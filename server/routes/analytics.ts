import type { FastifyInstance } from 'fastify';
import { all, get, nowIso } from '../db.ts';
import { HttpError, loadOwnedExam, requireTeacher, type ExamRow } from '../http.ts';
import { loadQuestions } from '../serialize.ts';
import {
  QUESTION_TYPE_LABEL,
  type AnalyticsExamOption,
  type AnalyticsMeta,
  type AnalyticsPayload,
  type ClassInfo,
  type ClassAnalytics,
  type QuestionAnalytics,
  type QuestionType,
  type ScoreBucket,
  type StudentAnalytics,
  type StudentInfo,
  type StudentProfile,
  type StudentProfileExam,
  type TrendPoint,
  type TypeAnalytics,
} from '../../shared/types.ts';

/** 及格线 / 优秀线（按卷面百分比计） */
const PASS_LINE = 60;
const EXCELLENT_LINE = 85;
const TREND_LIMIT = 8;

const BUCKETS: Array<{ label: string; min: number; max: number; test: (pct: number) => boolean }> = [
  { label: '60 以下', min: 0, max: 59.999, test: (p) => p < 60 },
  { label: '60–69', min: 60, max: 69.999, test: (p) => p >= 60 && p < 70 },
  { label: '70–79', min: 70, max: 79.999, test: (p) => p >= 70 && p < 80 },
  { label: '80–89', min: 80, max: 89.999, test: (p) => p >= 80 && p < 90 },
  { label: '90–100', min: 90, max: 100, test: (p) => p >= 90 },
];

type Param = string | number | null;

interface SubmissionRow {
  id: number;
  student_id: number;
  status: string;
  auto_score: number | null;
  final_score: number | null;
  submitted_at: string | null;
  graded_at: string | null;
  name: string;
  student_no: string;
  class_id: number | null;
  class_name: string | null;
}

interface AnswerRow {
  submission_id: number;
  question_id: number;
  raw_json: string | null;
  auto_score: number | null;
  final_score: number | null;
  type: QuestionType;
  max_score: number;
}

const round = (value: number, digits = 1): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const ratio = (part: number, total: number): number => (total > 0 ? round((part / total) * 100) : 0);

const scoreOf = (row: { final_score: number | null; auto_score: number | null }): number =>
  round(row.final_score ?? row.auto_score ?? 0, 2);

function parseIdList(raw: unknown, limit = 200): number[] {
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  return [
    ...new Set(
      values
        .map((value) => Number(String(value).trim()))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ].slice(0, limit);
}

function queryOf(req: unknown): Record<string, unknown> {
  return (req as { query?: Record<string, unknown> }).query ?? {};
}

function placeholder(count: number): string {
  return Array.from({ length: count }, () => '?').join(',');
}

function examOptions(teacherId: number): AnalyticsExamOption[] {
  return all<{
    id: number;
    title: string;
    status: AnalyticsExamOption['status'];
    total_score: number;
    question_count: number;
    submitted_count: number;
    results_published: number;
    created_at: string;
  }>(
    `SELECT e.id, e.title, e.status, e.results_published, e.created_at,
       (SELECT COALESCE(SUM(q.score), 0) FROM questions q WHERE q.exam_id = e.id) AS total_score,
       (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
       (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id AND s.status = 'graded') AS submitted_count
     FROM exams e
     WHERE e.teacher_id = ? AND e.status IN ('published', 'closed')
     ORDER BY e.created_at DESC, e.id DESC`,
    teacherId,
  ).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    totalScore: row.total_score,
    questionCount: row.question_count,
    submittedCount: row.submitted_count,
    resultsPublished: !!row.results_published,
    createdAt: row.created_at,
  }));
}

function classOptions(): ClassInfo[] {
  return all<{ id: number; name: string; grade: string | null; student_count: number }>(
    `SELECT c.id, c.name, c.grade,
       (SELECT COUNT(*) FROM users u WHERE u.role = 'student' AND u.class_id = c.id) AS student_count
     FROM classes c ORDER BY c.sort_order, c.id`,
  ).map((row) => ({ id: row.id, name: row.name, grade: row.grade, studentCount: row.student_count }));
}

function studentOptions(): StudentInfo[] {
  return all<{
    id: number;
    name: string;
    student_no: string | null;
    class_id: number | null;
    class_name: string | null;
  }>(
    `SELECT u.id, u.name, u.student_no, u.class_id, c.name AS class_name
     FROM users u LEFT JOIN classes c ON c.id = u.class_id
     WHERE u.role = 'student'
     ORDER BY c.sort_order, u.student_no, u.id`,
  ).map((row) => ({
    id: row.id,
    name: row.name,
    studentNo: row.student_no ?? '',
    classId: row.class_id,
    className: row.class_name,
  }));
}

function buildMeta(teacherId: number): AnalyticsMeta {
  return { exams: examOptions(teacherId), classes: classOptions(), students: studentOptions() };
}

function loadParticipants(exam: ExamRow, classIds: number[], studentIds: number[]): SubmissionRow[] {
  const where = ["s.exam_id = ?", "s.status = 'graded'"];
  const params: Param[] = [exam.id];
  if (classIds.length) {
    where.push(`(CASE WHEN ep.student_id IS NOT NULL THEN ep.class_id ELSE u.class_id END) IN (${placeholder(classIds.length)})`);
    params.push(...classIds);
  }
  if (studentIds.length) {
    where.push(`s.student_id IN (${placeholder(studentIds.length)})`);
    params.push(...studentIds);
  }
  return all<SubmissionRow>(
    `SELECT s.id, s.student_id, s.status, s.auto_score, s.final_score, s.submitted_at, s.graded_at,
       u.name, u.student_no, CASE WHEN ep.student_id IS NOT NULL THEN ep.class_id ELSE u.class_id END AS class_id, CASE WHEN ep.student_id IS NOT NULL THEN ep.class_name ELSE c.name END AS class_name
     FROM submissions s
     JOIN users u ON u.id = s.student_id
     LEFT JOIN classes c ON c.id = u.class_id
      LEFT JOIN exam_participants ep ON ep.exam_id = s.exam_id AND ep.student_id = s.student_id
     WHERE ${where.join(' AND ')}
     ORDER BY class_id, u.student_no, u.id`,
    ...params,
  );
}

function rankMap<T extends { id: number }>(items: T[], score: (item: T) => number): Map<number, number> {
  const sorted = [...items].sort((a, b) => score(b) - score(a) || a.id - b.id);
  const ranks = new Map<number, number>();
  sorted.forEach((item, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const rank = previous && score(previous) === score(item) ? ranks.get(previous.id)! : index + 1;
    ranks.set(item.id, rank);
  });
  return ranks;
}

function emptyBuckets(): number[] {
  return BUCKETS.map(() => 0);
}

function bucketIndex(percent: number): number {
  return BUCKETS.findIndex((bucket) => bucket.test(percent));
}

function buildClassStats(
  classes: ClassInfo[],
  participants: SubmissionRow[],
  totalScore: number,
): ClassAnalytics[] {
  return classes.map((info) => {
    const rows = participants.filter((row) => row.class_id === info.id);
    const scores = rows.map(scoreOf);
    const buckets = emptyBuckets();
    for (const score of scores) {
      const index = bucketIndex(ratio(score, totalScore));
      if (index >= 0) buckets[index] += 1;
    }
    return {
      id: info.id,
      name: info.name,
      totalStudents: info.studentCount,
      participants: rows.length,
      avg: scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0,
      max: scores.length ? Math.max(...scores) : 0,
      min: scores.length ? Math.min(...scores) : 0,
      passRate: ratio(scores.filter((score) => ratio(score, totalScore) >= PASS_LINE).length, scores.length),
      excellentRate: ratio(
        scores.filter((score) => ratio(score, totalScore) >= EXCELLENT_LINE).length,
        scores.length,
      ),
      buckets,
    };
  });
}

function buildTrend(
  teacherId: number,
  exams: AnalyticsExamOption[],
  classIds: number[],
  studentIds: number[],
): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const exam of [...exams].slice(0, TREND_LIMIT).reverse()) {
    const where = ["s.exam_id = ?", "s.status = 'graded'"];
    const params: Param[] = [exam.id];
    if (classIds.length) {
      where.push(`(CASE WHEN ep.student_id IS NOT NULL THEN ep.class_id ELSE u.class_id END) IN (${placeholder(classIds.length)})`);
      params.push(...classIds);
    }
    if (studentIds.length) {
      where.push(`s.student_id IN (${placeholder(studentIds.length)})`);
      params.push(...studentIds);
    }
    const rows = all<{ final_score: number | null; auto_score: number | null }>(
      `SELECT s.final_score, s.auto_score FROM submissions s
       JOIN users u ON u.id = s.student_id
       LEFT JOIN exam_participants ep ON ep.exam_id = s.exam_id AND ep.student_id = s.student_id
       WHERE ${where.join(' AND ')}`,
      ...params,
    );
    if (!rows.length) continue;
    const percents = rows.map((row) => ratio(scoreOf(row), exam.totalScore));
    points.push({
      examId: exam.id,
      title: exam.title,
      date: exam.createdAt,
      avg: round(percents.reduce((sum, value) => sum + value, 0) / percents.length),
      max: round(Math.max(...percents)),
      min: round(Math.min(...percents)),
      participants: rows.length,
    });
  }
  return points;
}

function analyticsPayload(
  teacherId: number,
  exam: ExamRow,
  meta: AnalyticsMeta,
  classIds: number[],
  studentIds: number[],
): AnalyticsPayload {
  const questions = loadQuestions(exam.id);
  const totalScore = round(questions.reduce((sum, question) => sum + question.score, 0), 2);
  const participants = loadParticipants(exam, classIds, studentIds);
  const participantIds = new Set(participants.map((row) => row.id));

  const answerRows = all<AnswerRow>(
    `SELECT a.submission_id, a.question_id, a.raw_json, a.auto_score, a.final_score,
       q.type, q.score AS max_score
     FROM answers a JOIN questions q ON q.id = a.question_id
     WHERE q.exam_id = ?`,
    exam.id,
  ).filter((row) => participantIds.has(row.submission_id));
  const answerKey = (submissionId: number, questionId: number) => `${submissionId}:${questionId}`;
  const answerMap = new Map(answerRows.map((row) => [answerKey(row.submission_id, row.question_id), row]));

  const scores = participants.map(scoreOf);
  const percentOf = (score: number) => ratio(score, totalScore);
  // 排名始终以「所选班级的全部已评学生」为分母，避免勾选少数学生后排名被压缩成 1/3。
  const rankUniverse = studentIds.length ? loadParticipants(exam, classIds, []) : participants;
  const overallRanks = rankMap(rankUniverse, scoreOf);
  const classGroups = new Map<number, SubmissionRow[]>();
  for (const row of rankUniverse) {
    if (row.class_id == null) continue;
    const group = classGroups.get(row.class_id) ?? [];
    group.push(row);
    classGroups.set(row.class_id, group);
  }
  const classRanks = new Map<number, number>();
  for (const group of classGroups.values()) {
    for (const [id, rank] of rankMap(group, scoreOf)) classRanks.set(id, rank);
  }

  const hasSnapshot = Boolean(get('SELECT 1 FROM exam_audiences WHERE exam_id = ?', exam.id));
  const snapshot = hasSnapshot ? all<{ studentId: number; classId: number | null; className: string | null }>(
    'SELECT student_id AS studentId, class_id AS classId, class_name AS className FROM exam_participants WHERE exam_id = ?', exam.id,
  ) : [];
  const snapshotClasses = new Map<number, ClassInfo>();
  for (const student of snapshot) {
    if (student.classId == null) continue;
    const entry = snapshotClasses.get(student.classId);
    if (entry) entry.studentCount++;
    else snapshotClasses.set(student.classId, { id: student.classId, name: student.className ?? `班级 ${student.classId}`, grade: null, studentCount: 1 });
  }
  const classesForExam = hasSnapshot ? [...snapshotClasses.values()] : meta.classes;
  const classList = classIds.length ? classesForExam.filter((item) => classIds.includes(item.id)) : classesForExam;
  const candidateStudents = (hasSnapshot ? snapshot.map((student) => ({ id: student.studentId, classId: student.classId })) : meta.students).filter(
    (student) => !classIds.length || (student.classId != null && classIds.includes(student.classId)),
  );
  const expected = studentIds.length
    ? candidateStudents.filter((student) => studentIds.includes(student.id)).length
    : candidateStudents.length;
  const students: StudentAnalytics[] = participants.map((row) => {
    const answers = questions.map((question) => answerMap.get(answerKey(row.id, question.id)));
    return {
      id: row.student_id,
      submissionId: row.id,
      name: row.name,
      studentNo: row.student_no,
      classId: row.class_id,
      className: row.class_name,
      score: scoreOf(row),
      totalScore,
      rank: overallRanks.get(row.id) ?? 0,
      classRank: classRanks.get(row.id) ?? 0,
      classSize: row.class_id == null ? 0 : (classGroups.get(row.class_id)?.length ?? 0),
      answered: answers.filter((answer) => !!answer?.raw_json).length,
      questionCount: questions.length,
      needsReview: answers.filter(
        (answer) =>
          !!answer &&
          answer.final_score == null &&
          (answer.type === 'short' || (answer.type === 'code' && (answer.auto_score ?? -1) < answer.max_score)),
      ).length,
      submittedAt: row.submitted_at,
      questionScores: answers.map((answer) => (answer ? scoreOf(answer) : null)),
    };
  });

  const distribution: ScoreBucket[] = BUCKETS.map((bucket) => ({
    label: bucket.label,
    min: bucket.min,
    max: bucket.max,
    count: 0,
  }));
  for (const score of scores) {
    const index = bucketIndex(percentOf(score));
    if (index >= 0) distribution[index].count += 1;
  }

  const classes = buildClassStats(classList, participants, totalScore);

  const questionStats: QuestionAnalytics[] = questions.map((question, index) => {
    let sum = 0;
    let full = 0;
    let zero = 0;
    let answered = 0;
    for (const student of students) {
      const score = student.questionScores[index] ?? 0;
      sum += score;
      if (score >= question.score) full += 1;
      if (score <= 0) zero += 1;
      if (student.questionScores[index] != null) answered += 1;
    }
    const count = students.length;
    return {
      id: question.id,
      seq: question.seq,
      type: question.type,
      score: question.score,
      avgScore: count ? round(sum / count, 2) : 0,
      scoreRate: ratio(sum, question.score * count),
      fullRate: ratio(full, count),
      zeroRate: ratio(zero, count),
      answered,
    };
  });

  const typeOrder: QuestionType[] = ['single', 'multiple', 'truefalse', 'fill', 'short', 'code'];
  const typeSummary: TypeAnalytics[] = typeOrder
    .map((type) => {
      const indexes = questions
        .map((question, index) => (question.type === type ? index : -1))
        .filter((index) => index >= 0);
      if (!indexes.length) return null;
      const maxTotal = indexes.reduce((sum, index) => sum + questions[index].score, 0);
      const earned = students.reduce(
        (sum, student) => sum + indexes.reduce((inner, index) => inner + (student.questionScores[index] ?? 0), 0),
        0,
      );
      return {
        type,
        label: QUESTION_TYPE_LABEL[type],
        totalScore: round(maxTotal, 2),
        avgScore: students.length ? round(earned / students.length, 2) : 0,
        rate: ratio(earned, maxTotal * students.length),
      };
    })
    .filter((item): item is TypeAnalytics => item != null);

  const passCount = scores.filter((score) => percentOf(score) >= PASS_LINE).length;
  const excellentCount = scores.filter((score) => percentOf(score) >= EXCELLENT_LINE).length;
  const answeredRate = students.length
    ? students.reduce((sum, student) => sum + ratio(student.answered, Math.max(1, student.questionCount)), 0) /
      students.length
    : 0;

  return {
    exam: {
      ...(meta.exams.find((item) => item.id === exam.id) ?? {
        id: exam.id,
        title: exam.title,
        status: exam.status,
        totalScore,
        questionCount: questions.length,
        submittedCount: students.length,
        resultsPublished: !!exam.results_published,
        createdAt: exam.created_at,
      }),
      description: exam.description,
      durationMin: exam.duration_min,
    },
    filters: { classIds, studentIds },
    kpi: {
      participants: students.length,
      expected,
      avg: scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0,
      max: scores.length ? Math.max(...scores) : 0,
      min: scores.length ? Math.min(...scores) : 0,
      passRate: ratio(passCount, scores.length),
      excellentRate: ratio(excellentCount, scores.length),
      submitRate: ratio(students.length, expected),
      avgAnsweredRate: round(answeredRate),
    },
    distribution,
    classes,
    students,
    questions: questionStats,
    typeSummary,
    trend: buildTrend(teacherId, meta.exams, classIds, studentIds),
    generatedAt: nowIso(),
  };
}

function studentProfile(teacherId: number, studentId: number): StudentProfile {
  const student = get<{
    id: number;
    name: string;
    student_no: string | null;
    class_id: number | null;
    class_name: string | null;
  }>(
    `SELECT u.id, u.name, u.student_no, u.class_id, c.name AS class_name
     FROM users u LEFT JOIN classes c ON c.id = u.class_id
     WHERE u.id = ? AND u.role = 'student'`,
    studentId,
  );
  if (!student) throw new HttpError(404, '学生不存在');

  const exams = all<{
    exam_id: number;
    title: string;
    status: StudentProfileExam['status'];
    total_score: number;
    final_score: number | null;
    auto_score: number | null;
    submitted_at: string | null;
  }>(
    `SELECT e.id AS exam_id, e.title, e.status,
       (SELECT COALESCE(SUM(q.score), 0) FROM questions q WHERE q.exam_id = e.id) AS total_score,
       s.final_score, s.auto_score, s.submitted_at
     FROM submissions s JOIN exams e ON e.id = s.exam_id
     WHERE s.student_id = ? AND e.teacher_id = ? AND s.status = 'graded'
     ORDER BY s.submitted_at DESC, e.id DESC`,
    studentId,
    teacherId,
  );

  const examRows: StudentProfileExam[] = exams.map((exam) => {
    const score = scoreOf(exam);
    const peers = all<{ student_id: number; final_score: number | null; auto_score: number | null }>(
      `SELECT s.student_id, s.final_score, s.auto_score
       FROM submissions s JOIN users u ON u.id = s.student_id
       WHERE s.exam_id = ? AND s.status = 'graded' AND u.class_id IS ?`,
      exam.exam_id,
      student.class_id,
    );
    const peerScores = peers.map(scoreOf);
    const classSize = peerScores.length;
    const classAvg = classSize ? round(peerScores.reduce((sum, value) => sum + value, 0) / classSize) : 0;
    const classRank = peerScores.filter((value) => value > score).length + 1;
    return {
      examId: exam.exam_id,
      title: exam.title,
      status: exam.status,
      totalScore: exam.total_score,
      score,
      classAvg,
      classRank,
      classSize,
      submittedAt: exam.submitted_at,
    };
  });

  const percents = examRows.map((exam) => ratio(exam.score, exam.totalScore));
  const latest = examRows[0] ?? null;
  const latestDelta = latest ? round(ratio(latest.score, latest.totalScore) - ratio(latest.classAvg, latest.totalScore)) : null;

  let latestDetail: StudentProfile['latest'] = null;
  if (latest) {
    const questions = loadQuestions(latest.examId);
    const answers = all<{ question_id: number; final_score: number | null; auto_score: number | null }>(
      `SELECT a.question_id, a.final_score, a.auto_score FROM answers a
       JOIN submissions s ON s.id = a.submission_id
       WHERE s.exam_id = ? AND s.student_id = ?`,
      latest.examId,
      studentId,
    );
    const answerMap = new Map(answers.map((answer) => [answer.question_id, scoreOf(answer)]));
    const peers = all<{ student_id: number; question_id: number; final_score: number | null; auto_score: number | null }>(
      `SELECT s.student_id, a.question_id, a.final_score, a.auto_score
       FROM answers a
       JOIN submissions s ON s.id = a.submission_id
       JOIN users u ON u.id = s.student_id
       WHERE s.exam_id = ? AND s.status = 'graded' AND u.class_id IS ?`,
      latest.examId,
      student.class_id,
    );
    const peerMap = new Map<number, number[]>();
    for (const row of peers) {
      const list = peerMap.get(row.question_id) ?? [];
      list.push(scoreOf(row));
      peerMap.set(row.question_id, list);
    }
    latestDetail = {
      examId: latest.examId,
      title: latest.title,
      totalScore: latest.totalScore,
      score: latest.score,
      classAvg: latest.classAvg,
      classRank: latest.classRank,
      classSize: latest.classSize,
      questions: questions.map((question) => {
        const values = peerMap.get(question.id) ?? [];
        return {
          id: question.id,
          seq: question.seq,
          type: question.type,
          score: answerMap.get(question.id) ?? 0,
          maxScore: question.score,
          classAvg: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0,
        };
      }),
    };
  }

  return {
    student: {
      id: student.id,
      name: student.name,
      studentNo: student.student_no ?? '',
      classId: student.class_id,
      className: student.class_name,
    },
    summary: {
      taken: examRows.length,
      avg: percents.length ? round(percents.reduce((sum, value) => sum + value, 0) / percents.length) : 0,
      best: percents.length ? round(Math.max(...percents)) : 0,
      worst: percents.length ? round(Math.min(...percents)) : 0,
      latestRank: latest?.classRank ?? null,
      latestClassSize: latest?.classSize ?? 0,
      latestDelta,
    },
    exams: examRows,
    latest: latestDetail,
  };
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/teacher/analytics/meta', async (req) => {
    const user = requireTeacher(req);
    return buildMeta(user.id);
  });

  app.get('/teacher/analytics', async (req) => {
    const user = requireTeacher(req);
    const query = queryOf(req);
    const meta = buildMeta(user.id);
    if (!meta.exams.length) throw new HttpError(404, '还没有可分析的考试');

    const requestedExam = Number(query.examId);
    const examId = Number.isInteger(requestedExam) && requestedExam > 0
      ? requestedExam
      : (meta.exams.find((exam) => exam.submittedCount > 0) ?? meta.exams[0]).id;
    const exam = loadOwnedExam(user.id, examId);
    const classIds = parseIdList(query.classIds).filter((id) => meta.classes.some((item) => item.id === id));
    const studentIds = parseIdList(query.studentIds).filter((id) =>
      meta.students.some((student) => student.id === id),
    );
    return analyticsPayload(user.id, exam, meta, classIds, studentIds);
  });

  app.get('/teacher/students/:id/profile', async (req) => {
    const user = requireTeacher(req);
    return studentProfile(user.id, Number((req.params as { id: string }).id));
  });
}

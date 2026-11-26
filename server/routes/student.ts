import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, get, nowIso, run, tx } from '../db.ts';
import { HttpError, requireStudent } from '../http.ts';
import { examSummary, loadQuestions, loadSections, loadTestCases, parseJson, type ExamRow } from '../serialize.ts';
import { hasAudienceAccess, queueSubmission, studentCanAccess } from '../exam-lifecycle.ts';
import type { AnswerSpec, QuestionStudent, StudentAnswer } from '../../shared/types.ts';

const draftSchema = z.object({ answers: z.record(z.string(), z.any()) });

interface SubmissionRow {
  id: number;
  exam_id: number;
  student_id: number;
  status: 'in_progress' | 'submitted' | 'grading' | 'graded' | 'discarded';
  started_at: string;
  submitted_at: string | null;
}

function loadExam(examId: number): ExamRow {
  const exam = get<ExamRow>('SELECT * FROM exams WHERE id = ?', examId);
  if (!exam) throw new HttpError(404, '考试不存在');
  return exam;
}

function deadlineOf(exam: ExamRow, startedAt: string): string | null {
  const start = new Date(startedAt).getTime();
  const byDuration = start + exam.duration_min * 60_000;
  const byEnd = exam.end_at ? new Date(exam.end_at).getTime() : null;
  const value = byEnd ? Math.min(byDuration, byEnd) : byDuration;
  return new Date(value).toISOString();
}

function loadSubmissionOwned(studentId: number, submissionId: number): { sub: SubmissionRow; exam: ExamRow } {
  const sub = get<SubmissionRow>('SELECT * FROM submissions WHERE id = ?', submissionId);
  if (!sub) throw new HttpError(404, '提交记录不存在');
  if (sub.student_id !== studentId) throw new HttpError(403, '无权访问该提交');
  if (!studentCanAccess(sub.exam_id, studentId)) throw new HttpError(404, '考试不存在');
  return { sub, exam: loadExam(sub.exam_id) };
}

export async function studentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/student/exams', async (req) => {
    const user = requireStudent(req);
    const rows = all<
      ExamRow & {
        teacher_name: string;
        total_score: number;
        question_count: number;
        sub_id: number | null;
        sub_status: string | null;
        sub_score: number | null;
        submitted_at: string | null;
      }
    >(
      `SELECT e.*, u.name AS teacher_name,
        (SELECT COALESCE(SUM(q.score), 0) FROM questions q WHERE q.exam_id = e.id) AS total_score,
        (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
        s.id AS sub_id, s.status AS sub_status, CASE WHEN e.results_published = 1 AND s.status = 'graded' THEN COALESCE(s.final_score, s.auto_score) END AS sub_score, s.submitted_at
       FROM exams e
       JOIN users u ON u.id = e.teacher_id
       LEFT JOIN submissions s ON s.exam_id = e.id AND s.student_id = ?
       WHERE e.status IN ('published', 'closed') AND ${hasAudienceAccess}
       ORDER BY CASE WHEN e.status = 'published' THEN 0 ELSE 1 END, e.created_at DESC, e.id DESC`,
      user.id, user.id,
    );

    return rows.map((r) => ({
      ...examSummary(r, { totalScore: r.total_score, questionCount: r.question_count }),
      teacherName: r.teacher_name,
      submission: r.sub_id
        ? {
            id: r.sub_id,
            status: r.sub_status,
            score: r.sub_score,
            submittedAt: r.submitted_at,
          }
        : null,
    }));
  });

  app.get('/student/exams/:id', async (req) => {
    const user = requireStudent(req);
    const exam = loadExam(Number((req.params as { id: string }).id));
    if (exam.status === 'draft' || !studentCanAccess(exam.id, user.id)) throw new HttpError(404, '考试不存在');
    if (exam.status === 'closed') throw new HttpError(409, '考试已结束');

    const now = Date.now();
    if (exam.start_at && new Date(exam.start_at).getTime() > now) throw new HttpError(409, '考试尚未开始');
    if (exam.end_at && new Date(exam.end_at).getTime() < now) throw new HttpError(409, '考试已结束');

    let sub = get<SubmissionRow>('SELECT * FROM submissions WHERE exam_id = ? AND student_id = ?', exam.id, user.id);
    if (!sub) {
      const res = run(
        "INSERT INTO submissions (exam_id, student_id, status, started_at) VALUES (?, ?, 'in_progress', ?)",
        exam.id,
        user.id,
        nowIso(),
      );
      sub = get<SubmissionRow>('SELECT * FROM submissions WHERE id = ?', res.lastInsertRowid)!;
    }

    const questions = loadQuestions(exam.id);
    const cases = loadTestCases(exam.id);
    const answerRows = all<{ question_id: number; raw_json: string | null }>(
      'SELECT question_id, raw_json FROM answers WHERE submission_id = ?',
      sub.id,
    );
    const answers: Record<string, StudentAnswer> = {};
    for (const row of answerRows) {
      const raw = parseJson<StudentAnswer | null>(row.raw_json, null);
      if (raw) answers[String(row.question_id)] = raw;
    }

    const dto: QuestionStudent[] = questions.map((q) => {
      const answerSpec = parseJson<AnswerSpec | null>(q.answer_json, null);
      const codeSpec = parseJson<{ languages: string[]; starterCode: string; timeLimitMs: number } | null>(
        q.code_spec_json,
        null,
      );
      return {
        id: q.id,
        seq: q.seq,
        type: q.type,
        stemHtml: q.stem_html,
        score: q.score,
        options: parseJson(q.options_json, []),
        blanks: answerSpec?.kind === 'fill' ? answerSpec.blanks.length : 0,
        codeSpec: codeSpec
          ? { languages: codeSpec.languages, starterCode: codeSpec.starterCode, timeLimitMs: codeSpec.timeLimitMs }
          : null,
        sampleCases: (cases.get(q.id) ?? [])
          .filter((c) => c.visible || c.score <= 0)
          .map((c) => ({
            stdin: c.stdin,
            expectedStdout: c.expectedStdout,
            label: c.score <= 0 ? '样例' : '公开测试点',
          })),
        sectionIndex: q.section_index ?? null,
      };
    });

    return {
      exam: {
        ...examSummary(exam, {
          totalScore: questions.reduce((s, q) => s + q.score, 0),
          questionCount: questions.length,
        }),
        teacherName: get<{ name: string }>('SELECT name FROM users WHERE id = ?', exam.teacher_id)?.name ?? '教师',
      },
      submission: {
        id: sub.id,
        status: sub.status,
        startedAt: sub.started_at,
        submittedAt: sub.submitted_at,
        deadlineAt: deadlineOf(exam, sub.started_at),
      },
      questions: dto,
      sections: loadSections(exam.sections_json),
      answers,
    };
  });

  app.put('/student/submissions/:id/draft', async (req) => {
    const user = requireStudent(req);
    const { sub, exam } = loadSubmissionOwned(user.id, Number((req.params as { id: string }).id));
    if (exam.status !== 'published' || sub.status !== 'in_progress') throw new HttpError(409, '考试已结束或试卷已提交，不能再保存');

    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, '答案格式不合法');

    const validIds = new Set(
      all<{ id: number }>('SELECT id FROM questions WHERE exam_id = ?', sub.exam_id).map((r) => r.id),
    );

    for (const [qid, raw] of Object.entries(parsed.data.answers)) {
      const id = Number(qid);
      if (!validIds.has(id)) continue;
      run(
        `INSERT INTO answers (submission_id, question_id, raw_json) VALUES (?, ?, ?)
         ON CONFLICT(submission_id, question_id) DO UPDATE SET raw_json = excluded.raw_json`,
        sub.id,
        id,
        JSON.stringify(raw ?? null),
      );
    }
    return { ok: true, savedAt: nowIso() };
  });

  app.post('/student/submissions/:id/submit', async (req) => {
    const user = requireStudent(req);
    const { sub, exam } = loadSubmissionOwned(user.id, Number((req.params as { id: string }).id));

    if (sub.status === 'discarded') throw new HttpError(409, '考试已结束，草稿未收卷');
    if (sub.status !== 'in_progress') {
      return { ok: true, status: sub.status, alreadySubmitted: true };
    }
    if (exam.status !== 'published') throw new HttpError(409, '考试已结束，无法提交');
    if (exam.end_at && new Date(exam.end_at).getTime() < Date.now() - 60_000) {
      throw new HttpError(409, '已超过考试结束时间');
    }

    tx(() => queueSubmission(sub.id, exam.id));
    return { ok: true, status: 'grading' };
  });

  app.get('/student/submissions/:id', async (req) => {
    const user = requireStudent(req);
    const { sub, exam } = loadSubmissionOwned(user.id, Number((req.params as { id: string }).id));

    const questions = loadQuestions(exam.id);
    const totalScore = questions.reduce((s, q) => s + q.score, 0);
    const published = !!exam.results_published && sub.status === 'graded';

    if (!published) {
      return {
        exam: examSummary(exam, { totalScore, questionCount: questions.length }),
        submission: { id: sub.id, status: sub.status, submittedAt: sub.submitted_at },
        resultsPublished: false,
        score: null,
        totalScore,
        questions: [],
      };
    }

    const answerRows = all<{
      question_id: number;
      raw_json: string | null;
      auto_score: number | null;
      final_score: number | null;
      comment: string | null;
      auto_detail_json: string | null;
    }>('SELECT * FROM answers WHERE submission_id = ?', sub.id);
    const byQuestion = new Map(answerRows.map((r) => [r.question_id, r]));

    const items = questions.map((q) => {
      const row = byQuestion.get(q.id);
      return {
        id: q.id,
        seq: q.seq,
        type: q.type,
        stemHtml: q.stem_html,
        score: q.score,
        options: parseJson(q.options_json, []),
        finalScore: row ? row.final_score ?? row.auto_score : null,
        comment: row?.comment ?? null,
        answer: parseJson<AnswerSpec | null>(q.answer_json, null),
        explanationHtml: q.explanation_html,
        raw: row ? parseJson<StudentAnswer | null>(row.raw_json, null) : null,
        sectionIndex: q.section_index ?? null,
      };
    });

    const sum = items.reduce((s, it) => s + (it.finalScore ?? 0), 0);

    return {
      exam: examSummary(exam, { totalScore, questionCount: questions.length }),
      submission: { id: sub.id, status: sub.status, submittedAt: sub.submitted_at },
      resultsPublished: true,
      score: Math.round(sum * 100) / 100,
      totalScore,
      questions: items,
      sections: loadSections(exam.sections_json),
    };
  });
}

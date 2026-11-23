import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROOT, all, get, nowIso, run, tx } from '../db.ts';
import { HttpError, audit, loadOwnedExam, requireTeacher, type ExamRow } from '../http.ts';
import { examSummary, loadQuestions, loadTestCases, parseJson, toQuestionTeacher } from '../serialize.ts';
import { parseDocx } from '../import/docx.ts';
import type { GradeDetail, QuestionTeacher, SubmissionRow } from '../../shared/types.ts';

const QUESTION_TYPES = ['single', 'multiple', 'truefalse', 'fill', 'short', 'code'] as const;

const codeSpecSchema = z.object({
  languages: z.array(z.string()).min(1),
  starterCode: z.string().default(''),
  timeLimitMs: z.number().int().positive().default(2000),
  memoryLimitMb: z.number().int().positive().default(256),
});

const testCaseSchema = z.object({
  stdin: z.string().default(''),
  expectedStdout: z.string().default(''),
  score: z.number().min(0),
  visible: z.boolean().default(false),
});

const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  stemHtml: z.string(),
  score: z.number().positive(),
  options: z.array(z.object({ key: z.string(), text: z.string() })).default([]),
  answer: z.any(),
  explanationHtml: z.string().nullable().optional(),
  codeSpec: codeSpecSchema.nullable().optional(),
  testCases: z.array(testCaseSchema).default([]),
});

const questionsPayloadSchema = z.object({ questions: z.array(questionSchema).min(1) });

function examStats(examId: number): { totalScore: number; questionCount: number } {
  const row = get<{ total: number | null; count: number }>(
    'SELECT COALESCE(SUM(score), 0) AS total, COUNT(*) AS count FROM questions WHERE exam_id = ?',
    examId,
  );
  return { totalScore: row?.total ?? 0, questionCount: row?.count ?? 0 };
}

function examDetail(exam: ExamRow) {
  const questions = loadQuestions(exam.id);
  const cases = loadTestCases(exam.id);
  const submissionCount =
    get<{ c: number }>('SELECT COUNT(*) AS c FROM submissions WHERE exam_id = ?', exam.id)?.c ?? 0;
  return {
    ...examSummary(exam, examStats(exam.id)),
    questions: questions.map((q) => toQuestionTeacher(q, cases.get(q.id) ?? [])),
    submissionCount,
  };
}

function recomputeSubmissionFinal(submissionId: number): number {
  const row = get<{ total: number | null }>(
    'SELECT SUM(COALESCE(final_score, auto_score, 0)) AS total FROM answers WHERE submission_id = ?',
    submissionId,
  );
  const total = Math.round((row?.total ?? 0) * 100) / 100;
  run('UPDATE submissions SET final_score = ? WHERE id = ?', total, submissionId);
  return total;
}

export async function teacherRoutes(app: FastifyInstance): Promise<void> {
  // 模板下载（不鉴权，方便教师直接获取）
  app.get('/template.docx', async (_req, reply) => {
    const file = path.join(ROOT, 'templates', '题目模板.docx');
    if (!fs.existsSync(file)) throw new HttpError(404, '模板文件不存在');
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .header('Content-Disposition', 'attachment; filename="zhijuan-template.docx"')
      .send(fs.readFileSync(file));
  });

  app.get('/teacher/exams', async (req) => {
    const user = requireTeacher(req);
    const rows = all<ExamRow & { total_score: number; question_count: number; submission_count: number; graded_count: number }>(
      `SELECT e.*,
        (SELECT COALESCE(SUM(q.score), 0) FROM questions q WHERE q.exam_id = e.id) AS total_score,
        (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) AS question_count,
        (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id) AS submission_count,
        (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id AND s.status = 'graded') AS graded_count
       FROM exams e WHERE e.teacher_id = ? ORDER BY e.id DESC`,
      user.id,
    );
    return rows.map((r) => ({
      ...examSummary(r, { totalScore: r.total_score, questionCount: r.question_count }),
      submissionCount: r.submission_count,
      gradedCount: r.graded_count,
    }));
  });

  app.post('/teacher/exams', async (req) => {
    const user = requireTeacher(req);
    const body = z
      .object({
        title: z.string().trim().min(1).max(120),
        description: z.string().max(2000).optional(),
        durationMin: z.number().int().min(1).max(600).optional(),
        startAt: z.string().nullable().optional(),
        endAt: z.string().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new HttpError(400, '考试标题不能为空（1-120 字）');

    const ts = nowIso();
    const res = run(
      'INSERT INTO exams (title, description, teacher_id, status, duration_min, start_at, end_at, results_published, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
      body.data.title,
      body.data.description ?? '',
      user.id,
      'draft',
      body.data.durationMin ?? 60,
      body.data.startAt ?? null,
      body.data.endAt ?? null,
      ts,
    );
    const exam = get<ExamRow>('SELECT * FROM exams WHERE id = ?', res.lastInsertRowid)!;
    return examDetail(exam);
  });

  app.get('/teacher/exams/:id', async (req) => {
    const user = requireTeacher(req);
    const exam = loadOwnedExam(user.id, Number((req.params as { id: string }).id));
    return examDetail(exam);
  });

  app.patch('/teacher/exams/:id', async (req) => {
    const user = requireTeacher(req);
    const exam = loadOwnedExam(user.id, Number((req.params as { id: string }).id));
    const body = z
      .object({
        title: z.string().trim().min(1).max(120).optional(),
        description: z.string().max(2000).optional(),
        durationMin: z.number().int().min(1).max(600).optional(),
        startAt: z.string().nullable().optional(),
        endAt: z.string().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new HttpError(400, '参数不合法');

    run(
      'UPDATE exams SET title = ?, description = ?, duration_min = ?, start_at = ?, end_at = ? WHERE id = ?',
      body.data.title ?? exam.title,
      body.data.description ?? exam.description,
      body.data.durationMin ?? exam.duration_min,
      body.data.startAt === undefined ? exam.start_at : body.data.startAt,
      body.data.endAt === undefined ? exam.end_at : body.data.endAt,
      exam.id,
    );
    return examDetail(get<ExamRow>('SELECT * FROM exams WHERE id = ?', exam.id)!);
  });

  app.delete('/teacher/exams/:id', async (req) => {
    const user = requireTeacher(req);
    const exam = loadOwnedExam(user.id, Number((req.params as { id: string }).id));
    if (exam.status !== 'draft') throw new HttpError(400, '只有草稿状态的考试可以删除');
    run('DELETE FROM exams WHERE id = ?', exam.id);
    return { ok: true };
  });

  // Word 解析预览：不写库
  app.post('/teacher/exams/:id/import', async (req) => {
    const user = requireTeacher(req);
    loadOwnedExam(user.id, Number((req.params as { id: string }).id));

    let buffer: Buffer | null = null;
    let filename = '';

    if (req.isMultipart()) {
      const file = await req.file();
      if (!file) throw new HttpError(400, '没有收到文件');
      filename = file.filename ?? '';
      if (filename && !/\.docx$/i.test(filename)) throw new HttpError(400, '只支持 .docx 格式');
      buffer = await file.toBuffer();
    } else {
      const body = req.body as { sample?: boolean } | undefined;
      if (body?.sample) {
        const sample = path.join(ROOT, 'templates', '题目模板.docx');
        if (!fs.existsSync(sample)) throw new HttpError(404, '示例模板不存在，请先运行 pnpm template');
        buffer = fs.readFileSync(sample);
        filename = '题目模板.docx';
      }
    }

    if (!buffer || buffer.length === 0) throw new HttpError(400, '文件为空');
    if (buffer.length > 20 * 1024 * 1024) throw new HttpError(413, '文件超过 20MB');

    const result = await parseDocx(buffer);
    return { ...result, filename };
  });

  // 确认导入：整卷替换
  app.put('/teacher/exams/:id/questions', async (req) => {
    const user = requireTeacher(req);
    const exam = loadOwnedExam(user.id, Number((req.params as { id: string }).id));
    const parsed = questionsPayloadSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, `题目数据不合法：${parsed.error.issues[0]?.message ?? ''}`);

    const submitted = get<{ c: number }>('SELECT COUNT(*) AS c FROM submissions WHERE exam_id = ?', exam.id)?.c ?? 0;
    if (submitted > 0) throw new HttpError(400, '已有学生提交，不能重新导入题目');

    tx(() => {
      run('DELETE FROM test_cases WHERE question_id IN (SELECT id FROM questions WHERE exam_id = ?)', exam.id);
      run('DELETE FROM questions WHERE exam_id = ?', exam.id);

      parsed.data.questions.forEach((q, i) => {
        const inserted = run(
          `INSERT INTO questions (exam_id, seq, type, stem_html, score, options_json, answer_json, explanation_html, code_spec_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          exam.id,
          i + 1,
          q.type,
          q.stemHtml,
          q.score,
          JSON.stringify(q.options),
          q.answer == null ? null : JSON.stringify(q.answer),
          q.explanationHtml ?? null,
          q.codeSpec ? JSON.stringify(q.codeSpec) : null,
        );
        q.testCases.forEach((tc, j) => {
          run(
            'INSERT INTO test_cases (question_id, seq, stdin, expected_stdout, score, visible) VALUES (?, ?, ?, ?, ?, ?)',
            inserted.lastInsertRowid,
            j + 1,
            tc.stdin,
            tc.expectedStdout,
            tc.score,
            tc.visible ? 1 : 0,
          );
        });
      });
    });

    return examDetail(get<ExamRow>('SELECT * FROM exams WHERE id = ?', exam.id)!);
  });

  app.patch('/teacher/questions/:id', async (req) => {
    const user = requireTeacher(req);
    const qid = Number((req.params as { id: string }).id);
    const q = get<{ id: number; exam_id: number; score: number }>('SELECT id, exam_id, score FROM questions WHERE id = ?', qid);
    if (!q) throw new HttpError(404, '题目不存在');
    loadOwnedExam(user.id, q.exam_id);

    const body = z.object({ score: z.number().positive().max(200) }).safeParse(req.body);
    if (!body.success) throw new HttpError(400, '分值必须是 0-200 之间的数字');
    run('UPDATE questions SET score = ? WHERE id = ?', body.data.score, qid);
    audit(user.id, 'question', qid, 'update_score', { score: q.score }, { score: body.data.score });
    return { ok: true };
  });

  app.delete('/teacher/questions/:id', async (req) => {
    const user = requireTeacher(req);
    const qid = Number((req.params as { id: string }).id);
    const q = get<{ id: number; exam_id: number }>('SELECT id, exam_id FROM questions WHERE id = ?', qid);
    if (!q) throw new HttpError(404, '题目不存在');
    loadOwnedExam(user.id, q.exam_id);
    const submitted = get<{ c: number }>('SELECT COUNT(*) AS c FROM submissions WHERE exam_id = ?', q.exam_id)?.c ?? 0;
    if (submitted > 0) throw new HttpError(400, '已有学生提交，不能删除题目');

    tx(() => {
      run('DELETE FROM questions WHERE id = ?', qid);
      const left = all<{ id: number }>('SELECT id FROM questions WHERE exam_id = ? ORDER BY seq', q.exam_id);
      left.forEach((row, i) => run('UPDATE questions SET seq = ? WHERE id = ?', i + 1, row.id));
    });
    return { ok: true };
  });

  app.post('/teacher/exams/:id/publish', async (req) => {
    const user = requireTeacher(req);
    const exam = loadOwnedExam(user.id, Number((req.params as { id: string }).id));
    const stats = examStats(exam.id);
    if (!stats.questionCount) throw new HttpError(400, '试卷还没有题目，请先导入 Word');
    run("UPDATE exams SET status = 'published' WHERE id = ?", exam.id);
    return { ok: true, totalScore: stats.totalScore };
  });

  app.post('/teacher/exams/:id/close', async (req) => {
    const user = requireTeacher(req);
    const exam = loadOwnedExam(user.id, Number((req.params as { id: string }).id));
    run("UPDATE exams SET status = 'closed' WHERE id = ?", exam.id);
    return { ok: true };
  });

  app.post('/teacher/exams/:id/publish-results', async (req) => {
    const user = requireTeacher(req);
    const exam = loadOwnedExam(user.id, Number((req.params as { id: string }).id));
    const body = z.object({ published: z.boolean() }).safeParse(req.body);
    if (!body.success) throw new HttpError(400, '参数不合法');
    run('UPDATE exams SET results_published = ? WHERE id = ?', body.data.published ? 1 : 0, exam.id);
    return { ok: true };
  });

  app.get('/teacher/exams/:id/submissions', async (req) => {
    const user = requireTeacher(req);
    const exam = loadOwnedExam(user.id, Number((req.params as { id: string }).id));
    const stats = examStats(exam.id);
    const rows = all<{
      id: number;
      student_id: number;
      student_name: string;
      student_no: string;
      status: SubmissionRow['status'];
      auto_score: number | null;
      final_score: number | null;
      submitted_at: string | null;
      answered: number;
    }>(
      `SELECT s.id, s.student_id, u.name AS student_name, u.student_no, s.status, s.auto_score, s.final_score, s.submitted_at,
        (SELECT COUNT(*) FROM answers a WHERE a.submission_id = s.id AND a.raw_json IS NOT NULL) AS answered
       FROM submissions s JOIN users u ON u.id = s.student_id
       WHERE s.exam_id = ? ORDER BY u.student_no`,
      exam.id,
    );

    const reviewRows = all<{ submission_id: number; n: number }>(
      `SELECT a.submission_id, COUNT(*) AS n
       FROM answers a JOIN questions q ON q.id = a.question_id
       WHERE q.exam_id = ? AND (q.type = 'short' OR (q.type = 'code' AND COALESCE(a.auto_score, -1) < q.score))
       GROUP BY a.submission_id`,
      exam.id,
    );
    const reviewMap = new Map(reviewRows.map((r) => [r.submission_id, r.n]));

    return rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      studentName: r.student_name,
      studentNo: r.student_no,
      status: r.status,
      autoScore: r.auto_score,
      finalScore: r.final_score,
      submittedAt: r.submitted_at,
      answered: r.answered,
      needsReview: reviewMap.get(r.id) ?? 0,
      questionCount: stats.questionCount,
    }));
  });

  app.get('/teacher/submissions/:id', async (req) => {
    const user = requireTeacher(req);
    const sid = Number((req.params as { id: string }).id);
    const sub = get<{
      id: number;
      exam_id: number;
      student_id: number;
      status: SubmissionRow['status'];
      auto_score: number | null;
      final_score: number | null;
      submitted_at: string | null;
      student_name: string;
      student_no: string;
      exam_title: string;
      teacher_id: number;
    }>(
      `SELECT s.*, u.name AS student_name, u.student_no, e.title AS exam_title, e.teacher_id
       FROM submissions s JOIN users u ON u.id = s.student_id JOIN exams e ON e.id = s.exam_id
       WHERE s.id = ?`,
      sid,
    );
    if (!sub) throw new HttpError(404, '提交不存在');
    if (sub.teacher_id !== user.id) throw new HttpError(403, '无权访问');

    const questions = loadQuestions(sub.exam_id);
    const cases = loadTestCases(sub.exam_id);
    const answerRows = all<{
      id: number;
      question_id: number;
      raw_json: string | null;
      auto_score: number | null;
      auto_detail_json: string | null;
      final_score: number | null;
      comment: string | null;
      graded_at: string | null;
    }>('SELECT * FROM answers WHERE submission_id = ?', sub.id);
    const byQuestion = new Map(answerRows.map((r) => [r.question_id, r]));

    const questionsDto: QuestionTeacher[] = questions.map((q) => toQuestionTeacher(q, cases.get(q.id) ?? []));
    const answers = questions.map((q) => {
      const row = byQuestion.get(q.id);
      return {
        id: row?.id ?? 0,
        questionId: q.id,
        raw: row ? parseJson<Record<string, unknown> | null>(row.raw_json, null) : null,
        autoScore: row?.auto_score ?? null,
        autoDetail: row ? parseJson<GradeDetail | null>(row.auto_detail_json, null) : null,
        finalScore: row?.final_score ?? null,
        comment: row?.comment ?? null,
        gradedAt: row?.graded_at ?? null,
      };
    });

    const totalAuto = answers.reduce((s, a) => s + (a.autoScore ?? 0), 0);
    const totalFinal = answers.reduce((s, a) => s + (a.finalScore ?? a.autoScore ?? 0), 0);

    return {
      id: sub.id,
      studentId: sub.student_id,
      studentName: sub.student_name,
      studentNo: sub.student_no,
      status: sub.status,
      autoScore: sub.auto_score,
      finalScore: sub.final_score ?? totalFinal,
      submittedAt: sub.submitted_at,
      answered: answers.filter((a) => a.raw != null).length,
      needsReview: 0,
      questionCount: questions.length,
      examId: sub.exam_id,
      examTitle: sub.exam_title,
      examTotalScore: questions.reduce((s, q) => s + q.score, 0),
      questions: questionsDto,
      answers,
      totalAutoScore: Math.round(totalAuto * 100) / 100,
    };
  });

  app.patch('/teacher/answers/:id', async (req) => {
    const user = requireTeacher(req);
    const aid = Number((req.params as { id: string }).id);
    const row = get<{
      id: number;
      submission_id: number;
      question_id: number;
      final_score: number | null;
      comment: string | null;
    }>('SELECT * FROM answers WHERE id = ?', aid);
    if (!row) throw new HttpError(404, '答题记录不存在');

    const ctx = get<{ exam_id: number; teacher_id: number; score: number; type: string }>(
      `SELECT q.exam_id, e.teacher_id, q.score, q.type FROM answers a
       JOIN questions q ON q.id = a.question_id JOIN exams e ON e.id = q.exam_id WHERE a.id = ?`,
      aid,
    );
    if (!ctx || ctx.teacher_id !== user.id) throw new HttpError(403, '无权操作');

    const body = z
      .object({ finalScore: z.number().min(0), comment: z.string().max(1000).nullable().optional() })
      .safeParse(req.body);
    if (!body.success) throw new HttpError(400, '分数不合法');
    if (body.data.finalScore > ctx.score) throw new HttpError(400, `得分不能超过该题满分 ${ctx.score}`);

    run(
      'UPDATE answers SET final_score = ?, comment = ?, graded_at = ? WHERE id = ?',
      body.data.finalScore,
      body.data.comment ?? null,
      nowIso(),
      aid,
    );
    const total = recomputeSubmissionFinal(row.submission_id);
    audit(
      user.id,
      'answer',
      aid,
      'grade_override',
      { finalScore: row.final_score, comment: row.comment },
      { finalScore: body.data.finalScore, comment: body.data.comment ?? null },
      body.data.comment ?? null,
    );

    return { ok: true, submissionFinalScore: total };
  });

  // 一键确认自动分（只填补未人工改分的题）
  app.post('/teacher/exams/:id/confirm-auto', async (req) => {
    const user = requireTeacher(req);
    const exam = loadOwnedExam(user.id, Number((req.params as { id: string }).id));
    const subs = all<{ id: number }>('SELECT id FROM submissions WHERE exam_id = ?', exam.id);
    let changed = 0;
    for (const s of subs) {
      const res = run(
        'UPDATE answers SET final_score = auto_score, graded_at = ? WHERE submission_id = ? AND final_score IS NULL AND auto_score IS NOT NULL',
        nowIso(),
        s.id,
      );
      changed += res.changes;
      recomputeSubmissionFinal(s.id);
    }
    return { ok: true, changed };
  });
}

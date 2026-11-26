import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type { ExamDetailTeacher, ExamProgress } from '../shared/types.ts';

// pnpm exec tsx scripts/exam-lifecycle-check.ts
const dataDir = await mkdtemp(join(tmpdir(), 'zhijuan-lifecycle-'));
process.env.DATA_DIR = dataDir;
const { db, run, nowIso } = await import('../server/db.ts');
const { cookieSecret, hashPassword } = await import('../server/auth.ts');
const { HttpError } = await import('../server/http.ts');
const { authRoutes } = await import('../server/routes/auth.ts');
const { teacherRoutes } = await import('../server/routes/teacher.ts');
const { studentRoutes } = await import('../server/routes/student.ts');
const app = Fastify();

try {
  await app.register(cookie, { secret: cookieSecret() });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    return reply.send(err);
  });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(teacherRoutes, { prefix: '/api' });
  await app.register(studentRoutes, { prefix: '/api' });
  const stamp = nowIso();
  const add = (sql: string, ...args: (string | number)[]) => run(sql, ...args).lastInsertRowid;
  const classA = add('INSERT INTO classes (name, created_at) VALUES (?, ?)', '回归甲班', stamp);
  const classB = add('INSERT INTO classes (name, created_at) VALUES (?, ?)', '回归乙班', stamp);
  const teacherPhone = '13855550101';
  const teacher = add("INSERT INTO users (username, name, password_hash, role, phone, created_at) VALUES (?, '教师', ?, 'teacher', ?, ?)", teacherPhone, hashPassword(teacherPhone), teacherPhone, stamp);
  const student = (no: string, classId: number, active = 1) => add("INSERT INTO users (username, name, password_hash, role, class_id, student_no, is_active, created_at) VALUES (?, ?, '', 'student', ?, ?, ?, ?)", no, no, classId, no, active, stamp);
  const a1 = student('a1', classA);
  student('a2', classA);
  student('a3', classA);
  student('a0-disabled', classA, 0);
  student('b1', classB);

  const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, sid: string | null, status: number, payload?: Record<string, unknown>) => {
    const response = await app.inject({ method, url: `/api${url}`, cookies: sid ? { sid } : undefined, payload });
    assert.equal(response.statusCode, status, `${method} ${url}: ${response.body}`);
    return response;
  };
  const login = async (role: 'teacher' | 'student', payload: Record<string, unknown>) => (await call('POST', `/auth/${role}/login`, null, 200, payload)).cookies[0].value;
  const teacherSid = await login('teacher', { username: teacherPhone, password: teacherPhone });
  const a1Sid = await login('student', { name: 'a1', studentNo: 'a1' });
  const a2Sid = await login('student', { name: 'a2', studentNo: 'a2' });
  const a3Sid = await login('student', { name: 'a3', studentNo: 'a3' });
  const b1Sid = await login('student', { name: 'b1', studentNo: 'b1' });
  const create = (title: string) => {
    // Fixture points and answers are inserted directly to isolate lifecycle from Word parsing.
    const id = add('INSERT INTO exams (title, teacher_id, created_at) VALUES (?, ?, ?)', title, teacher, stamp);
    const questionId = add("INSERT INTO questions (exam_id, seq, type, stem_html, score, answer_json, needs_manual) VALUES (?, 1, 'short', '<p>说明理由</p>', 4, ?, 1)", id, JSON.stringify({ kind: 'short', rubric: '' }));
    return { id, questionId, tool: `/teacher/exams/${id}`, student: `/student/exams/${id}` };
  };
  const first = create('定向发卷');
  const progress = async () => (await call('GET', first.tool, teacherSid, 200)).json<ExamDetailTeacher>().progress;
  const initial = await progress();
  assert.equal(initial.expected, null);
  await call('POST', `${first.tool}/publish`, teacherSid, 400, {});
  const published = (await call('POST', `${first.tool}/publish`, teacherSid, 200, { audience: { type: 'classes', classIds: [classA] } })).json();
  assert.deepEqual(published.audience, { type: 'classes', classIds: [classA], studentCount: 3 });
  const expected = async (partial: Partial<ExamProgress>) => {
    const current = await progress();
    for (const [key, value] of Object.entries(partial)) assert.equal(current[key as keyof ExamProgress], value, key);
  };
  await expected({ expected: 3, notStarted: 3, inProgress: 0, submitted: 0 });
  // A transfer after publication must neither remove an eligible student nor add a new one.
  run('UPDATE users SET class_id = ? WHERE id = ?', classB, a1);
  run("UPDATE users SET class_id = ? WHERE student_no = 'b1'", classA);
  const listOf = async (sid: string) => (await call('GET', '/student/exams', sid, 200)).json<Array<{ id: number; submission?: { score: number | null } }>>();
  assert.ok((await listOf(a1Sid)).some((exam) => exam.id === first.id));
  assert.ok(!(await listOf(b1Sid)).some((exam) => exam.id === first.id));
  await call('GET', first.student, b1Sid, 404);
  const open = async (url: string, sid: string) => (await call('GET', url, sid, 200)).json<{ submission: { id: number } }>().submission.id;
  const started = await open(first.student, a1Sid);
  const submitted = await open(first.student, a2Sid);
  await expected({ notStarted: 1, inProgress: 2, submitted: 0 });
  const save = (id: number, sid: string, questionId: number) => call('PUT', `/student/submissions/${id}/draft`, sid, 200, { answers: { [questionId]: { text: '回归测试答案' } } });
  await save(started, a1Sid, first.questionId);
  await save(submitted, a2Sid, first.questionId);
  await call('POST', `/student/submissions/${submitted}/submit`, a2Sid, 200);
  await expected({ notStarted: 1, inProgress: 1, submitted: 1, grading: 1 });
  const release = (status: number) => call('POST', `${first.tool}/publish-results`, teacherSid, status, { published: true });
  await release(409);
  await call('POST', `${first.tool}/close`, teacherSid, 409, {});
  const collected = (await call('POST', `${first.tool}/close`, teacherSid, 200, { action: 'collect' })).json();
  assert.equal(collected.collected, 1);
  assert.equal(collected.discarded, 0);
  await expected({ notStarted: 1, inProgress: 0, submitted: 2, grading: 2 });
  await release(409);
  assert.equal((await call('GET', `/student/submissions/${started}`, a1Sid, 200)).json().questions.length, 0);
  // No worker runs in this inject harness. Complete scores deterministically so the gate can be tested at every stage.
  run("UPDATE grading_tasks SET status = 'failed' WHERE submission_id = ?", started);
  await expected({ failed: 1, grading: 1 });
  await release(409);
  run("UPDATE grading_tasks SET status = 'done' WHERE submission_id IN (?, ?)", started, submitted);
  run("UPDATE submissions SET status = 'graded', auto_score = 0 WHERE id IN (?, ?)", started, submitted);
  run('UPDATE answers SET auto_score = 0 WHERE submission_id IN (?, ?)', started, submitted);
  await expected({ needsReview: 2, finalized: 0 });
  assert.equal((await listOf(a1Sid)).find((exam) => exam.id === first.id)?.submission?.score, null);
  await release(409);
  const confirm = await call('POST', `${first.tool}/confirm-auto`, teacherSid, 200);
  assert.equal(confirm.json().changed, 0, '批量确认不得跳过人工题');
  for (const id of [started, submitted]) {
    const answerId = db.prepare('SELECT id FROM answers WHERE submission_id = ?').get(id)?.id;
    await call('PATCH', `/teacher/answers/${answerId}`, teacherSid, 200, { finalScore: 3 });
  }
  await expected({ needsReview: 0, finalized: 2 });
  await release(200);
  assert.equal((await listOf(a1Sid)).find((exam) => exam.id === first.id)?.submission?.score, 3);
  const result = (await call('GET', `/student/submissions/${started}`, a1Sid, 200)).json();
  assert.equal(result.resultsPublished, true);
  assert.equal(result.score, 3);
  await call('GET', `/student/submissions/${started}`, b1Sid, 403);

  const second = create('不收草稿');
  await call('POST', `${second.tool}/publish`, teacherSid, 200, { audience: { type: 'classes', classIds: [classA] } });
  const discardedId = await open(second.student, a3Sid);
  await save(discardedId, a3Sid, second.questionId);
  const discarded = (await call('POST', `${second.tool}/close`, teacherSid, 200, { action: 'discard' })).json();
  assert.equal(discarded.collected, 0);
  assert.equal(discarded.discarded, 1);
  const secondProgress = (await call('GET', second.tool, teacherSid, 200)).json<ExamDetailTeacher>().progress;
  assert.equal(secondProgress.submitted, 0);
  assert.equal(secondProgress.inProgress, 0);
  await call('POST', `/student/submissions/${discardedId}/submit`, a3Sid, 409);
  await call('POST', `${second.tool}/publish-results`, teacherSid, 409, { published: true });
  console.log('考试闭环 API 回归通过：定向发卷、转班后应考名单固定、未交卷、收卷与不收草稿、评分异常、人工复核和成绩发布。');
} finally {
  await app.close();
  db.close();
  await rm(dataDir, { recursive: true, force: true });
}

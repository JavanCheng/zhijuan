import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type { AdminWorkbench, BatchTeacherResult, ManagedTeacher } from '../shared/types.ts';

// Run with: pnpm exec tsx scripts/admin-api-check.ts
const dataDir = await mkdtemp(join(tmpdir(), 'zhijuan-admin-api-'));
process.env.DATA_DIR = dataDir;
const { db, get, run, nowIso } = await import('../server/db.ts');
const { adminRoutes } = await import('../server/routes/admin.ts');
const { authRoutes } = await import('../server/routes/auth.ts');
const { HttpError, audit } = await import('../server/http.ts');
const { cookieSecret, hashPassword } = await import('../server/auth.ts');
const api = Fastify();

try {
  await api.register(cookie, { secret: cookieSecret() });
  api.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    return reply.send(err);
  });
  await api.register(authRoutes, { prefix: '/api' });
  await api.register(adminRoutes, { prefix: '/api' });

  const stamp = nowIso();
  const adminId = run(
    "INSERT INTO users (username, name, password_hash, role, created_at) VALUES ('test-admin', '测试管理员', ?, 'admin', ?)",
    hashPassword('test-pass'), stamp,
  ).lastInsertRowid;
  const createLegacyTeacher = (username: string, name: string, phone: string | null) => run(
    "INSERT INTO users (username, name, password_hash, role, phone, created_at) VALUES (?, ?, ?, 'teacher', ?, ?)",
    username, name, hashPassword('test-pass'), phone, stamp,
  ).lastInsertRowid;
  const legacyId = createLegacyTeacher('test-legacy', '历史老师', ' \t ');
  const countMissing = () => get<{ count: number }>("SELECT COUNT(*) AS count FROM users WHERE role = 'teacher'")!.count;
  const initialTeacherCount = countMissing();

  const workbench = '/api/admin/workbench';
  assert.equal((await api.inject(workbench)).statusCode, 401);
  const teacherLogin = await api.inject({ method: 'POST', url: '/api/auth/teacher/login', payload: { username: 'test-legacy', password: 'test-pass' } });
  assert.equal(teacherLogin.statusCode, 200, teacherLogin.body);
  assert.equal((await api.inject({ url: workbench, cookies: { sid: teacherLogin.cookies[0].value } })).statusCode, 403);
  const login = await api.inject({ method: 'POST', url: '/api/auth/admin/login', payload: { username: 'test-admin', password: 'test-pass' } });
  assert.equal(login.statusCode, 200, login.body);
  const cookies = { sid: login.cookies[0].value };
  const before = (await api.inject({ url: workbench, cookies })).json<AdminWorkbench>();
  assert.ok(before.missingPhoneCount >= 1);

  const create = await api.inject({ method: 'POST', url: '/api/admin/teachers', cookies, payload: { name: '新老师', phone: '13855550199' } });
  assert.equal(create.statusCode, 200, create.body);
  const teacher = create.json<ManagedTeacher>();
  assert.equal(countMissing(), initialTeacherCount + 1);
  const teacherPath = `/api/admin/teachers/${teacher.id}`;
  const examId = run('INSERT INTO exams (title, teacher_id, created_at) VALUES (?, ?, ?)', '保留考试', teacher.id, stamp).lastInsertRowid;
  const studentId = run("INSERT INTO users (username, name, password_hash, role, created_at) VALUES ('test-student', '测试学生', '', 'student', ?)", stamp).lastInsertRowid;
  const submissionId = run("INSERT INTO submissions (exam_id, student_id, status, final_score, started_at) VALUES (?, ?, 'graded', 88, ?)", examId, studentId, stamp).lastInsertRowid;
  const batch = (action: string, ids: number[], purge?: boolean) => api.inject({ method: 'POST', url: '/api/admin/teachers/batch', cookies, payload: { action, ids, purge } });
  assert.equal((await batch('delete', [teacher.id, legacyId], true)).statusCode, 400);
  assert.equal((await api.inject({ method: 'DELETE', url: `${teacherPath}?purge=1`, cookies })).statusCode, 409);
  assert.equal((await api.inject({ method: 'DELETE', url: `/api/admin/teachers/${adminId}`, cookies })).statusCode, 404);
  assert.equal(countMissing(), initialTeacherCount + 1);

  const disabled = await batch('disable', [teacher.id, teacher.id, adminId]);
  assert.equal(disabled.statusCode, 200, disabled.body);
  assert.equal(disabled.json<BatchTeacherResult>().affected, 1);
  assert.equal((await batch('disable', [teacher.id])).json<BatchTeacherResult>().affected, 0);
  assert.equal(get<{ is_active: number }>('SELECT is_active FROM users WHERE id = ?', adminId)?.is_active, 1);
  assert.equal(get<{ is_active: number }>('SELECT is_active FROM users WHERE id = ?', teacher.id)?.is_active, 0);
  assert.equal(get<{ final_score: number }>('SELECT final_score FROM submissions WHERE id = ?', submissionId)?.final_score, 88);

  const deleted = await api.inject({ method: 'DELETE', url: `/api/admin/teachers/${legacyId}`, cookies });
  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal(countMissing(), initialTeacherCount);
  audit(adminId, 'user', teacher.id, 'unrelated_action', null, null);
  audit(studentId, 'user', teacher.id, 'reset_teacher_password', null, null);
  audit(adminId, 'user', teacher.id, 'update_teacher', { name: '新老师', isActive: true }, { name: '新老师', isActive: false });
  const result = await api.inject({ url: workbench, cookies });
  assert.equal(result.statusCode, 200, result.body);
  const summary = result.json<AdminWorkbench>();
  assert.equal(summary.missingPhoneCount, before.missingPhoneCount - 1);
  assert.ok(!result.body.includes('13855550199'));
  assert.ok(!result.body.includes('before_json'));
  assert.ok(summary.recentActions.length <= 10);
  assert.equal(summary.recentActions[0].action, 'disable_teacher');
  assert.ok(!summary.recentActions.some((action) => action.action === 'reset_teacher_password'));
  assert.equal(summary.recentActions.find((action) => action.action === 'delete_teacher')?.teacherName, '历史老师');
  assert.equal(summary.recentActions.find((action) => action.action === 'create_teacher')?.actorName, '测试管理员');
  const batchLogs = summary.recentActions.filter((action) => action.action === 'batch_disable_teacher');
  assert.equal(batchLogs.length, 1);
  assert.equal(batchLogs[0].affectedCount, 1);

  assert.equal(teacher.passwordState, 'default');
  assert.ok(!create.body.includes('password_hash'));
  assert.equal((await batch('enable', [teacher.id])).statusCode, 200);
  const signIn = (username: string, password: string) => api.inject({ method: 'POST', url: '/api/auth/teacher/login', payload: { username, password } });
  const defaultLogin = await signIn('13855550199', '13855550199');
  assert.equal(defaultLogin.statusCode, 200, defaultLogin.body);
  const change = (sid: string, currentPassword: string, newPassword: string) => api.inject({ method: 'POST', url: '/api/auth/teacher/change-password', cookies: { sid }, payload: { currentPassword, newPassword } });
  assert.equal((await change(cookies.sid, 'test-pass', 'Test-new-for-teacher!')).statusCode, 403);
  const sid = defaultLogin.cookies[0].value;
  assert.equal((await change(sid, 'wrong', 'Test-new-for-teacher!')).statusCode, 400);
  assert.equal((await change(sid, '13855550199', 'Test-new-for-teacher!')).statusCode, 200);
  assert.equal((await signIn('13855550199', '13855550199')).statusCode, 401);
  const updated = await api.inject({ method: 'PATCH', url: teacherPath, cookies, payload: { name: '改名老师', phone: '13855550198' } });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json<ManagedTeacher>().passwordState, 'custom');
  assert.ok(!updated.body.includes('Test-new-for-teacher!'));
  assert.equal((await signIn('13855550199', 'Test-new-for-teacher!')).statusCode, 401);
  assert.equal((await signIn('13855550198', 'Test-new-for-teacher!')).statusCode, 200);
  assert.equal((await api.inject({ method: 'POST', url: `${teacherPath}/reset-password`, cookies })).statusCode, 200);
  const replaced = await api.inject({ method: 'PATCH', url: teacherPath, cookies, payload: { phone: '13855550197' } });
  assert.equal(replaced.statusCode, 200, replaced.body);
  assert.equal(replaced.json<ManagedTeacher>().passwordState, 'default');
  assert.equal((await signIn('13855550197', '13855550197')).statusCode, 200);
  console.log('Admin API regression checks passed.');
} finally {
  await api.close();
  db.close();
  await rm(dataDir, { recursive: true, force: true });
}

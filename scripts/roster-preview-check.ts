import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import type { RosterPreviewResult } from '../shared/roster-preview.ts';

const folder = await mkdtemp(join(tmpdir(), 'zhijuan-roster-'));
process.env.DATA_DIR = folder;
const { db, get, run, nowIso } = await import('../server/db.ts');
const { cookieSecret } = await import('../server/auth.ts');
const { HttpError } = await import('../server/http.ts');
const { hashPassword } = await import('../server/password.ts');
const { authRoutes } = await import('../server/routes/auth.ts');
const { classRoutes } = await import('../server/routes/classes.ts');
const app = Fastify();
try {
  await app.register(cookie, { secret: cookieSecret() });
  await app.register(multipart);
  app.setErrorHandler((error, _req, reply) => error instanceof HttpError ? reply.code(error.status).send({ error: error.message }) : reply.send(error));
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(classRoutes, { prefix: '/api' });
  const timestamp = nowIso();
  run("INSERT INTO users (username,password_hash,name,role,phone,created_at) VALUES ('13800001000',?,'老师','teacher','13800001000',?)", hashPassword('test-pass'), timestamp);
  const baseClass = run("INSERT INTO classes (name,created_at) VALUES ('旧班',?)", timestamp).lastInsertRowid;
  const inactive = run("INSERT INTO users (username,password_hash,name,role,student_no,class_id,is_active,created_at) VALUES ('roster-old','','旧名','student','0001',?,0,?)", baseClass, timestamp).lastInsertRowid;
  const login = await app.inject({ method: 'POST', url: '/api/auth/teacher/login', payload: { username: '13800001000', password: 'test-pass' } });
  assert.equal(login.statusCode, 200, login.body);
  const cookies = { sid: login.cookies[0].value };
  const submit = (preview: boolean, rows: string, token?: string) => {
    const boundary = 'roster-test-boundary';
    return app.inject({ method: 'POST', url: `/api/teacher/students/import${preview ? '/preview' : ''}`, cookies, headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`, ...(token ? { 'x-roster-preview': token } : {}),
    }, payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="students.csv"\r\nContent-Type: text/csv\r\n\r\n\uFEFF班级,姓名,学号\r\n${rows}\r\n--${boundary}--\r\n` });
  };
  const rows = '新班,新名,0001\r\n新班,另一位,0002';
  assert.equal((await submit(false, rows)).statusCode, 409);
  const preview = await submit(true, rows);
  assert.equal(preview.statusCode, 200, preview.body);
  const plan = preview.json<RosterPreviewResult>();
  assert.ok(plan.previewToken);
  assert.deepEqual(plan.summary, { rowsRead: 2, classesCreated: 1, studentsCreated: 1, studentsUpdated: 1, studentsReactivated: 1, studentsTransferred: 1, studentsUnchanged: 0 });
  assert.equal(get('SELECT id FROM classes WHERE name = ?', '新班'), undefined);
  assert.equal(get<{ name: string }>('SELECT name FROM users WHERE id = ?', inactive)?.name, '旧名');
  assert.equal((await submit(false, rows.replace('另一位', '被更换'), plan.previewToken)).statusCode, 409);
  run('UPDATE users SET name = ? WHERE id = ?', '并发改名', inactive);
  assert.equal((await submit(false, rows, plan.previewToken)).statusCode, 409);
  const refreshed = (await submit(true, rows)).json<RosterPreviewResult>();
  const confirmed = await submit(false, rows, refreshed.previewToken);
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  assert.equal(get<{ is_active: number }>('SELECT is_active FROM users WHERE id = ?', inactive)?.is_active, 1);
  const unchanged = (await submit(true, rows)).json<RosterPreviewResult>();
  assert.equal(unchanged.summary.studentsUnchanged, 2);
  const duplicated = (await submit(true, '新班,同名,0001\r\n新班,另一位,0001')).json<RosterPreviewResult>();
  assert.equal(duplicated.ok, false);
  assert.equal(duplicated.previewToken, undefined);
  console.log('Roster preview API passed: no writes, meaningful counts, upload binding, concurrent conflict, confirm and no-ops.');
} finally {
  await app.close(); db.close(); await rm(folder, { recursive: true, force: true });
}

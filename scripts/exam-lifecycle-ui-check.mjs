// pnpm build first, then node scripts/exam-lifecycle-ui-check.mjs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { ensureDemoTeacher } from './lib/teacher-session.mjs';

const socket = createServer().listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
const temp = await mkdtemp(join(tmpdir(), 'zhijuan-exam-ui-'));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: temp },
  stdio: 'ignore',
});
const exited = once(server, 'exit');
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`测试服务器提前退出：${server.exitCode}`);
    if (await fetch(`${base}/api/health`).then((r) => r.ok, () => false)) { ready = true; break; }
    await delay(100);
  }
  assert.ok(ready, '测试服务器未就绪');
  assert.doesNotMatch(await (await fetch(`${base}/teacher`)).text(), /前端尚未构建/);
  const teacher = await ensureDemoTeacher(base);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, locale: 'zh-CN' });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const req = async (method, route, data) => {
    const response = await page.request.fetch(`${base}/api${route}`, { method, data });
    assert.ok(response.ok(), `${method} ${route}: ${await response.text()}`);
    return response.json();
  };
  await req('POST', '/auth/teacher/login', { username: teacher.phone, password: teacher.password });
  const exam = await req('POST', '/teacher/exams', { title: '班级发布浏览器回归' });
  const source = await req('POST', `/teacher/exams/${exam.id}/import`, { sample: true });
  await req('PUT', `/teacher/exams/${exam.id}/questions`, { questions: source.questions, sections: source.sections });
  const overview = await req('GET', '/teacher/classes/overview');
  const active = overview.classes.filter((item) => item.activeCount > 0);
  assert.ok(active.length >= 2, '需要至少两个已启用班级');
  const selected = active[0];
  await page.goto(`${base}/teacher/exam/${exam.id}`);
  await page.getByRole('button', { name: '发布考试', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const publish = dialog.getByRole('button', { name: '发布考试', exact: true });
  assert.ok(await publish.isDisabled(), '未选择班级时不得发布');
  await dialog.getByRole('checkbox', { name: new RegExp(selected.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).check();
  assert.equal(await publish.isEnabled(), true, '选中班级后，应允许发布');
  const [actual] = await Promise.all([
    page.waitForResponse((res) => res.url().endsWith(`/exams/${exam.id}/publish`) && res.request().method() === 'POST'),
    publish.click(),
  ]);
  assert.ok(actual.ok(), await actual.text());
  assert.deepEqual(actual.request().postDataJSON(), { audience: { type: 'classes', classIds: [selected.id] } });
  await dialog.waitFor({ state: 'hidden' });
  const detail = await req('GET', `/teacher/exams/${exam.id}`);
  assert.deepEqual(detail.audience, { type: 'classes', classIds: [selected.id], studentCount: selected.activeCount });
  assert.equal(detail.progress.expected, selected.activeCount);
  assert.deepEqual(errors, []);
  console.log('班级发布浏览器回归通过：未选班级不可发布、实际选择班级、正确请求和应考人数。');
} finally {
  await browser?.close();
  if (server.exitCode === null) server.kill();
  await exited;
  await rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

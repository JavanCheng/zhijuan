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
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPrcAAAAASUVORK5CYII=';
  source.questions[0].stemHtml += `<p><img alt="回归题图" src="${pixel}"></p>`;
  await req('PUT', `/teacher/exams/${exam.id}/questions`, { questions: source.questions, sections: source.sections });
  const overview = await req('GET', '/teacher/classes/overview');
  const active = overview.classes.filter((item) => item.activeCount > 0);
  assert.ok(active.length >= 2, '需要至少两个已启用班级');
  const selected = active[0];
  await page.goto(`${base}/teacher/exam/${exam.id}`);
  await page.getByRole('button', { name: '编辑题目' }).first().click();
  const editor = page.getByRole('dialog');
  const stem = editor.getByRole('textbox', { name: '题干', exact: true });
  await stem.getByRole('img', { name: '回归题图' }).waitFor();
  await stem.press('Home');
  await page.keyboard.insertText('已校对：');
  await editor.getByRole('button', { name: '保存题目' }).click();
  await page.getByText(/已校对：/).first().waitFor();
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
  const paper = page.locator('.teacher-paper-preview');
  await paper.getByText('教师核对版', { exact: true }).waitFor();
  await paper.getByRole('img', { name: '回归题图' }).waitFor();
  await paper.getByText('参考答案', { exact: true }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: /编辑题目|发布考试|结束考试|提交试卷/ }).count(), 0);
  const locked = await page.request.patch(`${base}/api/teacher/questions/${detail.questions[0].id}`, { data: { score: 20 } });
  assert.equal(locked.status(), 409);
  await page.setViewportSize({ width: 1920, height: 1080 });
  assert.ok(await paper.evaluate((node) => node.getBoundingClientRect().width < 1450));
  assert.ok(await paper.evaluate((node) => node.querySelector('img')?.naturalWidth > 0));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth).catch(async (error) => {
    console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 20).map((el) => [el.tagName, String(el.className), el.getBoundingClientRect().right])));
    throw error;
  });
  for (const [route, scope] of [
    ['/teacher/classes', '.teacher-layout-classes'],
    [`/teacher/analytics?examId=${exam.id}`, '.teacher-layout-analytics'],
    [`/teacher/exam/${exam.id}/grading`, '.teacher-layout-grading'],
  ]) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${base}${route}`);
    const content = page.locator(scope).first();
    await content.waitFor();
    assert.ok(await content.evaluate((node) => node.getBoundingClientRect().width <= 1440), route);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  }
  assert.deepEqual(errors, []);
  console.log('教师浏览器回归通过：题图、草稿编辑、班级发布、只读预览和宽窄屏。');
} finally {
  await browser?.close();
  if (server.exitCode === null) server.kill();
  await exited;
  await rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

// 先执行 pnpm build，再运行 node scripts/admin-ui-check.mjs。使用隔离的临时数据库。
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const socket = createServer().listen(0, '127.0.0.1');
await once(socket, 'listening');
const { port } = socket.address();
await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
const data = await mkdtemp(path.join(tmpdir(), 'zhijuan-admin-ui-'));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: data },
  stdio: 'ignore',
});
const exited = once(server, 'exit');
let browser;

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`测试服务器提前退出：${server.exitCode}`);
    if (await fetch(`${base}/api/health`).then((r) => r.ok, () => false)) {
      ready = true;
      break;
    }
    await delay(100);
  }
  assert.ok(ready, '测试服务器未就绪');
  const db = new DatabaseSync(path.join(data, 'app.db'));
  try {
    db.prepare(`INSERT INTO users (username, password_hash, name, role, phone, is_active, created_at)
      VALUES ('legacy-smoke', '', '历史教师', 'teacher', NULL, 1, ?)`).run(new Date().toISOString());
  } finally {
    db.close();
  }

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const auth = await page.request.post(`${base}/api/auth/admin/login`, { data: { username: 'admin', password: 'yby19980523' } });
  assert.ok(auth.ok(), '测试管理员未能登录');

  await page.goto(`${base}/admin`);
  await page.getByRole('heading', { name: '管理员工作台' }).waitFor();
  await page.getByRole('link', { name: /1 位教师待补全手机号/ }).click();
  await page.waitForURL('**/admin/teachers?missingPhone=1');
  await page.getByRole('row', { name: /历史教师/ }).waitFor();

  await page.getByRole('button', { name: /新增教师$/ }).click();
  const add = page.getByRole('dialog');
  await add.getByLabel('教师姓名').fill('回归教师');
  await add.getByLabel('手机号').fill('13800008787');
  await add.getByRole('button', { name: '创建账号' }).click();
  const view = page.getByRole('button', { name: '查看账号' });
  await view.waitFor();
  assert.match(page.url(), /missingPhone=1/);
  await view.click();
  const row = page.getByRole('row', { name: /回归教师/ });
  await row.waitFor();
  const showDefault = row.getByRole('button', { name: '显示回归教师的默认密码' });
  await showDefault.click();
  assert.equal(await row.locator('.teacher-password-mask').innerText(), '13800008787');
  await row.getByRole('button', { name: '隐藏回归教师的默认密码' }).click();
  await page.route('**/api/admin/overview', (route) => route.fulfill({ status: 503, json: { error: '模拟刷新失败' } }));
  await page.getByRole('button', { name: /刷新$/ }).click();
  await page.getByText(/刷新失败.*上次数据/).first().waitFor();
  assert.ok(await row.isVisible(), '刷新失败后，原列表不应消失');
  await page.unroute('**/api/admin/overview');
  await page.getByRole('button', { name: '返回筛选结果' }).click();
  await page.getByRole('row', { name: /历史教师/ }).waitFor();
  await page.getByRole('button', { name: /^重\s*试$/ }).click();
  await page.getByText(/刷新失败.*上次数据/).first().waitFor({ state: 'hidden' });
  await page.getByText('教师列表已刷新').waitFor();
  await page.getByText('教师列表已刷新').waitFor({ state: 'hidden' });
  if (process.env.ADMIN_TEACHERS_SHOT) {
    await page.screenshot({ path: process.env.ADMIN_TEACHERS_SHOT, animations: 'disabled' });
  }

  await page.getByRole('link', { name: '工作台', exact: true }).click();
  await page.getByText('创建教师账号', { exact: true }).waitFor();
  await page.getByText(/· 回归教师/).waitFor();
  if (process.env.ADMIN_WORKBENCH_SHOT) {
    await page.screenshot({ path: process.env.ADMIN_WORKBENCH_SHOT, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '移动端工作台不应横向溢出');
  const teacherPage = await browser.newPage();
  const teacherAuth = await teacherPage.request.post(`${base}/api/auth/teacher/login`, { data: { username: '13800008787', password: '13800008787' } });
  assert.ok(teacherAuth.ok());
  await teacherPage.goto(`${base}/teacher`);
  await teacherPage.getByRole('button', { name: /回归教师 · 账户菜单/ }).click();
  await teacherPage.getByRole('menuitem', { name: /修改密码/ }).click();
  const passwordDialog = teacherPage.getByRole('dialog');
  await passwordDialog.getByLabel('当前密码', { exact: true }).fill('13800008787');
  await passwordDialog.getByLabel('新密码', { exact: true }).fill('Teacher-test-2026!');
  await passwordDialog.getByLabel('确认新密码', { exact: true }).fill('Teacher-test-2026!');
  await passwordDialog.getByRole('button', { name: '保存新密码' }).click();
  await teacherPage.getByText('密码已修改，下次请使用新密码登录').waitFor();
  await teacherPage.close();

  await page.goto(`${base}/admin/teachers`);
  const changed = page.getByRole('row', { name: /回归教师/ });
  await changed.getByText('已修改 · 不可查看').waitFor();
  assert.equal(await changed.getByRole('button', { name: /显示.*默认密码/ }).count(), 0);
  await page.setViewportSize({ width: 1920, height: 1000 });
  assert.ok(await page.locator('.teacher-accounts-page').evaluate((el) => el.getBoundingClientRect().width <= 1200));
  await changed.getByRole('button', { name: /^编\s*辑$/ }).click();
  const edit = page.getByRole('dialog');
  await edit.getByLabel('教师姓名').fill('回归教师已编辑');
  await edit.getByLabel('手机号').fill('13800008786');
  await edit.getByText('保存后须用新手机号登录，原密码不变。').waitFor();
  await edit.getByRole('button', { name: '保存修改' }).click();
  await page.getByRole('row', { name: /回归教师已编辑/ }).getByText('13800008786').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '移动端教师列表不应横向溢出');
  assert.deepEqual(errors, [], '不应出现浏览器脚本错误');
  console.log('管理员浏览器回归通过：工作台、待办筛选、新增定位、刷新失败保留数据、审计摘要');
} finally {
  await browser?.close();
  if (server.exitCode === null) server.kill();
  await exited;
  await rm(data, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

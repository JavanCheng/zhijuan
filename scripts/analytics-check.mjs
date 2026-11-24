// 学情看板与整体视觉巡检（需要演示数据：pnpm demo:data）
// 用法：pnpm build && pnpm start，然后 node scripts/analytics-check.mjs
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8787';
const OUT = 'audit';
fs.mkdirSync(OUT, { recursive: true });

const issues = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function session(width = 1440, height = 900) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) {
      issues.push(`console: ${message.text()}`);
    }
  });
  return page;
}

async function login(page, username) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[autocomplete="username"]', username);
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
}

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log(`  ✓ ${OUT}/${name}.png`);
}

async function waitCharts(page, count = 1) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('canvas').length >= expected,
    count,
    { timeout: 15000 },
  );
}

async function checkOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (overflow.scrollWidth > overflow.clientWidth + 2) {
    issues.push(`${label} 横向溢出：${overflow.scrollWidth}px > ${overflow.clientWidth}px`);
  }
}

const teacher = await session();
await login(teacher, 'teacher');
await teacher.waitForURL('**/teacher');
await teacher.waitForSelector('text=考试管理');
await shot(teacher, 'w01-teacher-home');

await teacher.goto(`${BASE}/teacher/analytics`, { waitUntil: 'networkidle' });
await teacher.waitForSelector('text=参评人数', { timeout: 20000 });
await waitCharts(teacher, 4);
await shot(teacher, 'w02-analytics-overview');
console.log('  总览看板 OK');

await teacher.locator('.ant-tabs-tab:has-text("班级对比")').click();
await teacher.waitForTimeout(700);
await waitCharts(teacher, 3);
await shot(teacher, 'w03-analytics-classes');
console.log('  班级对比 OK');

await teacher.locator('.ant-tabs-tab:has-text("学生对比")').click();
await teacher.waitForTimeout(700);
await waitCharts(teacher, 2);
await shot(teacher, 'w04-analytics-students');

await teacher.locator('button:has-text("画像")').first().click();
await teacher.waitForSelector('.ant-drawer', { timeout: 15000 });
await teacher.waitForTimeout(900);
await waitCharts(teacher, 1);
await shot(teacher, 'w05-student-profile', false);
await teacher.locator('.ant-drawer-close').first().click();
await teacher.waitForTimeout(500);
console.log('  学生画像 OK');

await teacher.goto(`${BASE}/teacher/analytics?examId=4&classIds=1,2`, { waitUntil: 'networkidle' });
await teacher.waitForSelector('text=参评人数');
await waitCharts(teacher, 4);
await shot(teacher, 'w06-analytics-two-classes');
console.log('  多班级筛选 OK');

await teacher.goto(`${BASE}/teacher/analytics?examId=4&classIds=1&studentIds=2,3,4`, { waitUntil: 'networkidle' });
await teacher.waitForSelector('text=参评人数');
await teacher.locator('.ant-tabs-tab:has-text("学生对比")').click();
await teacher.waitForTimeout(800);
await waitCharts(teacher, 2);
await shot(teacher, 'w07-analytics-student-compare');
console.log('  多学生对比 OK');

await teacher.locator('button:has-text("班级设置")').first().click();
await teacher.waitForSelector('.ant-drawer', { timeout: 15000 });
await teacher.waitForTimeout(600);
await shot(teacher, 'w08-class-settings', false);
await teacher.locator('.ant-drawer-close').first().click();
console.log('  班级设置 OK');

await teacher.goto(`${BASE}/teacher/exam/1/grading`, { waitUntil: 'networkidle' });
await teacher.waitForSelector('text=已提交');
await shot(teacher, 'w09-grading');
await teacher.locator('button:has-text("批改")').first().click();
await teacher.waitForSelector('text=本卷得分');
await shot(teacher, 'w10-submission');
console.log('  批改台与单份批改 OK');

// 学生端
const student = await session();
await login(student, 's01');
await student.waitForURL('**/student');
await student.waitForSelector('text=你好');
await shot(student, 'w11-student-home');
await student.locator('button:has-text("查看成绩")').first().click();
await student.waitForSelector('.score-hero', { timeout: 15000 });
await shot(student, 'w12-student-result');
console.log('  学生端 OK');

// 移动端
const mobile = await session(390, 844);
await login(mobile, 'teacher');
await mobile.waitForURL('**/teacher');
await mobile.waitForSelector('text=考试管理');
await shot(mobile, 'w13-mobile-home', false);
await checkOverflow(mobile, '移动端教师首页');
await mobile.locator('button[aria-label="打开导航"]').click();
await mobile.waitForTimeout(500);
await shot(mobile, 'w14-mobile-nav', false);
await mobile.locator('.sider-nav-item:has-text("学情看板")').click();
await mobile.waitForSelector('text=参评人数', { timeout: 20000 });
await mobile.waitForTimeout(1200);
await shot(mobile, 'w15-mobile-analytics', false);
await checkOverflow(mobile, '移动端学情看板');
await mobile.locator('button:has-text("班级设置")').first().click();
await mobile.waitForSelector('.ant-drawer', { timeout: 15000 });
await mobile.waitForTimeout(500);
const drawerWidth = await mobile
  .locator('.ant-drawer-content-wrapper')
  .first()
  .evaluate((element) => element.getBoundingClientRect().width);
if (drawerWidth > 392) issues.push(`移动端班级设置抽屉超出屏幕：${drawerWidth}px`);
await shot(mobile, 'w16-mobile-class-settings', false);
await mobile.locator('.ant-drawer-close').first().click();
console.log('  移动端 OK');

await browser.close();

if (issues.length) {
  console.log('\n控制台问题：');
  for (const issue of issues) console.log('  -', issue);
  process.exitCode = 1;
} else {
  console.log('\n视觉巡检完成，无控制台错误。');
}

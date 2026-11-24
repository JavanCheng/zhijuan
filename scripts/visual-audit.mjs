// 视觉巡检：抓取各页面截图，便于系统性检查间距与排版
// 用法：node scripts/visual-audit.mjs
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8787';
const OUT = 'audit';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const issues = [];

function watch(page) {
  page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('401 (Unauthorized)')) issues.push(`console: ${m.text()}`);
  });
}

async function session(width = 1440, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  watch(page);
  return page;
}

async function loginTeacher(page) {
  await page.goto(`${BASE}/teacher/login`, { waitUntil: 'networkidle' });
  await page.fill('input[autocomplete="username"]', 'teacher');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
}

async function loginStudent(page, name, studentNo) {
  await page.goto(`${BASE}/student/login`, { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="请输入姓名"]', name);
  await page.fill('input[placeholder="请输入学号"]', studentNo);
  await page.click('button[type="submit"]');
}

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log(`  ✓ ${OUT}/${name}.png`);
}

// ── 教师端 ─────────────────────────────────────────────
const teacher = await session();
await teacher.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await shot(teacher, 't01-login');

await loginTeacher(teacher);
await teacher.waitForURL('**/teacher');
await teacher.waitForSelector('text=考试管理');
await shot(teacher, 't02-home', true);

await teacher.locator('button:has-text("新建考试")').first().click();
await teacher.waitForSelector('.ant-modal');
await shot(teacher, 't03-create-modal');
await teacher.locator('.ant-modal-close').first().click();
await teacher.waitForTimeout(300);

await teacher.click('table tbody tr.ant-table-row');
await teacher.waitForSelector('text=题目列表');
await shot(teacher, 't04-exam-detail', true);

await teacher.click('button:has-text("使用示例模板试导入")');
await teacher.waitForSelector('text=解析预览', { timeout: 20000 });
await teacher.waitForTimeout(600);
await shot(teacher, 't05-import-modal');
await teacher.locator('.ant-modal-close').first().click();
await teacher.waitForTimeout(300);

const examUrl = teacher.url().replace(/\/$/, '');
await teacher.goto(`${examUrl}/grading`, { waitUntil: 'networkidle' });
await teacher.waitForSelector('text=已提交');
await shot(teacher, 't06-grading', true);

await teacher.click('button:has-text("批改")');
await teacher.waitForSelector('text=自动评分依据');
await shot(teacher, 't07-submission', true);

// 1280 宽度下的教师首页
const teacherNarrow = await session(1280, 800);
await loginTeacher(teacherNarrow);
await teacherNarrow.waitForURL('**/teacher');
await teacherNarrow.waitForSelector('text=考试管理');
await shot(teacherNarrow, 't08-home-1280', true);

// ── 学生端（s02，未提交）──────────────────────────────
const student = await session();
await loginStudent(student, '王梓萱', '20250302');
await student.waitForURL('**/student');
await student.waitForSelector('text=你好');
await shot(student, 's01-home', true);

await student.locator('button:has-text("开始作答"), button:has-text("继续作答")').first().click();
await student.waitForSelector('text=第 1 题');
await shot(student, 's02-q1-single');

for (let i = 2; i <= 6; i++) {
  await student.click('button:has-text("下一题")');
  await student.waitForTimeout(350);
  await shot(student, `s0${i + 1}-q${i}`);
}

await student.click('button:has-text("提交试卷")');
await student.waitForSelector('.ant-modal');
await shot(student, 's08-submit-modal');
await student.locator('.ant-modal-close').first().click();

const studentNarrow = await session(1280, 800);
await loginStudent(studentNarrow, '王梓萱', '20250302');
await studentNarrow.waitForURL('**/student');
await studentNarrow.locator('button:has-text("继续作答")').first().click();
await studentNarrow.waitForSelector('text=第 1 题');
await shot(studentNarrow, 's09-exam-1280');

// ── 学生成绩（s01）────────────────────────────────────
const result = await session();
await loginStudent(result, '李子涵', '20250301');
await result.waitForURL('**/student');
await result.locator('button:has-text("查看成绩")').first().click();
await result.waitForSelector('.score-hero');
await shot(result, 's10-result', true);

await browser.close();

if (issues.length) {
  console.log('\n控制台问题：');
  for (const i of issues) console.log('  -', i);
}
console.log('\n审计截图完成。');

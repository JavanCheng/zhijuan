// UI 端到端检查（antd v6 版，使用系统已安装的 Edge）
// 用法：node scripts/ui-check.mjs   （需先 pnpm build && pnpm start）
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { ensureDemoTeacher } from './lib/teacher-session.mjs';

const BASE = 'http://127.0.0.1:8787';
const demoTeacher = await ensureDemoTeacher(BASE);
const SHOTS = 'shots';
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function newSession() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (m.text().includes('401 (Unauthorized)')) return;
    errors.push(`console: ${m.text()}`);
  });
  return page;
}

async function loginTeacher(page) {
  await page.goto(`${BASE}/teacher/login`, { waitUntil: 'networkidle' });
  await page.fill('input[autocomplete="username"]', demoTeacher.phone);
  await page.fill('input[type="password"]', demoTeacher.password);
  await page.click('button[type="submit"]');
}

async function loginStudent(page, name, studentNo) {
  await page.goto(`${BASE}/student/login`, { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="请输入姓名"]', name);
  await page.fill('input[placeholder="请输入学号"]', studentNo);
  await page.click('button[type="submit"]');
}

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
  console.log(`  ✓ ${SHOTS}/${name}.png`);
}

const teacher = await newSession();
await teacher.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await shot(teacher, '01-login');

// ── 教师端 ──────────────────────────────────────────────
await loginTeacher(teacher);
await teacher.waitForURL('**/teacher');
await teacher.waitForSelector('text=考试管理');
await shot(teacher, '02-teacher-home', true);
console.log('  教师端首页 OK');

await teacher.click('button:has-text("试卷详情")');
await teacher.waitForSelector('text=题目列表');
await shot(teacher, '03-teacher-exam', true);
console.log('  试卷详情 OK');

const gradingUrl = teacher.url().replace(/\/$/, '') + '/grading';
await teacher.goto(gradingUrl, { waitUntil: 'networkidle' });
await teacher.waitForSelector('text=已提交');
await shot(teacher, '04-teacher-grading-empty', true);
console.log('  批改台 OK');

// ── 学生作答 ────────────────────────────────────────────
const student = await newSession();
await loginStudent(student, '李子涵', '20250301');
await student.waitForURL('**/student');
await student.waitForSelector('text=你好');
await shot(student, '05-student-home', true);

await student.click('button:has-text("开始作答")');
await student.waitForSelector('text=第 1 题');
await shot(student, '06-student-exam-q1');
console.log('  学生取卷 OK');

// Q1 单选 B
await student.locator('label.ant-radio-wrapper', { hasText: 'RAM' }).click();
await student.click('button:has-text("下一题")');
await student.waitForTimeout(250);

// Q2 多选 A C D
await student.locator('label.ant-checkbox-wrapper', { hasText: '键盘' }).click();
await student.locator('label.ant-checkbox-wrapper', { hasText: '鼠标' }).click();
await student.locator('label.ant-checkbox-wrapper', { hasText: '扫描仪' }).click();
await student.click('button:has-text("下一题")');
await student.waitForTimeout(250);

// Q3 判断 正确
await student.locator('label.ant-radio-button-wrapper', { hasText: '正确' }).click();
await student.click('button:has-text("下一题")');
await student.waitForTimeout(250);

// Q4 填空
await student.locator('input[placeholder="填写答案"]').nth(0).fill('1024');
await student.locator('input[placeholder="填写答案"]').nth(1).fill('1024');
await student.click('button:has-text("下一题")');
await student.waitForTimeout(250);

// Q5 简答
await student.locator('textarea[placeholder="请在这里作答……"]').fill(
  '死循环是程序无法自行结束、一直重复执行同一段代码的状态，会导致程序卡死并持续占用 CPU。',
);
await student.click('button:has-text("下一题")');
await student.waitForTimeout(300);

// Q6 代码
await student.locator('.code-editor').fill('n = int(input())\nprint(n * (n + 1) // 2)');
await shot(student, '07-student-exam-code');

await student.click('button:has-text("提交试卷")');
await student.locator('.ant-modal-footer button', { hasText: '确认提交' }).click();
await student.waitForURL('**/student/result/**');
await shot(student, '08-student-waiting');
console.log('  提交完成');

// ── 教师批改并发布 ──────────────────────────────────────
await teacher.goto(gradingUrl, { waitUntil: 'networkidle' });
await teacher.waitForSelector('table tbody tr');
await teacher.waitForTimeout(1200);
await shot(teacher, '09-teacher-grading-list', true);

await teacher.click('button:has-text("批改")');
await teacher.waitForSelector('text=自动评分依据');
await shot(teacher, '10-teacher-review', true);
console.log('  单份批改页 OK');

const shortCard = teacher.locator('.ant-card').filter({ hasText: '需人工评分' }).first();
await shortCard.locator('.ant-input-number input').fill('18');
await shortCard.locator('button:has-text("保存本题")').click();
await teacher.waitForTimeout(1000);
await shot(teacher, '10b-teacher-review-graded', true);
console.log('  人工改分 OK');

await teacher.goto(gradingUrl, { waitUntil: 'networkidle' });
await teacher.click('button:has-text("发布成绩")');
await teacher.locator('.ant-modal .ant-btn-primary').click();
await teacher.waitForTimeout(1200);
await teacher.waitForSelector('text=成绩已发布');
console.log('  成绩发布 OK');

// ── 学生看成绩 ──────────────────────────────────────────
await student.reload({ waitUntil: 'networkidle' });
await student.waitForSelector('.score-hero', { timeout: 15000 });
await shot(student, '11-student-result', true);

const scoreText = await student.locator('.score-hero').innerText();
console.log(`  学生成绩：${scoreText.replace(/\s+/g, ' ')}`);

await browser.close();

if (errors.length) {
  console.log('\n浏览器控制台错误：');
  for (const e of errors) console.log('  -', e);
  process.exitCode = 1;
} else {
  console.log('\nUI 检查通过，无控制台错误。');
}

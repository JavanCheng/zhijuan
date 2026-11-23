// UI 端到端检查（使用系统已安装的 Edge，无需下载浏览器）
// 用法：node scripts/ui-check.mjs   （需先 pnpm start）
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8787';
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
    // 未登录时 /api/auth/me 返回 401 属预期，浏览器会记一条资源错误
    if (m.text().includes('401 (Unauthorized)')) return;
    errors.push(`console: ${m.text()}`);
  });
  return page;
}

async function login(page, username) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[autocomplete="username"]', username);
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
}

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
  console.log(`  ✓ ${SHOTS}/${name}.png`);
}

// ── 1. 登录页 ────────────────────────────────────────────
const teacher = await newSession();
teacher.on('dialog', (d) => void d.accept());
await teacher.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await shot(teacher, '01-login');

// ── 2. 教师端 ────────────────────────────────────────────
await login(teacher, 'teacher');
await teacher.waitForURL('**/teacher');
await teacher.waitForSelector('text=考试管理');
await shot(teacher, '02-teacher-home', true);
console.log('  教师端首页 OK');

await teacher.click('a:has-text("试卷详情")');
await teacher.waitForSelector('text=题目列表');
await shot(teacher, '03-teacher-exam', true);
console.log('  试卷详情 OK');

const gradingUrl = teacher.url().replace('/teacher/exam/', '/teacher/exam/').replace(/$/, '') + '/grading';
await teacher.goto(gradingUrl, { waitUntil: 'networkidle' });
await teacher.waitForSelector('.stat-grid');
await shot(teacher, '04-teacher-grading-empty', true);
console.log('  批改台 OK');

// ── 3. 学生端作答 ────────────────────────────────────────
const student = await newSession();
await login(student, 's01');
await student.waitForURL('**/student');
await student.waitForSelector('text=你好');
await shot(student, '05-student-home', true);

await student.click('a:has-text("开始作答")');
await student.waitForSelector('.question-card');
await shot(student, '06-student-exam-q1');
console.log('  学生取卷 OK');

// Q1 单选 B
await student.locator('.options .option').nth(1).click();
await student.click('button:has-text("下一题")');
// Q2 多选 A C D
await student.waitForTimeout(200);
await student.locator('.options .option').nth(0).click();
await student.locator('.options .option').nth(2).click();
await student.locator('.options .option').nth(3).click();
await student.click('button:has-text("下一题")');
// Q3 判断
await student.waitForTimeout(200);
await student.locator('.tf-btn').nth(0).click();
await student.click('button:has-text("下一题")');
// Q4 填空
await student.waitForTimeout(200);
await student.locator('.fills input').nth(0).fill('1024');
await student.locator('.fills input').nth(1).fill('1024');
await student.click('button:has-text("下一题")');
// Q5 简答
await student.waitForTimeout(200);
await student.locator('.textarea').fill('死循环是程序无法自行结束、一直重复执行同一段代码的状态，会导致程序卡死并持续占用 CPU。');
await student.click('button:has-text("下一题")');
// Q6 代码
await student.waitForTimeout(300);
await student.locator('.editor').fill('n = int(input())\nprint(n * (n + 1) // 2)');
await shot(student, '07-student-exam-code');

await student.click('button:has-text("检查并提交")');
await student.click('button:has-text("确认提交")');
await student.waitForURL('**/student/result/**');
await shot(student, '08-student-waiting');
console.log('  提交完成');

// ── 4. 教师批改并发布 ────────────────────────────────────
await teacher.goto(gradingUrl, { waitUntil: 'networkidle' });
await teacher.waitForSelector('table.table tbody tr');
await teacher.waitForTimeout(1200);
await shot(teacher, '09-teacher-grading-list', true);

await teacher.click('a:has-text("批改")');
await teacher.waitForSelector('text=自动评分依据');
await shot(teacher, '10-teacher-review', true);
console.log('  单份批改页 OK');

// 给简答题人工打分
const shortCard = teacher.locator('.review-card').filter({ hasText: '简答' });
await shortCard.locator('input[type="number"]').fill('18');
await shortCard.locator('button:has-text("保存本题")').click();
await teacher.waitForTimeout(900);
await shot(teacher, '10b-teacher-review-graded', true);
console.log('  人工改分 OK');

await teacher.goto(gradingUrl, { waitUntil: 'networkidle' });
await teacher.click('button:has-text("发布成绩")');
await teacher.waitForTimeout(1200);
await teacher.waitForSelector('text=成绩已发布');
console.log('  成绩发布 OK');

// ── 5. 学生看成绩 ────────────────────────────────────────
await student.reload({ waitUntil: 'networkidle' });
await student.waitForSelector('.result-hero', { timeout: 15000 });
await shot(student, '11-student-result', true);

const scoreText = await student.locator('.score-big').innerText();
console.log(`  学生成绩：${scoreText.replace(/\s+/g, ' ')}`);

await browser.close();

if (errors.length) {
  console.log('\n浏览器控制台错误：');
  for (const e of errors) console.log('  -', e);
  process.exitCode = 1;
} else {
  console.log('\nUI 检查通过，无控制台错误。');
}

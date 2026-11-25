// 视觉校验：真实试卷导入后的教师端/学生端页面截图
// 用临时 DATA_DIR + 端口 8799，不碰 data/app.db；截图输出到 shots/real-paper/
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ensureDemoTeacher } from './lib/teacher-session.mjs';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zhijuan-shot-'));
const OUT = path.join(ROOT, 'shots', 'real-paper');
fs.mkdirSync(OUT, { recursive: true });

const PAPER = path.join(ROOT, 'templates', '川沙中学信息技术综合练习卷(1)(1).docx');
const ANSWER = path.join(ROOT, 'templates', '川沙中学信息技术综合练习卷(1)（参考答案）(1).docx');

const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', () => {});
server.stderr.on('data', () => {});

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

let cookie = '';
async function api(method, url, body, isForm = false) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (isForm) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}/api${url}`, { method, headers, body: payload });
  for (const item of res.headers.getSetCookie?.() ?? []) {
    if (item.startsWith('sid=')) cookie = item.split(';')[0];
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
  return json;
}

async function contextWithCookie(browser, cookiePair) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const eq = cookiePair.indexOf('=');
  await ctx.addCookies([
    { name: cookiePair.slice(0, eq), value: cookiePair.slice(eq + 1), domain: '127.0.0.1', path: '/' },
  ]);
  return ctx;
}

const shot = async (page, name, fullPage = true) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, name), fullPage });
  console.log(`  ✓ ${name}`);
};

let browser = null;
try {
  await waitReady();
  console.log('▶ 造数据');
  // ── 造数据：导入真实卷 → 发布 → 学生作答 ──
  const teacher = await ensureDemoTeacher(BASE);
  await api('POST', '/auth/teacher/login', { username: teacher.phone, password: teacher.password });
  const teacherCookie = cookie;
  const exam = await api('POST', '/teacher/exams', { title: '川沙中学信息技术综合练习卷(1)', durationMin: 60 });
  // 单独一场空考试，用来演示「两份 docx 导入预览」（有提交记录后上传会锁定）
  const previewExam = await api('POST', '/teacher/exams', { title: '导入预览（真实试卷 + 参考答案）', durationMin: 60 });

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(PAPER)]), path.basename(PAPER));
  form.append('file', new Blob([fs.readFileSync(ANSWER)]), path.basename(ANSWER));
  const parsed = await api('POST', `/teacher/exams/${exam.id}/import`, form, true);
  await api('PUT', `/teacher/exams/${exam.id}/questions`, JSON.parse(JSON.stringify({ questions: parsed.questions, sections: parsed.sections })));
  await api('POST', `/teacher/exams/${exam.id}/publish`);

  // 学生 1：作答并提交（用于批改台/成绩页截图）
  cookie = '';
  await api('POST', '/auth/student/login', { name: '李子涵', studentNo: '20250301' });
  const student1Cookie = cookie;
  const page1 = await api('GET', `/student/exams/${exam.id}`);
  const bySeq = new Map(page1.questions.map((q) => [q.seq, q]));
  await api('PUT', `/student/submissions/${page1.submission.id}/draft`, {
    answers: {
      [bySeq.get(1).id]: { key: 'C' },
      [bySeq.get(2).id]: { blanks: ['85'] },
      [bySeq.get(4).id]: { blanks: ['有损压缩', '压缩率高', '画面质量损失且不可逆'] },
      [bySeq.get(5).id]: { keys: ['B', 'C'] },
      [bySeq.get(6).id]: { key: 'A' },
      [bySeq.get(13).id]: { blanks: ['广域网', '路由器'] },
      [bySeq.get(30).id]: { blanks: ['②', '①', '③'] },
    },
  });
  await api('POST', `/student/submissions/${page1.submission.id}/submit`);
  for (let i = 0; i < 60; i++) {
    const sub = await api('GET', `/student/submissions/${page1.submission.id}`);
    if (sub.submission.status === 'graded') break;
    await new Promise((r) => setTimeout(r, 400));
  }
  cookie = teacherCookie;
  await api('POST', `/teacher/exams/${exam.id}/publish-results`, { published: true });

  // 学生 2：未提交（用于答题页截图）
  cookie = '';
  await api('POST', '/auth/student/login', { name: '王梓萱', studentNo: '20250302' });
  const student2Cookie = cookie;
  const page2 = await api('GET', `/student/exams/${exam.id}`);
  await api('PUT', `/student/submissions/${page2.submission.id}/draft`, {
    answers: { [page2.questions[0].id]: { key: 'C' } },
  });

  // ── 截图 ──
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  console.log('\n▶ 截图');

  const teacherCtx = await contextWithCookie(browser, teacherCookie);
  const tPage = await teacherCtx.newPage();
  tPage.setDefaultTimeout(20000);
  await tPage.goto(`${BASE}/teacher/exam/${exam.id}`, { waitUntil: 'load' });
  await shot(tPage, '01-teacher-exam.png');
  console.log('  · 教师试卷页完成');

  // 打开解析预览：在空考试里用真实浏览器上传两份 docx
  await tPage.goto(`${BASE}/teacher/exam/${previewExam.id}`, { waitUntil: 'load' });
  console.log('  · 打开空考试页');
  const input = tPage.locator('input[type=file]');
  await input.setInputFiles([PAPER, ANSWER]);
  await tPage.waitForTimeout(600);
  console.log('  · 已选择两份文件');
  const [importResp] = await Promise.all([
    tPage.waitForResponse((r) => r.url().includes('/import') && r.request().method() === 'POST', { timeout: 60000 }),
    tPage.getByRole('button', { name: /解析并预览/ }).click(),
  ]);
  const importBody = await importResp.json().catch(() => ({}));
  console.log(`  · 解析接口 ${importResp.status()}：${importBody.counts ? `${importBody.counts.total} 题 / ${importBody.counts.totalScore} 分 / ${importBody.counts.errors} 错误` : importBody.error}`);
  await tPage.waitForTimeout(2500);
  await shot(tPage, '02-import-preview.png', false);
  await tPage.keyboard.press('Escape');
  await tPage.waitForTimeout(300);

  await tPage.goto(`${BASE}/teacher/submission/${page1.submission.id}`, { waitUntil: 'load' });
  await shot(tPage, '03-teacher-submission.png', false);

  const student2Ctx = await contextWithCookie(browser, student2Cookie);
  const s2 = await student2Ctx.newPage();
  s2.setDefaultTimeout(20000);
  await s2.goto(`${BASE}/student/exam/${exam.id}`, { waitUntil: 'load' });
  await shot(s2, '04-student-exam.png');

  const student1Ctx = await contextWithCookie(browser, student1Cookie);
  const s1 = await student1Ctx.newPage();
  s1.setDefaultTimeout(20000);
  await s1.goto(`${BASE}/student/result/${page1.submission.id}`, { waitUntil: 'load' });
  await shot(s1, '05-student-result.png', false);

  console.log(`\n截图目录：${path.relative(ROOT, OUT)}`);
} catch (err) {
  console.error('\n✗ 视觉校验失败：', err.message);
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } catch {
    /* ignore */
  }
  server.kill();
  await new Promise((r) => setTimeout(r, 300));
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  process.exit(process.exitCode ?? 0);
}

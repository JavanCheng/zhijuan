// 端到端校验：真实试卷 + 参考答案 → 导入 → 发布 → 学生作答 → 自动判分
// 用临时 DATA_DIR，不碰 data/app.db
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureDemoTeacher } from './lib/teacher-session.mjs';

const PORT = 8799;
const ROOT_BASE = `http://127.0.0.1:${PORT}`;
const BASE = `http://127.0.0.1:${PORT}/api`;
const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zhijuan-e2e-'));

const PAPER = path.join(ROOT, 'templates', '川沙中学信息技术综合练习卷(1)(1).docx');
const ANSWER = path.join(ROOT, 'templates', '川沙中学信息技术综合练习卷(1)（参考答案）(1).docx');

let passed = 0;
let failed = 0;
function check(name, ok, extra = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', () => {});
server.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(d));

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

let cookie = '';
async function call(method, url, body, isForm = false) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (isForm) {
    payload = body;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${url}`, { method, headers, body: payload });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const item of setCookie) {
    if (item.startsWith('sid=')) cookie = item.split(';')[0];
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

try {
  await waitReady();
  console.log('\n▶ 导入解析（HTTP 上传两份 docx）');
  const teacher = await ensureDemoTeacher(ROOT_BASE);
  await call('POST', '/auth/teacher/login', { username: teacher.phone, password: teacher.password });
  const exam = await call('POST', '/teacher/exams', { title: '川沙中学信息技术综合练习卷(1)', durationMin: 60 });

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(PAPER)]), path.basename(PAPER));
  form.append('file', new Blob([fs.readFileSync(ANSWER)]), path.basename(ANSWER));
  const parsed = await call('POST', `/teacher/exams/${exam.id}/import`, form, true);

  check('解析出 32 题', parsed.counts.total === 32, `total=${parsed.counts.total}`);
  check('全卷 100 分', parsed.counts.totalScore === 100, `score=${parsed.counts.totalScore}`);
  check('没有错误', parsed.counts.errors === 0, `errors=${parsed.counts.errors}`);
  check('4 道大题', parsed.sections.length === 4, parsed.sections.map((s) => `${s.title}${s.score}`).join('/'));
  check('每题都带大题归属', parsed.questions.every((q) => q.sectionIndex != null));
  check('题目/答案已合并', !parsed.notes.some((n) => n.includes('没有匹配到参考答案')));

  const merged = JSON.parse(JSON.stringify({ questions: parsed.questions, sections: parsed.sections }));
  await call('PUT', `/teacher/exams/${exam.id}/questions`, merged);
  const detail = await call('GET', `/teacher/exams/${exam.id}`);
  check('入库后大题仍在', detail.sections.length === 4);
  check('入库后 32 题', detail.questions.length === 32);
  check('多选带漏选扣分', detail.questions.some((q) => q.answer?.missedDeduct === 1));
  check('填空带逐空分值', detail.questions.some((q) => q.answer?.blankScores?.length > 0));
  check('含人工评分空', detail.questions.some((q) => q.answer?.manualBlanks?.some(Boolean)));
  check('编程题需人工', detail.questions.some((q) => q.type === 'code' && q.needsManual));

  // 回归：模板格式（【题型】）仍然可用
  const legacyExam = await call('POST', '/teacher/exams', { title: '模板格式回归' });
  const legacy = await call('POST', `/teacher/exams/${legacyExam.id}/import`, { sample: true });
  check('模板格式仍解析 6 题 / 100 分', legacy.counts.total === 6 && legacy.counts.totalScore === 100, `${legacy.counts.total} 题 / ${legacy.counts.totalScore} 分`);
  check('模板格式没有大题', legacy.sections.length === 0);

  await call('POST', `/teacher/exams/${exam.id}/publish`, { audience: { type: 'school' } });

  console.log('\n▶ 学生作答 + 自动判分');
  cookie = '';
  await call('POST', '/auth/student/login', { name: '李子涵', studentNo: '20250301' });
  const page = await call('GET', `/student/exams/${exam.id}`);
  check('学生端拿到大题材料', page.sections.length === 4);
  check('学生端每题有大题序号', page.questions.every((q) => q.sectionIndex != null));
  check('学生端不下发答案', page.questions.every((q) => q.answer === undefined));

  const bySeq = new Map(page.questions.map((q) => [q.seq, q]));
  const answers = {
    // #1 单选正确
    [bySeq.get(1).id]: { key: 'C' },
    // #2 填空正确
    [bySeq.get(2).id]: { blanks: ['85'] },
    // #4 填空：第 1 空自动，第 2/3 空人工
    [bySeq.get(4).id]: { blanks: ['有损压缩', '压缩率高', '画面质量损失且不可逆'] },
    // #5 多选漏选 1 个（BCD → BC），应扣 1 分
    [bySeq.get(5).id]: { keys: ['B', 'C'] },
    // #6 单选错误
    [bySeq.get(6).id]: { key: 'A' },
    // #10 多选全对（ABCD），漏选扣 0.5 规则不影响满分
    [bySeq.get(10).id]: { keys: ['A', 'B', 'C', 'D'] },
    // #13 填空两空：2 分 + 3 分
    [bySeq.get(13).id]: { blanks: ['广域网', '路由器'] },
    // #30 匹配题 3 框
    [bySeq.get(30).id]: { blanks: ['②', '①', '③'] },
    // #20 SQL 填空：写成无空格版本，验证宽松比对
    [bySeq.get(20).id]: { blanks: ['event="男子三级跳远"', 'studentid="20240742"'] },
  };
  await call('PUT', `/student/submissions/${page.submission.id}/draft`, { answers });
  await call('POST', `/student/submissions/${page.submission.id}/submit`);

  let status = 'grading';
  for (let i = 0; i < 60 && status !== 'graded'; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const sub = await call('GET', `/student/submissions/${page.submission.id}`);
    status = sub.submission.status;
  }
  check('评分完成', status === 'graded', status);

  cookie = '';
  await call('POST', '/auth/teacher/login', { username: teacher.phone, password: teacher.password });
  const sub = await call('GET', `/teacher/submissions/${page.submission.id}`);
  const autoOf = (seq) => sub.answers.find((a) => a.questionId === bySeq.get(seq).id)?.autoScore;

  check('单选答对得 2 分', autoOf(1) === 2, `auto=${autoOf(1)}`);
  check('单选答错得 0 分', autoOf(6) === 0, `auto=${autoOf(6)}`);
  check('填空答对得 3 分', autoOf(2) === 3, `auto=${autoOf(2)}`);
  check('多选漏选 1 个扣 1 分（3-1=2）', autoOf(5) === 2, `auto=${autoOf(5)}`);
  check('多选全对得满分 3 分', autoOf(10) === 3, `auto=${autoOf(10)}`);
  check('填空按空给分（2+3=5）', autoOf(13) === 5, `auto=${autoOf(13)}`);
  check('匹配题 3 框全对（6 分）', autoOf(30) === 6, `auto=${autoOf(30)}`);
  check('SQL 填空忽略空格差异（6 分）', autoOf(20) === 6, `auto=${autoOf(20)}`);
  check('含人工空的填空只给自动分（2 分）', autoOf(4) === 2, `auto=${autoOf(4)}`);
  check('含人工空的填空标记需人工', sub.answers.find((a) => a.questionId === bySeq.get(4).id)?.autoDetail?.needsManual === true);
  check('编程题标记需人工', sub.answers.find((a) => a.questionId === bySeq.get(32).id)?.autoDetail?.needsManual === true);

  console.log('\n▶ 学生成绩页');
  await call('POST', `/teacher/exams/${exam.id}/close`, { action: 'collect' });
  const pending = (await call('GET', `/teacher/exams/${exam.id}/submissions`)).find((row) => row.id === page.submission.id);
  for (const answer of sub.answers) {
    const question = sub.questions.find((q) => q.id === answer.questionId);
    if (answer.finalScore == null && (question.needsManual || question.type === 'short' || answer.autoScore == null || answer.autoDetail?.needsManual || answer.autoDetail?.runtimeError || (question.type === 'code' && answer.autoScore < question.score))) {
      await call('PATCH', `/teacher/answers/${answer.id}`, { finalScore: answer.autoScore ?? 0 });
    }
  }
  check('人工复核已清空', pending?.needsReview > 0 && (await call('GET', `/teacher/exams/${exam.id}`)).progress.needsReview === 0);
  // 教师端发布成绩后再以学生身份查看
  await call('POST', `/teacher/exams/${exam.id}/publish-results`, { published: true });
  cookie = '';
  await call('POST', '/auth/student/login', { name: '李子涵', studentNo: '20250301' });
  const result = await call('GET', `/student/submissions/${page.submission.id}`);
  check('成绩页返回大题材料', result.sections?.length === 4);
  check('成绩页每题带大题序号', result.questions.every((q) => q.sectionIndex != null));
} catch (err) {
  failed += 1;
  console.error('\n✗ 端到端测试异常：', err.message);
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 300));
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

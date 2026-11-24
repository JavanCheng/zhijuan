// 生成用于演示「学情看板」的历史考试与成绩数据（只写本地 data/app.db）。
// 用法：node scripts/seed-demo.mjs [--force]
// 会复用第一场有题目的考试，并复制出 3 场历史考试；为三个班级生成均衡但不相同的成绩。
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'app.db');
if (!fs.existsSync(DB_FILE)) {
  console.error('未找到 data/app.db，请先启动一次服务以初始化数据库。');
  process.exit(1);
}

const force = process.argv.includes('--force');
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');

const all = (sql, ...params) => db.prepare(sql).all(...params);
const get = (sql, ...params) => db.prepare(sql).get(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);
const nowIso = () => new Date().toISOString();

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

const existing = get('SELECT COUNT(*) AS count FROM submissions')?.count ?? 0;
if (existing > 3 && !force) {
  console.log(`已有 ${existing} 份提交，为避免覆盖真实数据已跳过。需要重置演示数据请加 --force。`);
  process.exit(0);
}

const baseExam = get(
  `SELECT e.* FROM exams e
   WHERE (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) > 0
   ORDER BY e.id LIMIT 1`,
);
if (!baseExam) {
  console.error('数据库里还没有含题目的考试，请先运行 scripts/demo-setup.ps1 或手动导入一份试卷。');
  process.exit(1);
}

const students = all(
  `SELECT u.id, u.name, u.student_no, u.class_id, c.sort_order
   FROM users u LEFT JOIN classes c ON c.id = u.class_id
   WHERE u.role = 'student' ORDER BY u.student_no`,
);
const classes = all('SELECT id, name FROM classes ORDER BY sort_order, id');
if (!students.length) {
  console.error('没有学生账号，无法生成演示数据。');
  process.exit(1);
}

const classOffset = new Map(
  classes.map((item, index) => [item.id, [0.035, 0.0, -0.045][index] ?? 0]),
);

/** 复制题目与测试点到目标考试 */
function cloneExamPaper(sourceExamId, targetExamId) {
  const questions = all('SELECT * FROM questions WHERE exam_id = ? ORDER BY seq', sourceExamId);
  for (const question of questions) {
    const result = run(
      `INSERT INTO questions (exam_id, seq, type, stem_html, score, options_json, answer_json, explanation_html, code_spec_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      targetExamId,
      question.seq,
      question.type,
      question.stem_html,
      question.score,
      question.options_json,
      question.answer_json,
      question.explanation_html,
      question.code_spec_json,
    );
    const cases = all('SELECT * FROM test_cases WHERE question_id = ? ORDER BY seq', question.id);
    for (const testCase of cases) {
      run(
        'INSERT INTO test_cases (question_id, seq, stdin, expected_stdout, score, visible) VALUES (?, ?, ?, ?, ?, ?)',
        Number(result.lastInsertRowid),
        testCase.seq,
        testCase.stdin,
        testCase.expected_stdout,
        testCase.score,
        testCase.visible,
      );
    }
  }
}

const HISTORY = [
  { title: '信息科技 · 第一次月考', description: '第一单元：数据与存储 · 算法基础', daysAgo: 30, difficulty: -0.035 },
  { title: '信息科技 · 期中测评', description: '第一至第二单元综合测评', daysAgo: 20, difficulty: 0.02 },
  { title: '信息科技 · 单元巩固测', description: '算法与程序设计专项巩固', daysAgo: 10, difficulty: -0.01 },
];

// 让第一场考试也成为历史数据的一部分
const baseDate = new Date(Date.now() - 40 * 86400000);
baseDate.setHours(9, 0, 0, 0);
run('UPDATE exams SET created_at = ? WHERE id = ?', baseDate.toISOString(), baseExam.id);

const exams = [{ id: baseExam.id, title: baseExam.title, daysAgo: 40, difficulty: 0.015, createdAt: baseDate }];
for (const item of HISTORY) {
  const date = new Date(Date.now() - item.daysAgo * 86400000);
  date.setHours(9, 0, 0, 0);
  let exam = get('SELECT * FROM exams WHERE title = ?', item.title);
  if (!exam) {
    const result = run(
      `INSERT INTO exams (title, description, teacher_id, status, duration_min, start_at, end_at, results_published, created_at)
       VALUES (?, ?, ?, 'closed', ?, ?, ?, 1, ?)`,
      item.title,
      item.description,
      baseExam.teacher_id,
      baseExam.duration_min,
      date.toISOString(),
      new Date(date.getTime() + baseExam.duration_min * 60000).toISOString(),
      date.toISOString(),
    );
    const examId = Number(result.lastInsertRowid);
    cloneExamPaper(baseExam.id, examId);
    exam = get('SELECT * FROM exams WHERE id = ?', examId);
    console.log(`已创建考试：${item.title}（${examId}）`);
  } else {
    run(
      "UPDATE exams SET created_at = ?, start_at = ?, end_at = ?, status = 'closed', results_published = 1 WHERE id = ?",
      date.toISOString(),
      date.toISOString(),
      new Date(date.getTime() + baseExam.duration_min * 60000).toISOString(),
      exam.id,
    );
    exam = get('SELECT * FROM exams WHERE id = ?', exam.id);
  }
  const createdAt = new Date(exam.created_at);
  exams.push({ id: exam.id, title: exam.title, daysAgo: item.daysAgo, difficulty: item.difficulty, createdAt });
}

const SHORT_ANSWERS = [
  '死循环是程序无法自行结束、一直重复执行同一段代码的状态，会导致程序卡死并持续占用 CPU。',
  '死循环就是循环条件永远为真，程序会一直运行下去，需要手动停止。',
  '程序一直重复执行某段代码，无法通过正常条件退出，会占满 CPU。',
  '循环没有正确的退出条件，导致程序无法结束。',
];

let submissionCount = 0;
for (const exam of exams) {
  const questions = all('SELECT * FROM questions WHERE exam_id = ? ORDER BY seq', exam.id);
  const cases = new Map();
  for (const row of all(
    `SELECT tc.* FROM test_cases tc JOIN questions q ON q.id = tc.question_id
     WHERE q.exam_id = ? ORDER BY tc.question_id, tc.seq`,
    exam.id,
  )) {
    const list = cases.get(row.question_id) ?? [];
    list.push(row);
    cases.set(row.question_id, list);
  }

  for (const [studentIndex, student] of students.entries()) {
    const rand = mulberry32(1000 + exam.id * 131 + student.id * 17);
    const ability = clamp(
      0.52 + rand() * 0.4 + (classOffset.get(student.class_id) ?? 0) + exam.difficulty,
      0.32,
      0.985,
    );

    const existingSub = get(
      'SELECT id FROM submissions WHERE exam_id = ? AND student_id = ?',
      exam.id,
      student.id,
    );
    let submissionId;
    const started = new Date(exam.createdAt.getTime() + (3 + (studentIndex % 6)) * 60000);
    const submitted = new Date(started.getTime() + 32 * 60000 + (studentIndex % 13) * 45000);
    if (existingSub) {
      submissionId = existingSub.id;
      run('DELETE FROM answers WHERE submission_id = ?', submissionId);
      run(
        `UPDATE submissions SET status = 'graded', auto_score = NULL, final_score = NULL,
           started_at = ?, submitted_at = ?, graded_at = ? WHERE id = ?`,
        started.toISOString(),
        submitted.toISOString(),
        new Date(submitted.getTime() + 90000).toISOString(),
        submissionId,
      );
    } else {
      const result = run(
        `INSERT INTO submissions (exam_id, student_id, status, started_at, submitted_at, graded_at)
         VALUES (?, ?, 'graded', ?, ?, ?)`,
        exam.id,
        student.id,
        started.toISOString(),
        submitted.toISOString(),
        new Date(submitted.getTime() + 90000).toISOString(),
      );
      submissionId = Number(result.lastInsertRowid);
    }

    let autoTotal = 0;
    let finalTotal = 0;
    for (const question of questions) {
      const spec = question.answer_json ? JSON.parse(question.answer_json) : null;
      const options = question.options_json ? JSON.parse(question.options_json) : [];
      const percent = clamp(ability + (rand() - 0.5) * 0.3, 0, 1);
      let score = 0;
      let raw = null;
      let comment = null;
      let finalScore = null;

      if (question.type === 'single' || question.type === 'multiple' || question.type === 'truefalse') {
        const correctKeys = spec?.kind === 'choice' ? spec.keys : [];
        const correctBool = spec?.kind === 'bool' ? spec.value : null;
        const pass = percent >= (question.type === 'multiple' ? 0.72 : 0.66);
        score = pass ? question.score : 0;
        if (question.type === 'single') {
          const wrong = options.find((option) => !correctKeys.includes(option.key))?.key ?? 'A';
          raw = { key: pass ? correctKeys[0] : wrong };
        } else if (question.type === 'multiple') {
          if (pass) raw = { keys: [...correctKeys].sort() };
          else {
            const wrongKeys = options
              .map((option) => option.key)
              .filter((key) => !correctKeys.includes(key))
              .slice(0, Math.max(1, Math.min(2, correctKeys.length - 1)));
            raw = { keys: wrongKeys.length ? wrongKeys : [options[0]?.key ?? 'A'] };
          }
        } else {
          raw = { value: pass ? correctBool : !correctBool };
        }
      } else if (question.type === 'fill') {
        const blanks = spec?.kind === 'fill' ? spec.blanks : [];
        const answers = [];
        let earned = 0;
        blanks.forEach((accepted) => {
          const pass = rand() < percent;
          answers.push(pass ? (accepted[0] ?? '') : '错误答案');
          if (pass) earned += question.score / Math.max(1, blanks.length);
        });
        score = round(earned, 1);
        raw = { blanks: answers };
      } else if (question.type === 'short') {
        score = round(question.score * clamp(percent + 0.05, 0.35, 0.96), 1);
        raw = { text: SHORT_ANSWERS[studentIndex % SHORT_ANSWERS.length] };
        comment =
          score >= question.score * 0.8
            ? '要点完整，表达清楚。'
            : score >= question.score * 0.6
              ? '基本覆盖关键点，可再补充死循环的后果。'
              : '需要结合定义与后果完整作答。';
      } else if (question.type === 'code') {
        const testCases = cases.get(question.id) ?? [];
        let earned = 0;
        for (const testCase of testCases) {
          if (rand() < clamp(percent + 0.06, 0, 0.97)) earned += testCase.score;
        }
        score = round(Math.min(question.score, earned), 1);
        const ratio = score / Math.max(1, question.score);
        raw = {
          language: 'python',
          code:
            ratio >= 0.95
              ? 'n = int(input())\nprint(n * (n + 1) // 2)'
              : ratio > 0
                ? 'n = int(input())\nprint(n * (n + 1))'
                : 'print(0)',
        };
      }

      score = clamp(round(score, 2), 0, question.score);
      // 留一部分简答题处于「待人工校准」状态，方便演示批改台与看板
      finalScore = question.type === 'short' && studentIndex % 5 === 0 ? null : score;
      autoTotal += score;
      finalTotal += finalScore ?? score;
      run(
        `INSERT INTO answers (submission_id, question_id, raw_json, auto_score, auto_detail_json, final_score, comment, graded_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
        submissionId,
        question.id,
        JSON.stringify(raw),
        score,
        finalScore,
        comment,
        new Date(submitted.getTime() + 90000).toISOString(),
      );
    }

    run(
      'UPDATE submissions SET auto_score = ?, final_score = ? WHERE id = ?',
      round(autoTotal, 2),
      round(finalTotal, 2),
      submissionId,
    );
    submissionCount += 1;
  }
  console.log(`  已生成 ${students.length} 份：${exam.title}`);
}

db.close();
console.log(`\n演示数据完成：${exams.length} 场考试，${submissionCount} 份提交，${students.length} 名学生 / ${classes.length} 个班级。`);
console.log('打开教师端「学情看板」即可查看图表。');

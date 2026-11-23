import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './password.ts';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  student_no TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft',
  duration_min INTEGER NOT NULL DEFAULT 60,
  start_at TEXT,
  end_at TEXT,
  results_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  stem_html TEXT NOT NULL,
  score REAL NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  answer_json TEXT,
  explanation_html TEXT,
  code_spec_json TEXT
);

CREATE TABLE IF NOT EXISTS test_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  stdin TEXT NOT NULL DEFAULT '',
  expected_stdout TEXT NOT NULL DEFAULT '',
  score REAL NOT NULL,
  visible INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'in_progress',
  auto_score REAL,
  final_score REAL,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  graded_at TEXT,
  UNIQUE (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  raw_json TEXT,
  auto_score REAL,
  auto_detail_json TEXT,
  final_score REAL,
  comment TEXT,
  graded_at TEXT,
  UNIQUE (submission_id, question_id)
);

CREATE TABLE IF NOT EXISTS grading_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id, seq);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_submissions_exam ON submissions(exam_id);
`);

type Param = string | number | null;

export function all<T = Record<string, unknown>>(sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function get<T = Record<string, unknown>>(sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function run(sql: string, ...params: Param[]): { changes: number; lastInsertRowid: number } {
  const res = db.prepare(sql).run(...params) as { changes: number | bigint; lastInsertRowid: number | bigint };
  return { changes: Number(res.changes), lastInsertRowid: Number(res.lastInsertRowid) };
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();

const STUDENT_NAMES = [
  '李子涵', '王梓萱', '张浩宇', '刘欣怡', '陈思远', '杨雨桐',
  '赵明轩', '黄语晨', '周书航', '吴静怡', '徐嘉懿', '孙铭泽',
  '马若彤', '朱一诺', '胡佳琪', '郭子墨', '何雨欣', '高梓豪',
  '林诗涵', '罗逸辰', '郑清越', '谢子涵', '韩思齐', '曹嘉宁',
  '许文博', '邓雅雯', '冯绍辉', '曾令仪', '彭宇轩', '蒋雨薇',
  '蔡子昂', '潘安琪', '田睿哲', '董欣妍', '苏浩然', '卢佳怡',
];

export function seed(): void {
  const row = get<{ c: number }>('SELECT COUNT(*) AS c FROM users');
  if (row && row.c > 0) return;

  const ts = nowIso();
  run(
    'INSERT INTO users (username, password_hash, name, role, student_no, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    'teacher', hashPassword('123456'), '张老师', 'teacher', null, ts,
  );

  STUDENT_NAMES.forEach((name, i) => {
    const no = String(20250301 + i);
    run(
      'INSERT INTO users (username, password_hash, name, role, student_no, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      `s${String(i + 1).padStart(2, '0')}`, hashPassword('123456'), name, 'student', no, ts,
    );
  });
}

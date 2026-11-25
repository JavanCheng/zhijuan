import { all } from './db.ts';
import type {
  AnswerSpec,
  CodeSpec,
  ExamSummary,
  Option,
  QuestionSection,
  QuestionStudent,
  QuestionTeacher,
  QuestionType,
  TestCase,
} from '../shared/types.ts';

export interface QuestionRow {
  id: number;
  exam_id: number;
  seq: number;
  type: QuestionType;
  stem_html: string;
  score: number;
  options_json: string;
  answer_json: string | null;
  explanation_html: string | null;
  code_spec_json: string | null;
  section_index: number | null;
  needs_manual: number;
}

export interface TestCaseRow {
  id: number;
  question_id: number;
  seq: number;
  stdin: string;
  expected_stdout: string;
  score: number;
  visible: number;
}

export interface ExamRow {
  id: number;
  title: string;
  description: string;
  teacher_id: number;
  status: ExamSummary['status'];
  duration_min: number;
  start_at: string | null;
  end_at: string | null;
  results_published: number;
  sections_json: string;
  created_at: string;
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadTestCases(examId: number): Map<number, TestCase[]> {
  const rows = all<TestCaseRow>(
    `SELECT tc.* FROM test_cases tc
     JOIN questions q ON q.id = tc.question_id
     WHERE q.exam_id = ?
     ORDER BY tc.question_id, tc.seq`,
    examId,
  );
  const map = new Map<number, TestCase[]>();
  for (const r of rows) {
    const list = map.get(r.question_id) ?? [];
    list.push({
      id: r.id,
      seq: r.seq,
      stdin: r.stdin,
      expectedStdout: r.expected_stdout,
      score: r.score,
      visible: !!r.visible,
    });
    map.set(r.question_id, list);
  }
  return map;
}

export function loadQuestions(examId: number): QuestionRow[] {
  return all<QuestionRow>('SELECT * FROM questions WHERE exam_id = ? ORDER BY seq, id', examId);
}

/** 大题（材料题）分组信息，随考试一起保存，题目只用 section_index 引用。 */
export function loadSections(sectionsJson: string | null | undefined): QuestionSection[] {
  return parseJson<QuestionSection[]>(sectionsJson, []).filter(
    (s) => s && typeof s.index === 'number' && typeof s.title === 'string',
  );
}

export function toQuestionTeacher(q: QuestionRow, cases: TestCase[]): QuestionTeacher {
  return {
    id: q.id,
    seq: q.seq,
    type: q.type,
    stemHtml: q.stem_html,
    score: q.score,
    options: parseJson<Option[]>(q.options_json, []),
    answer: parseJson<AnswerSpec | null>(q.answer_json, null),
    explanationHtml: q.explanation_html,
    codeSpec: parseJson<CodeSpec | null>(q.code_spec_json, null),
    testCases: cases,
    sectionIndex: q.section_index ?? null,
    needsManual: !!q.needs_manual,
  };
}

export function toQuestionStudent(q: QuestionRow, cases: TestCase[]): QuestionStudent {
  const answer = parseJson<AnswerSpec | null>(q.answer_json, null);
  const codeSpec = parseJson<CodeSpec | null>(q.code_spec_json, null);
  return {
    id: q.id,
    seq: q.seq,
    type: q.type,
    stemHtml: q.stem_html,
    score: q.score,
    options: parseJson<Option[]>(q.options_json, []),
    blanks: answer?.kind === 'fill' ? answer.blanks.length : 0,
    codeSpec: codeSpec
      ? { languages: codeSpec.languages, starterCode: codeSpec.starterCode, timeLimitMs: codeSpec.timeLimitMs }
      : null,
    sampleCases: cases
      .filter((c) => c.visible || c.score <= 0)
      .map((c) => ({
        stdin: c.stdin,
        expectedStdout: c.expectedStdout,
        label: c.score <= 0 ? '样例' : '公开测试点',
      })),
    sectionIndex: q.section_index ?? null,
  };
}

export function examSummary(
  row: ExamRow,
  stats: { totalScore: number; questionCount: number },
): ExamSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    durationMin: row.duration_min,
    startAt: row.start_at,
    endAt: row.end_at,
    resultsPublished: !!row.results_published,
    totalScore: stats.totalScore,
    questionCount: stats.questionCount,
    createdAt: row.created_at,
  };
}

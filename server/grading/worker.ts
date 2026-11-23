// 异步评分 worker：从 grading_tasks 表取任务，纯函数判客观题，代码题交给运行时。
import { all, get, nowIso, run } from '../db.ts';
import { gradeObjective, normalizeOutput, round2 } from '../../shared/grading.ts';
import type { AnswerSpec, CodeSpec, GradeDetail, GradeItem, StudentAnswer } from '../../shared/types.ts';
import { runProgram } from '../runner/run.ts';
import { loadQuestions, loadTestCases, parseJson, type QuestionRow } from '../serialize.ts';
import type { TestCase } from '../../shared/types.ts';

const POLL_MS = 400;

export function enqueueGrading(submissionId: number): void {
  run("DELETE FROM grading_tasks WHERE submission_id = ? AND status = 'pending'", submissionId);
  const ts = nowIso();
  run(
    "INSERT INTO grading_tasks (submission_id, status, attempts, created_at, updated_at) VALUES (?, 'pending', 0, ?, ?)",
    submissionId,
    ts,
    ts,
  );
}

function truncate(text: string, max = 600): string {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function upsertAnswer(submissionId: number, questionId: number, autoScore: number, detail: GradeDetail): void {
  run(
    `INSERT INTO answers (submission_id, question_id, auto_score, auto_detail_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(submission_id, question_id) DO UPDATE SET
       auto_score = excluded.auto_score,
       auto_detail_json = excluded.auto_detail_json`,
    submissionId,
    questionId,
    autoScore,
    JSON.stringify(detail),
  );
}

async function gradeCodeQuestion(
  q: QuestionRow,
  cases: TestCase[],
  raw: StudentAnswer | null,
): Promise<{ score: number; detail: GradeDetail }> {
  const code = raw?.code ?? '';
  if (!code.trim()) return { score: 0, detail: { note: '未作答', items: [] } };

  const spec = parseJson<CodeSpec | null>(q.code_spec_json, null);
  const language = raw?.language || spec?.languages?.[0] || 'python';
  if (spec && !spec.languages.includes(language)) {
    return { score: 0, detail: { note: `该题不支持语言 ${language}`, items: [] } };
  }

  const scored = cases.filter((c) => c.score > 0);
  if (!scored.length) return { score: 0, detail: { note: '题目没有计分测试点', items: [] } };

  const items: GradeItem[] = [];
  let runtimeError: string | undefined;
  const timeLimit = spec?.timeLimitMs ?? 2000;

  for (let i = 0; i < scored.length; i++) {
    const tc = scored[i];
    const res = await runProgram({ language, code, stdin: tc.stdin, timeLimitMs: timeLimit });

    if (res.runtimeError) {
      runtimeError = res.runtimeError;
      items.push({
        label: `测试点 #${i + 1}`,
        ok: false,
        score: 0,
        maxScore: tc.score,
        note: res.runtimeError,
        visible: tc.visible,
      });
      break;
    }

    const ok = !res.timedOut && res.exitCode === 0 && normalizeOutput(res.stdout) === normalizeOutput(tc.expectedStdout);
    let note = '';
    if (res.timedOut) note = `超时（限 ${timeLimit}ms）`;
    else if (res.exitCode !== 0) note = `运行错误：${truncate(res.stderr.trim().split('\n').pop() ?? '', 160) || `退出码 ${res.exitCode}`}`;
    else if (!ok) note = '输出不符';

    items.push({
      label: `测试点 #${i + 1}${tc.visible ? '（公开）' : '（隐藏）'}`,
      ok,
      score: ok ? tc.score : 0,
      maxScore: tc.score,
      expected: truncate(tc.expectedStdout, 400),
      got: truncate(res.stdout, 400),
      note: note || `通过，用时 ${res.timeMs}ms`,
      visible: tc.visible,
    });
  }

  const score = items.reduce((s, it) => s + it.score, 0);
  const passed = items.filter((it) => it.ok).length;
  return {
    score: round2(score),
    detail: {
      items,
      note: runtimeError ? '运行时不可用，评测中断' : `通过 ${passed}/${scored.length} 个测试点`,
      runtimeError,
    },
  };
}

export async function gradeSubmission(submissionId: number): Promise<void> {
  const submission = get<{ id: number; exam_id: number }>('SELECT id, exam_id FROM submissions WHERE id = ?', submissionId);
  if (!submission) throw new Error(`submission ${submissionId} not found`);

  const questions = loadQuestions(submission.exam_id);
  const casesByQuestion = loadTestCases(submission.exam_id);
  const existing = all<{ question_id: number; raw_json: string | null }>(
    'SELECT question_id, raw_json FROM answers WHERE submission_id = ?',
    submissionId,
  );
  const rawByQuestion = new Map(existing.map((r) => [r.question_id, parseJson<StudentAnswer | null>(r.raw_json, null)]));

  let total = 0;
  for (const q of questions) {
    const raw = rawByQuestion.get(q.id) ?? null;

    if (q.type === 'code') {
      const { score, detail } = await gradeCodeQuestion(q, casesByQuestion.get(q.id) ?? [], raw);
      total += score;
      upsertAnswer(submissionId, q.id, score, detail);
      continue;
    }

    const { score, detail } = gradeObjective(
      {
        id: q.id,
        seq: q.seq,
        type: q.type,
        score: q.score,
        answer: parseJson<AnswerSpec | null>(q.answer_json, null),
      },
      raw,
    );
    total += score;
    upsertAnswer(submissionId, q.id, score, detail);
  }

  const totalScore = round2(total);
  run(
    "UPDATE submissions SET status = 'graded', auto_score = ?, graded_at = ? WHERE id = ?",
    totalScore,
    nowIso(),
    submissionId,
  );
}

let busy = false;

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const task = get<{ id: number; submission_id: number }>(
      "SELECT id, submission_id FROM grading_tasks WHERE status = 'pending' ORDER BY id LIMIT 1",
    );
    if (!task) return;

    run("UPDATE grading_tasks SET status = 'running', updated_at = ? WHERE id = ?", nowIso(), task.id);
    try {
      await gradeSubmission(task.submission_id);
      run("UPDATE grading_tasks SET status = 'done', updated_at = ? WHERE id = ?", nowIso(), task.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[grading] task failed', task.id, message);
      run(
        "UPDATE grading_tasks SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?",
        message.slice(0, 500),
        nowIso(),
        task.id,
      );
      run("UPDATE submissions SET status = 'submitted' WHERE id = ? AND status = 'grading'", task.submission_id);
    }
  } finally {
    busy = false;
  }
}

export function startGradingWorker(): void {
  // 服务重启后，把中断的任务重新排队
  run("UPDATE grading_tasks SET status = 'pending' WHERE status = 'running'");
  setInterval(() => {
    void tick();
  }, POLL_MS);
}

import { all, get, nowIso, run } from './db.ts';
import { HttpError, type ExamRow } from './http.ts';
import { enqueueGrading } from './grading/worker.ts';
import type { ExamAudience, ExamAudienceInput, ExamProgress } from '../shared/types.ts';

export const reviewRequired = `(q.needs_manual = 1 OR q.type = 'short' OR a.auto_score IS NULL
  OR (q.type = 'code' AND a.auto_score < q.score)
  OR CASE WHEN json_valid(a.auto_detail_json) THEN
    COALESCE(json_extract(a.auto_detail_json, '$.needsManual'), 0) = 1
    OR json_extract(a.auto_detail_json, '$.runtimeError') IS NOT NULL ELSE 0 END)`;

export const hasAudienceAccess = `(NOT EXISTS (SELECT 1 FROM exam_audiences ea WHERE ea.exam_id = e.id)
  OR EXISTS (SELECT 1 FROM exam_participants ep WHERE ep.exam_id = e.id AND ep.student_id = ?))`;

export function studentCanAccess(examId: number, studentId: number): boolean {
  return Boolean(get(`SELECT 1 FROM exams e WHERE ${hasAudienceAccess} AND e.id = ?`, studentId, examId));
}

export function snapshotAudience(examId: number, audience: ExamAudienceInput): ExamAudience {
  const classIds = audience.type === 'classes' ? [...new Set(audience.classIds)] : [];
  if (classIds.length) {
    const existing = get<{ count: number }>(`SELECT COUNT(*) AS count FROM classes WHERE id IN (${classIds.map(() => '?').join(',')})`, ...classIds);
    if (existing?.count !== classIds.length) throw new HttpError(400, '有选中的班级已不存在，请重新选择');
  }
  run('INSERT INTO exam_audiences (exam_id, type, class_ids_json) VALUES (?, ?, ?)', examId, audience.type, JSON.stringify(classIds));
  const inserted = run(
    `INSERT INTO exam_participants (exam_id, student_id, class_id, class_name)
     SELECT ?, u.id, u.class_id, c.name FROM users u LEFT JOIN classes c ON c.id = u.class_id
     WHERE u.role = 'student' AND u.is_active = 1${classIds.length ? ` AND u.class_id IN (${classIds.map(() => '?').join(',')})` : ''}`,
    examId, ...classIds,
  );
  if (!inserted.changes) throw new HttpError(400, '发布范围没有启用的学生，请先检查班级名册');
  return { type: audience.type, classIds, studentCount: inserted.changes };
}

export function examLifecycle(exam: ExamRow): { audience: ExamAudience | null; progress: ExamProgress } {
  const record = get<{ type: 'classes' | 'school'; class_ids_json: string; count: number }>(
    `SELECT ea.type, ea.class_ids_json, (SELECT COUNT(*) FROM exam_participants ep WHERE ep.exam_id = ea.exam_id) AS count
     FROM exam_audiences ea WHERE ea.exam_id = ?`, exam.id,
  );
  const rows = all<{ status: string; failed: number; review: number }>(
    `SELECT s.status,
       (SELECT gt.status = 'failed' FROM grading_tasks gt WHERE gt.submission_id = s.id ORDER BY gt.id DESC LIMIT 1) AS failed,
       EXISTS (SELECT 1 FROM answers a JOIN questions q ON q.id = a.question_id
         WHERE a.submission_id = s.id AND a.final_score IS NULL AND ${reviewRequired}) AS review
     FROM submissions s WHERE s.exam_id = ?`, exam.id,
  );
  const expected = record?.count ?? null;
  const progress: ExamProgress = { expected, notStarted: expected === null ? null : Math.max(0, expected - rows.length), inProgress: 0, submitted: 0, grading: 0, failed: 0, needsReview: 0, finalized: 0 };
  for (const row of rows) {
    if (row.status === 'in_progress') progress.inProgress++;
    else if (row.status !== 'discarded') {
      progress.submitted++;
      if (row.status === 'graded') {
        if (row.review) progress.needsReview++;
        else progress.finalized++;
      } else if (row.failed) progress.failed++;
      else progress.grading++;
    }
  }
  const audience: ExamAudience | null = record
    ? { type: record.type, classIds: JSON.parse(record.class_ids_json) as number[], studentCount: record.count }
    : exam.status === 'draft' ? null : { type: 'legacy', classIds: [], studentCount: rows.length };
  return { audience, progress };
}

/** 转交卷和补齐空答案必须和排队在同一事务中。 */
export function queueSubmission(submissionId: number, examId: number, submittedAt = nowIso()): boolean {
  const updated = run("UPDATE submissions SET status = 'grading', submitted_at = ? WHERE id = ? AND status = 'in_progress'", submittedAt, submissionId);
  if (!updated.changes) return false;
  run(`INSERT INTO answers (submission_id, question_id, raw_json)
       SELECT ?, id, NULL FROM questions WHERE exam_id = ?
       ON CONFLICT(submission_id, question_id) DO NOTHING`, submissionId, examId);
  enqueueGrading(submissionId);
  return true;
}

import type { FastifyRequest } from 'fastify';
import { currentUser, type SessionUser } from './auth.ts';
import { get, nowIso, run } from './db.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function requireUser(req: FastifyRequest): SessionUser {
  const user = currentUser(req);
  if (!user) throw new HttpError(401, '请先登录');
  return user;
}

export function requireAdmin(req: FastifyRequest): SessionUser {
  const user = requireUser(req);
  if (user.role !== 'admin') throw new HttpError(403, '该操作仅管理员可用');
  return user;
}

export function requireTeacher(req: FastifyRequest): SessionUser {
  const user = requireUser(req);
  if (user.role !== 'teacher') throw new HttpError(403, '该操作仅教师可用');
  return user;
}

export function requireStudent(req: FastifyRequest): SessionUser {
  const user = requireUser(req);
  if (user.role !== 'student') throw new HttpError(403, '该操作仅学生可用');
  return user;
}

export interface ExamRow {
  id: number;
  title: string;
  description: string;
  teacher_id: number;
  status: 'draft' | 'published' | 'closed';
  duration_min: number;
  start_at: string | null;
  end_at: string | null;
  results_published: number;
  sections_json: string;
  created_at: string;
}

export function loadOwnedExam(teacherId: number, examId: number): ExamRow {
  const exam = get<ExamRow>('SELECT * FROM exams WHERE id = ?', examId);
  if (!exam) throw new HttpError(404, '考试不存在');
  if (exam.teacher_id !== teacherId) throw new HttpError(403, '无权访问该考试');
  return exam;
}

export function audit(
  actorId: number,
  entity: string,
  entityId: number,
  action: string,
  before: unknown,
  after: unknown,
  reason?: string | null,
): void {
  run(
    'INSERT INTO audit_logs (actor_id, entity, entity_id, action, before_json, after_json, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    actorId,
    entity,
    entityId,
    action,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
    reason ?? null,
    nowIso(),
  );
}

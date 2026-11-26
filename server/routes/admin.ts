import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, get, nowIso, run, tx } from '../db.ts';
import { audit, HttpError, requireAdmin } from '../http.ts';
import { hashPassword } from '../password.ts';
import type {
  AdminRecentAction,
  AdminTeacherAction,
  AdminWorkbench,
  BatchTeacherResult,
  DeleteTeacherResult,
  ManagedTeacher,
  TeacherOverview,
} from '../../shared/types.ts';

const PHONE_PATTERN = /^1[3-9]\d{9}$/;

/** 统一手机号：去掉空格、横线、+86 前缀，只留 11 位数字。 */
function normalizePhone(value: unknown): string {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('86')) digits = digits.slice(2);
  return digits;
}

function isValidPhone(phone: string): boolean {
  return PHONE_PATTERN.test(phone);
}

const teacherCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(1).max(30),
});

const teacherUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  phone: z.string().trim().min(1).max(30).optional(),
  isActive: z.boolean().optional(),
});

const batchSchema = z.object({
  action: z.enum(['enable', 'disable', 'delete']),
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

interface TeacherRow {
  id: number;
  username: string;
  name: string;
  phone: string | null;
  teacher_password_state: 'default' | 'custom' | null;
  is_active: number;
  created_at: string;
  exam_count: number;
  submission_count: number;
}

function mapTeacher(row: TeacherRow): ManagedTeacher {
  return {
    id: row.id,
    username: row.phone?.trim() || row.username,
    name: row.name,
    phone: row.phone?.trim() || null,
    passwordState: row.teacher_password_state ?? 'unknown',
    isActive: !!row.is_active,
    createdAt: row.created_at,
    examCount: row.exam_count,
    submissionCount: row.submission_count,
  };
}

/** 教师列表：带出考试数、答卷数，便于管理员判断能否直接删除。 */
function loadTeachers(): ManagedTeacher[] {
  return all<TeacherRow>(
    `SELECT u.id, u.username, u.name, u.phone, u.teacher_password_state, u.is_active, u.created_at,
       (SELECT COUNT(*) FROM exams e WHERE e.teacher_id = u.id) AS exam_count,
       (SELECT COUNT(*) FROM submissions s JOIN exams e ON e.id = s.exam_id WHERE e.teacher_id = u.id) AS submission_count
     FROM users u
     WHERE u.role = 'teacher'
     ORDER BY u.is_active DESC, u.created_at DESC, u.id DESC`,
  ).map(mapTeacher);
}

function loadTeacher(id: number): ManagedTeacher {
  const row = get<TeacherRow>(
    `SELECT u.id, u.username, u.name, u.phone, u.teacher_password_state, u.is_active, u.created_at,
       (SELECT COUNT(*) FROM exams e WHERE e.teacher_id = u.id) AS exam_count,
       (SELECT COUNT(*) FROM submissions s JOIN exams e ON e.id = s.exam_id WHERE e.teacher_id = u.id) AS submission_count
     FROM users u
     WHERE u.id = ? AND u.role = 'teacher'`,
    id,
  );
  if (!row) throw new HttpError(404, '教师账号不存在');
  return mapTeacher(row);
}

function assertPhoneAvailable(phone: string, exceptId = 0): void {
  const row = get<{ id: number }>(
    'SELECT id FROM users WHERE (username = ? OR phone = ?) AND id <> ?',
    phone,
    phone,
    exceptId,
  );
  if (row) throw new HttpError(409, `手机号 ${phone} 已被其他账号使用`);
}

function parsePhone(value: string): string {
  const phone = normalizePhone(value);
  if (!isValidPhone(phone)) throw new HttpError(400, '请输入 11 位手机号');
  return phone;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

const WORKBENCH_ACTIONS = [
  'create_teacher',
  'update_teacher',
  'enable_teacher',
  'disable_teacher',
  'reset_teacher_password',
  'delete_teacher',
  'batch_enable_teacher',
  'batch_disable_teacher',
  'batch_delete_teacher',
] as const satisfies readonly AdminTeacherAction[];

interface TeacherAuditRow {
  id: number;
  action: AdminTeacherAction;
  actor_name: string | null;
  teacher_name: string | null;
  before_json: string | null;
  after_json: string | null;
  created_at: string;
}

function readAuditFields(json: string | null): Record<string, unknown> {
  try {
    const value: unknown = json ? JSON.parse(json) : null;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // An old or malformed log should not make the workbench unavailable.
  }
  return {};
}

function auditName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  // Historical account names may equal a phone number. Never display those in the feed.
  return trimmed && !isValidPhone(normalizePhone(trimmed)) ? trimmed : null;
}

function mapTeacherAudit(row: TeacherAuditRow): AdminRecentAction {
  const before = readAuditFields(row.before_json);
  const after = readAuditFields(row.after_json);
  const batch = row.action.startsWith('batch_');
  let action = row.action;
  // Older releases logged single status toggles as generic account updates.
  if (
    action === 'update_teacher' &&
    typeof before.isActive === 'boolean' &&
    typeof after.isActive === 'boolean' &&
    before.isActive !== after.isActive &&
    before.name === after.name && before.phone === after.phone
  ) {
    action = after.isActive ? 'enable_teacher' : 'disable_teacher';
  }
  const result: AdminRecentAction = {
    id: row.id,
    action,
    actorName: auditName(row.actor_name),
    teacherName: batch ? null : auditName(after.name) ?? auditName(before.name) ?? auditName(row.teacher_name),
    createdAt: row.created_at,
  };
  const affectedCount = after.affectedCount ?? (action === 'batch_delete_teacher' ? after.deleted : undefined);
  if (batch && typeof affectedCount === 'number' && Number.isSafeInteger(affectedCount) && affectedCount >= 0) {
    result.affectedCount = affectedCount;
  }
  return result;
}

function loadWorkbench(): AdminWorkbench {
  // Match the teacher list's whitespace handling without loading exam or answer counts.
  const accounts = all<{ phone: string | null }>("SELECT phone FROM users WHERE role = 'teacher'");
  const recentActions = all<TeacherAuditRow>(
    `SELECT a.id, a.action, person.name AS actor_name, teacher.name AS teacher_name,
       a.before_json, a.after_json, a.created_at
     FROM audit_logs a
     LEFT JOIN users person ON person.id = a.actor_id
     LEFT JOIN users teacher ON teacher.id = a.entity_id AND teacher.role = 'teacher'
     WHERE a.entity = 'user' AND a.action IN (${placeholders(WORKBENCH_ACTIONS.length)})
       AND (person.role = 'admin' OR person.id IS NULL)
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT 10`,
    ...WORKBENCH_ACTIONS,
  ).map(mapTeacherAudit);
  return { missingPhoneCount: accounts.filter(({ phone }) => !phone?.trim()).length, recentActions };
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/workbench', async (req) => {
    requireAdmin(req);
    return loadWorkbench();
  });

  app.get('/admin/overview', async (req) => {
    requireAdmin(req);
    const teachers = loadTeachers();
    return {
      teachers,
      total: teachers.length,
      active: teachers.filter((teacher) => teacher.isActive).length,
      inactive: teachers.filter((teacher) => !teacher.isActive).length,
      withExams: teachers.filter((teacher) => teacher.examCount > 0).length,
      examCount: teachers.reduce((sum, teacher) => sum + teacher.examCount, 0),
    } satisfies TeacherOverview;
  });

  app.post('/admin/teachers', async (req) => {
    const admin = requireAdmin(req);
    const body = teacherCreateSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, '请输入教师姓名和手机号');
    const phone = parsePhone(body.data.phone);
    const name = body.data.name;

    const id = tx(() => {
      assertPhoneAvailable(phone);
      const inserted = run(
        `INSERT INTO users (username, password_hash, name, role, phone, is_active, created_at, teacher_password_state)
         VALUES (?, ?, ?, 'teacher', ?, 1, ?, 'default')`,
        phone,
        hashPassword(phone),
        name,
        phone,
        nowIso(),
      );
      return inserted.lastInsertRowid;
    });
    audit(admin.id, 'user', id, 'create_teacher', null, { name, phone });
    return loadTeacher(id);
  });

  app.patch('/admin/teachers/:id', async (req) => {
    const admin = requireAdmin(req);
    const teacherId = Number((req.params as { id: string }).id);
    const current = loadTeacher(teacherId);
    const body = teacherUpdateSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, '教师信息不合法');

    const nextName = body.data.name ?? current.name;
    let nextPhone = current.phone;
    let phoneChanged = false;
    if (body.data.phone != null) {
      const phone = parsePhone(body.data.phone);
      if (phone !== current.phone) {
        assertPhoneAvailable(phone, teacherId);
        nextPhone = phone;
        phoneChanged = true;
      }
    }

    const passwordChanged = phoneChanged && (current.passwordState === 'default' || (current.passwordState === 'unknown' && !current.phone));
    const nextActive = body.data.isActive ?? current.isActive;
    const currentHash =
      get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ? AND role = ?', teacherId, 'teacher')
        ?.password_hash ?? '';
    run(
      `UPDATE users
       SET username = ?, password_hash = ?, name = ?, phone = ?, is_active = ?, teacher_password_state = ?
       WHERE id = ? AND role = 'teacher'`,
      phoneChanged ? nextPhone : get<{ username: string }>("SELECT username FROM users WHERE id = ?", teacherId)?.username ?? current.username,
      passwordChanged && nextPhone ? hashPassword(nextPhone) : currentHash,
      nextName,
      nextPhone,
      nextActive ? 1 : 0,
      passwordChanged ? 'default' : current.passwordState === 'unknown' ? null : current.passwordState,
      teacherId,
    );
    audit(
      admin.id,
      'user',
      teacherId,
      'update_teacher',
      { name: current.name, phone: current.phone, isActive: current.isActive },
      { name: nextName, phone: nextPhone, isActive: nextActive, passwordReset: passwordChanged },
    );
    return loadTeacher(teacherId);
  });

  app.post('/admin/teachers/:id/reset-password', async (req) => {
    const admin = requireAdmin(req);
    const teacherId = Number((req.params as { id: string }).id);
    const teacher = loadTeacher(teacherId);
    if (!teacher.phone) {
      throw new HttpError(400, '该教师还没有手机号，请先编辑补全手机号');
    }
    run("UPDATE users SET password_hash = ?, teacher_password_state = 'default' WHERE id = ? AND role = ?", hashPassword(teacher.phone), teacherId, 'teacher');
    audit(admin.id, 'user', teacherId, 'reset_teacher_password', null, { name: teacher.name });
    return { ok: true, phone: teacher.phone };
  });

  app.delete('/admin/teachers/:id', async (req) => {
    const admin = requireAdmin(req);
    const teacherId = Number((req.params as { id: string }).id);
    return tx(() => {
      const teacher = loadTeacher(teacherId);
      if (teacher.examCount > 0) {
        throw new HttpError(409, `该教师名下有 ${teacher.examCount} 场考试，不能删除账号。请停用账号以保留考试与成绩。`);
      }
      run("DELETE FROM users WHERE id = ? AND role = 'teacher'", teacherId);
      audit(admin.id, 'user', teacherId, 'delete_teacher', { name: teacher.name }, null);
      return { ok: true, deleted: true, purgedExams: 0 } satisfies DeleteTeacherResult;
    });
  });

  app.post('/admin/teachers/batch', async (req) => {
    const admin = requireAdmin(req);
    const body = batchSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, '请选择要操作的教师');
    const { action, ids } = body.data;
    if (action === 'delete') throw new HttpError(400, '不支持批量删除教师账号，请改为批量停用');

    const active = action === 'enable' ? 1 : 0;
    return tx(() => {
      const updated = all<{ id: number }>(
        `UPDATE users SET is_active = ?
         WHERE role = 'teacher' AND is_active != ? AND id IN (${placeholders(ids.length)})
         RETURNING id`,
        active,
        active,
        ...ids,
      );
      if (updated.length) {
        audit(admin.id, 'user', 0, action === 'enable' ? 'batch_enable_teacher' : 'batch_disable_teacher', null, {
          ids: updated.map(({ id }) => id),
          affectedCount: updated.length,
        });
      }
      return { ok: true, affected: updated.length, deleted: 0, purgedExams: 0 } satisfies BatchTeacherResult;
    });
  });
}

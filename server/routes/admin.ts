import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, get, nowIso, run, tx } from '../db.ts';
import { audit, HttpError, requireAdmin } from '../http.ts';
import { hashPassword } from '../password.ts';
import type {
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
  /** 删除教师时是否连同名下考试、答卷与成绩一起清除 */
  purge: z.boolean().optional(),
});

interface TeacherRow {
  id: number;
  username: string;
  name: string;
  phone: string | null;
  password_hash: string;
  is_active: number;
  created_at: string;
  exam_count: number;
  submission_count: number;
}

function mapTeacher(row: TeacherRow): ManagedTeacher {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    phone: row.phone,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    examCount: row.exam_count,
    submissionCount: row.submission_count,
  };
}

/** 教师列表：带出考试数、答卷数，便于管理员判断能否直接删除。 */
function loadTeachers(): ManagedTeacher[] {
  return all<TeacherRow>(
    `SELECT u.id, u.username, u.name, u.phone, u.password_hash, u.is_active, u.created_at,
       (SELECT COUNT(*) FROM exams e WHERE e.teacher_id = u.id) AS exam_count,
       (SELECT COUNT(*) FROM submissions s JOIN exams e ON e.id = s.exam_id WHERE e.teacher_id = u.id) AS submission_count
     FROM users u
     WHERE u.role = 'teacher'
     ORDER BY u.is_active DESC, u.created_at DESC, u.id DESC`,
  ).map(mapTeacher);
}

function loadTeacher(id: number): ManagedTeacher {
  const row = get<TeacherRow>(
    `SELECT u.id, u.username, u.name, u.phone, u.password_hash, u.is_active, u.created_at,
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

/**
 * 删除教师账号。考试、题目、答卷、成绩通过外键级联删除；
 * grading_tasks 没有外键，需要先按考试下的答卷清理。返回一同清除的考试数。
 */
function deleteTeacherRecord(teacherId: number): number {
  const examCount =
    get<{ c: number }>('SELECT COUNT(*) AS c FROM exams WHERE teacher_id = ?', teacherId)?.c ?? 0;
  if (examCount > 0) {
    run(
      `DELETE FROM grading_tasks WHERE submission_id IN (
         SELECT s.id FROM submissions s JOIN exams e ON e.id = s.exam_id WHERE e.teacher_id = ?
       )`,
      teacherId,
    );
    run('DELETE FROM exams WHERE teacher_id = ?', teacherId);
  }
  run('DELETE FROM users WHERE id = ? AND role = ?', teacherId, 'teacher');
  return examCount;
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
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
        `INSERT INTO users (username, password_hash, name, role, phone, is_active, created_at)
         VALUES (?, ?, ?, 'teacher', ?, 1, ?)`,
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
    let passwordChanged = false;
    if (body.data.phone != null) {
      const phone = parsePhone(body.data.phone);
      if (phone !== current.phone) {
        assertPhoneAvailable(phone, teacherId);
        nextPhone = phone;
        passwordChanged = true;
      }
    }

    const nextActive = body.data.isActive ?? current.isActive;
    const currentHash =
      get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ? AND role = ?', teacherId, 'teacher')
        ?.password_hash ?? '';
    run(
      `UPDATE users
       SET username = ?, password_hash = ?, name = ?, phone = ?, is_active = ?
       WHERE id = ? AND role = 'teacher'`,
      passwordChanged ? nextPhone : current.username,
      passwordChanged && nextPhone ? hashPassword(nextPhone) : currentHash,
      nextName,
      nextPhone,
      nextActive ? 1 : 0,
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
    run('UPDATE users SET password_hash = ? WHERE id = ? AND role = ?', hashPassword(teacher.phone), teacherId, 'teacher');
    audit(admin.id, 'user', teacherId, 'reset_teacher_password', null, { phone: teacher.phone });
    return { ok: true, phone: teacher.phone };
  });

  app.delete('/admin/teachers/:id', async (req) => {
    const admin = requireAdmin(req);
    const teacherId = Number((req.params as { id: string }).id);
    const teacher = loadTeacher(teacherId);
    const purge = (req.query as { purge?: string }).purge === '1';
    if (teacher.examCount > 0 && !purge) {
      throw new HttpError(
        409,
        `该教师名下有 ${teacher.examCount} 场考试，删除账号会一并清除考试与成绩，请二次确认`,
      );
    }

    let purgedExams = 0;
    tx(() => {
      purgedExams = deleteTeacherRecord(teacherId);
    });
    audit(admin.id, 'user', teacherId, 'delete_teacher', teacher, { purgedExams });
    return { ok: true, deleted: true, purgedExams } satisfies DeleteTeacherResult;
  });

  app.post('/admin/teachers/batch', async (req) => {
    const admin = requireAdmin(req);
    const body = batchSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, '请选择要操作的教师');
    const { action, ids, purge } = body.data;

    if (action === 'delete') {
      let deleted = 0;
      let purgedExams = 0;
      const rows = all<{ id: number; exam_count: number }>(
        `SELECT u.id,
           (SELECT COUNT(*) FROM exams e WHERE e.teacher_id = u.id) AS exam_count
         FROM users u WHERE u.role = 'teacher' AND u.id IN (${placeholders(ids.length)})`,
        ...ids,
      );
      const totalExams = rows.reduce((sum, row) => sum + row.exam_count, 0);
      if (totalExams > 0 && !purge) {
        throw new HttpError(409, `选中的教师名下有 ${totalExams} 场考试，确认删除会一并清除考试与成绩`);
      }

      tx(() => {
        for (const row of rows) {
          purgedExams += deleteTeacherRecord(row.id);
          deleted += 1;
        }
      });
      audit(admin.id, 'user', 0, 'batch_delete_teacher', null, { ids, purgedExams, deleted });
      return { ok: true, affected: deleted, deleted, purgedExams } satisfies BatchTeacherResult;
    }

    const active = action === 'enable' ? 1 : 0;
    const result = run(
      `UPDATE users SET is_active = ? WHERE role = 'teacher' AND id IN (${placeholders(ids.length)})`,
      active,
      ...ids,
    );
    audit(admin.id, 'user', 0, action === 'enable' ? 'batch_enable_teacher' : 'batch_disable_teacher', null, {
      ids,
    });
    return {
      ok: true,
      affected: result.changes,
      deleted: 0,
      purgedExams: 0,
    } satisfies BatchTeacherResult;
  });

}

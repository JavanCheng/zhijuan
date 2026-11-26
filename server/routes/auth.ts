import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Role } from '../../shared/types.ts';
import { get, run } from '../db.ts';
import { hashPassword, verifyPassword } from '../password.ts';
import { currentUser, type SessionUser } from '../auth.ts';
import { HttpError, requireTeacher } from '../http.ts';

const accountLoginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});

const studentLoginSchema = z.object({
  name: z.string().trim().min(1).max(40),
  studentNo: z.string().trim().min(1).max(40),
});

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  name: string;
  role: Role;
  phone: string | null;
  student_no: string | null;
  class_id: number | null;
  class_name: string | null;
  is_active: number;
}

function setSession(reply: FastifyReply, userId: number): void {
  reply.setCookie('sid', String(userId), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
  });
}

function toDto(row: UserRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    phone: row.phone,
    studentNo: row.student_no,
    classId: row.class_id,
    className: row.class_name,
    isActive: !!row.is_active,
  };
}

async function adminLogin(req: FastifyRequest, reply: FastifyReply) {
  const parsed = accountLoginSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, '请输入管理员账号和密码');

  const row = get<UserRow>(
    `SELECT u.*, c.name AS class_name FROM users u
     LEFT JOIN classes c ON c.id = u.class_id
     WHERE u.username = ? AND u.role = 'admin'`,
    parsed.data.username,
  );
  if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
    throw new HttpError(401, '管理员账号或密码错误');
  }
  if (!row.is_active) throw new HttpError(403, '管理员账号已停用');

  setSession(reply, row.id);
  return { user: toDto(row) };
}

async function teacherLogin(req: FastifyRequest, reply: FastifyReply) {
  const parsed = accountLoginSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, '请输入教师账号和密码');

  const account = parsed.data.username;
  const row = get<UserRow>(
    `SELECT u.*, c.name AS class_name FROM users u
     LEFT JOIN classes c ON c.id = u.class_id
     WHERE u.role = 'teacher' AND (u.phone = ? OR ((u.phone IS NULL OR trim(u.phone, char(9, 10, 11, 12, 13, 32)) = '') AND u.username = ?))
     LIMIT 1`,
    account,
    account,
  );
  if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
    throw new HttpError(401, '教师账号或密码错误');
  }
  if (!row.is_active) throw new HttpError(403, '该教师账号已停用，请联系管理员');

  setSession(reply, row.id);
  return { user: toDto(row) };
}

async function studentLogin(req: FastifyRequest, reply: FastifyReply) {
  const parsed = studentLoginSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, '请输入姓名和学号');

  const row = get<UserRow>(
    `SELECT u.*, c.name AS class_name FROM users u
     LEFT JOIN classes c ON c.id = u.class_id
     WHERE u.role = 'student' AND u.student_no = ? AND u.name = ?
     LIMIT 1`,
    parsed.data.studentNo,
    parsed.data.name,
  );
  if (!row) {
    throw new HttpError(401, '姓名或学号不正确。学生账号需由老师在「班级管理」中录入。');
  }
  if (!row.is_active) {
    throw new HttpError(403, '该学生账号已停用，请联系老师。');
  }

  setSession(reply, row.id);
  return { user: toDto(row) };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // /auth/login 保留为教师登录别名，避免旧脚本失效
  app.post('/auth/login', teacherLogin);
  app.post('/auth/admin/login', adminLogin);
  app.post('/auth/teacher/login', teacherLogin);
  app.post('/auth/student/login', studentLogin);
  app.post('/auth/teacher/change-password', async (req) => {
    const teacher = requireTeacher(req);
    const parsed = z.object({
      currentPassword: z.string().min(1).max(200),
      newPassword: z.string().min(8).max(128).refine((value) => value.trim().length > 0),
    }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, '请输入当前密码，新密码须为 8–128 个字符');
    const { currentPassword, newPassword } = parsed.data;
    const row = get<{ password_hash: string; phone: string | null }>(
      "SELECT password_hash, phone FROM users WHERE id = ? AND role = 'teacher' AND is_active = 1", teacher.id,
    );
    if (!row || !verifyPassword(currentPassword, row.password_hash)) throw new HttpError(400, '当前密码不正确');
    if (newPassword === currentPassword || (row.phone && newPassword.trim() === row.phone.trim())) {
      throw new HttpError(400, '新密码不能与当前密码或手机号相同');
    }
    run("UPDATE users SET password_hash = ?, teacher_password_state = 'custom' WHERE id = ? AND role = 'teacher'", hashPassword(newPassword), teacher.id);
    return { ok: true };
  });

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie('sid', { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', async (req) => {
    const user = currentUser(req);
    if (!user) throw new HttpError(401, '未登录');
    return { user };
  });

  app.get('/auth/runtime', async (req) => {
    const user = currentUser(req);
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      throw new HttpError(403, '仅教师或管理员可查看');
    }
    const { runtimeStatus } = await import('../runner/run.ts');
    return runtimeStatus();
  });
}

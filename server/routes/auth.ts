import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { get } from '../db.ts';
import { verifyPassword } from '../password.ts';
import { currentUser, type SessionUser } from '../auth.ts';
import { HttpError } from '../http.ts';

const teacherLoginSchema = z.object({
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
  role: 'teacher' | 'student';
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
    studentNo: row.student_no,
    classId: row.class_id,
    className: row.class_name,
    isActive: !!row.is_active,
  };
}

async function teacherLogin(req: FastifyRequest, reply: FastifyReply) {
  const parsed = teacherLoginSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, '请输入教师账号和密码');

  const row = get<UserRow>(
    `SELECT u.*, c.name AS class_name FROM users u
     LEFT JOIN classes c ON c.id = u.class_id
     WHERE u.username = ? AND u.role = 'teacher'`,
    parsed.data.username,
  );
  if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
    throw new HttpError(401, '教师账号或密码错误');
  }
  if (!row.is_active) throw new HttpError(403, '该教师账号已停用');

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
  app.post('/auth/teacher/login', teacherLogin);
  app.post('/auth/student/login', studentLogin);

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
    if (!user || user.role !== 'teacher') throw new HttpError(403, '仅教师可查看');
    const { runtimeStatus } = await import('../runner/run.ts');
    return runtimeStatus();
  });
}

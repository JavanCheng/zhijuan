import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { get } from '../db.ts';
import { verifyPassword } from '../password.ts';
import { currentUser } from '../auth.ts';
import { HttpError } from '../http.ts';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function setSession(reply: FastifyReply, userId: number): void {
  reply.setCookie('sid', String(userId), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, '请输入账号和密码');

    const { username, password } = parsed.data;
    const row = get<{
      id: number;
      username: string;
      password_hash: string;
      name: string;
      role: 'teacher' | 'student';
      student_no: string | null;
      class_id: number | null;
      class_name: string | null;
    }>(
      `SELECT u.*, c.name AS class_name FROM users u LEFT JOIN classes c ON c.id = u.class_id
       WHERE u.username = ? OR u.student_no = ?`,
      username.trim(),
      username.trim(),
    );

    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, '账号或密码错误');
    }

    setSession(reply, row.id);
    return {
      user: {
        id: row.id,
        username: row.username,
        name: row.name,
        role: row.role,
        studentNo: row.student_no,
        classId: row.class_id,
        className: row.class_name,
      },
    };
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
    if (!user || user.role !== 'teacher') throw new HttpError(403, '仅教师可查看');
    const { runtimeStatus } = await import('../runner/run.ts');
    return runtimeStatus();
  });
}

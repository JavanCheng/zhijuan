import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import { DATA_DIR, get } from './db.ts';

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: 'teacher' | 'student';
  studentNo: string | null;
  classId: number | null;
  className: string | null;
}

let cachedSecret: string | null = null;
export function cookieSecret(): string {
  if (cachedSecret) return cachedSecret;
  const file = path.join(DATA_DIR, '.secret');
  if (fs.existsSync(file)) {
    cachedSecret = fs.readFileSync(file, 'utf8').trim();
  } else {
    cachedSecret = randomBytes(32).toString('hex');
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

export function currentUser(req: FastifyRequest): SessionUser | null {
  const raw = req.cookies?.sid;
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  const id = Number(unsigned.value);
  if (!Number.isFinite(id)) return null;
  const row = get<{
    id: number;
    username: string;
    name: string;
    role: 'teacher' | 'student';
    student_no: string | null;
    class_id: number | null;
    class_name: string | null;
  }>(
    `SELECT u.id, u.username, u.name, u.role, u.student_no, u.class_id, c.name AS class_name
     FROM users u LEFT JOIN classes c ON c.id = u.class_id WHERE u.id = ?`,
    id,
  );
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    studentNo: row.student_no,
    classId: row.class_id,
    className: row.class_name,
  };
}

export { verifyPassword, hashPassword } from './password.ts';

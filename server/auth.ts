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
  }>('SELECT id, username, name, role, student_no FROM users WHERE id = ?', id);
  if (!row) return null;
  return { id: row.id, username: row.username, name: row.name, role: row.role, studentNo: row.student_no };
}

export { verifyPassword, hashPassword } from './password.ts';

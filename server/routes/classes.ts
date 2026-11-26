import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, get, nowIso, run, tx } from '../db.ts';
import { audit, HttpError, requireTeacher } from '../http.ts';
import { hashPassword } from '../password.ts';
import { buildRosterTemplate, parseRosterWorkbook, type ParsedRosterRow } from '../import/students.ts';
import type { RosterPreviewResult, RosterPreviewSummary } from '../../shared/roster-preview.ts';
import type {
  ManagedClass,
  ManagedStudent,

  RosterIssue,
  RosterOverview,
} from '../../shared/types.ts';

const classSchema = z.object({
  name: z.string().trim().min(1).max(40),
  grade: z.string().trim().max(20).optional(),
});

const studentCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  studentNo: z.string().trim().min(1).max(40),
  classId: z.number().int().positive(),
});

const studentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  studentNo: z.string().trim().min(1).max(40).optional(),
  classId: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

function emptySummary(): RosterPreviewSummary {
  return {
    rowsRead: 0,
    classesCreated: 0,
    studentsCreated: 0,
    studentsUpdated: 0,
    studentsReactivated: 0,
    studentsTransferred: 0,
    studentsUnchanged: 0,
  };
}

function loadOverview(): RosterOverview {
  const classes: ManagedClass[] = all<{
    id: number;
    name: string;
    grade: string | null;
    sort_order: number;
    active_count: number;
    inactive_count: number;
    total_count: number;
  }>(
    `SELECT c.id, c.name, c.grade, c.sort_order,
       (SELECT COUNT(*) FROM users u WHERE u.role = 'student' AND u.class_id = c.id AND u.is_active = 1) AS active_count,
       (SELECT COUNT(*) FROM users u WHERE u.role = 'student' AND u.class_id = c.id AND u.is_active = 0) AS inactive_count,
       (SELECT COUNT(*) FROM users u WHERE u.role = 'student' AND u.class_id = c.id) AS total_count
     FROM classes c ORDER BY c.sort_order, c.id`,
  ).map((row) => ({
    id: row.id,
    name: row.name,
    grade: row.grade,
    sortOrder: row.sort_order,
    activeCount: row.active_count,
    inactiveCount: row.inactive_count,
    totalCount: row.total_count,
  }));

  const students: ManagedStudent[] = all<{
    id: number;
    name: string;
    student_no: string | null;
    class_id: number | null;
    class_name: string | null;
    is_active: number;
    created_at: string;
    submission_count: number;
  }>(
    `SELECT u.id, u.name, u.student_no, u.class_id, c.name AS class_name, u.is_active, u.created_at,
       (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id) AS submission_count
     FROM users u LEFT JOIN classes c ON c.id = u.class_id
     WHERE u.role = 'student'
     ORDER BY c.sort_order, u.student_no, u.id`,
  ).map((row) => ({
    id: row.id,
    name: row.name,
    studentNo: row.student_no ?? '',
    classId: row.class_id,
    className: row.class_name,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    submissionCount: row.submission_count,
  }));

  return {
    classes,
    students,
    totalStudents: students.length,
    activeStudents: students.filter((student) => student.isActive).length,
    inactiveStudents: students.filter((student) => !student.isActive).length,
    unassignedStudents: students.filter((student) => student.classId == null).length,
  };
}

function loadManagedStudent(id: number): ManagedStudent {
  const row = get<{
    id: number;
    name: string;
    student_no: string | null;
    class_id: number | null;
    class_name: string | null;
    is_active: number;
    created_at: string;
    submission_count: number;
  }>(
    `SELECT u.id, u.name, u.student_no, u.class_id, c.name AS class_name, u.is_active, u.created_at,
       (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id) AS submission_count
     FROM users u LEFT JOIN classes c ON c.id = u.class_id
     WHERE u.id = ? AND u.role = 'student'`,
    id,
  );
  if (!row) throw new HttpError(404, '学生不存在');
  return {
    id: row.id,
    name: row.name,
    studentNo: row.student_no ?? '',
    classId: row.class_id,
    className: row.class_name,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    submissionCount: row.submission_count,
  };
}

function assertClass(classId: number): { id: number; name: string } {
  const row = get<{ id: number; name: string }>('SELECT id, name FROM classes WHERE id = ?', classId);
  if (!row) throw new HttpError(400, '班级不存在');
  return row;
}

function assertStudentNoAvailable(studentNo: string, exceptId?: number): void {
  const row = get<{ id: number }>(
    "SELECT id FROM users WHERE role = 'student' AND student_no = ?",
    studentNo,
  );
  if (row && row.id !== exceptId) throw new HttpError(409, `学号 ${studentNo} 已被使用`);
}

function uniqueUsername(base: string): string {
  let candidate = base.slice(0, 60);
  let suffix = 1;
  while (get('SELECT id FROM users WHERE username = ?', candidate)) {
    candidate = `${base.slice(0, 55)}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function createStudentRecord(input: { name: string; studentNo: string; classId: number }): number {
  assertClass(input.classId);
  assertStudentNoAvailable(input.studentNo);
  const result = run(
    `INSERT INTO users (username, password_hash, name, role, student_no, class_id, is_active, created_at)
     VALUES (?, ?, ?, 'student', ?, ?, 1, ?)`,
    uniqueUsername(`stu_${input.studentNo}`),
    hashPassword(randomBytes(24).toString('hex')),
    input.name,
    input.studentNo,
    input.classId,
    nowIso(),
  );
  return result.lastInsertRowid;
}

export async function classRoutes(app: FastifyInstance): Promise<void> {
  app.get('/teacher/classes/overview', async (req) => {
    requireTeacher(req);
    return loadOverview();
  });

  app.get('/teacher/students/template.xlsx', async (req, reply) => {
    requireTeacher(req);
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="student-roster-template.xlsx"')
      .send(buildRosterTemplate());
  });

  app.post('/teacher/classes', async (req) => {
    const user = requireTeacher(req);
    const body = classSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, '班级名称不能为空（1-40 字）');
    if (get('SELECT id FROM classes WHERE name = ?', body.data.name)) {
      throw new HttpError(409, '同名班级已存在');
    }
    const maxSort = get<{ value: number | null }>('SELECT MAX(sort_order) AS value FROM classes')?.value ?? 0;
    const res = run(
      'INSERT INTO classes (name, grade, sort_order, created_at) VALUES (?, ?, ?, ?)',
      body.data.name,
      body.data.grade ?? null,
      maxSort + 1,
      nowIso(),
    );
    audit(user.id, 'class', res.lastInsertRowid, 'create', null, { name: body.data.name });
    return { ok: true, id: res.lastInsertRowid, name: body.data.name };
  });

  app.patch('/teacher/classes/:id', async (req) => {
    const user = requireTeacher(req);
    const classId = Number((req.params as { id: string }).id);
    const current = get<{ id: number; name: string; grade: string | null }>(
      'SELECT id, name, grade FROM classes WHERE id = ?',
      classId,
    );
    if (!current) throw new HttpError(404, '班级不存在');
    const body = classSchema.partial().safeParse(req.body);
    if (!body.success) throw new HttpError(400, '班级名称不合法');
    const name = body.data.name ?? current.name;
    if (name !== current.name && get('SELECT id FROM classes WHERE name = ? AND id <> ?', name, classId)) {
      throw new HttpError(409, '同名班级已存在');
    }
    run(
      'UPDATE classes SET name = ?, grade = ? WHERE id = ?',
      name,
      body.data.grade ?? current.grade,
      classId,
    );
    audit(user.id, 'class', classId, 'update', current, { name, grade: body.data.grade ?? current.grade });
    return { ok: true };
  });

  app.delete('/teacher/classes/:id', async (req) => {
    const user = requireTeacher(req);
    const classId = Number((req.params as { id: string }).id);
    const current = get<{ id: number; name: string }>('SELECT id, name FROM classes WHERE id = ?', classId);
    if (!current) throw new HttpError(404, '班级不存在');
    const count = get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM users WHERE role = 'student' AND class_id = ?",
      classId,
    )?.c ?? 0;
    if (count > 0) throw new HttpError(400, `班级还有 ${count} 名学生，请先移出或停用后再删除`);
    run('DELETE FROM classes WHERE id = ?', classId);
    audit(user.id, 'class', classId, 'delete', current, null);
    return { ok: true };
  });

  app.post('/teacher/students', async (req) => {
    const user = requireTeacher(req);
    const body = studentCreateSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, '姓名、学号与班级均为必填项');
    const id = createStudentRecord(body.data);
    const created = loadManagedStudent(id);
    audit(user.id, 'user', id, 'create', null, {
      name: created.name,
      studentNo: created.studentNo,
      classId: created.classId,
    });
    return created;
  });

  app.patch('/teacher/students/:id', async (req) => {
    const user = requireTeacher(req);
    const studentId = Number((req.params as { id: string }).id);
    const current = loadManagedStudent(studentId);
    const body = studentUpdateSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, '学生信息不合法');

    const nextName = body.data.name ?? current.name;
    const nextNo = body.data.studentNo ?? current.studentNo;
    const nextClassId = body.data.classId ?? current.classId;
    if (nextClassId == null) throw new HttpError(400, '请选择班级');
    assertClass(nextClassId);
    if (nextNo !== current.studentNo) assertStudentNoAvailable(nextNo, studentId);

    run(
      'UPDATE users SET name = ?, student_no = ?, class_id = ?, is_active = ? WHERE id = ?',
      nextName,
      nextNo,
      nextClassId,
      body.data.isActive === undefined ? (current.isActive ? 1 : 0) : body.data.isActive ? 1 : 0,
      studentId,
    );
    audit(
      user.id,
      'user',
      studentId,
      'update',
      { name: current.name, studentNo: current.studentNo, classId: current.classId, isActive: current.isActive },
      {
        name: nextName,
        studentNo: nextNo,
        classId: nextClassId,
        isActive: body.data.isActive ?? current.isActive,
      },
    );
    return loadManagedStudent(studentId);
  });

  app.delete('/teacher/students/:id', async (req) => {
    const user = requireTeacher(req);
    const studentId = Number((req.params as { id: string }).id);
    const current = loadManagedStudent(studentId);
    if (current.submissionCount > 0) {
      run('UPDATE users SET is_active = 0 WHERE id = ?', studentId);
      audit(user.id, 'user', studentId, 'deactivate', { isActive: current.isActive }, { isActive: false });
      return { ok: true, deactivated: true, submissionCount: current.submissionCount };
    }
    run('DELETE FROM users WHERE id = ?', studentId);
    audit(user.id, 'user', studentId, 'delete', current, null);
    return { ok: true, deleted: true };
  });

  app.post('/teacher/students/import/preview', (req) => processImport(req, false));
  app.post('/teacher/students/import', (req) => processImport(req, true));
}

type ExistingStudent = { id: number; name: string; student_no: string; class_id: number | null; is_active: number };
const previewKey = randomBytes(32);
const previewLifetime = 15 * 60_000;

function planImport(rows: ParsedRosterRow[], sourceWarnings: RosterIssue[]) {
  const classes = new Map(all<{ id: number; name: string }>('SELECT id, name FROM classes').map(({ id, name }) => [name, id]));
  const classNames = new Map([...classes].map(([name, id]) => [id, name]));
  const existing = new Map(all<ExistingStudent>(
    "SELECT id, student_no, name, class_id, is_active FROM users WHERE role = 'student' AND student_no IS NOT NULL",
  ).map((row) => [row.student_no, row]));
  const newClasses = new Set<string>();
  const summary = { ...emptySummary(), rowsRead: rows.length };
  const warnings = [...sourceWarnings];
  const changes = rows.map((row) => {
    const classId = classes.get(row.className);
    const current = existing.get(row.studentNo);
    if (!classId) newClasses.add(row.className);
    const renamed = current != null && current.name !== row.name;
    const transferred = current != null && current.class_id !== (classId ?? -1);
    const activated = current != null && current.is_active === 0;
    const issue = (message: string) => warnings.push({ sheet: row.sheet, row: row.row, level: 'warning', message });
    if (!current) summary.studentsCreated++;
    else {
      if (renamed) { summary.studentsUpdated++; issue(`学号 ${row.studentNo}：姓名「${current.name}」改为「${row.name}」`); }
      if (transferred) { summary.studentsTransferred++; issue(`学号 ${row.studentNo}：从「${classNames.get(current.class_id ?? -1) ?? '未分班'}」调至「${row.className}」`); }
      if (activated) { summary.studentsReactivated++; issue(`学号 ${row.studentNo}：将重新启用登录`); }
      if (!renamed && !transferred && !activated) summary.studentsUnchanged++;
    }
    return { row, current, classId, previousClassName: classNames.get(current?.class_id ?? -1), renamed, transferred, activated };
  });
  summary.classesCreated = newClasses.size;
  return { classes, newClasses, summary, warnings, changes };
}

function signPreview(expires: number, userId: number, fileHash: string, snapshot: unknown): string {
  const signature = createHmac('sha256', previewKey).update(JSON.stringify([expires, userId, fileHash, snapshot])).digest('hex');
  return `${expires}.${signature}`;
}

async function processImport(req: import('fastify').FastifyRequest, confirm: boolean): Promise<RosterPreviewResult> {
  const user = requireTeacher(req);
  if (!req.isMultipart()) throw new HttpError(400, '请上传 .xlsx、.xls 或 .csv 文件');
  const file = await req.file();
  if (!file) throw new HttpError(400, '没有收到文件');
  if (!/\.(xlsx|xls|csv)$/i.test(file.filename)) throw new HttpError(400, '只支持 .xlsx、.xls 或 .csv');
  const buffer = await file.toBuffer();
  if (!buffer.length) throw new HttpError(400, '文件为空');
  if (buffer.length > 10 * 1024 * 1024) throw new HttpError(413, '文件不能超过 10MB');
  const parsed = parseRosterWorkbook(buffer);
  if (parsed.errors.length) return { ok: false, summary: { ...emptySummary(), rowsRead: parsed.rows.length }, errors: parsed.errors, warnings: parsed.warnings };
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  const execute = (): RosterPreviewResult => {
    const plan = planImport(parsed.rows, parsed.warnings);
    const snapshot = plan.changes.map(({ current, classId, previousClassName }) => [current, classId, previousClassName]);
    const result: RosterPreviewResult = { ok: true, summary: plan.summary, errors: [], warnings: plan.warnings };
    if (!confirm) {
      return { ...result, previewToken: signPreview(Date.now() + previewLifetime, user.id, fileHash, snapshot) };
    }
    const token = req.headers['x-roster-preview'];
    const expires = typeof token === 'string' && /^\d{13}\.[a-f0-9]{64}$/.test(token) ? Number(token.split('.')[0]) : 0;
    if (!expires || expires < Date.now() || typeof token !== 'string') throw new HttpError(409, '预检已过期或缺失，请重新选择文件预检');
    const expected = signPreview(expires, user.id, fileHash, snapshot);
    if (!timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw new HttpError(409, '文件或相关名册已变更，请重新预检并确认');

    let maxSort = get<{ value: number | null }>('SELECT MAX(sort_order) AS value FROM classes')?.value ?? 0;
    for (const name of plan.newClasses) {
      const inserted = run('INSERT INTO classes (name, grade, sort_order, created_at) VALUES (?, NULL, ?, ?)', name, ++maxSort, nowIso());
      plan.classes.set(name, inserted.lastInsertRowid);
    }
    const passwordHash = plan.summary.studentsCreated ? hashPassword(randomBytes(24).toString('hex')) : '';
    for (const { row, current, renamed, transferred, activated } of plan.changes) {
      const classId = plan.classes.get(row.className)!;
      if (!current) {
        run(`INSERT INTO users (username, password_hash, name, role, student_no, class_id, is_active, created_at)
          VALUES (?, ?, ?, 'student', ?, ?, 1, ?)`, uniqueUsername(`stu_${row.studentNo}`), passwordHash, row.name, row.studentNo, classId, nowIso());
      } else if (renamed || transferred || activated) {
        run('UPDATE users SET name = ?, class_id = ?, is_active = 1 WHERE id = ?', row.name, classId, current.id);
      }
    }
    audit(user.id, 'roster', 0, 'import', null, result.summary);
    return result;
  };
  return confirm ? tx(execute) : execute();
}
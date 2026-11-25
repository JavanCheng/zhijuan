// 测试脚本专用：先以管理员身份准备一个固定的演示教师，再用该教师登录。
// 演示教师：13800000000 / 13800000000（每次运行都会重置为手机号密码）。
const ADMIN = { username: 'admin', password: 'yby19980523' };
const DEMO_TEACHER = { name: '演示教师', phone: '13800000000' };

async function apiCall(base, cookieRef, method, url, body) {
  const headers = {};
  if (cookieRef.value) headers.cookie = cookieRef.value;
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}/api${url}`, { method, headers, body: payload });
  for (const item of res.headers.getSetCookie?.() ?? []) {
    if (item.startsWith('sid=')) cookieRef.value = item.split(';')[0];
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const error = new Error(`${method} ${url} → ${res.status} ${text}`);
    error.status = res.status;
    throw error;
  }
  return json;
}

/**
 * @param {string} base 服务地址，如 http://127.0.0.1:8787
 * @returns {Promise<{ phone: string, password: string, id: number, name: string }>}
 */
export async function ensureDemoTeacher(base) {
  const cookieRef = { value: '' };
  const call = (method, url, body) => apiCall(base, cookieRef, method, url, body);

  await call('POST', '/auth/admin/login', ADMIN);
  const overview = await call('GET', '/admin/overview');
  let teacher = overview.teachers.find((item) => item.phone === DEMO_TEACHER.phone);
  if (!teacher) {
    teacher = await call('POST', '/admin/teachers', DEMO_TEACHER);
  }
  if (!teacher.isActive) {
    teacher = await call('PATCH', `/admin/teachers/${teacher.id}`, { isActive: true });
  }
  await call('POST', `/admin/teachers/${teacher.id}/reset-password`);
  return {
    id: teacher.id,
    name: teacher.name,
    phone: DEMO_TEACHER.phone,
    password: DEMO_TEACHER.phone,
  };
}

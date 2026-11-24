import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { ROOT, seed } from './db.ts';
import { cookieSecret } from './auth.ts';
import { HttpError } from './http.ts';
import { authRoutes } from './routes/auth.ts';
import { teacherRoutes } from './routes/teacher.ts';
import { studentRoutes } from './routes/student.ts';
import { analyticsRoutes } from './routes/analytics.ts';
import { classRoutes } from './routes/classes.ts';
import { startGradingWorker } from './grading/worker.ts';
import { runtimeStatus } from './runner/run.ts';

seed();

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const DIST = path.join(ROOT, 'dist');

const app = Fastify({
  logger: false,
  bodyLimit: 25 * 1024 * 1024,
});

await app.register(cookie, { secret: cookieSecret() });
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

app.setErrorHandler((error, _req, reply) => {
  if (error instanceof HttpError) {
    return reply.code(error.status).send({ error: error.message });
  }
  const err = error as Error & { statusCode?: number };
  const status = err.statusCode;
  if (status === 413) return reply.code(413).send({ error: '上传内容过大' });
  if (status && status >= 400 && status < 500) {
    return reply.code(status).send({ error: err.message || '请求不合法' });
  }
  console.error('[server] unhandled error:', err);
  return reply.code(500).send({ error: '服务器内部错误' });
});

await app.register(authRoutes, { prefix: '/api' });
await app.register(teacherRoutes, { prefix: '/api' });
await app.register(analyticsRoutes, { prefix: '/api' });
await app.register(classRoutes, { prefix: '/api' });
await app.register(studentRoutes, { prefix: '/api' });

app.get('/api/health', async () => ({
  ok: true,
  time: new Date().toISOString(),
  runtime: runtimeStatus(),
}));

if (fs.existsSync(path.join(DIST, 'index.html'))) {
  await app.register(fastifyStatic, { root: DIST, prefix: '/' });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: '接口不存在' });
    return reply.sendFile('index.html');
  });
} else {
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: '接口不存在' });
    return reply
      .code(200)
      .header('Content-Type', 'text/html; charset=utf-8')
      .send('<h1>前端尚未构建</h1><p>请先执行 <code>pnpm build</code>，或在开发模式下访问 Vite 的 5173 端口。</p>');
  });
}

startGradingWorker();

await app.listen({ port: PORT, host: HOST });

const lanUrls: string[] = [];
for (const list of Object.values(os.networkInterfaces())) {
  for (const net of list ?? []) {
    if (net.family === 'IPv4' && !net.internal) lanUrls.push(`http://${net.address}:${PORT}`);
  }
}

const runtime = runtimeStatus();
console.log('');
console.log('  智卷 · 信息科技在线测评系统');
console.log('  ────────────────────────────────');
console.log(`  本机访问   http://127.0.0.1:${PORT}`);
for (const url of lanUrls) console.log(`  局域网访问 ${url}`);
console.log(`  数据文件   ${path.join(ROOT, 'data', 'app.db')}`);
console.log(`  代码运行时 ${runtime.python ? `Python ✓ (${runtime.pythonSource})` : '未配置 Python（代码题将无法评测）'}`);
console.log('  教师账号   teacher / 123456');
console.log('  学生账号   s01 ~ s36 / 123456');
console.log('');

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../db.ts';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  timeMs: number;
  runtimeError?: string;
}

const MAX_OUTPUT = 256 * 1024;

let pythonCache: { bin: string; source: string } | null | undefined;

/** 依次尝试：环境变量 → 项目内置 runtime → 系统 PATH */
export function resolvePython(): { bin: string; source: string } | null {
  if (pythonCache !== undefined) return pythonCache;

  const candidates: Array<{ bin: string; source: string }> = [];
  if (process.env.PYTHON_BIN) candidates.push({ bin: process.env.PYTHON_BIN, source: '环境变量 PYTHON_BIN' });

  const bundled = path.join(ROOT, 'runtime', 'python', 'python.exe');
  if (fs.existsSync(bundled)) candidates.push({ bin: bundled, source: '项目内置 runtime/python' });
  const bundledUnix = path.join(ROOT, 'runtime', 'python', 'bin', 'python3');
  if (fs.existsSync(bundledUnix)) candidates.push({ bin: bundledUnix, source: '项目内置 runtime/python' });

  for (const bin of ['python', 'python3']) candidates.push({ bin, source: '系统 PATH' });

  for (const c of candidates) {
    try {
      const probe = spawnSync(c.bin, ['-I', '-c', 'print(1)'], { encoding: 'utf8', timeout: 6000, windowsHide: true });
      if (probe.status === 0 && probe.stdout.trim() === '1') {
        pythonCache = c;
        return c;
      }
    } catch {
      /* try next */
    }
  }
  pythonCache = null;
  return null;
}

export function runtimeStatus(): { python: string | null; node: string; pythonSource: string } {
  const py = resolvePython();
  return { python: py?.bin ?? null, node: process.execPath, pythonSource: py?.source ?? '未找到' };
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      return;
    } catch {
      /* fallthrough */
    }
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* ignore */
  }
}

export interface RunOptions {
  language: string;
  code: string;
  stdin: string;
  timeLimitMs: number;
}

export async function runProgram(opts: RunOptions): Promise<RunResult> {
  const timeLimit = Math.min(Math.max(opts.timeLimitMs || 2000, 200), 15000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zhijuan-run-'));
  const started = Date.now();

  try {
    let bin: string;
    let args: string[];
    let script: string;

    if (opts.language === 'javascript') {
      script = path.join(dir, 'main.js');
      fs.writeFileSync(script, opts.code, 'utf8');
      bin = process.execPath;
      args = [script];
    } else {
      const py = resolvePython();
      if (!py) {
        return {
          stdout: '',
          stderr: '',
          exitCode: null,
          timedOut: false,
          timeMs: 0,
          runtimeError: '未找到 Python 运行时。可在项目根目录放置 runtime/python，或设置环境变量 PYTHON_BIN。',
        };
      }
      script = path.join(dir, 'main.py');
      fs.writeFileSync(script, opts.code, 'utf8');
      bin = py.bin;
      args = ['-I', script];
    }

    return await new Promise<RunResult>((resolve) => {
      const child = spawn(bin, args, {
        cwd: dir,
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          PYTHONDONTWRITEBYTECODE: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;

      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode,
          timedOut,
          timeMs: Date.now() - started,
        });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid);
      }, timeLimit);

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length < MAX_OUTPUT) stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT) stderr += chunk.toString('utf8');
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: `${stderr}${String(err)}`,
          exitCode: null,
          timedOut,
          timeMs: Date.now() - started,
          runtimeError: String(err),
        });
      });

      child.on('close', (code) => finish(code));

      try {
        child.stdin?.end(opts.stdin ?? '');
      } catch {
        /* ignore */
      }
    });
  } finally {
    setTimeout(() => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }, 1500);
  }
}

import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { homeOf, useAuth } from '../auth';
import { Alert, Button, Field, Icon } from '../ui';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={homeOf(user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      const u = await login(username.trim(), password);
      navigate(homeOf(u.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setPending(false);
    }
  }

  function fill(name: string) {
    setUsername(name);
    setPassword('123456');
    setError('');
  }

  return (
    <div className="login">
      <section className="login-hero">
        <div className="hero-brand">
          <div className="brand-mark">智</div>
          <div>
            <div className="brand-name" style={{ fontSize: 17 }}>智卷</div>
            <div className="brand-sub">Information Technology Exam</div>
          </div>
        </div>

        <div>
          <h1 className="hero-title">
            出题、作答、阅卷
            <br />
            连成一条线
          </h1>
          <p className="hero-sub">
            教师用 Word 出卷，系统自动解析题型与答案；客观题秒级判分，代码题在沙箱里跑真实测试点；每一分改动都留痕。
          </p>
          <ul className="hero-list">
            <li>
              <span className="dot"><Icon name="file" size={13} /></span>
              Word 一次导入，六种题型自动识别
            </li>
            <li>
              <span className="dot"><Icon name="check" size={13} /></span>
              选择、填空、判断即时判分
            </li>
            <li>
              <span className="dot"><Icon name="code" size={13} /></span>
              代码题真实运行，逐点给分
            </li>
            <li>
              <span className="dot"><Icon name="users" size={13} /></span>
              教师校准台，自动分可逐题调整
            </li>
          </ul>
        </div>

        <div className="hero-foot">局域网单机部署 · 数据不出内网</div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <h1>登录</h1>
          <p className="sub">教师与学生使用同一入口，登录后自动进入对应工作台。</p>

          <form className="login-form" onSubmit={submit}>
            <Field label="账号 / 学号">
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="教师账号或学生学号"
                autoFocus
                autoComplete="username"
              />
            </Field>
            <Field label="密码">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </Field>
            {error ? <Alert tone="red">{error}</Alert> : null}
            <Button type="submit" size="lg" loading={pending} disabled={!username || !password}>
              进入系统
            </Button>
          </form>

          <div className="demo-accounts">
            <p>演示账号（点击填充，密码均为 123456）</p>
            <div className="demo-row">
              <button type="button" className="demo-btn" onClick={() => fill('teacher')}>
                <strong>教师端</strong>
                <span>teacher</span>
              </button>
              <button type="button" className="demo-btn" onClick={() => fill('s01')}>
                <strong>学生端</strong>
                <span>s01</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

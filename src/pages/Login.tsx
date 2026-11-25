import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, ConfigProvider, Form, Input, Spin, Tooltip } from 'antd';
import {
  ArrowRightOutlined,
  IdcardOutlined,
  LockOutlined,
  NumberOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { homeOf, useAuth } from '../auth';
import { BrandMark } from '../ui';
import { BRAND } from '../brand';
import { useFavicon } from '../favicon';
import { adminTheme, studentTheme, teacherTheme } from '../theme';
import { ChooserArt, StudentArt, TeacherArt } from './loginArt';

type LoginVariant = 'chooser' | 'admin' | 'teacher' | 'student';

/** 左侧只保留一句「xx 工作台」，其余用图形表达 */
const WORKSPACE: Record<LoginVariant, string> = {
  chooser: '统一入口',
  admin: '管理员工作台',
  teacher: '教师工作台',
  student: '学生工作台',
};

/** 每个入口一种主色：左侧图形与右侧按钮同色系 */
const ACCENT: Record<LoginVariant, [string, string]> = {
  chooser: ['#b6a5ff', '#5b46e8'],
  admin: ['#c4b5fd', '#6d4ad8'],
  teacher: ['#74a0ff', '#2a54e8'],
  student: ['#5ee3b8', '#0f9e77'],
};

/** 账号输入框旁的帮助说明：悬停 / 点击问号查看 */
const TEACHER_ACCOUNT_TIPS = (
  <ul className="m-0 list-disc space-y-1 pl-4 text-left">
    <li>教师账号由管理员统一创建，初始密码为手机号</li>
    <li>忘记密码请联系管理员重置</li>
  </ul>
);

function Hero({ variant }: { variant: LoginVariant }) {
  const [accent] = ACCENT[variant];
  const Art =
    variant === 'student' ? StudentArt : variant === 'teacher' || variant === 'admin' ? TeacherArt : ChooserArt;
  const markTone = variant === 'student' ? 'green' : variant === 'admin' ? 'purple' : 'blue';
  return (
    <section className="login-hero hidden flex-col p-12 lg:flex xl:p-14">
      <div className="relative z-10 flex items-center justify-between gap-4">
        <Link to="/login" className="flex items-center gap-3">
          <BrandMark size={40} tone={markTone} />
          <div>
            <div className="wordmark-on-dark text-[17px] font-semibold leading-tight">{BRAND.name}</div>
            <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.22em] text-white/45">{BRAND.latin}</div>
          </div>
        </Link>

        <div className="hero-workspace">
          <span
            className="hero-workspace-dot"
            style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
          />
          <span>{WORKSPACE[variant]}</span>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center py-8">
        <Art accent={ACCENT[variant]} />
      </div>
    </section>
  );
}

function LoginShell({ variant, children }: { variant: LoginVariant; children: ReactNode }) {
  const isStudent = variant === 'student';
  const isAdmin = variant === 'admin';
  const markTone = isStudent ? 'green' : isAdmin ? 'purple' : 'blue';
  useFavicon(isStudent ? 'green' : isAdmin ? 'purple' : 'blue');
  return (
    <ConfigProvider theme={isStudent ? studentTheme : isAdmin ? adminTheme : teacherTheme}>
      <div className={`grid min-h-screen lg:grid-cols-2 ${isStudent ? 'tone-student' : isAdmin ? 'tone-admin' : ''}`}>
        <Hero variant={variant} />
        <section className="flex items-center justify-center bg-white p-8">
          <div className="w-full max-w-[400px]">
            <div className="mb-9 flex items-center gap-2.5 lg:hidden">
              <BrandMark size={34} tone={markTone} />
              <div>
                <div className="wordmark-ink text-[15px] font-semibold">{BRAND.name}</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#98a1b3]">{BRAND.latin}</div>
              </div>
              <span className="ml-auto rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--brand-strong)]">
                {WORKSPACE[variant]}
              </span>
            </div>
            {children}
          </div>
        </section>
      </div>
    </ConfigProvider>
  );
}

/** 右侧内容骨架：一个标题 + 表单，其余全部留白 */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="login-panel">
      <h1 className="login-title">{title}</h1>
      {children}
    </div>
  );
}

function LoginLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spin size="large" />
    </div>
  );
}

export function LoginChooser() {
  const { user, loading } = useAuth();
  if (loading) return <LoginLoading />;
  if (user) return <Navigate to={homeOf(user.role)} replace />;

  return (
    <LoginShell variant="chooser">
      <Panel title="选择登录入口">
        <div className="mt-9 grid gap-3">
          <Link to="/admin/login" className="role-card">
            <span className="role-card-icon is-admin">
              <SafetyCertificateOutlined />
            </span>
            <span className="role-card-name">管理员登录</span>
            <ArrowRightOutlined className="role-card-arrow" />
          </Link>

          <Link to="/teacher/login" className="role-card">
            <span className="role-card-icon is-teacher">
              <UserOutlined />
            </span>
            <span className="role-card-name">教师登录</span>
            <ArrowRightOutlined className="role-card-arrow" />
          </Link>

          <Link to="/student/login" className="role-card">
            <span className="role-card-icon is-student">
              <IdcardOutlined />
            </span>
            <span className="role-card-name">学生登录</span>
            <ArrowRightOutlined className="role-card-arrow" />
          </Link>
        </div>
      </Panel>
    </LoginShell>
  );
}

export function TeacherLogin() {
  const { user, loginTeacher } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<{ username: string; password: string }>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={homeOf(user.role)} replace />;

  async function onFinish(values: { username: string; password: string }) {
    setError('');
    setPending(true);
    try {
      const logged = await loginTeacher(values.username.trim(), values.password);
      navigate(homeOf(logged.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <LoginShell variant="teacher">
      <Panel title="教师登录">
        <Form form={form} layout="vertical" onFinish={onFinish} className="login-form" requiredMark={false}>
          <Form.Item
            label={
              <span className="inline-flex items-center gap-1">
                账号
                <Tooltip
                  title={TEACHER_ACCOUNT_TIPS}
                  trigger={['hover', 'click']}
                  placement="right"
                  styles={{
                    root: { maxWidth: 'min(380px, calc(100vw - 120px))' },
                    container: { maxWidth: 'min(380px, calc(100vw - 120px))' },
                  }}
                >
                  <QuestionCircleOutlined
                    aria-label="教师账号说明"
                    className="cursor-help text-[11px] text-[#b6bfd0] transition-colors hover:text-[var(--brand)]"
                  />
                </Tooltip>
              </span>
            }
            name="username"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input
              size="large"
              autoComplete="username"
              prefix={<UserOutlined className="text-[#98a1b3]" />}
              placeholder="请输入账号"
              autoFocus
            />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              size="large"
              autoComplete="current-password"
              prefix={<LockOutlined className="text-[#98a1b3]" />}
              placeholder="请输入密码"
            />
          </Form.Item>

          {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

          <Button type="primary" size="large" block htmlType="submit" loading={pending} className="login-submit">
            进入教师工作台
          </Button>
        </Form>
      </Panel>
    </LoginShell>
  );
}

export function AdminLogin() {
  const { user, loginAdmin } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<{ username: string; password: string }>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={homeOf(user.role)} replace />;

  async function onFinish(values: { username: string; password: string }) {
    setError('');
    setPending(true);
    try {
      const logged = await loginAdmin(values.username.trim(), values.password);
      navigate(homeOf(logged.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <LoginShell variant="admin">
      <Panel title="管理员登录">
        <Form form={form} layout="vertical" onFinish={onFinish} className="login-form" requiredMark={false}>
          <Form.Item label="管理员账号" name="username" rules={[{ required: true, message: '请输入管理员账号' }]}>
            <Input
              size="large"
              autoComplete="username"
              prefix={<SafetyCertificateOutlined className="text-[#98a1b3]" />}
              placeholder="请输入管理员账号"
              autoFocus
            />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              size="large"
              autoComplete="current-password"
              prefix={<LockOutlined className="text-[#98a1b3]" />}
              placeholder="请输入密码"
            />
          </Form.Item>

          {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

          <Button type="primary" size="large" block htmlType="submit" loading={pending} className="login-submit">
            进入管理员工作台
          </Button>
        </Form>
      </Panel>
    </LoginShell>
  );
}

export function StudentLogin() {
  const { user, loginStudent } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<{ name: string; studentNo: string }>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={homeOf(user.role)} replace />;

  async function onFinish(values: { name: string; studentNo: string }) {
    setError('');
    setPending(true);
    try {
      const logged = await loginStudent(values.name.trim(), values.studentNo.trim());
      navigate(homeOf(logged.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <LoginShell variant="student">
      <Panel title="学生登录">
        <Form form={form} layout="vertical" onFinish={onFinish} className="login-form" requiredMark={false}>
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input
              size="large"
              autoComplete="name"
              prefix={<UserOutlined className="text-[#98a1b3]" />}
              placeholder="请输入姓名"
              autoFocus
            />
          </Form.Item>
          <Form.Item label="学号" name="studentNo" rules={[{ required: true, message: '请输入学号' }]}>
            <Input
              size="large"
              autoComplete="off"
              prefix={<NumberOutlined className="text-[#98a1b3]" />}
              placeholder="请输入学号"
            />
          </Form.Item>

          {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

          <Button type="primary" size="large" block htmlType="submit" loading={pending} className="login-submit">
            进入学生工作台
          </Button>
        </Form>
      </Panel>
    </LoginShell>
  );
}

import './login.css';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { App, Button, Form, Input, Spin } from 'antd';
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
import { BrandMark, IconButton } from '../ui';
import { BRAND } from '../brand';
import { useFavicon } from '../favicon';
import { ChooserArt, StudentArt, TeacherArt } from './loginArt';

type LoginVariant = 'chooser' | 'admin' | 'teacher' | 'student';

/** 左侧只保留一句「xx 工作台」，其余用图形表达 */
const WORKSPACE: Record<LoginVariant, string> = {
  chooser: '统一入口',
  admin: '管理员工作台',
  teacher: '教师工作台',
  student: '学生工作台',
};

/** 账号输入框旁的帮助说明：悬停或聚焦问号查看 */
const TEACHER_ACCOUNT_TIPS = (
  <ul className="m-0 list-disc space-y-1 pl-4 text-left">
    <li>教师账号由管理员统一创建，初始密码为手机号</li>
    <li>忘记密码请联系管理员重置</li>
  </ul>
);

function Hero({ variant }: { variant: LoginVariant }) {
  const tone = variant === 'student' ? 'green' : variant === 'admin' ? 'purple' : 'blue';
  const Art =
    variant === 'student' ? StudentArt : variant === 'teacher' || variant === 'admin' ? TeacherArt : ChooserArt;
  return (
    <section className="login-hero hidden flex-col p-12 lg:flex xl:p-14">
      <div className="relative z-10 flex items-center justify-between gap-4">
        <Link to="/login" className="flex items-center gap-3">
          <BrandMark size={40} tone={tone} />
          <div>
            <div className="wordmark-ink text-[17px] font-semibold leading-tight">{BRAND.name}</div>
            <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.22em] text-ui-tertiary">{BRAND.latin}</div>
          </div>
        </Link>

        <div className="hero-workspace">
          <span className="hero-workspace-dot" aria-hidden="true" />
          <span>{WORKSPACE[variant]}</span>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center py-8">
        <Art />
      </div>
    </section>
  );
}

function LoginShell({ variant, children }: { variant: LoginVariant; children: ReactNode }) {
  const isStudent = variant === 'student';
  const isAdmin = variant === 'admin';
  useFavicon(isStudent ? 'green' : isAdmin ? 'purple' : 'blue');
  return (
    <div className="grid min-h-screen bg-ui-page lg:grid-cols-2">
      <Hero variant={variant} />
      <section className="flex items-center justify-center bg-ui-surface p-4 sm:p-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-9 flex flex-wrap items-center gap-2.5 lg:hidden">
            <BrandMark size={34} tone={isStudent ? 'green' : isAdmin ? 'purple' : 'blue'} />
            <div>
              <div className="wordmark-ink text-[15px] font-semibold">{BRAND.name}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ui-tertiary">{BRAND.latin}</div>
            </div>
            <span className="ml-auto rounded-full bg-ui-accent-selected px-2.5 py-1 text-[11px] font-medium text-ui-accent">
              {WORKSPACE[variant]}
            </span>
          </div>
          {children}
        </div>
      </section>
    </div>
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
    <div className="flex min-h-screen items-center justify-center bg-ui-page">
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
          <Link to="/admin/login" className="role-card" data-ui-role="admin">
            <span className="role-card-icon">
              <SafetyCertificateOutlined />
            </span>
            <span className="role-card-name">管理员登录</span>
            <ArrowRightOutlined className="role-card-arrow" />
          </Link>

          <Link to="/teacher/login" className="role-card" data-ui-role="teacher">
            <span className="role-card-icon">
              <UserOutlined />
            </span>
            <span className="role-card-name">教师登录</span>
            <ArrowRightOutlined className="role-card-arrow" />
          </Link>

          <Link to="/student/login" className="role-card" data-ui-role="student">
            <span className="role-card-icon">
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
  const { message } = App.useApp();
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={homeOf(user.role)} replace />;

  async function onFinish(values: { username: string; password: string }) {
    setPending(true);
    try {
      const logged = await loginTeacher(values.username.trim(), values.password);
      navigate(homeOf(logged.role), { replace: true });
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '登录失败');
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
                <IconButton
                  htmlType="button"
                  type="text"
                  size="small"
                  label="教师账号说明"
                  tooltip={TEACHER_ACCOUNT_TIPS}
                  icon={<QuestionCircleOutlined className="text-[11px]" />}
                  className="cursor-help text-ui-secondary"
                  onClick={(event) => {
                    event.preventDefault();
                    event.currentTarget.focus();
                  }}
                />
              </span>
            }
            name="username"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input
              size="large"
              autoComplete="username"
              prefix={<UserOutlined className="text-ui-tertiary" />}
              placeholder="请输入账号"
              autoFocus
            />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              size="large"
              autoComplete="current-password"
              prefix={<LockOutlined className="text-ui-tertiary" />}
              placeholder="请输入密码"
            />
          </Form.Item>


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
  const { message } = App.useApp();
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={homeOf(user.role)} replace />;

  async function onFinish(values: { username: string; password: string }) {
    setPending(true);
    try {
      const logged = await loginAdmin(values.username.trim(), values.password);
      navigate(homeOf(logged.role), { replace: true });
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '登录失败');
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
              prefix={<SafetyCertificateOutlined className="text-ui-tertiary" />}
              placeholder="请输入管理员账号"
              autoFocus
            />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              size="large"
              autoComplete="current-password"
              prefix={<LockOutlined className="text-ui-tertiary" />}
              placeholder="请输入密码"
            />
          </Form.Item>


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
  const { message } = App.useApp();
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={homeOf(user.role)} replace />;

  async function onFinish(values: { name: string; studentNo: string }) {
    setPending(true);
    try {
      const logged = await loginStudent(values.name.trim(), values.studentNo.trim());
      navigate(homeOf(logged.role), { replace: true });
    } catch (err) {
      void message.error(err instanceof Error ? err.message : '登录失败');
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
              prefix={<UserOutlined className="text-ui-tertiary" />}
              placeholder="请输入姓名"
              autoFocus
            />
          </Form.Item>
          <Form.Item label="学号" name="studentNo" rules={[{ required: true, message: '请输入学号' }]}>
            <Input
              size="large"
              autoComplete="off"
              prefix={<NumberOutlined className="text-ui-tertiary" />}
              placeholder="请输入学号"
            />
          </Form.Item>


          <Button type="primary" size="large" block htmlType="submit" loading={pending} className="login-submit">
            进入学生工作台
          </Button>
        </Form>
      </Panel>
    </LoginShell>
  );
}

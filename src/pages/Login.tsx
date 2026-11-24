import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input, Spin, Typography } from 'antd';
import {
  ArrowRightOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  FileTextOutlined,
  IdcardOutlined,
  LockOutlined,
  NumberOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { homeOf, useAuth } from '../auth';
import { BrandMark } from '../ui';

const { Title, Text } = Typography;

type LoginVariant = 'chooser' | 'teacher' | 'student';

const HERO: Record<
  LoginVariant,
  {
    title: ReactNode;
    text: string;
    stats: Array<{ value: string; label: string }>;
    features: Array<{ icon: ReactNode; text: string }>;
  }
> = {
  chooser: {
    title: (
      <>
        出题、作答、阅卷
        <br />
        连成一条线
      </>
    ),
    text: '教师用 Word 出卷，系统自动解析题型与答案；学生用姓名和学号登录作答，成绩自动汇成班级学情看板。',
    stats: [
      { value: '2', label: '独立入口' },
      { value: '6', label: '种题型' },
      { value: '0', label: '外网依赖' },
    ],
    features: [
      { icon: <UserOutlined />, text: '教师账号密码登录，管理考试与班级' },
      { icon: <IdcardOutlined />, text: '学生姓名 + 学号登录，仅限已录入名册' },
      { icon: <BarChartOutlined />, text: '自动评分、逐题校准与班级学情看板' },
      { icon: <CheckCircleOutlined />, text: '所有改分留痕，成绩发布有据可查' },
    ],
  },
  teacher: {
    title: (
      <>
        教师工作台
        <br />
        从出卷到出分
      </>
    ),
    text: '用 Word 出卷，系统自动解析题型、答案与测试点；批改台逐题校准，成绩发布后自动进入学情看板。',
    stats: [
      { value: '6', label: '种题型' },
      { value: '3', label: '维学情' },
      { value: '0', label: '外网依赖' },
    ],
    features: [
      { icon: <FileTextOutlined />, text: 'Word 一次导入，六种题型自动识别' },
      { icon: <CodeOutlined />, text: '代码题真实运行，逐测试点给分' },
      { icon: <BarChartOutlined />, text: '班级学情看板，多班多生对比' },
      { icon: <SafetyCertificateOutlined />, text: '逐题改分写入审计日志' },
    ],
  },
  student: {
    title: (
      <>
        姓名 + 学号
        <br />
        进入你的答题空间
      </>
    ),
    text: '老师导入班级名册后，你才能使用姓名和学号登录。答题会自动保存，倒计时结束前可以随时检查。',
    stats: [
      { value: '6', label: '种题型' },
      { value: '自动', label: '保存草稿' },
      { value: '100%', label: '记录留痕' },
    ],
    features: [
      { icon: <IdcardOutlined />, text: '姓名 + 学号登录，无需额外注册' },
      { icon: <CheckCircleOutlined />, text: '选择、填空、判断即时判分' },
      { icon: <CodeOutlined />, text: '代码题内置 Python 起始模板' },
      { icon: <ReadOutlined />, text: '成绩发布后可看每题得分与解析' },
    ],
  },
};

function Hero({ variant }: { variant: LoginVariant }) {
  const config = HERO[variant];
  return (
    <section className="login-hero hidden flex-col justify-between p-14 lg:flex">
      <Link to="/login" className="relative z-10 flex items-center gap-3">
        <BrandMark size={40} />
        <div>
          <div className="text-[17px] font-semibold">智卷</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Information Technology Exam</div>
        </div>
      </Link>

      <div className="relative z-10">
        <Title level={1} style={{ color: '#fff', fontSize: 36, lineHeight: 1.35, marginBottom: 18 }}>
          {config.title}
        </Title>
        <p className="max-w-[460px] text-[15px] leading-8 text-white/70">{config.text}</p>

        <div className="mt-7 grid max-w-[430px] grid-cols-3 gap-2.5">
          {config.stats.map((item) => (
            <div className="hero-stat" key={item.label}>
              <div className="text-[22px] font-semibold leading-none">{item.value}</div>
              <div className="mt-1.5 text-[11px] text-white/50">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-7 grid gap-3.5">
          {config.features.map((feature) => (
            <div className="hero-item" key={feature.text}>
              <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-[7px] bg-white/10 text-[13px] text-[#a8c0ff]">
                {feature.icon}
              </span>
              <span className="text-[14px]">{feature.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 text-[12px] tracking-wide text-white/40">局域网单机部署 · 数据不出内网</div>
    </section>
  );
}

function LoginShell({ variant, children }: { variant: LoginVariant; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <Hero variant={variant} />
      <section className="flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size={34} />
            <div>
              <div className="text-[15px] font-semibold text-[#1a2338]">智卷</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#98a1b3]">Information Technology Exam</div>
            </div>
          </div>
          {children}
        </div>
      </section>
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

function RoleSwitch({ to, label }: { to: string; label: string }) {
  return (
    <div className="mt-7 flex items-center justify-between border-t border-dashed border-[#e4e8f2] pt-5">
      <span className="text-[11.5px] text-[#98a1b3]">入口地址：{to}</span>
      <Link to={to} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#3358e8]">
        {label}
        <ArrowRightOutlined className="text-[10px]" />
      </Link>
    </div>
  );
}

export function LoginChooser() {
  const { user, loading } = useAuth();
  if (loading) return <LoginLoading />;
  if (user) return <Navigate to={homeOf(user.role)} replace />;

  return (
    <LoginShell variant="chooser">
      <div className="page-eyebrow mb-2">Sign in</div>
      <Title level={2} style={{ marginBottom: 6 }}>
        选择登录入口
      </Title>
      <Text type="secondary">教师与学生使用不同地址登录，学生仅支持老师已录入的名册。</Text>

      <div className="mt-8 grid gap-3.5">
        <Link to="/teacher/login" className="role-card">
          <span className="role-card-icon is-teacher">
            <UserOutlined />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-[#1a2338]">教师登录</span>
            <span className="mt-1 block text-[12px] leading-5 text-[#7b86a0]">账号 + 密码 · 管理考试、班级与成绩</span>
            <span className="mt-1 block font-mono text-[10.5px] text-[#a0a8ba]">/teacher/login</span>
          </span>
          <ArrowRightOutlined className="text-[#b0b7c7]" />
        </Link>

        <Link to="/student/login" className="role-card">
          <span className="role-card-icon is-student">
            <IdcardOutlined />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-[#1a2338]">学生登录</span>
            <span className="mt-1 block text-[12px] leading-5 text-[#7b86a0]">姓名 + 学号 · 仅限老师导入的名册</span>
            <span className="mt-1 block font-mono text-[10.5px] text-[#a0a8ba]">/student/login</span>
          </span>
          <ArrowRightOutlined className="text-[#b0b7c7]" />
        </Link>
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-xl bg-[#f7f9fd] px-3.5 py-3 text-[11.5px] leading-5 text-[#7b86a0]">
        <SafetyCertificateOutlined className="mt-0.5 text-[#3358e8]" />
        <span>学生账号由教师在「班级管理」中导入或手动添加，未录入的学生无法登录。</span>
      </div>

      <div className="mt-6 flex items-center gap-1.5 text-[11.5px] text-[#a0a8ba]">
        <ThunderboltOutlined />
        客观题秒级判分 · 代码题真实评测
      </div>
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

  function fillDemo() {
    form.setFieldsValue({ username: 'teacher', password: '123456' });
    setError('');
  }

  return (
    <LoginShell variant="teacher">
      <div className="page-eyebrow mb-2">Teacher</div>
      <Title level={2} style={{ marginBottom: 6 }}>
        教师登录
      </Title>
      <Text type="secondary">使用教师账号进入工作台，管理考试、班级与学生成绩。</Text>

      <Form form={form} layout="vertical" onFinish={onFinish} className="!mt-8" requiredMark={false}>
        <Form.Item label="教师账号" name="username" rules={[{ required: true, message: '请输入教师账号' }]}>
          <Input
            size="large"
            autoComplete="username"
            prefix={<UserOutlined className="text-[#98a1b3]" />}
            placeholder="请输入教师账号"
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

        <Button type="primary" size="large" block htmlType="submit" loading={pending}>
          进入教师工作台
        </Button>
      </Form>

      <div className="mt-6 rounded-xl border border-[#e9ecf4] bg-[#fbfcff] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11.5px] text-[#98a1b3]">演示账号</div>
            <div className="mt-0.5 font-mono text-[12.5px] text-[#4b5670]">teacher / 123456</div>
          </div>
          <Button size="small" onClick={fillDemo}>
            填入
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-[11.5px] text-[#a0a8ba]">
        <SafetyCertificateOutlined />
        教师账号与学生入口相互独立
      </div>

      <RoleSwitch to="/student/login" label="我是学生" />
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

  function fillDemo() {
    form.setFieldsValue({ name: '李子涵', studentNo: '20250301' });
    setError('');
  }

  return (
    <LoginShell variant="student">
      <div className="page-eyebrow mb-2">Student</div>
      <Title level={2} style={{ marginBottom: 6 }}>
        学生登录
      </Title>
      <Text type="secondary">输入老师录入的姓名和学号，只有已录入名册的学生才能进入。</Text>

      <Form form={form} layout="vertical" onFinish={onFinish} className="!mt-8" requiredMark={false}>
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

        <Button type="primary" size="large" block htmlType="submit" loading={pending}>
          进入学生端
        </Button>
      </Form>

      <div className="mt-6 rounded-xl border border-[#e9ecf4] bg-[#fbfcff] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11.5px] text-[#98a1b3]">演示学生</div>
            <div className="mt-0.5 font-mono text-[12.5px] text-[#4b5670]">李子涵 / 20250301</div>
          </div>
          <Button size="small" onClick={fillDemo}>
            填入
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-1.5 rounded-xl bg-[#f7f9fd] px-3.5 py-3 text-[11.5px] leading-5 text-[#7b86a0]">
        <TeamOutlined className="mt-0.5 flex-none text-[#0b7a63]" />
        如果提示未找到学生，请联系老师在「班级管理」中确认姓名和学号已录入。
      </div>

      <RoleSwitch to="/teacher/login" label="教师入口" />
    </LoginShell>
  );
}

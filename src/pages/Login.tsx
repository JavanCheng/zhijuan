import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input, Typography } from 'antd';
import {
  BarChartOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { homeOf, useAuth } from '../auth';
import { BrandMark } from '../ui';

const { Title, Text } = Typography;

const FEATURES = [
  { icon: <FileTextOutlined />, text: 'Word 一次导入，六种题型自动识别' },
  { icon: <CheckCircleOutlined />, text: '选择、填空、判断即时判分' },
  { icon: <CodeOutlined />, text: '代码题真实运行，逐点给分' },
  { icon: <BarChartOutlined />, text: '班级学情看板，多班多生对比' },
];

const HERO_STATS = [
  { value: '6', label: '种题型' },
  { value: '3', label: '维学情' },
  { value: '0', label: '外网依赖' },
];

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<{ username: string; password: string }>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={homeOf(user.role)} replace />;

  async function onFinish(values: { username: string; password: string }) {
    setError('');
    setPending(true);
    try {
      const logged = await login(values.username.trim(), values.password);
      navigate(homeOf(logged.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setPending(false);
    }
  }

  function fill(username: string) {
    form.setFieldsValue({ username, password: '123456' });
    setError('');
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="login-hero hidden flex-col justify-between p-14 lg:flex">
        <div className="relative z-10 flex items-center gap-3">
          <BrandMark size={40} />
          <div>
            <div className="text-[17px] font-semibold">智卷</div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Information Technology Exam</div>
          </div>
        </div>

        <div className="relative z-10">
          <Title level={1} style={{ color: '#fff', fontSize: 36, lineHeight: 1.35, marginBottom: 18 }}>
            出题、作答、阅卷
            <br />
            连成一条线
          </Title>
          <p className="max-w-[460px] text-[15px] leading-8 text-white/70">
            教师用 Word 出卷，系统自动解析题型与答案；客观题秒级判分，代码题在沙箱里跑真实测试点；每一分改动都留痕，成绩自动汇成班级学情看板。
          </p>

          <div className="mt-7 grid max-w-[430px] grid-cols-3 gap-2.5">
            {HERO_STATS.map((item) => (
              <div className="hero-stat" key={item.label}>
                <div className="text-[24px] font-semibold leading-none">{item.value}</div>
                <div className="mt-1.5 text-[11px] text-white/50">{item.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-7 grid gap-3.5">
            {FEATURES.map((f) => (
              <div className="hero-item" key={f.text}>
                <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-[7px] bg-white/10 text-[13px] text-[#a8c0ff]">
                  {f.icon}
                </span>
                <span className="text-[14px]">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-[12px] tracking-wide text-white/40">局域网单机部署 · 数据不出内网</div>
      </section>

      <section className="flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-[380px]">
          <Title level={2} style={{ marginBottom: 6 }}>
            登录
          </Title>
          <Text type="secondary">教师与学生使用同一入口，登录后自动进入对应工作台。</Text>

          <Form form={form} layout="vertical" onFinish={onFinish} className="!mt-8" requiredMark={false}>
            <Form.Item label="账号 / 学号" name="username" rules={[{ required: true, message: '请输入账号或学号' }]}>
              <Input size="large" autoComplete="username" placeholder="教师账号或学生学号" autoFocus />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password size="large" autoComplete="current-password" placeholder="请输入密码" />
            </Form.Item>

            {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

            <Button type="primary" size="large" block htmlType="submit" loading={pending}>
              进入系统
            </Button>
          </Form>

          <div className="mt-7 border-t border-dashed border-[#e4e8f2] pt-5">
            <div className="mb-2.5 text-[12px] text-[#7a839a]">演示账号（点击填充，密码均为 123456）</div>
            <div className="flex gap-2.5">
              <Button block onClick={() => fill('teacher')} className="!h-auto !py-2.5">
                <div className="text-left leading-tight">
                  <div className="text-[13px] font-medium">教师端</div>
                  <div className="text-[12px] text-[#7a839a]">teacher</div>
                </div>
              </Button>
              <Button block onClick={() => fill('s01')} className="!h-auto !py-2.5">
                <div className="text-left leading-tight">
                  <div className="text-[13px] font-medium">学生端</div>
                  <div className="text-[12px] text-[#7a839a]">s01 · 高一(1)班</div>
                </div>
              </Button>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-1.5 text-[11.5px] text-[#a0a8ba]">
            <ThunderboltOutlined />
            客观题秒级判分 · 代码题真实评测
          </div>
        </div>
      </section>
    </div>
  );
}

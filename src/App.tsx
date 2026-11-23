import { Avatar, Button, Layout, Menu } from 'antd';
import { BarChartOutlined, LogoutOutlined } from '@ant-design/icons';
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth, Landing, RequireRole } from './auth';
import { BrandMark } from './ui';
import { Login } from './pages/Login';
import { TeacherHome } from './pages/teacher/Home';
import { TeacherExam } from './pages/teacher/ExamDetail';
import { TeacherGrading } from './pages/teacher/Grading';
import { TeacherSubmission } from './pages/teacher/Submission';
import { StudentHome } from './pages/student/Home';
import { StudentExam } from './pages/student/Exam';
import { StudentResult } from './pages/student/Result';

function TeacherShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider width={236} style={{ background: '#0f1830', position: 'sticky', top: 0, height: '100vh' }}>
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 px-5 pb-5 pt-6">
            <BrandMark size={38} />
            <div>
              <div className="text-[16px] font-semibold text-white">智卷</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Teacher</div>
            </div>
          </div>

          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={['exams']}
            style={{ background: 'transparent', borderInlineEnd: 'none', flex: 1 }}
            items={[{ key: 'exams', icon: <BarChartOutlined />, label: '考试管理' }]}
            onClick={() => navigate('/teacher')}
          />

          <div className="border-t border-white/10 p-3">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <Avatar shape="square" size={32} style={{ background: 'rgba(126,162,255,0.18)', color: '#c9d8ff', borderRadius: 9 }}>
                {user?.name.slice(0, 1)}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-white/90">{user?.name}</div>
                <div className="text-[11px] text-white/40">教师</div>
              </div>
              <Button
                type="text"
                size="small"
                icon={<LogoutOutlined />}
                aria-label="退出登录"
                style={{ color: 'rgba(255,255,255,0.5)' }}
                onClick={async () => {
                  await logout();
                  navigate('/login', { replace: true });
                }}
              />
            </div>
          </div>
        </div>
      </Layout.Sider>

      <Layout>
        <Layout.Content style={{ background: '#f5f6fb' }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

function StudentShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header
        style={{
          background: '#fff',
          borderBottom: '1px solid #e4e8f2',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 20,
          lineHeight: 'normal',
        }}
      >
        <BrandMark size={32} />
        <span className="text-[16px] font-semibold">智卷</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <div className="text-[13px] font-medium">{user?.name}</div>
            <div className="text-[11px] text-[#7a839a]">学号 {user?.studentNo ?? '—'}</div>
          </div>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            aria-label="退出登录"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          />
        </div>
      </Layout.Header>
      <Layout.Content style={{ background: '#f5f6fb' }}>
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      <Route
        path="/teacher"
        element={
          <RequireRole role="teacher">
            <TeacherShell />
          </RequireRole>
        }
      >
        <Route index element={<TeacherHome />} />
        <Route path="exam/:id" element={<TeacherExam />} />
        <Route path="exam/:id/grading" element={<TeacherGrading />} />
        <Route path="submission/:id" element={<TeacherSubmission />} />
      </Route>

      <Route
        path="/student"
        element={
          <RequireRole role="student">
            <StudentShell />
          </RequireRole>
        }
      >
        <Route index element={<StudentHome />} />
        <Route path="exam/:id" element={<StudentExam />} />
        <Route path="result/:id" element={<StudentResult />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

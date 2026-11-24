import { lazy, Suspense, useEffect, useState } from 'react';
import { Avatar, Button, Dropdown, Layout, Spin } from 'antd';
import {
  BarChartOutlined,
  DashboardOutlined,
  DownloadOutlined,
  LogoutOutlined,
  MenuOutlined,
  RightOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, Landing, RequireRole } from './auth';
import { BrandMark, Pill } from './ui';
import { LoginChooser, StudentLogin, TeacherLogin } from './pages/Login';
import { TeacherHome } from './pages/teacher/Home';
import { TeacherExam } from './pages/teacher/ExamDetail';
import { TeacherGrading } from './pages/teacher/Grading';
import { TeacherSubmission } from './pages/teacher/Submission';
import { TeacherClasses } from './pages/teacher/Classes';
import { StudentHome } from './pages/student/Home';
import { StudentExam } from './pages/student/Exam';
import { StudentResult } from './pages/student/Result';

const TeacherAnalytics = lazy(() =>
  import('./pages/teacher/Analytics').then((module) => ({ default: module.TeacherAnalytics })),
);

function RouteLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spin size="large" />
    </div>
  );
}

const TEACHER_NAV = [
  { to: '/teacher', end: true, label: '考试管理', icon: <DashboardOutlined /> },
  { to: '/teacher/analytics', end: false, label: '学情看板', icon: <BarChartOutlined /> },
  { to: '/teacher/classes', end: false, label: '班级管理', icon: <TeamOutlined /> },
];

function teacherSection(pathname: string): string {
  if (pathname.startsWith('/teacher/analytics')) return '学情看板';
  if (pathname.startsWith('/teacher/classes')) return '班级管理';
  if (/^\/teacher\/exam\/\d+\/grading/.test(pathname)) return '批改与出分';
  if (/^\/teacher\/exam\/\d+/.test(pathname)) return '试卷详情';
  if (/^\/teacher\/submission\/\d+/.test(pathname)) return '单份批改';
  return '考试管理';
}

function TeacherShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 992);
  const [mobile, setMobile] = useState(() => window.innerWidth < 992);

  useEffect(() => {
    setCollapsed(window.innerWidth < 992);
    setMobile(window.innerWidth < 992);
  }, []);

  useEffect(() => {
    if (mobile) setCollapsed(true);
  }, [location.pathname, mobile]);

  const section = teacherSection(location.pathname);

  async function signOut() {
    await logout();
    navigate('/teacher/login', { replace: true });
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {mobile && !collapsed ? <div className="sider-backdrop" onClick={() => setCollapsed(true)} /> : null}

      <Layout.Sider
        width={248}
        className="app-sider"
        collapsible
        collapsed={collapsed}
        collapsedWidth={0}
        trigger={null}
        breakpoint="lg"
        onBreakpoint={(broken) => {
          setMobile(broken);
          setCollapsed(broken);
        }}
        style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}
      >
        <div className="flex h-full flex-col">
          <NavLink to="/teacher" className="sider-brand flex items-center gap-3" onClick={() => mobile && setCollapsed(true)}>
            <BrandMark size={38} />
            <div>
              <div className="sider-brand-name">智卷</div>
              <div className="sider-brand-sub">Teacher Console</div>
            </div>
          </NavLink>

          <div className="sider-section-label">教学工作台</div>
          <nav className="sider-nav">
            {TEACHER_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => mobile && setCollapsed(true)}
                className={({ isActive }) => {
                  const active =
                    item.to === '/teacher'
                      ? location.pathname.startsWith('/teacher') &&
                        !location.pathname.startsWith('/teacher/analytics') &&
                        !location.pathname.startsWith('/teacher/classes')
                      : isActive;
                  return `sider-nav-item ${active ? 'is-active' : ''}`;
                }}
              >
                <span className="sider-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sider-section-label">教学资源</div>
          <nav className="sider-nav">
            <a className="sider-nav-item" href="/api/template.docx" download>
              <span className="sider-nav-icon">
                <DownloadOutlined />
              </span>
              <span>下载题目模板</span>
            </a>
          </nav>

          <div className="flex-1" />

          <div className="sider-footer">
            <div className="px-1 text-[10.5px] tracking-wide text-white/25">v0.3 · 局域网版</div>
          </div>
        </div>
      </Layout.Sider>

      <Layout>
        <Layout.Header className="app-topbar">
          <Button
            className="menu-toggle"
            type="text"
            icon={<MenuOutlined />}
            aria-label="打开导航"
            onClick={() => setCollapsed((value) => !value)}
          />
          <div className="topbar-crumb">
            <span className="hidden sm:inline">教师工作台</span>
            <RightOutlined className="topbar-sep hidden text-[9px] sm:inline" />
            <strong>{section}</strong>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'name', label: `${user?.name ?? '教师'} · 教师`, disabled: true },
                  { type: 'divider' },
                  { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
                ],
                onClick: ({ key }) => {
                  if (key === 'logout') void signOut();
                },
              }}
            >
              <button type="button" className="user-trigger">
                <Avatar size={30} style={{ background: 'linear-gradient(135deg, #4f74ff, #2545c9)', fontSize: 13 }}>
                  {user?.name.slice(0, 1)}
                </Avatar>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-[12.5px] font-medium text-[#26304a]">{user?.name}</span>
                  <span className="block text-[10.5px] text-[#98a1b3]">教师</span>
                </span>
              </button>
            </Dropdown>
          </div>
        </Layout.Header>

        <Layout.Content style={{ background: '#f4f6fb' }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

function StudentShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await logout();
    navigate('/student/login', { replace: true });
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header
        className="app-topbar"
        style={{ position: 'sticky', top: 0, zIndex: 30 }}
      >
        <NavLink to="/student" className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <span className="text-[15.5px] font-semibold text-[#1a2338]">智卷</span>
          <span className="hidden text-[11.5px] text-[#98a1b3] sm:inline">学生端</span>
        </NavLink>

        <div className="ml-3 hidden h-5 w-px bg-[#e6eaf3] sm:block" />
        <NavLink
          to="/student"
          className={({ isActive }) =>
            `hidden rounded-lg px-3 py-1.5 text-[12.5px] transition sm:block ${
              isActive ? 'bg-[#eef2ff] font-medium text-[#3358e8]' : 'text-[#7b86a0] hover:bg-[#f5f7fc]'
            }`
          }
        >
          我的考试
        </NavLink>

        <div className="ml-auto flex items-center gap-2.5">
          {user?.className ? (
            <span className="hidden sm:inline-flex">
              <Pill tone="teal">{user.className}</Pill>
            </span>
          ) : null}
          <span className="hidden text-right text-[11.5px] leading-tight text-[#98a1b3] md:block">
            学号 {user?.studentNo ?? '—'}
          </span>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'name', label: `${user?.name ?? '学生'}`, disabled: true },
                { key: 'no', label: `学号 ${user?.studentNo ?? '—'}`, disabled: true },
                { type: 'divider' },
                { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'logout') void signOut();
              },
            }}
          >
            <button type="button" className="user-trigger">
              <Avatar size={30} style={{ background: 'linear-gradient(135deg, #12b886, #0b7a63)', fontSize: 13 }}>
                {user?.name.slice(0, 1)}
              </Avatar>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[12.5px] font-medium text-[#26304a]">{user?.name}</span>
                <span className="block text-[10.5px] text-[#98a1b3]">{user?.className ?? '学生'}</span>
              </span>
            </button>
          </Dropdown>
        </div>
      </Layout.Header>
      <Layout.Content style={{ background: '#f4f6fb' }}>
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<LoginChooser />} />
      <Route path="/teacher/login" element={<TeacherLogin />} />
      <Route path="/student/login" element={<StudentLogin />} />

      <Route
        path="/teacher"
        element={
          <RequireRole role="teacher">
            <TeacherShell />
          </RequireRole>
        }
      >
        <Route index element={<TeacherHome />} />
        <Route path="analytics" element={
          <Suspense fallback={<RouteLoading />}>
            <TeacherAnalytics />
          </Suspense>
        } />
        <Route path="classes" element={<TeacherClasses />} />
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

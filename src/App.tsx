import './workspace.css';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { App as AntApp, Avatar, Dropdown, Layout } from 'antd';
import {
  BarChartOutlined,
  DashboardOutlined,
  CloseOutlined,
  DownloadOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  RightOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, Landing, RequireRole } from './auth';
import { BrandMark, ContentSkeleton, IconButton, Pill, UiTooltip } from './ui';
import { BRAND } from './brand';
import { useFavicon } from './favicon';
import { ThemeControl } from './appearance';
import { AdminLogin, LoginChooser, StudentLogin, TeacherLogin } from './pages/Login';
import { AdminTeachers } from './pages/admin/Teachers';
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
  return <ContentSkeleton className="page-shell" rows={8} />;
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

const ADMIN_NAV = [
  { to: '/admin', end: true, label: '教师账号', icon: <UserSwitchOutlined /> },
];

function UserMenu({ name, subtitle, onLogout }: { name?: string; subtitle: string; onLogout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const { message } = AntApp.useApp();
  return (
    <Dropdown open={open} onOpenChange={setOpen} trigger={['click']} autoFocus menu={{
      items: [{ key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true }],
      onClick: ({ key }) => {
        setOpen(false);
        if (key === 'logout') {
          void onLogout().catch((error: unknown) => {
            void message.error(error instanceof Error ? error.message : '退出登录失败');
          });
        }
      },
    }}>
      <button type="button" className="user-trigger" aria-label={`${name ?? subtitle} · 账户菜单`} aria-haspopup="menu" aria-expanded={open}>
        <Avatar size={30} className="shell-avatar">{name?.slice(0, 1)}</Avatar>
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block max-w-36 truncate text-[12.5px] font-medium text-ui-primary" title={name}>{name}</span>
          <span className="block max-w-36 truncate text-[10.5px] text-ui-tertiary" title={subtitle}>{subtitle}</span>
        </span>
      </button>
    </Dropdown>
  );
}

function WorkspaceShell({ admin = false }: { admin?: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useFavicon(admin ? 'purple' : 'blue');
  const [mobile, setMobile] = useState(() => matchMedia('(width < 992px)').matches);
  const [collapsed, setCollapsed] = useState(() => matchMedia('(width < 992px)').matches);
  const toggleRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const siderRef = useRef<HTMLElement>(null);
  const navFirst = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const query = matchMedia('(width < 992px)');
    const update = (event: MediaQueryListEvent) => {
      // If a resize hides focused sidebar content, hand focus back to its toggle.
      if (event.matches && siderRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
      setMobile(event.matches);
      setCollapsed(event.matches);
    };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const overlayOpen = mobile && !collapsed;
  useEffect(() => {
    if (overlayOpen) navFirst.current?.focus({ preventScroll: true });
  }, [overlayOpen]);

  function closeOverlay() {
    if (!mobile) return;
    setCollapsed(true);
    requestAnimationFrame(() => toggleRef.current?.focus());
  }
  useEffect(() => {
    if (mobile) setCollapsed(true);
  }, [location.pathname, mobile]);

  const role = admin ? 'admin' : 'teacher';
  const section = admin ? '教师账号' : teacherSection(location.pathname);
  const navigation = admin ? ADMIN_NAV : TEACHER_NAV;
  const workplace = admin ? '管理员工作台' : '教师工作台';

  async function signOut() {
    await logout();
    navigate(`/${role}/login`, { replace: true });
  }

  return (
    <div className={`app-frame${mobile ? ' is-mobile' : ''}`} onKeyDown={(event) => {
      if (overlayOpen && event.key === 'Escape') {
        event.stopPropagation();
        closeOverlay();
      }
    }}>
      {overlayOpen ? <div className="sider-backdrop" aria-hidden="true" onClick={closeOverlay} /> : null}
      <aside id="workspace-sidebar" ref={siderRef} className={`app-sider${collapsed ? ' is-collapsed' : ''}`} inert={mobile && collapsed} aria-label="工作台导航">
        <div className="flex h-full flex-col">
          {mobile ? <IconButton className="sider-close" icon={<CloseOutlined />} label="收起导航" onClick={closeOverlay} /> : null}
          <NavLink ref={navFirst} to={`/${role}`} className="sider-brand flex items-center gap-3" aria-label={`${BRAND.name} · ${workplace}`} onClick={closeOverlay}>
            <BrandMark size={38} tone={admin ? 'purple' : 'blue'} />
            <div className="sider-brand-copy">
              <div className="sider-brand-name">{BRAND.name}</div>
              <div className="sider-brand-sub">{admin ? 'Admin Console' : 'Teacher Console'}</div>
            </div>
          </NavLink>
          <div className="sider-section-label">{admin ? '系统管理' : '教学工作台'}</div>
          <nav className="sider-nav" aria-label="主要导航">
            {navigation.map((item) => {
              const onTeacherExam = item.to === '/teacher' && section !== '学情看板' && section !== '班级管理';
              return (
                <UiTooltip key={item.to} title={!mobile && collapsed ? item.label : null} placement="right">
                  <NavLink to={item.to} end={item.end} aria-label={item.label} onClick={closeOverlay}
                    aria-current={onTeacherExam ? 'location' : undefined}
                    className={({ isActive }) => `sider-nav-item${isActive || onTeacherExam ? ' is-active' : ''}`}>
                    <span className="sider-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span className="sider-nav-label">{item.label}</span>
                  </NavLink>
                </UiTooltip>
              );
            })}
          </nav>
          {!admin ? <>
            <div className="sider-section-label">教学资源</div>
            <nav className="sider-nav" aria-label="教学资源">
              <UiTooltip title={!mobile && collapsed ? '下载题目模板' : null} placement="right">
                <a className="sider-nav-item" href="/api/template.docx" aria-label="下载题目模板" download>
                  <span className="sider-nav-icon" aria-hidden="true"><DownloadOutlined /></span>
                  <span className="sider-nav-label">下载题目模板</span>
                </a>
              </UiTooltip>
            </nav>
          </> : null}
          <div className="flex-1" />
          <div className="sider-footer"><div className="px-1 text-[10.5px] tracking-wide text-ui-tertiary">{admin ? 'v0.4 · 管理员工作台' : 'v0.3 · 局域网版'}</div></div>
        </div>
      </aside>
      <Layout className="app-main" inert={overlayOpen}>
        <Layout.Header className="app-topbar">
          <IconButton ref={toggleRef} className="menu-toggle" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            label={collapsed ? '展开导航' : '收起导航'} aria-expanded={!collapsed} aria-controls="workspace-sidebar" onClick={() => setCollapsed((value) => !value)} />
          <div className="topbar-crumb">
            <span className="hidden sm:inline">{workplace}</span>
            <RightOutlined className="topbar-sep hidden text-[9px] sm:inline" />
            <strong>{section}</strong>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ThemeControl />
            <UserMenu name={admin ? 'Admin' : user?.name} subtitle={admin ? '管理员' : '教师'} onLogout={signOut} />
          </div>
        </Layout.Header>
        <Layout.Content><Outlet /></Layout.Content>
      </Layout>
    </div>
  );
}

function AdminShell() { return <WorkspaceShell admin />; }
function TeacherShell() { return <WorkspaceShell />; }

function StudentShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  useFavicon('green');

  async function signOut() {
    await logout();
    navigate('/student/login', { replace: true });
  }

  return (
    <Layout className="min-h-dvh">
      <Layout.Header className="app-topbar sticky top-0 z-30">
        <NavLink to="/student" className="flex items-center gap-2.5">
          <BrandMark size={32} tone="green" />
          <span className="text-[15.5px] font-semibold text-ui-accent">{BRAND.name}</span>
          <span className="hidden text-[11.5px] text-ui-tertiary sm:inline">学生工作台</span>
        </NavLink>
        <div className="ml-3 hidden h-5 w-px bg-ui-line sm:block" />
        <NavLink to="/student" className={({ isActive }) => `hidden rounded-lg px-3 py-1.5 text-[12.5px] sm:block ${isActive ? 'bg-ui-accent-selected font-medium text-ui-accent' : 'text-ui-secondary hover:bg-ui-hover'}`}>
          我的考试
        </NavLink>
        <div className="ml-auto flex min-w-0 items-center gap-2.5">
          {user?.className ? <span className="hidden max-w-36 sm:inline-flex"><Pill tone="gray"><span className="truncate" title={user.className}>{user.className}</span></Pill></span> : null}
          <span className="hidden max-w-36 truncate text-right text-[11.5px] leading-tight text-ui-tertiary md:block" title={user?.studentNo ?? undefined}>
            学号 {user?.studentNo ?? '—'}
          </span>
          <ThemeControl />
          <UserMenu name={user?.name} subtitle={user?.className ?? '学生'} onLogout={signOut} />
        </div>
      </Layout.Header>
      <Layout.Content className="min-w-0"><Outlet /></Layout.Content>
    </Layout>
  );
}

export function App() {
  const { pathname } = useLocation();
  const login = pathname === '/login' || pathname.endsWith('/login');
  return (
    <>
      {login ? <ThemeControl className="theme-control-entry" /> : null}
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<LoginChooser />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/teacher/login" element={<TeacherLogin />} />
      <Route path="/student/login" element={<StudentLogin />} />

      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <AdminShell />
          </RequireRole>
        }
      >
        <Route index element={<AdminTeachers />} />
      </Route>

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
    </>
  );
}

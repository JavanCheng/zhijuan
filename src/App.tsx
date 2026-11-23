import { NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth, Landing, RequireRole } from './auth';
import { Icon } from './ui';
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
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">智</div>
          <div>
            <div className="brand-name">智卷</div>
            <div className="brand-sub">Teacher</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/teacher" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon name="chart" size={17} />
            考试管理
            <span className="nav-dot" />
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">{user?.name.slice(0, 1)}</div>
            <div>
              <div className="name">{user?.name}</div>
              <div className="role">教师</div>
            </div>
            <button
              className="logout-btn"
              title="退出登录"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

function StudentShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="student-shell">
      <header className="student-top">
        <div className="brand-mark">智</div>
        <div>
          <div className="brand-name">智卷</div>
        </div>
        <div className="who">
          <div>
            <div className="name">{user?.name}</div>
            <div className="no">学号 {user?.studentNo ?? '—'}</div>
          </div>
          <button
            className="icon-btn"
            title="退出登录"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </header>
      <Outlet />
    </div>
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

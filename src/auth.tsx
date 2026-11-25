import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import type { Role } from '../shared/types';
import { api, post } from './api';

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  phone?: string | null;
  studentNo?: string | null;
  classId?: number | null;
  className?: string | null;
  isActive?: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  loginAdmin: (username: string, password: string) => Promise<User>;
  loginTeacher: (account: string, password: string) => Promise<User>;
  loginStudent: (name: string, studentNo: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const loginAdmin = useCallback(async (username: string, password: string) => {
    const data = await post<{ user: User }>('/api/auth/admin/login', { username, password });
    setUser(data.user);
    return data.user;
  }, []);

  const loginTeacher = useCallback(async (account: string, password: string) => {
    const data = await post<{ user: User }>('/api/auth/teacher/login', { username: account, password });
    setUser(data.user);
    return data.user;
  }, []);

  const loginStudent = useCallback(async (name: string, studentNo: string) => {
    const data = await post<{ user: User }>('/api/auth/student/login', { name, studentNo });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await post('/api/auth/logout');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginAdmin, loginTeacher, loginStudent, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}

export function homeOf(role: Role): string {
  if (role === 'admin') return '/admin';
  return role === 'teacher' ? '/teacher' : '/student';
}

export function loginPathOf(role: Role): string {
  if (role === 'admin') return '/admin/login';
  return role === 'teacher' ? '/teacher/login' : '/student/login';
}

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spin size="large" />
    </div>
  );
}

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to={loginPathOf(role)} replace />;
  if (user.role !== role) return <Navigate to={homeOf(user.role)} replace />;
  return <>{children}</>;
}

export function Landing() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homeOf(user.role)} replace />;
}

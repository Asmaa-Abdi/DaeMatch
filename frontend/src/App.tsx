import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { LoadingScreen } from './components/LoadingScreen';
import { useAuth } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmployerDashboardPage } from './pages/EmployerDashboardPage';
import { JobsPage } from './pages/JobsPage';
import { LandingPage } from './pages/LandingPage';
import { MatchesPage } from './pages/MatchesPage';
import { MessagesPage } from './pages/MessagesPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordRecoveryPage';
import { ProfilePage } from './pages/ProfilePage';
import { RegistrationChoicePage } from './pages/RegistrationChoicePage';

function Protected({ children, role }: { children: ReactNode; role?: 'developer' | 'employer' }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'employer' ? '/employer' : '/dashboard'} replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<RegistrationChoicePage />} />
      <Route path="/register/developer" element={<AuthPage mode="register" role="developer" />} />
      <Route path="/register/employer" element={<AuthPage mode="register" role="employer" />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />
      <Route path="/dashboard" element={<Protected role="developer"><DashboardPage /></Protected>} />
      <Route path="/jobs" element={<Protected><JobsPage /></Protected>} />
      <Route path="/matches" element={<Protected role="developer"><MatchesPage /></Protected>} />
      <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
      <Route path="/messages" element={<Protected><MessagesPage /></Protected>} />
      <Route path="/employer" element={<Protected role="employer"><EmployerDashboardPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

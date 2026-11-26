import { BriefcaseBusiness, LayoutDashboard, LogOut, MessageCircle, Sparkles, UserRound, UsersRound } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

import { Brand } from './Brand';
import { NotificationCenter } from './NotificationCenter';
import { useAuth } from '../context/AuthContext';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const items = user.role === 'developer'
    ? [
        { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
        { to: '/jobs', label: 'Find jobs', icon: BriefcaseBusiness },
        { to: '/matches', label: 'AI matches', icon: Sparkles },
        { to: '/messages', label: 'Messages', icon: MessageCircle },
        { to: '/profile', label: 'My profile', icon: UserRound },
      ]
    : [
        { to: '/employer', label: 'Overview', icon: LayoutDashboard },
        { to: '/jobs', label: 'Jobs & applicants', icon: BriefcaseBusiness },
        { to: '/messages', label: 'Messages', icon: MessageCircle },
        { to: '/profile', label: 'Company profile', icon: UserRound },
      ];
  const accountLabel = user.role === 'employer' ? user.company_name || user.username : user.username;
  const initial = accountLabel.slice(0, 1).toUpperCase();

  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="workspace">
      <NotificationCenter role={user.role} />
      <aside className="side-rail">
        <Brand compact to={user.role === 'employer' ? '/employer' : '/dashboard'} />
        <div className="rail-caption">WORKSPACE</div>
        <nav className="rail-nav" aria-label="Main navigation">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/dashboard' || to === '/employer'} className={({ isActive }) => `rail-link${isActive ? ' is-active' : ''}`}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {label === 'AI matches' && <span className="nav-new">AI</span>}
            </NavLink>
          ))}
        </nav>
        <div className="rail-bottom">
          <div className="rail-help"><span className="help-dot" /> Your next connection is one good match away.</div>
          <button className="rail-user" onClick={signOut} type="button" aria-label={`Sign out ${accountLabel}`}>
            <span className="avatar avatar--small">{initial}</span>
            <span className="rail-user-copy"><strong>{accountLabel}</strong><small>{user.role === 'developer' ? 'Developer' : 'Employer'}</small></span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="mobile-topbar">
          <Brand compact to={user.role === 'employer' ? '/employer' : '/dashboard'} />
          <button className="icon-button" type="button" onClick={signOut} aria-label="Sign out"><LogOut size={18} /></button>
        </header>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/dashboard' || to === '/employer'} className={({ isActive }) => `mobile-nav-link${isActive ? ' is-active' : ''}`}>
              <Icon size={18} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <main className="workspace-content">{children}</main>
        <footer className="workspace-footer"><span>DAEMatch by Amana Software</span><span><UsersRound size={14} /> Skills move opportunity</span></footer>
      </div>
    </div>
  );
}

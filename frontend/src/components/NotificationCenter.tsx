import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { ArrowRight, Bell, BriefcaseBusiness, CheckCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { api, ApiError } from '../api/client';
import type { AppNotification, NotificationFeed, Role } from '../types';

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Just now'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function NotificationCenter({ role }: { role: Role }) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setFeed(await api.notifications());
      setError('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 30_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        lastTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const togglePanel = (event: MouseEvent<HTMLButtonElement>) => {
    if (!open) {
      lastTriggerRef.current = event.currentTarget;
      void refresh();
    }
    setOpen((current) => !current);
  };

  const closePanel = () => {
    setOpen(false);
    lastTriggerRef.current?.focus();
  };

  const markRead = async (notification: AppNotification) => {
    if (notification.is_read) return;
    try {
      await api.markNotificationRead(notification.id);
      setFeed((current) => current ? {
        ...current,
        unread_count: Math.max(0, current.unread_count - 1),
        notifications: current.notifications.map((item) => item.id === notification.id ? { ...item, is_read: true } : item),
      } : current);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update this notification.');
    }
  };

  const openNotification = async (notification: AppNotification) => {
    await markRead(notification);
    setOpen(false);
    if (notification.event_type === 'job_match_high' && role === 'developer') navigate(`/matches?job=${notification.job_id}`);
    else if (notification.event_type === 'application_received' && role === 'employer') navigate(`/employer?view=applications&refresh=${Date.now()}`);
    else if (notification.event_type === 'application_accepted' && role === 'developer' && notification.application_id !== null) navigate(`/messages?application=${notification.application_id}`);
    else if (notification.event_type === 'application_rejected' && role === 'developer') navigate('/jobs');
    else navigate(role === 'employer' ? '/employer' : '/dashboard');
  };

  const markAllRead = async () => {
    if (!feed?.unread_count) return;
    try {
      await api.markAllNotificationsRead();
      setFeed((current) => current ? {
        ...current,
        unread_count: 0,
        notifications: current.notifications.map((item) => ({ ...item, is_read: true })),
      } : current);
      setError('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not mark notifications as read.');
    }
  };

  const unreadCount = feed?.unread_count ?? 0;
  const triggerLabel = unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <div className="notification-center" ref={rootRef}>
      <button className="notification-trigger notification-trigger--rail" type="button" onClick={togglePanel} aria-label={triggerLabel} aria-expanded={open} aria-controls="notification-panel">
        <Bell size={17} /><span>Notifications</span>{unreadCount > 0 && <span className="notification-badge" aria-live="polite">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      <button className="notification-trigger notification-trigger--mobile" type="button" onClick={togglePanel} aria-label={triggerLabel} aria-expanded={open} aria-controls="notification-panel">
        <Bell size={18} />{unreadCount > 0 && <span className="notification-badge notification-badge--mobile" aria-live="polite">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && <section className="notification-panel" id="notification-panel" role="region" aria-labelledby="notification-heading">
        <header className="notification-panel-header">
          <div><h2 id="notification-heading">Notifications</h2><p>{unreadCount ? `${unreadCount} unread` : 'You are all caught up'}</p></div>
          <div className="notification-panel-actions"><button className="notification-mark-all" type="button" onClick={() => void markAllRead()} disabled={!unreadCount}><CheckCheck size={14} /> Mark all read</button><button className="notification-panel-close" type="button" onClick={closePanel} aria-label="Close notifications"><X size={16} /></button></div>
        </header>
        {error && <p className="notification-error" role="alert">{error}</p>}
        {loading ? <div className="notification-empty">Loading notifications…</div> : feed?.notifications.length ? <div className="notification-list">
          {feed.notifications.map((notification) => <button className={`notification-item${notification.is_read ? '' : ' is-unread'}`} type="button" key={notification.id} onClick={() => void openNotification(notification)}>
            <span className="notification-item-icon"><BriefcaseBusiness size={15} /></span>
            <span className="notification-item-copy">
              <span className="notification-item-label">{notification.event_type === 'job_match_high' ? 'Strong AI match' : notification.event_type === 'application_received' ? 'New application' : notification.event_type === 'application_accepted' ? 'Application accepted' : 'Application rejected'}</span>
              <strong>{notification.message}</strong>
              <span className="notification-item-job">{notification.job_title} · {formatNotificationTime(notification.created_at)}</span>
              <span className="notification-item-link">{notification.event_type === 'job_match_high' ? 'Review AI match' : notification.event_type === 'application_received' ? 'View applications' : notification.event_type === 'application_accepted' ? 'Open conversation' : 'Browse jobs'} <ArrowRight size={12} /></span>
            </span>
            {!notification.is_read && <span className="notification-unread-dot" aria-label="Unread" />}
          </button>)}
        </div> : <div className="notification-empty">No notifications yet. Strong AI matches, applications and decisions will appear here.</div>}
      </section>}
    </div>
  );
}

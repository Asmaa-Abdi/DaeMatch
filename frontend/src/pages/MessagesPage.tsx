import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, MessageCircle, Send } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { api, ApiError } from '../api/client';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import type { Application, ApplicationMessage } from '../types';

function formatMessageTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function MessagesPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ApplicationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [applicationsError, setApplicationsError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingApplications(true);
    setApplicationsError('');
    api.applications()
      .then((allApplications) => {
        if (cancelled) return;
        const accepted = allApplications.filter((application) => application.status === 'accepted');
        setApplications(accepted);
        const requestedId = Number(new URLSearchParams(location.search).get('application'));
        const requested = accepted.find((application) => application.id === requestedId);
        setSelectedApplicationId(requested?.id ?? accepted[0]?.id ?? null);
      })
      .catch((caught) => {
        if (cancelled) return;
        setApplicationsError(caught instanceof ApiError ? caught.message : 'Could not load accepted applications.');
      })
      .finally(() => { if (!cancelled) setLoadingApplications(false); });
    return () => { cancelled = true; };
  }, [location.search]);

  const selectedApplication = applications.find((application) => application.id === selectedApplicationId) ?? null;

  useEffect(() => {
    setMessages([]);
    setDraft('');
    setError('');
    if (!selectedApplicationId) {
      setLoadingMessages(false);
      return;
    }

    let cancelled = false;
    const loadMessages = async (showLoading: boolean) => {
      if (showLoading) setLoadingMessages(true);
      try {
        const result = await api.applicationMessages(selectedApplicationId);
        if (!cancelled) setMessages(result);
        if (!cancelled) setError('');
      } catch (caught) {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : 'Could not load this conversation.');
      } finally {
        if (!cancelled && showLoading) setLoadingMessages(false);
      }
    };

    void loadMessages(true);
    const interval = window.setInterval(() => { void loadMessages(false); }, 5000);
    const onFocus = () => { void loadMessages(false); };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [selectedApplicationId]);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    messagesEndRef.current.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'end' });
  }, [messages.length, selectedApplicationId]);

  const selectApplication = (application: Application) => {
    setSelectedApplicationId(application.id);
    navigate(`/messages?application=${application.id}`, { replace: true });
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedApplicationId || !draft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const message = await api.sendApplicationMessage(selectedApplicationId, draft.trim());
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      setDraft('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not send this message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const counterpartName = selectedApplication
    ? user?.role === 'employer' ? selectedApplication.applicant.username : selectedApplication.job.employer_name
    : '';

  return (
    <AppShell>
      <div className="page-heading messages-page-heading">
        <div><span className="page-eyebrow">DAEMatch workspace</span><h1>Messages</h1><p>Talk directly about a role after an employer accepts your application.</p></div>
      </div>

      {applicationsError && <div className="form-error results-error" role="alert">{applicationsError}</div>}
      {loadingApplications ? <div className="inline-loading">Loading accepted applications…</div> : applicationsError ? null : applications.length === 0 ? (
        <section className="messages-empty-state">
          <span className="messages-empty-icon"><MessageCircle size={22} /></span>
          <h2>No accepted conversations yet</h2>
          <p>Messaging opens after an employer accepts a job application. You can return here to continue the conversation.</p>
          <Link className="button button--secondary button--small" to={user?.role === 'employer' ? '/employer' : '/jobs'}>
            {user?.role === 'employer' ? 'Review incoming applications' : 'Browse jobs'} <ArrowRight size={14} />
          </Link>
        </section>
      ) : (
        <section className="messages-layout" aria-label="Accepted application conversations">
          <aside className="messages-sidebar">
            <div className="messages-sidebar-heading"><h2>Accepted applications</h2><span>{applications.length}</span></div>
            <div className="messages-application-list">
              {applications.map((application) => {
                const name = user?.role === 'employer' ? application.applicant.username : application.job.employer_name;
                return <button
                  type="button"
                  key={application.id}
                  className={`messages-application${selectedApplicationId === application.id ? ' is-active' : ''}`}
                  aria-pressed={selectedApplicationId === application.id}
                  onClick={() => selectApplication(application)}
                >
                  <span className="avatar avatar--small">{name.slice(0, 1).toUpperCase()}</span>
                  <span className="messages-application-copy"><strong>{name}</strong><small>{application.job.title}</small></span>
                  <ArrowRight size={15} />
                </button>;
              })}
            </div>
          </aside>

          {selectedApplication ? <section className="messages-thread" aria-label={`Conversation with ${counterpartName}`}>
            <header className="messages-thread-header">
              <span className="avatar avatar--small">{counterpartName.slice(0, 1).toUpperCase()}</span>
              <div><h2>{counterpartName}</h2><p>{selectedApplication.job.title} <span className="messages-accepted-label">Accepted</span></p></div>
            </header>
            <div className="messages-feed" role="log" aria-live="polite" aria-label="Conversation messages">
              {loadingMessages ? <div className="messages-feed-placeholder">Loading messages…</div> : messages.length === 0 ? <div className="messages-feed-placeholder"><MessageCircle size={18} /><span>No messages yet. Send a short introduction to start the conversation.</span></div> : messages.map((message) => {
                const mine = message.sender_id === user?.id;
                return <article key={message.id} className={`message-bubble${mine ? ' message-bubble--mine' : ''}`}>
                  <div className="message-bubble-meta"><strong>{mine ? 'You' : message.sender_name}</strong><time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time></div>
                  <p>{message.body}</p>
                </article>;
              })}
              <div ref={messagesEndRef} />
            </div>
            {error && <div className="messages-error" role="alert">{error}</div>}
            <form className="messages-composer" onSubmit={(event) => void sendMessage(event)}>
              <label className="sr-only" htmlFor="message-draft">Write a message</label>
              <textarea id="message-draft" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000} rows={2} placeholder="Write a message…" disabled={sending} />
              <button className="button button--primary" type="submit" disabled={!draft.trim() || sending} aria-label="Send message">{sending ? 'Sending…' : 'Send'} <Send size={15} /></button>
            </form>
          </section> : <div className="messages-empty-thread">Choose an accepted application to open its conversation.</div>}
        </section>
      )}
    </AppShell>
  );
}

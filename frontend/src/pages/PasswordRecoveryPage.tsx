import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, KeyRound, LockKeyhole, Mail } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, api } from '../api/client';
import { Brand } from '../components/Brand';

function RecoveryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <div className="auth-story-top"><Brand inverse to="/" /></div>
        <div className="auth-story-copy">
          <span className="auth-kicker"><span className="kicker-dot" /> Amana Software · DAEMatch</span>
          <h1>Back to building.</h1>
          <p>Securely restore access to your DAEMatch account and keep your next opportunity within reach.</p>
          <div className="auth-points">
            <div><span><Check size={13} /></span> Private reset links</div>
            <div><span><Check size={13} /></span> One-time verification</div>
            <div><span><Check size={13} /></span> Skills-first matching</div>
          </div>
        </div>
        <div className="auth-story-foot"><span>Account security</span><span>DAEMatch</span></div>
      </aside>
      <main className="auth-main">
        <Link to="/login" className="auth-back"><ArrowLeft size={15} /> Back to log in</Link>
        <div className="auth-card">{children}<div className="auth-secure"><LockKeyhole size={13} /> Your account and profile stay protected.</div></div>
        <div className="auth-footer"><span>© {new Date().getFullYear()} Amana Software</span><span>Where Developers Meet Employers</span></div>
      </main>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api.requestPasswordReset(email.trim());
      setNotice(result.detail);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to connect right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RecoveryLayout>
      <div className="auth-card-heading">
        <span className="auth-card-icon"><Mail size={19} /></span>
        <span className="page-eyebrow">Account recovery</span>
        <h2>Forgot your password?</h2>
        <p>Enter the email address linked to your account and we’ll send a reset link if it exists.</p>
      </div>
      {notice && <div className="form-success" role="status">{notice}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <form className="auth-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="reset-email">Email address</label>
          <input id="reset-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" maxLength={254} required />
        </div>
        <button className="button button--primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : 'Send reset link'} {!busy && <ArrowRight size={16} />}
        </button>
      </form>
      <p className="auth-switch">Remembered your password? <Link to="/login">Log in</Link></p>
    </RecoveryLayout>
  );
}

export function ResetPasswordPage() {
  const { uid, token } = useParams<{ uid: string; token: string }>();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!uid || !token) {
      setError('This reset link is invalid. Request a new one to continue.');
      return;
    }
    setBusy(true);
    try {
      await api.confirmPasswordReset({ uid, token, new_password: password, confirm_password: confirmation });
      setDone(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to connect right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RecoveryLayout>
      <div className="auth-card-heading">
        <span className="auth-card-icon"><KeyRound size={19} /></span>
        <span className="page-eyebrow">Secure account recovery</span>
        <h2>{done ? 'Password updated.' : 'Choose a new password.'}</h2>
        <p>{done ? 'Your password has been changed. You can now log in securely.' : 'Choose a new password for your DAEMatch account.'}</p>
      </div>
      {done ? (
        <Link className="button button--primary auth-submit" to="/login?passwordReset=1">Continue to log in <ArrowRight size={16} /></Link>
      ) : (
        <>
          {error && <div className="form-error" role="alert">{error}</div>}
          <form className="auth-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} maxLength={128} required />
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Enter it again" minLength={8} maxLength={128} required />
            </div>
            <button className="button button--primary auth-submit" type="submit" disabled={busy || !uid || !token}>
              {busy ? 'Please wait…' : 'Reset password'} {!busy && <ArrowRight size={16} />}
            </button>
          </form>
          <p className="auth-switch">Reset link expired? <Link to="/forgot-password">Request a new one</Link></p>
        </>
      )}
    </RecoveryLayout>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Check, Code2, LockKeyhole, MapPin } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { Brand } from '../components/Brand';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';

export function AuthPage({ mode, role = 'developer' }: { mode: 'login' | 'register'; role?: Role }) {
  const isRegister = mode === 'register';
  const isDeveloper = role === 'developer';
  const roleLabel = isDeveloper ? 'Developer' : 'Employer';
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [developerUsername, setDeveloperUsername] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [password, setPassword] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(params.get('registered') === '1'
    ? 'Your account is ready. Log in to continue.'
    : params.get('passwordReset') === '1' ? 'Your password has been reset. Log in with your new password.' : '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate(user.role === 'employer' ? '/employer' : '/dashboard', { replace: true });
  }, [user, navigate]);

  if (user) return <LoadingScreen />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (isRegister) {
        if (isDeveloper) {
          await register({ role: 'developer', username: developerUsername.trim(), email: email.trim(), password, location: location.trim() });
        } else {
          await register({ role: 'employer', email: email.trim(), company_website: companyWebsite.trim(), company_name: companyName.trim(), location: location.trim(), password });
        }
        navigate('/login?registered=1', { replace: true });
      } else {
        const account = await login(identifier.trim(), password);
        navigate(account.role === 'employer' ? '/employer' : '/dashboard', { replace: true });
      }
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Unable to connect right now. Please try again.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const storyHeading = !isRegister
    ? 'Your next step starts here.'
    : isDeveloper ? 'Make your skills easier to find.' : 'Meet the talent that moves your team forward.';
  const CardIcon = !isRegister ? LockKeyhole : isDeveloper ? Code2 : BriefcaseBusiness;

  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <div className="auth-story-top"><Brand inverse to="/" /></div>
        <div className="auth-story-copy">
          <span className="auth-kicker"><span className="kicker-dot" /> Amana Software · DAEMatch</span>
          <h1>{storyHeading}</h1>
          <p>Where developers meet employers. A better way to connect skills with opportunity across Africa.</p>
          <div className="auth-points">
            <div><span><Check size={13} /></span> Skills-first matching</div>
            <div><span><Check size={13} /></span> Built for African tech talent</div>
            <div><span><Check size={13} /></span> Clear job details before you apply</div>
          </div>
        </div>
        <div className="auth-story-foot"><span>Phase 1 · Somali developers</span><span>01 / 03</span></div>
      </aside>

      <main className="auth-main">
        <Link to="/" className="auth-back"><ArrowLeft size={15} /> Back to DAEMatch</Link>
        <div className="auth-card">
          <div className="auth-card-heading">
            <span className="auth-card-icon"><CardIcon size={19} /></span>
            <span className="page-eyebrow">{isRegister ? `${roleLabel} registration` : 'Member access'}</span>
            <h2>{isRegister ? `Create your ${roleLabel.toLowerCase()} account` : 'Good to see you again.'}</h2>
            <p>{isRegister ? isDeveloper ? 'Add your developer details to discover roles that fit.' : 'Tell developers about your company and where you are hiring.' : 'Log in to see your jobs, matches and workspace.'}</p>
          </div>

          {notice && <div className="form-success" role="status">{notice}</div>}
          {error && <div className="form-error" role="alert">{error}</div>}

          <form className="auth-form" onSubmit={submit}>
            {isRegister && isDeveloper && <div className="field"><label htmlFor="developer-username">Username</label><input id="developer-username" autoComplete="username" value={developerUsername} onChange={(event) => setDeveloperUsername(event.target.value)} placeholder="Choose a username" maxLength={150} required /></div>}
            {isRegister ? (
              <div className="field"><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div>
            ) : (
              <div className="field"><label htmlFor="identifier">Username or email</label><input id="identifier" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Username or email" maxLength={254} required /></div>
            )}
            {isRegister && !isDeveloper && <>
              <div className="field"><label htmlFor="company-website">Company website</label><input id="company-website" type="url" autoComplete="url" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} placeholder="https://company.com" maxLength={250} required /></div>
              <div className="field"><label htmlFor="company-name">Company name</label><input id="company-name" autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Your company" maxLength={160} required /></div>
            </>}
            {isRegister && <div className="field"><label htmlFor="location">Location</label><div className="input-with-icon"><MapPin size={15} /><input id="location" autoComplete="address-level2" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City or country" maxLength={120} required /></div></div>}
            <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? 'At least 8 characters' : 'Your password'} minLength={isRegister ? 8 : undefined} required /></div>
            {!isRegister && <div className="auth-form-meta"><Link to="/forgot-password">Forgot password?</Link></div>}
            <button className="button button--primary auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'} {!busy && <ArrowRight size={16} />}</button>
          </form>

          {isRegister && <p className="auth-switch">Registering as {roleLabel}. <Link to="/register">Change account type</Link></p>}
          <p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to DAEMatch?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Log in' : 'Create an account'}</Link></p>
          <div className="auth-secure"><LockKeyhole size={13} /> Your account and profile stay protected.</div>
        </div>
        <div className="auth-footer"><span>© {new Date().getFullYear()} Amana Software</span><span>Where Developers Meet Employers</span></div>
      </main>
    </div>
  );
}

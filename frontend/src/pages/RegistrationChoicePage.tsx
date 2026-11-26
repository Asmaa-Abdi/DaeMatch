import { useEffect } from 'react';
import { ArrowRight, BriefcaseBusiness, Code2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { Brand } from '../components/Brand';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../context/AuthContext';

export function RegistrationChoicePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate(user.role === 'employer' ? '/employer' : '/dashboard', { replace: true });
  }, [user, navigate]);

  if (loading || user) return <LoadingScreen />;

  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <div className="auth-story-top"><Brand inverse to="/" /></div>
        <div className="auth-story-copy">
          <span className="auth-kicker"><span className="kicker-dot" /> Amana Software · DAEMatch</span>
          <h1>Two clear paths. One better connection.</h1>
          <p>Choose the account that fits the way you want to use DAEMatch.</p>
        </div>
        <div className="auth-story-foot"><span>Phase 1 · Somali developers</span><span>01 / 03</span></div>
      </aside>
      <main className="auth-main">
        <Link to="/" className="auth-back">Back to DAEMatch</Link>
        <div className="auth-card">
          <div className="auth-card-heading">
            <span className="page-eyebrow">Create your account</span>
            <h2>How will you use DAEMatch?</h2>
            <p>Choose a registration path. Each account asks only for the details that apply.</p>
          </div>
          <div className="registration-choice-list">
            <Link className="role-option role-option--link" to="/register/developer">
              <Code2 size={19} /><span><strong>I’m a developer</strong><small>Build a profile and find roles that fit your skills.</small></span><ArrowRight className="choice-arrow" size={16} />
            </Link>
            <Link className="role-option role-option--link" to="/register/employer">
              <BriefcaseBusiness size={19} /><span><strong>I’m hiring for a company</strong><small>Share your company details and discover skilled developers.</small></span><ArrowRight className="choice-arrow" size={16} />
            </Link>
          </div>
          <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
          <div className="auth-secure">Your account and profile stay protected.</div>
        </div>
        <div className="auth-footer"><span>© {new Date().getFullYear()} Amana Software</span><span>Where Developers Meet Employers</span></div>
      </main>
    </div>
  );
}

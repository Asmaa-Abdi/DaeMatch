import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, BadgeCheck, BriefcaseBusiness, Check, Globe2, MousePointerClick, ShieldCheck, Sparkles, Target, UsersRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { Brand } from '../components/Brand';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { PublicStats } from '../types';

export function LandingPage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [pathsVisible, setPathsVisible] = useState(false);
  const pathsRef = useRef<HTMLElement | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.stats().then(setStats).catch(() => setStats(null));
  }, []);

  useEffect(() => {
    const section = pathsRef.current;
    if (!section) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      setPathsVisible(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setPathsVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(section);

    return () => observer.disconnect();
  }, []);

  const homeForUser = user?.role === 'employer' ? '/employer' : '/dashboard';
  const register = (role: 'developer' | 'employer') => user ? navigate(homeForUser) : navigate(`/register/${role}`);
  const count = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString();

  return (
    <div className="marketing-site">
      <header className="marketing-nav">
        <Brand />
        <nav className="marketing-links" aria-label="Public navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#for-who">For who</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="marketing-actions">
          {user ? <Link className="marketing-signin" to={homeForUser}>Dashboard</Link> : <Link className="marketing-signin" to="/login">Log in</Link>}
          <Link className="button button--primary" to={user ? homeForUser : '/register'}>{user ? 'Open workspace' : 'Join DAEMatch'} <ArrowUpRight size={15} /></Link>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="hero-kicker"><span className="kicker-dot" /> Built for African tech talent</div>
            <h1>Where Developers <span>Meet Employers.</span></h1>
            <p>DAEMatch brings African developers together with employers who hire for skill, not geography. Your next role starts with what you can do.</p>
            <div className="hero-ctas">
              <button type="button" className="button button--primary" onClick={() => register('developer')}>Find your next role <ArrowRight size={16} /></button>
              <button type="button" className="button button--secondary" onClick={() => register('employer')}>Hire with clarity <ArrowUpRight size={15} /></button>
            </div>
            <div className="hero-note"><span className="hero-note-check"><Check size={12} /></span><span><strong>Skills first.</strong> Opportunity everywhere.</span></div>
          </div>

          <div className="hero-art" aria-label="Illustration of a developer profile matched to a job">
            <div className="match-visual">
              <div className="visual-orbit" />
              <div className="visual-floating"><span><Sparkles size={13} /></span> AI-powered fit</div>
              <div className="visual-main-card">
                <div className="visual-card-head">
                  <div className="visual-avatar">AM</div>
                  <div><strong>Full-stack developer</strong><small>Somalia · Open to work</small></div>
                  <span className="visual-match-pill">88% fit</span>
                </div>
                <div className="visual-divider" />
                <div className="visual-label"><span>Skills match</span><strong>Strong fit</strong></div>
                <div className="visual-progress"><span /></div>
                <div className="visual-skills"><span>React</span><span>Python</span><span>Django</span><span>+2 skills</span></div>
              </div>
              <div className="visual-job-card">
                <div className="visual-job-label"><span className="visual-company">N</span> New opportunity</div>
                <h4>Product Engineer</h4>
                <p>Remote · Skills-led team</p>
              </div>
            </div>
          </div>
        </section>

        <section className="stats-strip" aria-label="DAEMatch platform statistics">
          <div className="stats-intro">A network built on ability</div>
          <div className="stat-item"><strong>{count(stats?.users)}</strong><span>users</span></div>
          <div className="stat-item"><strong>{count(stats?.jobs)}</strong><span>open roles</span></div>
          <div className="stat-item stat-item--small"><strong>{stats?.match_rate == null ? '—' : `${stats.match_rate}%`}</strong><span>roles matching 50%+</span></div>
        </section>

        <section className="section" id="features">
          <div className="feature-layout">
            <div className="feature-aside">
              <span className="eyebrow"><Sparkles size={13} /> A better kind of connection</span>
              <h2>Make the right match before the first message.</h2>
              <p>Less noise. More signal. DAEMatch puts real skills at the centre of the hiring conversation, connecting capable developers with teams ready to build.</p>
              <div className="feature-note"><ShieldCheck size={17} /><span>Profiles stay yours. Your skills do the talking.</span></div>
            </div>
            <div className="feature-list">
              <article className="feature-card"><span className="feature-icon"><Target size={18} /></span><h3>AI matching</h3><p>See roles ranked by how closely your skills line up.</p></article>
              <article className="feature-card"><span className="feature-icon"><BadgeCheck size={18} /></span><h3>Skills-based</h3><p>Clear signals replace keyword guesswork and generic filters.</p></article>
              <article className="feature-card"><span className="feature-icon"><Globe2 size={18} /></span><h3>Africa focused</h3><p>Built around the talent and opportunity growing across Africa.</p></article>
              <article className="feature-card"><span className="feature-icon"><MousePointerClick size={18} /></span><h3>Fast apply</h3><p>When it fits, apply in one click and move the conversation forward.</p></article>
            </div>
          </div>
        </section>

        <section className="steps-section" id="how-it-works">
          <div className="steps-wrap">
            <div className="section-head"><span className="eyebrow">A clear path to the next step</span><h2>Four steps. Better connections.</h2><p>Whether you’re looking for a role or the person who can build it, start with what matters.</p></div>
            <div className="steps-grid">
              <article className="step-card"><span className="step-number">01</span><h3>Build your profile</h3><p>Share your skills, experience and what you’re ready to do next.</p></article>
              <article className="step-card"><span className="step-number">02</span><h3>See the fit</h3><p>Compare developer skills with the requirements that teams post.</p></article>
              <article className="step-card"><span className="step-number">03</span><h3>Make a move</h3><p>Review a role before applying, or explore applicants ranked against your needs.</p></article>
              <article className="step-card"><span className="step-number">04</span><h3>Build together</h3><p>Turn a promising skills match into the start of good work.</p></article>
            </div>
          </div>
        </section>

        <section ref={pathsRef} className={`section paths-section${pathsVisible ? ' paths-section--visible' : ''}`} id="for-who">
          <div className="section-head"><span className="eyebrow">One platform, two clear paths</span><h2>Made for the people who make tech happen.</h2><p>Start with the side that fits you. DAEMatch keeps the next step simple.</p></div>
          <div className="audience-grid">
            <article className="audience-card"><span className="audience-icon"><UsersRound size={19} /></span><h3>For developers</h3><p>Show what you can do, find roles that fit your stack and spend less time searching through work that doesn’t.</p><button className="audience-link audience-link--button" type="button" onClick={() => register('developer')}>Build your profile <ArrowRight size={15} /></button></article>
            <article className="audience-card audience-card--employer"><span className="audience-icon"><BriefcaseBusiness size={19} /></span><h3>For employers</h3><p>Post roles, see skill-aligned applicants and reach talent from Somalia and across Africa.</p><button className="audience-link audience-link--button" type="button" onClick={() => register('employer')}>Find your next hire <ArrowRight size={15} /></button></article>
          </div>
        </section>

        <section className="pricing-section" id="pricing">
          <div className="section">
            <div className="section-head"><span className="eyebrow">Plans are on the way</span><h2>Pricing is coming soon.</h2><p>We’re putting the finishing touches on plans for developers and employers. Details will be shared here soon.</p></div>
            <div className="pricing-coming-soon" role="status">
              <span className="pricing-coming-soon-icon"><Sparkles size={20} /></span>
              <div><span className="price-label">DAEMatch plans</span><strong>Coming soon</strong><p>For now, explore DAEMatch and create an account to get started.</p></div>
              <Link className="button button--primary" to="/register">Join DAEMatch <ArrowUpRight size={15} /></Link>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div><h2>Let your skills lead the way.</h2><p>One profile. Better signals. A wider view of what’s possible.</p></div>
          <button className="button" type="button" onClick={() => register('developer')}>Get started <ArrowRight size={15} /></button>
        </section>
      </main>

      <footer className="marketing-footer">
        <div className="footer-brand"><Brand compact /><span className="footer-ams">An Amana Software product</span></div>
        <div className="footer-links"><a href="#features">About DAEMatch</a><a href="#pricing">Pricing</a><Link to="/login">Log in</Link></div>
        <div className="footer-market" aria-label="Target market phases">
          <span><strong>Phase 1</strong> Somali developers</span>
          <span><strong>Phase 2</strong> African developers</span>
          <span><strong>Phase 3</strong> Global tech market</span>
        </div>
        <span>© {new Date().getFullYear()} Amana Software</span>
      </footer>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, MapPin, Sparkles, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';

import { api } from '../api/client';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';
import { JobCard } from '../components/JobCard';
import { MetricCard } from '../components/MetricCard';
import { ScoreBadge, scoreTone } from '../components/ScoreBadge';
import { useAuth } from '../context/AuthContext';
import type { Job, JobMatch, PublicStats } from '../types';

export function DashboardPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [matchCount, setMatchCount] = useState(0);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.jobs().catch(() => [] as Job[]),
      api.matches().catch(() => ({ count: 0, results: [] as JobMatch[] })),
      api.stats().catch(() => null),
    ]).then(([jobList, matchData, publicStats]) => {
      if (!active) return;
      setJobs(jobList.slice(0, 3));
      setMatches(matchData.results.slice(0, 3));
      setMatchCount(matchData.count);
      setStats(publicStats);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const profileComplete = Boolean(user?.bio && user.skills.length > 0);

  return (
    <AppShell>
      <div className="page-heading">
        <div><span className="page-eyebrow">Developer workspace</span><h1>Good to have you here, {user?.username}.</h1><p>Your next opportunity starts with the skills you’ve already built.</p></div>
        <span className={`work-status${user?.is_open_to_work ? ' work-status--open' : ''}`}><span />{user?.is_open_to_work ? 'Open to work' : 'Not open to work'}</span>
      </div>

      <div className="metrics-grid metrics-grid--three">
        <MetricCard label="Open jobs" value={loading ? '—' : (stats?.jobs ?? 0)} note="Across the DAEMatch network" icon={<BriefcaseBusiness size={16} />} />
        <MetricCard label="AI matches" value={loading ? '—' : matchCount} note="Ranked against your skills" icon={<Sparkles size={16} />} />
        <MetricCard label="Skills on profile" value={user?.skills.length ?? 0} note={profileComplete ? 'Your profile is match-ready' : 'Add skills to improve your matches'} icon={<Wrench size={16} />} />
      </div>

      {!profileComplete && (
        <div className="completion-callout">
          <div className="completion-icon"><Sparkles size={17} /></div>
          <div><strong>Give matching more to work with.</strong><span>Add a short bio and your core skills so roles can be ranked against your profile.</span></div>
          <Link className="text-link" to="/profile">Complete profile <ArrowRight size={14} /></Link>
        </div>
      )}

      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-header"><div><h2>Recent opportunities</h2><p>New roles from employers on DAEMatch</p></div><Link to="/jobs" className="text-link">See all <ArrowRight size={14} /></Link></div>
          {loading ? <div className="inline-loading">Finding recent roles…</div> : jobs.length ? <div className="panel-list">{jobs.map((job) => <JobCard key={job.id} job={job} />)}</div> : <EmptyState icon={<BriefcaseBusiness size={20} />} title="No roles posted yet" description="New employer postings will appear here. Browse the jobs board to check again." action={<Link className="text-link" to="/jobs">Explore jobs <ArrowRight size={14} /></Link>} />}
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2>Your top AI matches</h2><p>Open a match to see which role skills overlap.</p></div><Link to="/matches" className="text-link">See all <ArrowRight size={14} /></Link></div>
          {loading ? <div className="inline-loading">Calculating skill matches…</div> : matches.length ? <div className="panel-list">{matches.map((match, index) => (
            <Link className="mini-score-card" to="/matches" key={match.id}>
              <div className="mini-score-head"><span className="rank-badge">#{index + 1}</span><span className="mini-score-copy"><strong>{match.title}</strong><span>{match.employer}</span></span><ScoreBadge score={match.match_score} /></div>
              <div className="score-track"><span className={scoreTone(match.match_score)} style={{ width: `${match.match_score}%` }} /></div>
              <div className="mini-score-foot"><span><MapPin size={12} /> {match.location_type}</span><span>{match.required_skill_count ? `${match.matched_skills.length} of ${match.required_skill_count} role skills match` : 'No role skills listed'}</span></div>
            </Link>
          ))}</div> : <EmptyState icon={<Sparkles size={20} />} title="Your matches start with your skills" description="Add skills to your profile to see jobs ranked by how closely they fit." action={<Link className="text-link" to="/profile">Add skills <ArrowRight size={14} /></Link>} />}
        </section>
      </div>
    </AppShell>
  );
}

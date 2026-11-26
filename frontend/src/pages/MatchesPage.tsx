import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, RefreshCw, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { api, ApiError } from '../api/client';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';
import { MatchExplanation } from '../components/MatchExplanation';
import { ScoreBadge, scoreTone } from '../components/ScoreBadge';
import { useAuth } from '../context/AuthContext';
import type { JobMatch } from '../types';

export function MatchesPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightedJobId = Number(searchParams.get('job')) || null;
  const hasSkills = Boolean(user?.skills.length);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const refreshMatches = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      const response = await api.matches();
      setMatches(response.results);
      setCount(response.count);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not calculate matches.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshMatches();
  }, [refreshMatches]);

  useEffect(() => {
    if (loading || !highlightedJobId) return;
    const card = document.getElementById(`match-card-${highlightedJobId}`);
    if (!card) return;
    card.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
    card.focus({ preventScroll: true });
  }, [highlightedJobId, loading, matches]);

  return (
    <AppShell>
      <div className="page-heading">
        <div><span className="page-eyebrow">Skills-led discovery</span><h1>Your AI matches</h1><p>Roles ranked by the skills you’ve added to your developer profile.</p></div>
        <div className="matches-heading-actions">
          <span className="match-count-chip"><Sparkles size={15} /> {loading ? '…' : `${hasSkills ? count : 0} ${(hasSkills ? count : 0) === 1 ? 'match' : 'matches'}`}</span>
          <button className="button button--secondary button--small matches-refresh" type="button" onClick={() => void refreshMatches()} disabled={refreshing} aria-busy={refreshing}>
            <RefreshCw size={14} /> {refreshing ? 'Refreshing…' : 'Refresh matches'}
          </button>
        </div>
      </div>
      <div className="match-legend" aria-label="Match score legend"><span className="legend-item"><i className="legend-dot legend-dot--green" />75%+ strong fit</span><span className="legend-item"><i className="legend-dot legend-dot--orange" />50–74% possible fit</span><span className="legend-item"><i className="legend-dot legend-dot--red" />Below 50% early fit</span></div>
      {error && <div className="form-error results-error" role="alert">{error}</div>}
      {loading ? <div className="match-list">{[1, 2, 3].map((item) => <div className="match-skeleton" key={item} />)}</div> : !hasSkills ? <EmptyState icon={<BriefcaseBusiness size={21} />} title="Add skills to reveal your matches" description="Your match list is empty until your profile has skills to compare with open roles." action={<Link className="button button--primary button--small" to="/profile">Add skills <ArrowRight size={14} /></Link>} /> : matches.length ? <div className="match-list">{matches.map((match, index) => (
        <article id={`match-card-${match.id}`} className={`match-card${match.id === highlightedJobId ? ' match-card--highlighted' : ''}`} key={match.id} tabIndex={match.id === highlightedJobId ? -1 : undefined}>
          <div className="match-card-top"><span className="rank-badge">#{index + 1}</span><span className="match-card-copy"><h3>{match.title}</h3><p>{match.employer}{match.employer_location ? ` · ${match.employer_location}` : ''}</p></span><span className="match-score-percent">{Math.round(match.match_score)}%</span></div>
          <div className="match-progress"><span className={scoreTone(match.match_score)} style={{ width: `${Math.min(100, Math.max(0, match.match_score))}%` }} /></div>
          <div className="match-card-details"><span>{match.salary_range || 'Salary not listed'} · {match.location_type}</span></div>
          <MatchExplanation match={match} />
          <div className="match-card-actions"><ScoreBadge score={match.match_score} /><Link className="text-link" to="/jobs">View job board <ArrowRight size={14} /></Link></div>
        </article>
      ))}</div> : <EmptyState icon={<BriefcaseBusiness size={21} />} title="No roles to match yet" description="Add or refine your skills and check again when more roles are posted." action={<Link className="button button--primary button--small" to="/profile">Update skills <ArrowRight size={14} /></Link>} />}
    </AppShell>
  );
}

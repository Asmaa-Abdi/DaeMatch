import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Check, Clock3, Search, UsersRound, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { api, ApiError } from '../api/client';
import { AppShell } from '../components/AppShell';
import { DeveloperReportModal } from '../components/DeveloperReportModal';
import { EmptyState } from '../components/EmptyState';
import { MetricCard } from '../components/MetricCard';
import { ScoreBadge } from '../components/ScoreBadge';
import type { Application, ApplicationStatus, Connection, EmployerDashboard } from '../types';

type ApplicantFilter = 'all' | 'review' | 'accepted' | 'connect';
type ApplicantConnectionStatus = 'none' | 'outgoing' | 'incoming' | 'accepted';

const filterLabels: Record<ApplicantFilter, string> = {
  all: 'All',
  review: 'Review',
  accepted: 'Accepted',
  connect: 'Connect',
};

function connectionActionLabel(status: ApplicantConnectionStatus, connecting: boolean): string {
  if (connecting) return 'Connecting…';
  if (status === 'accepted') return 'Connected';
  if (status === 'outgoing') return 'Request sent';
  if (status === 'incoming') return 'Accept request';
  return 'Connect';
}

export function EmployerDashboardPage() {
  const location = useLocation();
  const lastApplicationsRefresh = useRef('');
  const [data, setData] = useState<EmployerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<number | null>(null);
  const [connecting, setConnecting] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [showAllApplications, setShowAllApplications] = useState(false);
  const [allApplications, setAllApplications] = useState<Application[]>([]);
  const [applicationsLoaded, setApplicationsLoaded] = useState(false);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [applicationsError, setApplicationsError] = useState('');
  const [applicantFilter, setApplicantFilter] = useState<ApplicantFilter>('all');
  const [applicationSearch, setApplicationSearch] = useState('');
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.employerDashboard());
      setError('');
      try {
        const [profile, connectionList] = await Promise.all([api.profile(), api.connections()]);
        setCurrentUserId(profile.id);
        setConnections(connectionList);
      } catch {
        // Dashboard and applicant reports remain available if connection history cannot be loaded.
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the employer dashboard.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const updateStatus = async (application: Application, status: ApplicationStatus) => {
    setUpdating(application.id); setError('');
    try {
      await api.updateApplication(application.id, status);
      setData((current) => current ? { ...current, top_applicants: current.top_applicants.map((item) => item.id === application.id ? { ...item, status } : item) } : current);
      setAllApplications((current) => current.map((item) => item.id === application.id ? { ...item, status } : item));
      setSelectedApplication((current) => current?.id === application.id ? { ...current, status } : current);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not update this application.'); }
    finally { setUpdating(null); }
  };

  const toggleAllApplications = async () => {
    if (showAllApplications) {
      setShowAllApplications(false);
      setApplicantFilter('all');
      setApplicationSearch('');
      return;
    }
    setShowAllApplications(true);
    setApplicantFilter('all');
    setApplicationSearch('');
    if (applicationsLoaded || loadingApplications) return;
    setLoadingApplications(true); setApplicationsError(''); setError('');
    try {
      setAllApplications(await api.applications());
      setApplicationsLoaded(true);
    } catch (caught) {
      setApplicationsError(caught instanceof ApiError ? caught.message : 'Could not load all applications.');
    } finally { setLoadingApplications(false); }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const refreshToken = params.get('refresh');
    if (params.get('view') !== 'applications' || !refreshToken || lastApplicationsRefresh.current === refreshToken) return;
    lastApplicationsRefresh.current = refreshToken;
    setShowAllApplications(true);
    setApplicantFilter('all');
    setApplicationSearch('');
    setLoadingApplications(true);
    setApplicationsError('');
    void api.applications()
      .then((applications) => { setAllApplications(applications); setApplicationsLoaded(true); })
      .catch((caught) => { setApplicationsError(caught instanceof ApiError ? caught.message : 'Could not load all applications.'); })
      .finally(() => setLoadingApplications(false));
  }, [location.search]);

  const connectionForApplicant = (applicantId: number) => connections
    .filter((connection) => currentUserId !== null && (
      (connection.sender.id === currentUserId && connection.receiver.id === applicantId)
      || (connection.receiver.id === currentUserId && connection.sender.id === applicantId)
    ))
    .find((connection) => connection.status === 'accepted')
    ?? connections.find((connection) => currentUserId !== null && (
      (connection.sender.id === currentUserId && connection.receiver.id === applicantId)
      || (connection.receiver.id === currentUserId && connection.sender.id === applicantId)
    ));

  const connectionStatusFor = (applicantId: number): ApplicantConnectionStatus => {
    const connection = connectionForApplicant(applicantId);
    if (!connection) return 'none';
    if (connection.status === 'accepted') return 'accepted';
    return connection.sender.id === currentUserId ? 'outgoing' : 'incoming';
  };

  const connect = async (application: Application) => {
    const applicantId = application.applicant.id;
    const existingStatus = connectionStatusFor(applicantId);
    if (existingStatus === 'accepted' || existingStatus === 'outgoing') return;
    setConnecting(applicantId); setError('');
    try {
      const updatedConnection = await api.connect(applicantId);
      setConnections((current) => current.some((connection) => connection.id === updatedConnection.id)
        ? current.map((connection) => connection.id === updatedConnection.id ? updatedConnection : connection)
        : [...current, updatedConnection]);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not send a connection request.'); }
    finally { setConnecting(null); }
  };

  const openReport = (application: Application) => {
    setSelectedApplication(application);
    if (application.status === 'pending') void updateStatus(application, 'reviewed');
  };
  const closeReport = useCallback(() => setSelectedApplication(null), []);

  const visibleApplications = showAllApplications ? allApplications : data?.top_applicants ?? [];
  const filterMatches: Record<ApplicantFilter, (application: Application) => boolean> = {
    all: () => true,
    review: (application) => application.status === 'pending' || application.status === 'reviewed',
    accepted: (application) => application.status === 'accepted',
    connect: (application) => connectionStatusFor(application.applicant.id) !== 'none',
  };
  const filteredApplications = visibleApplications.filter(filterMatches[applicantFilter]);
  const filterCounts = Object.fromEntries(
    (Object.keys(filterLabels) as ApplicantFilter[]).map((filter) => [filter, visibleApplications.filter(filterMatches[filter]).length]),
  ) as Record<ApplicantFilter, number>;
  const searchTerm = applicationSearch.trim().toLocaleLowerCase();
  const searchFilteredApplications = filteredApplications.filter((application) => {
    if (!searchTerm) return true;
    const searchableText = [
      application.applicant.username,
      application.applicant.location,
      application.applicant.bio,
      application.job.title,
      application.job.employer_name,
      application.status,
      application.cover_letter,
      application.applicant.skills.map((skill) => skill.name).join(' '),
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return searchableText.includes(searchTerm);
  });
  const filterEmptyCopy: Record<ApplicantFilter, { title: string; description: string }> = {
    all: { title: 'No applicants yet', description: 'Applications for your job posts will appear here.' },
    review: { title: 'Nothing to review', description: 'Pending and reviewed applications will appear in this section.' },
    accepted: { title: 'No accepted applicants', description: 'Applicants you accept will be listed here.' },
    connect: { title: 'No connections yet', description: 'Developers with a connection request or an accepted connection with you will appear here.' },
  };

  return (
    <AppShell>
      <div className="page-heading">
        <div><span className="page-eyebrow">Employer workspace</span><h1>Build your team with a clearer signal.</h1><p>See applicants ranked against the skills your roles ask for.</p></div>
        <Link className="button button--primary" to="/jobs"><BriefcaseBusiness size={15} /> Manage jobs</Link>
      </div>
      {error && <div className="form-error results-error" role="alert">{error}</div>}
      <div className="metrics-grid">
        <MetricCard label="Jobs posted" value={loading ? '—' : data?.jobs_posted ?? 0} note="Roles on your account" icon={<BriefcaseBusiness size={16} />} />
        <MetricCard label="Total applicants" value={loading ? '—' : data?.total_applicants ?? 0} note="Across your job posts" icon={<UsersRound size={16} />} />
        <MetricCard label="Available developers" value={loading ? '—' : data?.available_developers ?? 0} note="Open to work on DAEMatch" icon={<Clock3 size={16} />} />
        <MetricCard label="Hiring signal" value="Skills first" note="Matched to your requirements" icon={<Check size={16} />} />
      </div>

      <div className="dashboard-columns employer-dashboard-columns">
        <section className="panel">
          <div className="panel-header"><div><h2>My jobs</h2><p>Applicant activity for your open roles</p></div><Link to="/jobs" className="text-link">See all <ArrowRight size={14} /></Link></div>
          {loading ? <div className="inline-loading">Loading your roles…</div> : data?.my_jobs.length ? <div className="employer-jobs">{data.my_jobs.map((job) => <div className="employer-job-row" key={job.id}><div className="employer-job-row-head"><h3>{job.title}</h3><span className="applicant-count">{job.application_count} applicant{job.application_count === 1 ? '' : 's'}</span></div><div className="employer-job-meta">{job.location_type} · {job.salary_range || 'Salary not listed'}</div><div className="skill-list skill-list--tight">{job.required_skills.map((skill) => <span className="skill-chip" key={skill.id}>{skill.name}</span>)}</div></div>)}</div> : <EmptyState icon={<BriefcaseBusiness size={19} />} title="Your first role starts here" description="Post a clear job with the skills you need to see aligned applicants." action={<Link className="button button--primary button--small" to="/jobs">Post a job</Link>} />}
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2>{showAllApplications ? 'All incoming applications' : 'Incoming applications'}</h2><p>{showAllApplications ? 'Every application received for your job posts' : 'Top applicants ranked by skills match; view all to browse every submission'}</p></div><button className="text-link dashboard-applicant-toggle" type="button" onClick={() => void toggleAllApplications()} disabled={loading || loadingApplications} aria-expanded={showAllApplications}>{showAllApplications ? 'Show top applicants' : `View all applications (${data?.total_applicants ?? 0})`}</button></div>
          {showAllApplications && !loading && <div className="view-tabs applicant-filter-tabs" role="group" aria-label="Filter job applications">
            {(Object.keys(filterLabels) as ApplicantFilter[]).map((filter) => <button key={filter} type="button" aria-pressed={applicantFilter === filter} className={applicantFilter === filter ? 'active' : ''} onClick={() => setApplicantFilter(filter)}>{filterLabels[filter]}<span className="applicant-filter-count">{filterCounts[filter]}</span></button>)}
          </div>}
          {showAllApplications && !loading && !loadingApplications && !applicationsError && <div className="application-search-row">
            <div className="application-search-field">
              <Search size={15} aria-hidden="true" />
              <label className="sr-only" htmlFor="incoming-application-search">Search incoming applications</label>
              <input id="incoming-application-search" type="search" value={applicationSearch} onChange={(event) => setApplicationSearch(event.target.value)} placeholder="Search developers, jobs, skills or locations…" />
              {applicationSearch && <button className="application-search-clear" type="button" aria-label="Clear application search" onClick={() => setApplicationSearch('')}><X size={14} /></button>}
            </div>
            <span className="application-search-count" aria-live="polite">{searchFilteredApplications.length} result{searchFilteredApplications.length === 1 ? '' : 's'}</span>
          </div>}
          {loading ? <div className="inline-loading">Ranking applicants…</div> : showAllApplications && loadingApplications ? <div className="inline-loading">Loading all applications…</div> : showAllApplications && applicationsError ? <div className="form-error results-error" role="alert">{applicationsError}</div> : searchFilteredApplications.length ? <div className="applicant-list">{searchFilteredApplications.map((application) => {
            const connectionStatus = connectionStatusFor(application.applicant.id);
            const isConnecting = connecting === application.applicant.id;
            return <article className="applicant-row applicant-row--stacked" key={application.id}>
              <span className="avatar avatar--small">{application.applicant.username.slice(0, 1).toUpperCase()}</span>
              <div className="applicant-copy"><strong>{application.applicant.username}</strong><span>{application.job.title} · {application.applicant.location || 'Location not listed'}</span></div>
              <ScoreBadge score={application.match_score} />
              <div className="applicant-skills">{application.applicant.skills.slice(0, 4).map((skill) => <span className="skill-chip" key={skill.id}>{skill.name}</span>)}</div>
              <div className="applicant-row-footer"><span className={`status-pill status-pill--${application.status}`}>{application.status}</span><div className="applicant-actions">
                <button className="button button--secondary button--small" type="button" onClick={() => openReport(application)} disabled={updating === application.id}>{application.status === 'pending' ? 'Review' : 'View report'}</button>
                <button className="button button--secondary button--small" type="button" onClick={() => void connect(application)} disabled={connectionStatus === 'accepted' || connectionStatus === 'outgoing' || isConnecting}>{connectionActionLabel(connectionStatus, isConnecting)}</button>
                {application.status !== 'accepted' && application.status !== 'rejected' && <><button className="icon-button applicant-accept" type="button" aria-label={`Accept ${application.applicant.username}`} disabled={updating === application.id} onClick={() => void updateStatus(application, 'accepted')}><Check size={14} /></button><button className="button button--secondary button--small applicant-reject-button" type="button" disabled={updating === application.id} onClick={() => void updateStatus(application, 'rejected')}><X size={13} /> Reject</button></>}
              </div></div>
            </article>;
          })}</div> : showAllApplications && applicationsLoaded && !applicationsError ? <div className="applicant-filter-empty" role="status"><UsersRound size={20} /><strong>{searchTerm ? 'No matching applications' : filterEmptyCopy[applicantFilter].title}</strong><p>{searchTerm ? `No applications match “${applicationSearch.trim()}”. Try a different developer, job, skill, location or status.` : filterEmptyCopy[applicantFilter].description}</p>{searchTerm && <button className="text-link" type="button" onClick={() => setApplicationSearch('')}>Clear search</button>}</div> : !showAllApplications && !data?.top_applicants.length ? <EmptyState icon={<UsersRound size={20} />} title="No applicants yet" description="Once a developer applies, their skills fit will appear here." action={<Link className="text-link" to="/jobs">Review your roles <ArrowRight size={14} /></Link>} /> : null}
        </section>
      </div>
      <p className="employer-footnote">Applicant scores compare listed profile skills with each job’s required skills; they support review and do not replace your hiring judgment.</p>
      {selectedApplication && <DeveloperReportModal
        application={selectedApplication}
        connectionLabel={connectionActionLabel(connectionStatusFor(selectedApplication.applicant.id), connecting === selectedApplication.applicant.id)}
        connectionDisabled={['accepted', 'outgoing'].includes(connectionStatusFor(selectedApplication.applicant.id)) || connecting === selectedApplication.applicant.id}
        updating={updating === selectedApplication.id}
        onClose={closeReport}
        onReview={() => void updateStatus(selectedApplication, 'reviewed')}
        onAccept={() => void updateStatus(selectedApplication, 'accepted')}
        onReject={() => void updateStatus(selectedApplication, 'rejected')}
        onConnect={() => void connect(selectedApplication)}
      />}
    </AppShell>
  );
}

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, BriefcaseBusiness, Check, Plus, Search, SlidersHorizontal } from 'lucide-react';

import { api, ApiError } from '../api/client';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';
import { JobCard } from '../components/JobCard';
import { JobApplicationPreviewModal } from '../components/JobApplicationPreviewModal';
import { useAuth } from '../context/AuthContext';
import type { Job, LocationType, RoleTemplate, Skill } from '../types';

type JobWriteInput = {
  title: string;
  description: string;
  salary_range: string;
  location_type: LocationType;
  required_skill_ids: number[];
};

function JobComposer({ skills, roleTemplates, job, onSaved, onCancel }: {
  skills: Skill[];
  roleTemplates: RoleTemplate[];
  job: Job | null;
  onSaved: (created: boolean) => void;
  onCancel: () => void;
}) {
  const editing = job !== null;
  const [title, setTitle] = useState(job?.title ?? '');
  const [description, setDescription] = useState(job?.description ?? '');
  const [salary, setSalary] = useState(job?.salary_range ?? '');
  const [locationType, setLocationType] = useState<LocationType>(job?.location_type ?? 'remote');
  const [selected, setSelected] = useState<number[]>(job?.required_skills.map((skill) => skill.id) ?? []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const applyRoleTemplate = (role: string) => {
    const template = roleTemplates.find((item) => item.role === role);
    if (!template) return;
    const templateNames = new Set(template.skills.map((name) => name.trim().toLocaleLowerCase()));
    setSelected(skills.filter((skill) => templateNames.has(skill.name.trim().toLocaleLowerCase())).map((skill) => skill.id));
    if (!title.trim()) setTitle(role);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selected.length < 3) {
      setError('Choose at least 3 required skills before publishing this role.');
      return;
    }
    setBusy(true);
    setError('');
    const input: JobWriteInput = {
      title: title.trim(),
      description: description.trim(),
      salary_range: salary.trim(),
      location_type: locationType,
      required_skill_ids: selected,
    };
    try {
      if (job) await api.updateJob(job.id, input);
      else await api.createJob(input);
      onSaved(!editing);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : editing ? 'Unable to update this job right now.' : 'Unable to post this job right now.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSkill = (id: number) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <section className="composer-panel">
      <div className="panel-header">
        <div><h2>{editing ? 'Edit job post' : 'Post a new role'}</h2><p>{editing ? 'Update the role details developers see.' : 'Clear requirements help developers see the fit.'}</p></div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="Close job form">×</button>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form className="composer-form" onSubmit={submit}>
        <div className="field"><label htmlFor="job-title">Job title</label><input id="job-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Backend Engineer" maxLength={160} required /></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="job-salary">Salary range</label><input id="job-salary" value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="e.g. $2,000–$3,500 / month" maxLength={120} /></div>
          <div className="field"><label htmlFor="job-location">Location type</label><select id="job-location" value={locationType} onChange={(event) => setLocationType(event.target.value as LocationType)}><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></div>
        </div>
        <div className="field"><label htmlFor="job-role-template">Start from a role template</label><select id="job-role-template" defaultValue="" onChange={(event) => applyRoleTemplate(event.target.value)}><option value="">Choose a role template…</option>{roleTemplates.map((template) => <option value={template.role} key={template.role}>{template.role}</option>)}</select><span className="field-hint">Templates add the recommended skills below. You can adjust them before saving.</span></div>
        <div className="field"><label htmlFor="job-description">Description</label><textarea id="job-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the work, team and what success looks like…" maxLength={12000} required /></div>
        <fieldset className="skill-picker"><legend>Required skills <span className="field-hint">{selected.length}/3 minimum</span></legend><div className="skill-picker-list">{skills.map((skill) => <label key={skill.id} className={`skill-check${selected.includes(skill.id) ? ' selected' : ''}`}><input type="checkbox" checked={selected.includes(skill.id)} onChange={() => toggleSkill(skill.id)} /><span>{skill.name}</span></label>)}{skills.length === 0 && <span className="field-hint">Skill choices will appear here after the catalog is available.</span>}</div></fieldset>
        <div className="composer-actions"><button className="button button--secondary" type="button" onClick={onCancel}>Cancel</button><button className="button button--primary" disabled={busy || selected.length < 3}>{busy ? (editing ? 'Saving…' : 'Posting…') : editing ? 'Save changes' : 'Publish job'} <ArrowRight size={15} /></button></div>
      </form>
    </section>
  );
}

export function JobsPage() {
  const { user } = useAuth();
  const isEmployer = user?.role === 'employer';
  const [jobs, setJobs] = useState<Job[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [skill, setSkill] = useState('');
  const [view, setView] = useState<'all' | 'mine'>('all');
  const [composerJob, setComposerJob] = useState<Job | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState<number | null>(null);
  const [applicationPreview, setApplicationPreview] = useState<Job | null>(null);
  const [applicationError, setApplicationError] = useState('');
  const [applicationSuccess, setApplicationSuccess] = useState('');
  const [deletingJobId, setDeletingJobId] = useState<number | null>(null);

  useEffect(() => {
    api.skills().then(setSkills).catch(() => setSkills([]));
    if (isEmployer) api.roleTemplates().then((result) => setRoleTemplates(result.templates)).catch(() => setRoleTemplates([]));
  }, [isEmployer]);

  const loadJobs = async () => {
    setLoading(true);
    setError('');
    try {
      const result = isEmployer && view === 'mine' ? await api.myJobs() : await api.jobs({ search, location_type: location, skill });
      setJobs(result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load jobs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadJobs(); }, 180);
    return () => window.clearTimeout(timer);
  }, [search, location, skill, view, isEmployer]);

  const openApplicationPreview = (jobId: number) => {
    const job = jobs.find((item) => item.id === jobId);
    if (!job || job.has_applied) return;
    setApplicationError('');
    setApplicationSuccess('');
    setApplicationPreview(job);
  };

  const closeApplicationPreview = useCallback(() => {
    setApplicationPreview(null);
    setApplicationError('');
  }, []);

  const submitApplication = async () => {
    if (!applicationPreview || applicationPreview.has_applied || applying !== null) return;
    const job = applicationPreview;
    setApplying(job.id);
    setApplicationError('');
    try {
      await api.apply(job.id);
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, has_applied: true } : item));
      setApplicationSuccess(job.title);
      closeApplicationPreview();
    } catch (caught) {
      setApplicationError(caught instanceof ApiError ? caught.message : 'Your application could not be sent.');
    } finally {
      setApplying(null);
    }
  };

  const deleteJob = async (jobId: number) => {
    const job = jobs.find((item) => item.id === jobId);
    if (!job || !isEmployer || job.employer !== user?.id) return;
    const confirmed = window.confirm(`Delete “${job.title}”? This will permanently remove the job and all applications submitted for it.`);
    if (!confirmed) return;

    setDeletingJobId(jobId);
    setError('');
    try {
      await api.deleteJob(jobId);
      setJobs((current) => current.filter((item) => item.id !== jobId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'This job could not be deleted. Please try again.');
    } finally {
      setDeletingJobId(null);
    }
  };

  const editJob = (jobId: number) => {
    const job = jobs.find((item) => item.id === jobId);
    if (job && isEmployer && job.employer === user?.id) setComposerJob(job);
  };

  return (
    <AppShell>
      <div className="page-heading">
        <div><span className="page-eyebrow">{isEmployer ? 'Employer workspace' : 'The job board'}</span><h1>{isEmployer ? 'Find your next great match.' : 'Find work that fits.'}</h1><p>{isEmployer ? 'Post roles and find skill-aligned people across the network.' : 'Explore new opportunities from teams hiring for what you can do.'}</p></div>
        {isEmployer && <button className="button button--primary" type="button" onClick={() => setComposerJob((current) => current === null ? undefined : null)}><Plus size={16} /> Post a job</button>}
      </div>

      {composerJob !== undefined && isEmployer && <JobComposer key={composerJob?.id ?? 'new'} job={composerJob} skills={skills} roleTemplates={roleTemplates} onCancel={() => setComposerJob(undefined)} onSaved={(created) => { setComposerJob(undefined); if (created) setView('mine'); else void loadJobs(); }} />}

      <div className="toolbar">
        <label className="search-box"><Search size={16} /><input aria-label="Search jobs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search roles, employers or skills" /></label>
        <label className="toolbar-select"><SlidersHorizontal size={14} /><select aria-label="Filter by location type" value={location} onChange={(event) => setLocation(event.target.value)}><option value="">All locations</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></label>
        <select aria-label="Filter by required skill" value={skill} onChange={(event) => setSkill(event.target.value)}><option value="">All skills</option>{skills.map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}</select>
      </div>

      {isEmployer && <div className="view-tabs"><button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')} type="button">All jobs</button><button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')} type="button">My job posts</button></div>}
      <div className="results-summary"><span>{loading ? 'Loading roles…' : `${jobs.length} ${jobs.length === 1 ? 'role' : 'roles'} shown`}</span>{!isEmployer && <span>Review the role details before you apply.</span>}</div>
      {error && <div className="form-error results-error" role="alert">{error}</div>}
      {applicationSuccess && <div className="job-apply-success" role="status"><Check size={15} /> Your application for “{applicationSuccess}” was submitted.</div>}
      {loading ? <div className="job-results">{[1, 2, 3, 4].map((item) => <div className="job-skeleton" key={item} />)}</div> : jobs.length ? <div className="job-results">{jobs.map((job) => <JobCard key={job.id} job={job} onApply={isEmployer ? undefined : openApplicationPreview} applying={applying === job.id} canManage={isEmployer && job.employer === user?.id} onEdit={editJob} onDelete={deleteJob} deleting={deletingJobId === job.id} />)}</div> : <EmptyState icon={<BriefcaseBusiness size={21} />} title={view === 'mine' ? 'No jobs posted yet' : 'No matching jobs just yet'} description={view === 'mine' ? 'Your published roles and applicant counts will appear here.' : 'Try another search or filter, or check back as new opportunities are posted.'} action={isEmployer && view === 'mine' ? <button className="button button--primary button--small" type="button" onClick={() => setComposerJob(null)}>Post your first job</button> : undefined} />}
      {applicationPreview && !isEmployer && <JobApplicationPreviewModal job={applicationPreview} applying={applying === applicationPreview.id} error={applicationError} onClose={closeApplicationPreview} onConfirm={() => void submitApplication()} />}
    </AppShell>
  );
}

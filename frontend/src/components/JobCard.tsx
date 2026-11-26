import { ArrowUpRight, BriefcaseBusiness, CalendarDays, MapPin } from 'lucide-react';

import type { Job, JobMatch } from '../types';
import { ScoreBadge } from './ScoreBadge';

export function JobCard({ job, onApply, applying = false, canManage = false, onEdit, onDelete, deleting = false }: {
  job: Job | JobMatch;
  onApply?: (id: number) => void;
  applying?: boolean;
  canManage?: boolean;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  deleting?: boolean;
}) {
  const employerName = 'employer_name' in job ? job.employer_name : job.employer;
  const applied = 'has_applied' in job && job.has_applied;
  const score = 'match_score' in job ? job.match_score : undefined;
  const salary = job.salary_range || 'Salary not listed';
  const posted = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(job.created_at));
  const location = job.location_type === 'onsite' ? 'On-site' : job.location_type === 'hybrid' ? 'Hybrid' : 'Remote';

  return (
    <article className="job-card">
      <div className="job-card-top">
        <div className="job-avatar"><BriefcaseBusiness size={18} /></div>
        <div className="job-card-title"><h3>{job.title}</h3><p>{employerName}</p></div>
        {score !== undefined && <ScoreBadge score={score} />}
      </div>
      <p className="job-description">{job.description}</p>
      <div className="job-meta">
        <span><MapPin size={14} />{location}</span>
        <span><CalendarDays size={14} />{posted}</span>
        <span className="salary-text">{salary}</span>
      </div>
      <div className="job-card-bottom">
        <div className="skill-list skill-list--tight">
          {job.required_skills.slice(0, 5).map((skill) => <span className="skill-chip" key={skill.id}>{skill.name}</span>)}
          {job.required_skills.length > 5 && <span className="skill-more">+{job.required_skills.length - 5}</span>}
          {job.required_skills.length === 0 && <span className="skill-more">Skills open</span>}
        </div>
        {canManage && onEdit && onDelete ? (
          <div className="job-management-actions">
            <button className="job-management-action" type="button" onClick={() => onEdit(job.id)} aria-label={`Edit ${job.title}`}>Edit</button>
            <button className="job-management-action job-management-action--danger" type="button" onClick={() => onDelete(job.id)} disabled={deleting} aria-label={`Delete ${job.title}`}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        ) : onApply ? (
          <button className={`button ${applied ? 'button--applied' : 'button--primary button--small'}`} type="button" onClick={() => { if (!applied && !applying) onApply(job.id); }} disabled={applying} aria-disabled={applied}>
            {applied ? 'Applied' : applying ? 'Applying…' : <>Apply <ArrowUpRight size={15} /></>}
          </button>
        ) : null}
      </div>
    </article>
  );
}

import { useEffect, useRef } from 'react';
import { ArrowRight, BriefcaseBusiness, CalendarDays, MapPin, X } from 'lucide-react';

import type { Job } from '../types';

interface JobApplicationPreviewModalProps {
  job: Job;
  applying: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}

function formatPostedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Posting date not listed'
    : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function formatLocation(value: Job['location_type']): string {
  if (value === 'onsite') return 'On-site';
  if (value === 'hybrid') return 'Hybrid';
  return 'Remote';
}

export function JobApplicationPreviewModal({ job, applying, error, onClose, onConfirm }: JobApplicationPreviewModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const applyingRef = useRef(applying);
  applyingRef.current = applying;

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    const focusableSelector = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';
    const closeButton = dialog?.querySelector<HTMLButtonElement>('.job-apply-close');
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !applyingRef.current) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusableElements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    (closeButton ?? dialog)?.focus();
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose]);

  return (
    <div className="job-apply-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !applying) onClose(); }}>
      <section ref={dialogRef} className="job-apply-dialog" role="dialog" aria-modal="true" aria-labelledby="job-apply-title" tabIndex={-1}>
        <header className="job-apply-header">
          <div className="job-apply-heading-icon"><BriefcaseBusiness size={17} /></div>
          <div className="job-apply-heading-copy">
            <span className="page-eyebrow">Review job details before applying</span>
            <h2 id="job-apply-title">{job.title}</h2>
            <p>{job.employer_name}</p>
          </div>
          <button className="icon-button job-apply-close" type="button" aria-label="Close job details" onClick={onClose} disabled={applying}><X size={17} /></button>
        </header>

        <div className="job-apply-content">
          <div className="job-apply-meta">
            <span><MapPin size={14} />{formatLocation(job.location_type)}</span>
            <span><CalendarDays size={14} />{formatPostedAt(job.created_at)}</span>
            <span className="job-apply-salary">{job.salary_range || 'Salary not listed'}</span>
          </div>

          <section className="job-apply-section">
            <h3>Job description</h3>
            <p className="job-apply-description">{job.description}</p>
          </section>

          <section className="job-apply-section">
            <h3>Required skills</h3>
            {job.required_skills.length
              ? <div className="job-apply-skills">{job.required_skills.map((skill) => <span className="skill-chip" key={skill.id}>{skill.name}</span>)}</div>
              : <p className="job-apply-muted">No specific skills listed.</p>}
          </section>

          {error && <div className="form-error job-apply-error" role="alert">{error}</div>}
        </div>

        <footer className="job-apply-actions">
          <button className="button button--secondary" type="button" onClick={onClose} disabled={applying}>Cancel</button>
          <button className="button button--primary" type="button" onClick={onConfirm} disabled={applying}>{applying ? 'Submitting…' : 'Confirm application'} <ArrowRight size={15} /></button>
        </footer>
      </section>
    </div>
  );
}

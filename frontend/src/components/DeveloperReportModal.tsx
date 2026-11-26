import { useEffect, useRef, useState } from 'react';
import { BriefcaseBusiness, Check, Clock3, Download, ExternalLink, Eye, MapPin, X } from 'lucide-react';

import { ScoreBadge } from './ScoreBadge';
import { CVPreviewDialog } from './CVPreviewDialog';
import { api, ApiError, saveProtectedDownload, type ProtectedPreview } from '../api/client';
import type { Application } from '../types';

interface DeveloperReportModalProps {
  application: Application;
  connectionLabel: string;
  connectionDisabled: boolean;
  updating: boolean;
  onClose: () => void;
  onReview: () => void;
  onAccept: () => void;
  onReject: () => void;
  onConnect: () => void;
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function formatAppliedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function DeveloperReportModal({
  application,
  connectionLabel,
  connectionDisabled,
  updating,
  onClose,
  onReview,
  onAccept,
  onReject,
  onConnect,
}: DeveloperReportModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const { applicant, job } = application;
  const githubUrl = safeExternalUrl(applicant.github_url);
  const linkedinUrl = safeExternalUrl(applicant.linkedin_url);
  const experience = applicant.years_experience > 0
    ? `${applicant.years_experience} year${applicant.years_experience === 1 ? '' : 's'} experience`
    : 'Experience not listed';
  const [downloadingCV, setDownloadingCV] = useState(false);
  const [previewingCV, setPreviewingCV] = useState(false);
  const [cvPreview, setCVPreview] = useState<ProtectedPreview | null>(null);
  const [cvError, setCVError] = useState('');

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';
    const closeButton = dialog?.querySelector<HTMLButtonElement>('.developer-report-close');
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose]);

  const downloadCV = async () => {
    setDownloadingCV(true);
    setCVError('');
    try {
      saveProtectedDownload(await api.downloadApplicationCV(application.id));
    } catch (caught) {
      setCVError(caught instanceof ApiError ? caught.message : 'Could not download this CV.');
    } finally {
      setDownloadingCV(false);
    }
  };

  const previewCV = async () => {
    setPreviewingCV(true);
    setCVError('');
    try {
      setCVPreview(await api.previewApplicationCV(application.id));
    } catch (caught) {
      setCVError(caught instanceof ApiError ? caught.message : 'Could not open this CV.');
    } finally {
      setPreviewingCV(false);
    }
  };

  return (
    <div className="developer-report-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="developer-report-dialog" role="dialog" aria-modal="true" aria-labelledby="developer-report-title" tabIndex={-1}>
        <header className="developer-report-header">
          <div><span className="page-eyebrow">Applicant review</span><p>Developer report</p></div>
          <button className="icon-button developer-report-close" type="button" aria-label="Close developer report" onClick={onClose}><X size={17} /></button>
        </header>

        <div className="developer-report-content">
          <div className="developer-report-summary">
            <span className="avatar avatar--large">{applicant.username.slice(0, 1).toUpperCase()}</span>
            <div className="developer-report-identity">
              <h2 id="developer-report-title">{applicant.username}</h2>
              <p><MapPin size={13} /> {applicant.location || 'Location not listed'} <span>·</span> {experience}</p>
            </div>
            <div className="developer-report-score"><small>Skills match</small><ScoreBadge score={application.match_score} /></div>
          </div>

          <section className="developer-report-section">
            <h3>Profile summary</h3>
            <p className="developer-report-bio">{applicant.bio || 'No developer bio has been added yet.'}</p>
          </section>

          <section className="developer-report-section">
            <h3>Skills</h3>
            {applicant.skills.length ? <div className="developer-report-skills">{applicant.skills.map((skill) => <span className="skill-chip" key={skill.id}>{skill.name}</span>)}</div> : <p className="developer-report-muted">No skills listed.</p>}
          </section>

          <section className="developer-report-section">
            <h3>Applied role</h3>
            <div className="developer-report-job">
              <span className="developer-report-job-icon"><BriefcaseBusiness size={16} /></span>
              <div><strong>{job.title}</strong><small>{job.employer_name} · {job.location_type} · {job.salary_range || 'Salary not listed'}</small></div>
            </div>
            {job.required_skills.length > 0 && <div className="developer-report-skills developer-report-required">{job.required_skills.map((skill) => <span className="skill-chip" key={skill.id}>{skill.name}</span>)}</div>}
          </section>

          <section className="developer-report-section developer-report-application">
            <div className="developer-report-section-heading"><h3>Application</h3><span className={`status-pill status-pill--${application.status}`}>{application.status}</span></div>
            <div className="developer-report-applied"><Clock3 size={13} /> Applied {formatAppliedAt(application.applied_at)}</div>
            <p className="developer-report-label">Cover letter</p>
            <p className="developer-report-cover-letter">{application.cover_letter || 'No cover letter was included.'}</p>
          </section>

          <section className="developer-report-section">
            <h3>CV / résumé</h3>
            {applicant.has_cv ? <>
              <p className="developer-report-muted">The developer has shared a CV for this application.</p>
              <div className="developer-cv-actions">
                <button className="button button--secondary button--small" type="button" disabled={previewingCV || downloadingCV} onClick={() => void previewCV()}><Eye size={14} /> {previewingCV ? 'Opening…' : 'View CV'}</button>
                <button className="button button--secondary button--small developer-cv-download" type="button" disabled={downloadingCV || previewingCV} onClick={() => void downloadCV()}><Download size={14} /> {downloadingCV ? 'Downloading…' : 'Download CV'}</button>
              </div>
              {cvError && <p className="form-error" role="alert">{cvError}</p>}
            </> : <p className="developer-report-muted">No CV has been uploaded.</p>}
          </section>

          <section className="developer-report-section">
            <h3>Professional links</h3>
            <div className="developer-report-links">
              {githubUrl && <a href={githubUrl} target="_blank" rel="noreferrer">GitHub <ExternalLink size={12} /></a>}
              {linkedinUrl && <a href={linkedinUrl} target="_blank" rel="noreferrer">LinkedIn <ExternalLink size={12} /></a>}
              {!githubUrl && !linkedinUrl && <p className="developer-report-muted">No portfolio links provided.</p>}
            </div>
          </section>
        </div>

        <footer className="developer-report-actions">
          {application.status === 'pending' && <button className="button button--secondary button--small" type="button" disabled={updating} onClick={onReview}>Mark reviewed</button>}
          {application.status !== 'accepted' && application.status !== 'rejected' && <>
            <button className="button button--secondary button--small" type="button" disabled={updating} onClick={onReject}>Reject</button>
            <button className="button button--primary button--small" type="button" disabled={updating} onClick={onAccept}><Check size={13} /> Accept</button>
          </>}
          <button className="button button--secondary button--small" type="button" disabled={connectionDisabled} onClick={onConnect}>{connectionLabel}</button>
        </footer>
      </section>
      {cvPreview && <CVPreviewDialog file={cvPreview} onClose={() => setCVPreview(null)} />}
    </div>
  );
}

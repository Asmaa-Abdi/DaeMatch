import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowRight, Check, Download, Eye, FileText, Link as LinkIcon, MapPin, Plus, Trash2, UserRound, UsersRound, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { api, ApiError, saveProtectedDownload, type ProtectedPreview } from '../api/client';
import { AppShell } from '../components/AppShell';
import { CVPreviewDialog } from '../components/CVPreviewDialog';
import { useAuth } from '../context/AuthContext';
import type { Connection, DeveloperCV } from '../types';

const quickSkills = ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'ML', 'React', 'JavaScript', 'Docker'];
const maxCVBytes = 5 * 1024 * 1024;

function formatCVSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const isDeveloper = user?.role === 'developer';
  const [bio, setBio] = useState(user?.bio ?? '');
  const [github, setGithub] = useState(user?.github_url ?? '');
  const [linkedin, setLinkedin] = useState(user?.linkedin_url ?? '');
  const [experience, setExperience] = useState(user?.years_experience ?? 0);
  const [location, setLocation] = useState(user?.location ?? '');
  const [companyName, setCompanyName] = useState(user?.company_name ?? '');
  const [companyWebsite, setCompanyWebsite] = useState(user?.company_website ?? '');
  const [cv, setCV] = useState<DeveloperCV | null>(null);
  const [cvLoading, setCVLoading] = useState(false);
  const [cvBusy, setCVBusy] = useState(false);
  const [cvPreview, setCVPreview] = useState<ProtectedPreview | null>(null);
  const [cvMessage, setCVMessage] = useState('');
  const [cvError, setCVError] = useState('');
  const cvInputRef = useRef<HTMLInputElement | null>(null);
  const [skillInput, setSkillInput] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [saving, setSaving] = useState(false);
  const [skillBusy, setSkillBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setBio(user?.bio ?? '');
    setGithub(user?.github_url ?? '');
    setLinkedin(user?.linkedin_url ?? '');
    setExperience(user?.years_experience ?? 0);
    setLocation(user?.location ?? '');
    setCompanyName(user?.company_name ?? '');
    setCompanyWebsite(user?.company_website ?? '');
  }, [user]);

  useEffect(() => {
    if (!isDeveloper || !user?.id) return;
    let cancelled = false;
    setCVLoading(true);
    setCVError('');
    api.developerCV()
      .then((metadata) => { if (!cancelled) setCV(metadata); })
      .catch((caught) => { if (!cancelled) setCVError(caught instanceof ApiError ? caught.message : 'Could not load your CV.'); })
      .finally(() => { if (!cancelled) setCVLoading(false); });
    return () => { cancelled = true; };
  }, [isDeveloper, user?.id]);

  const loadConnections = async () => {
    try { setConnections(await api.connections()); } catch { setConnections([]); }
  };
  useEffect(() => { void loadConnections(); }, []);

  const completeFields = useMemo(() => [Boolean(user?.bio), Boolean(user?.skills.length), Boolean(user?.github_url || user?.linkedin_url), Boolean(user?.years_experience)].filter(Boolean).length, [user]);
  const completion = isDeveloper ? Math.round(completeFields / 4 * 100) : 100;
  const incoming = connections.filter((item) => item.receiver.id === user?.id && item.status === 'pending');
  const established = connections.filter((item) => item.status === 'accepted');
  const accountLabel = isDeveloper ? user?.username : user?.company_name || user?.username;
  const initial = accountLabel?.split(/[\s._-]/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'D';

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      await api.updateProfile(isDeveloper
        ? { bio: bio.trim(), github_url: github.trim(), linkedin_url: linkedin.trim(), years_experience: experience, location: location.trim() }
        : { company_name: companyName.trim(), company_website: companyWebsite.trim(), location: location.trim() });
      await refreshProfile();
      setNotice('Profile changes saved.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save your profile.');
    } finally { setSaving(false); }
  };

  const addSkill = async (name: string) => {
    if (!name.trim() || skillBusy) return;
    setSkillBusy(true); setError(''); setNotice('');
    try {
      await api.addSkill(name.trim());
      setSkillInput('');
      await refreshProfile();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not add that skill.'); }
    finally { setSkillBusy(false); }
  };

  const removeSkill = async (id: number) => {
    setError('');
    try { await api.removeSkill(id); await refreshProfile(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not remove that skill.'); }
  };

  const toggleAvailability = async () => {
    if (!user) return;
    setError('');
    try {
      await api.updateProfile({ is_open_to_work: !user.is_open_to_work });
      await refreshProfile();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not update availability.'); }
  };

  const acceptConnection = async (id: number) => {
    try { await api.acceptConnection(id); await loadConnections(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not accept this request.'); }
  };

  const uploadCV = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const extension = file.name.toLowerCase().split('.').pop();
    if (!['pdf', 'docx'].includes(extension ?? '')) {
      setCVError('Choose a PDF or DOCX file.');
      setCVMessage('');
      return;
    }
    if (file.size > maxCVBytes) {
      setCVError('CV files must be 5 MiB or smaller.');
      setCVMessage('');
      return;
    }
    setCVBusy(true);
    setCVError('');
    setCVMessage('');
    try {
      const uploaded = await api.uploadDeveloperCV(file);
      setCV(uploaded);
      setCVMessage('Your CV was saved securely.');
    } catch (caught) {
      setCVError(caught instanceof ApiError ? caught.message : 'Could not upload your CV. Please try again.');
    } finally {
      setCVBusy(false);
    }
  };

  const downloadCV = async () => {
    setCVBusy(true);
    setCVError('');
    setCVMessage('');
    try {
      saveProtectedDownload(await api.downloadDeveloperCV(cv?.filename ?? 'developer-cv'));
    } catch (caught) {
      setCVError(caught instanceof ApiError ? caught.message : 'Could not download your CV.');
    } finally {
      setCVBusy(false);
    }
  };

  const previewCV = async () => {
    setCVBusy(true);
    setCVError('');
    setCVMessage('');
    try {
      setCVPreview(await api.previewDeveloperCV());
    } catch (caught) {
      setCVError(caught instanceof ApiError ? caught.message : 'Could not open your CV.');
    } finally {
      setCVBusy(false);
    }
  };

  const removeCV = async () => {
    if (!window.confirm('Remove your uploaded CV from your profile?')) return;
    setCVBusy(true);
    setCVError('');
    setCVMessage('');
    try {
      await api.deleteDeveloperCV();
      setCV({ available: false, filename: null, content_type: null, size_bytes: 0, updated_at: null });
      setCVMessage('Your CV was removed.');
    } catch (caught) {
      setCVError(caught instanceof ApiError ? caught.message : 'Could not remove your CV.');
    } finally {
      setCVBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="page-heading"><div><span className="page-eyebrow">Your account</span><h1>{isDeveloper ? 'Your developer profile' : 'Your employer profile'}</h1><p>{isDeveloper ? 'Help good opportunities understand what you bring.' : 'Manage the basics for the account that posts your jobs.'}</p></div></div>
      {error && <div className="form-error results-error" role="alert">{error}</div>}
      <div className="profile-layout">
        <aside>
          <section className="profile-card">
            <div className="profile-card-head"><span className="avatar avatar--large">{initial}</span><h2>{accountLabel}</h2><p>{user?.email}</p>{user?.location && <span className="profile-location"><MapPin size={13} />{user.location}</span>}</div>
            <div className="profile-stat-row"><span>Account type</span><strong>{isDeveloper ? 'Developer' : 'Employer'}</strong></div>
            <div className="profile-stat-row"><span>{isDeveloper ? 'Skills listed' : 'Open opportunities'}</span><strong>{isDeveloper ? user?.skills.length ?? 0 : 'View jobs'}</strong></div>
            <div className="profile-stat-row"><span>Profile progress</span><strong>{completion}%</strong></div>
            {isDeveloper && <div className="profile-progress"><span style={{ width: `${completion}%` }} /></div>}
          </section>
          {isDeveloper && <section className="profile-card profile-availability"><div className="availability-head"><span className={`availability-dot${user?.is_open_to_work ? ' is-open' : ''}`} /><div><strong>{user?.is_open_to_work ? 'Open to work' : 'Not open to work'}</strong><small>Let employers know you’re available.</small></div></div><button className="toggle" type="button" role="switch" aria-checked={Boolean(user?.is_open_to_work)} aria-label="Toggle open to work" onClick={toggleAvailability} /></section>}
          <section className="profile-card profile-network"><div className="network-title"><UsersRound size={16} /><strong>Your connections</strong></div><p>{established.length} accepted connection{established.length === 1 ? '' : 's'}</p>{incoming.length ? <div className="connection-list">{incoming.map((item) => <div className="connection-row" key={item.id}><span className="avatar avatar--small">{item.sender.username.slice(0, 1).toUpperCase()}</span><span><strong>{item.sender.username}</strong><small>Wants to connect</small></span><button className="icon-button accept-connection" type="button" onClick={() => acceptConnection(item.id)} aria-label={`Accept ${item.sender.username}'s connection`}><Check size={15} /></button></div>)}</div> : <span className="connection-empty">New requests will appear here.</span>}</section>
        </aside>

        <div>
          <section className="profile-panel">
            <h2>{isDeveloper ? 'About you' : 'Employer account details'}</h2>
            {notice && <div className="form-success" role="status">{notice}</div>}
            <form className="profile-form" onSubmit={saveProfile}>
              {isDeveloper ? <>
                <div className="field"><label htmlFor="bio">Bio</label><textarea id="bio" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={1200} placeholder="Tell employers what you enjoy building and how you work…" /><span className="field-hint">Keep it specific to the kind of work you want to do.</span></div>
                <div className="form-grid">
                  <div className="field"><label htmlFor="github"><LinkIcon size={13} /> GitHub URL</label><input id="github" type="url" value={github} onChange={(event) => setGithub(event.target.value)} placeholder="https://github.com/you" /></div>
                  <div className="field"><label htmlFor="linkedin"><LinkIcon size={13} /> LinkedIn URL</label><input id="linkedin" type="url" value={linkedin} onChange={(event) => setLinkedin(event.target.value)} placeholder="https://linkedin.com/in/you" /></div>
                </div>
                <div className="field field--narrow"><label htmlFor="experience">Years of experience</label><input id="experience" type="number" min="0" max="80" value={experience} onChange={(event) => setExperience(Number(event.target.value))} /></div>
              </> : <>
                <div className="field"><label htmlFor="company-name">Company name</label><input id="company-name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={160} required /></div>
                <div className="field"><label htmlFor="company-website">Company website</label><input id="company-website" type="url" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} maxLength={250} required /></div>
                <div className="profile-account-row"><span className="account-icon"><UserRound size={17} /></span><span><strong>{user?.email}</strong><small>Employer sign-in email</small></span></div>
              </>}
              <div className="field field--narrow"><label htmlFor="location">Location</label><input id="location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City or country" maxLength={120} /></div>
              <div className="profile-form-actions"><button className="button button--primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'} <Check size={15} /></button></div>
            </form>
          </section>

          {isDeveloper && <section className="profile-panel developer-cv-panel" aria-labelledby="developer-cv-heading">
            <div className="panel-header"><div><h2 id="developer-cv-heading">Your CV / résumé</h2><p>Share a current CV with employers who receive your applications.</p></div><FileText size={19} aria-hidden="true" /></div>
            {cvLoading ? <p className="field-hint">Loading your CV…</p> : cv?.available ? <div className="cv-document-row">
              <span className="cv-document-icon"><FileText size={17} /></span>
              <span className="cv-document-copy"><strong>{cv.filename}</strong><small>{formatCVSize(cv.size_bytes)} · Private document</small></span>
              <div className="cv-document-actions">
                <button className="button button--secondary button--small" type="button" disabled={cvBusy} onClick={() => void previewCV()}><Eye size={14} /> {cvBusy ? 'Opening…' : 'View CV'}</button>
                <button className="button button--secondary button--small" type="button" disabled={cvBusy} onClick={() => void downloadCV()}><Download size={14} /> Download</button>
              </div>
              <button className="icon-button cv-remove-button" type="button" disabled={cvBusy} onClick={() => void removeCV()} aria-label="Remove uploaded CV"><Trash2 size={15} /></button>
            </div> : <p className="field-hint">No CV uploaded yet. Employers cannot access your document until you choose to upload one.</p>}
            <div className="field developer-cv-upload"><label htmlFor="developer-cv-file">Upload or replace CV</label><input ref={cvInputRef} id="developer-cv-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-describedby="developer-cv-help" disabled={cvBusy} onChange={(event) => void uploadCV(event)} /></div>
            <p className="field-hint" id="developer-cv-help">PDF or DOCX, maximum 5 MiB. Stored privately in PostgreSQL; only you and an employer who received your application can view or download it.</p>
            {cvMessage && <div className="form-success" role="status">{cvMessage}</div>}
            {cvError && <div className="form-error" role="alert">{cvError}</div>}
          </section>}

          {isDeveloper && <section className="profile-panel">
            <div className="panel-header"><div><h2>Your skills</h2><p>Matches use your listed skills and each role’s requirements.</p></div><span className="skill-count">{user?.skills.length ?? 0} added</span></div>
            <form className="skill-entry" onSubmit={(event) => { event.preventDefault(); void addSkill(skillInput); }}><input aria-label="Add a skill" value={skillInput} onChange={(event) => setSkillInput(event.target.value)} placeholder="Type a skill to add" maxLength={64} /><button className="button button--primary button--small" type="submit" disabled={!skillInput.trim() || skillBusy}><Plus size={15} /> Add skill</button></form>
            <div className="skill-list">{user?.skills.map((item) => <span className="skill-removable" key={item.id}>{item.name}<button type="button" onClick={() => void removeSkill(item.id)} aria-label={`Remove ${item.name}`}><X size={13} /></button></span>)}{!user?.skills.length && <span className="field-hint">No skills added yet. Start with one of the common skills below.</span>}</div>
            <div className="quick-skills-label">Quick add</div>
            <div className="quick-skills">{quickSkills.map((name) => { const exists = user?.skills.some((item) => item.name.toLowerCase() === name.toLowerCase()); return <button key={name} disabled={exists || skillBusy} type="button" onClick={() => void addSkill(name)}>{exists ? <Check size={11} /> : <Plus size={11} />} {name}</button>; })}</div>
          </section>}
          {isDeveloper && <section className="profile-panel profile-links"><h2>Keep your profile useful</h2><p>Connect profile updates with better match signals. You can change your availability any time.</p><Link className="text-link" to="/matches">See your AI matches <ArrowRight size={14} /></Link></section>}
        </div>
      </div>
      {cvPreview && <CVPreviewDialog file={cvPreview} onClose={() => setCVPreview(null)} />}
    </AppShell>
  );
}

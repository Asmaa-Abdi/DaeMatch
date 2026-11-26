import type { Application, ApplicationMessage, ApplicationStatus, Connection, DeveloperCV, DeveloperMatch, EmployerDashboard, Job, JobMatch, NotificationFeed, PublicStats, RegisterInput, ResultsPage, RoleTemplate, Skill, UserProfile } from '../types';

interface Tokens {
  access: string;
  refresh: string;
}

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const TOKEN_KEY = 'daematch.jwt';
const configuredBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const API_ROOT = configuredBase ? (configuredBase.endsWith('/api') ? configuredBase : `${configuredBase}/api`) : '/api';

export function getTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) as Tokens : null;
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

export function saveTokens(tokens: Tokens): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.detail === 'string') return record.detail;
    const first = Object.values(record).flat()[0];
    if (typeof first === 'string') return first;
  }
  return fallback;
}

async function refreshAccessToken(refresh: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_ROOT}/users/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!response.ok) return false;
    const next = await response.json() as { access: string; refresh?: string };
    saveTokens({ access: next.access, refresh: next.refresh ?? refresh });
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const hasBody = init.body !== undefined && init.body !== null;
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const tokens = getTokens();
  const isPasswordResetPath = path.includes('/password-reset/');
  if (tokens?.access && !path.endsWith('/login/') && !isPasswordResetPath) headers.set('Authorization', `Bearer ${tokens.access}`);

  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers });
  if (response.status === 401 && retry && tokens?.refresh && !path.endsWith('/token/refresh/') && !isPasswordResetPath) {
    if (await refreshAccessToken(tokens.refresh)) {
      return request<T>(path, init, false);
    }
    clearTokens();
  }

  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new ApiError(errorMessage(payload, 'Something went wrong. Please try again.'), response.status, payload);
  return payload as T;
}

export interface ProtectedDownload {
  blob: Blob;
  filename: string;
}

export interface ProtectedPreview extends ProtectedDownload {
  contentType: 'application/pdf' | 'text/plain';
}

function responseFilename(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded.trim().replace(/^"|"$/g, '')); } catch { return fallback; }
  }
  const quoted = /filename="([^"]+)"/i.exec(header)?.[1];
  const plain = /filename=([^;]+)/i.exec(header)?.[1]?.trim();
  return (quoted || plain || fallback).replace(/[\r\n]/g, '') || fallback;
}

async function requestDownload(path: string, fallbackFilename: string, retry = true): Promise<ProtectedDownload> {
  const tokens = getTokens();
  const headers = new Headers({ Accept: 'application/octet-stream' });
  if (tokens?.access) headers.set('Authorization', `Bearer ${tokens.access}`);
  const response = await fetch(`${API_ROOT}${path}`, { headers });
  if (response.status === 401 && retry && tokens?.refresh) {
    if (await refreshAccessToken(tokens.refresh)) return requestDownload(path, fallbackFilename, false);
    clearTokens();
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as unknown;
    throw new ApiError(errorMessage(payload, 'Could not download this CV.'), response.status, payload);
  }
  return {
    blob: await response.blob(),
    filename: responseFilename(response.headers.get('Content-Disposition'), fallbackFilename),
  };
}

async function requestPreview(path: string, fallbackFilename: string, retry = true): Promise<ProtectedPreview> {
  const tokens = getTokens();
  // FileResponse is returned directly by the API view. Asking DRF for two
  // concrete media types makes its content negotiation reject the response
  // with 406 before FileResponse can be returned. The client validates the
  // actual response Content-Type below, so accept any response here.
  const headers = new Headers({ Accept: '*/*' });
  if (tokens?.access) headers.set('Authorization', `Bearer ${tokens.access}`);
  const response = await fetch(`${API_ROOT}${path}`, { headers });
  if (response.status === 401 && retry && tokens?.refresh) {
    if (await refreshAccessToken(tokens.refresh)) return requestPreview(path, fallbackFilename, false);
    clearTokens();
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as unknown;
    throw new ApiError(errorMessage(payload, 'Could not open this CV.'), response.status, payload);
  }
  const responseType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (responseType !== 'application/pdf' && responseType !== 'text/plain') {
    throw new ApiError('This CV returned an unsupported preview format.', response.status);
  }
  return {
    blob: await response.blob(),
    filename: responseFilename(response.headers.get('Content-Disposition'), fallbackFilename),
    contentType: responseType,
  };
}

export function saveProtectedDownload(file: ProtectedDownload): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

async function list<T>(path: string): Promise<T[]> {
  const data = await request<ResultsPage<T> | T[]>(path);
  return Array.isArray(data) ? data : data.results;
}

export const api = {
  register: (input: RegisterInput) =>
    request<{ id: number }>('/users/register/', json('POST', input)),
  login: (username: string, password: string) =>
    request<{ access: string; refresh: string; user: UserProfile }>('/users/login/', json('POST', { username, password })),
  requestPasswordReset: (email: string) =>
    request<{ detail: string }>('/users/password-reset/', json('POST', { email })),
  confirmPasswordReset: (input: { uid: string; token: string; new_password: string; confirm_password: string }) =>
    request<{ detail: string }>('/users/password-reset/confirm/', json('POST', input)),
  profile: () => request<UserProfile>('/users/profile/'),
  updateProfile: (input: Partial<Pick<UserProfile, 'location' | 'company_name' | 'company_website' | 'bio' | 'github_url' | 'linkedin_url' | 'years_experience' | 'is_open_to_work'>>) =>
    request<UserProfile>('/users/profile/', json('PUT', input)),
  developerCV: () => request<DeveloperCV>('/users/profile/cv/'),
  uploadDeveloperCV: (file: File) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return request<DeveloperCV>('/users/profile/cv/', { method: 'POST', body: formData });
  },
  deleteDeveloperCV: () => request<void>('/users/profile/cv/', { method: 'DELETE' }),
  downloadDeveloperCV: (filename = 'developer-cv') => requestDownload('/users/profile/cv/download/', filename),
  previewDeveloperCV: () => requestPreview('/users/profile/cv/preview/', 'developer-cv'),
  downloadApplicationCV: (applicationId: number) => requestDownload(`/jobs/applications/${applicationId}/cv/`, 'developer-cv'),
  previewApplicationCV: (applicationId: number) => requestPreview(`/jobs/applications/${applicationId}/cv/preview/`, 'developer-cv'),
  skills: () => list<Skill>('/users/skills/'),
  addSkill: (name: string) => request<Skill>('/users/profile/skills/', json('POST', { name })),
  removeSkill: (skillId: number) => request<void>('/users/profile/skills/', json('DELETE', { skill_id: skillId })),
  matches: () => request<ResultsPage<JobMatch>>('/users/job-matches/'),
  developers: (jobId?: number, search?: string) => {
    const params = new URLSearchParams();
    if (jobId) params.set('job', String(jobId));
    if (search) params.set('search', search);
    return request<ResultsPage<DeveloperMatch>>(`/users/developers/${params.size ? `?${params}` : ''}`);
  },
  stats: () => request<PublicStats>('/public/stats/'),
  roleTemplates: () => request<{ templates: RoleTemplate[] }>('/jobs/role-templates/'),
  jobs: (filters: { search?: string; location_type?: string; skill?: string } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return list<Job>(`/jobs/${params.size ? `?${params}` : ''}`);
  },
  job: (id: number) => request<Job>(`/jobs/${id}/`),
  createJob: (input: { title: string; description: string; salary_range: string; location_type: string; required_skill_ids: number[] }) =>
    request<Job>('/jobs/', json('POST', input)),
  updateJob: (id: number, input: { title: string; description: string; salary_range: string; location_type: string; required_skill_ids: number[] }) =>
    request<Job>(`/jobs/${id}/`, json('PATCH', input)),
  deleteJob: (id: number) => request<void>(`/jobs/${id}/`, json('DELETE')),
  apply: (jobId: number) => request<{ id: number; job_id: number; status: string; applied: boolean }>(`/jobs/${jobId}/apply/`, json('POST', {})),
  myJobs: () => list<Job>('/jobs/my-jobs/'),
  applications: () => list<Application>('/jobs/applications/'),
  employerDashboard: () => request<EmployerDashboard>('/jobs/dashboard/'),
  updateApplication: (id: number, status: ApplicationStatus) => request<Application>(`/jobs/applications/${id}/status/`, json('PUT', { status })),
  applicationMessages: (id: number) => list<ApplicationMessage>(`/jobs/applications/${id}/messages/`),
  sendApplicationMessage: (id: number, body: string) => request<ApplicationMessage>(`/jobs/applications/${id}/messages/`, json('POST', { body })),
  notifications: () => request<NotificationFeed>('/notifications/'),
  markNotificationRead: (id: number) => request<void>(`/notifications/${id}/read/`, json('POST', {})),
  markAllNotificationsRead: () => request<void>('/notifications/read-all/', json('POST', {})),
  connections: () => list<Connection>('/network/connections/'),
  connect: (receiverId: number) => request<Connection>('/network/connections/', json('POST', { receiver_id: receiverId })),
  acceptConnection: (id: number) => request<Connection>(`/network/connections/${id}/accept/`, json('POST', {})),
};

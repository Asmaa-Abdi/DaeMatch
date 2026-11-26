export type Role = 'developer' | 'employer';
export type LocationType = 'remote' | 'onsite' | 'hybrid';
export type ApplicationStatus = 'pending' | 'reviewed' | 'accepted' | 'rejected';

export interface Skill {
  id: number;
  name: string;
}

export interface RoleTemplate {
  role: string;
  skills: string[];
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: Role;
  location: string;
  company_name: string;
  company_website: string;
  bio: string;
  github_url: string;
  linkedin_url: string;
  years_experience: number;
  is_open_to_work: boolean;
  skills: Skill[];
}

export interface DeveloperCV {
  available: boolean;
  filename: string | null;
  content_type: string | null;
  size_bytes: number;
  updated_at: string | null;
}

export type RegisterInput =
  | { role: 'developer'; username: string; email: string; password: string; location: string }
  | { role: 'employer'; email: string; company_website: string; company_name: string; location: string; password: string };

export interface Job {
  id: number;
  employer: number;
  employer_name: string;
  title: string;
  description: string;
  salary_range: string;
  location_type: LocationType;
  required_skills: Skill[];
  created_at: string;
  application_count: number;
  has_applied: boolean;
}

export interface JobMatch extends Omit<Job, 'employer' | 'employer_name' | 'application_count'> {
  employer: string;
  employer_location?: string;
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  developer_skill_count: number;
  required_skill_count: number;
}

export interface Applicant {
  id: number;
  username: string;
  location: string;
  bio: string;
  years_experience: number;
  skills: Skill[];
  github_url: string;
  linkedin_url: string;
  has_cv: boolean;
}

export interface Application {
  id: number;
  job: { id: number; title: string; employer_name: string; location_type: LocationType; salary_range: string; required_skills: Skill[] };
  applicant: Applicant;
  status: ApplicationStatus;
  cover_letter: string;
  applied_at: string;
  match_score: number;
}

export interface ApplicationMessage {
  id: number;
  application_id: number;
  sender_id: number;
  sender_name: string;
  body: string;
  created_at: string;
}

export interface DeveloperMatch extends Applicant {
  match_score: number;
}

export interface EmployerDashboard {
  jobs_posted: number;
  total_applicants: number;
  available_developers: number;
  my_jobs: Job[];
  top_applicants: Application[];
}

export interface Connection {
  id: number;
  sender: { id: number; username: string; location: string };
  receiver: { id: number; username: string; location: string };
  status: 'pending' | 'accepted';
  created_at: string;
}

export type NotificationEventType = 'application_received' | 'application_accepted' | 'application_rejected' | 'job_match_high';

export interface AppNotification {
  id: number;
  event_type: NotificationEventType;
  application_id: number | null;
  job_id: number;
  job_title: string;
  applicant_name: string | null;
  employer_name: string;
  message: string;
  match_score: number | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationFeed {
  unread_count: number;
  notifications: AppNotification[];
}

export interface PublicStats {
  users: number;
  developers: number;
  employers: number;
  jobs: number;
  match_rate: number | null;
}

export interface ResultsPage<T> {
  count: number;
  results: T[];
}

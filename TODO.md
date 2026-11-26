# DAEMatch delivery checklist

## Public landing page and brand — complete
- [x] Build a public landing page for DAEMatch (Developer And Employer Match), branded for Amana Software (AMS) with the tagline “Where Developers Meet Employers.” Include a navbar with logo, Login and Register; a hero section with tagline and CTA buttons; statistics for users, jobs and match rate that are database-derived rather than fabricated; features for AI matching, skills-based matching, Africa focus and fast apply; a four-step How it works section; Developer versus Employer cards; an AMS-branded footer; and a pricing section that clearly says “Pricing is coming soon,” does not display plan prices, and links visitors to join/register. The proposed business-model tiers remain planning content only; checkout is not implemented.
- [x] Add a subtle animation to the landing hero’s Full-stack developer profile card and match bar; respect `prefers-reduced-motion` by disabling the motion when reduced motion is requested.
- [x] Preserve the target-market sequence: Phase 1 Somali developers, Phase 2 African developers, Phase 3 global tech market.
- [x] Apply the requested clean, minimal, professional sans-serif design; use #1565c0 as primary brand color; make layouts responsive on mobile.
- [x] Add subtle, easy-to-follow motion to the home-page “Full-stack developer,” “AI-powered fit,” and “Product Engineer” elements and the “One platform, two clear paths” section; keep all text readable and honor `prefers-reduced-motion`.
- [x] Redesign the hero motion as one understandable journey—developer skills → AI match → Product Engineer role—instead of separately floating cards; retain the reduced-motion static state, readable labels and responsive layout.

## Hero animation refinement — complete
- [x] Restore the earlier hero animation style: an orbital motif with gently floating Full-stack developer profile, AI-powered fit badge and Product Engineer card, plus a short match-bar reveal. Remove the newer travelling skills-to-role connector sequence. Preserve readable labels, responsive layout, the “One platform, two clear paths” reveal, and a static state for `prefers-reduced-motion`.

## Accounts, registration and login — complete
- [x] Implement User extending AbstractUser with role `developer` or `employer`, location, company name and company website fields. Provide separate registration forms: Developer collects username, email, password and location; Employer collects email, company website, company name, location and password, with no username input. Persist employer company details, create a related developer profile only for developers, and redirect either successful registration to Login. Generate an internal unique employer username from the email to satisfy Django's user model.
- [x] Implement login using JWT with `djangorestframework-simplejwt`; developers sign in with username/password and employers with email/password. Return/store JWT tokens in browser `localStorage`, use them for authenticated API requests, and redirect to the role-appropriate Dashboard after login. Include logout and authenticated versus logged-out states.
- [x] Enforce role restrictions so developer-only and employer-only pages/actions cannot be used by the other role.

## Password recovery — complete
- [x] Add a visible “Forgot password?” link on login and a public request form where the user enters email. Submit to a public password-reset request API and always show the same neutral confirmation, whether or not the email is registered. Queue the same asynchronous work path for every submitted address so response timing does not disclose whether an account exists.
- [x] Send a one-time password-reset link to the configured frontend `FRONTEND_URL`; use an expiring Django reset token. Provide a public confirmation route that accepts the token and UID, asks for a new password and confirmation, validates it with Django password validators, changes the password only when the token is valid, and gives a success message with a path back to Login. Invalid, expired or already-used tokens must not change the password. Validate the token and update the password atomically while locking the user row so simultaneous confirmations cannot both consume the token.
- [x] Configure local email delivery through Django's console backend and production email through environment-configured SMTP; include placeholder-only settings in `.env.example` and document provider setup in `README.md`. Build reset links from explicit `FRONTEND_URL`, never the internal request Host. Declare `/forgot-password` and `/reset-password/:uid/:token` in the route manifest.

## Developer dashboard — complete
- [x] On the private Dashboard, show a navbar with the active link indicator, a welcome message and open-to-work status, stats for job count, match count and skill count, the three latest jobs, the three highest-scoring AI matches, and links to see all jobs/matches.

## Jobs, posting and applications — complete
- [x] On the private Jobs page, list all jobs and support search/filter. Each job card shows title, employer, location type, salary, required skills and date posted. When a developer clicks Apply, show a job-details confirmation dialog with the employer, location type, salary, posting date, full description and required skills; submit only when the developer confirms Apply in that dialog. Closing the dialog cancels, and a successful application shows the Applied state.
- [x] Employer users can post a job using title, description, salary, location type and required skills. Job fields include employer, title, description, salary range, location type (`remote`, `onsite` or `hybrid`), required skills and `created_at`.
- [x] Implement JobApplication with job, applicant, status (`pending`, `reviewed`, `accepted` or `rejected`), cover letter and `applied_at`; enforce unique job+applicant applications.

## Employer job editing and deletion — complete
- [x] An employer can edit only jobs they own, using the existing job form to update title, description, salary range, location type and required skills. Implement `PATCH /api/jobs/<id>/` while preserving the job's employer and created-at fields; developers and other employers cannot edit it.
- [x] An employer can delete only jobs they own through `DELETE /api/jobs/<id>/`. Ask for confirmation and explicitly warn that deleting the job permanently removes its applications; reject developer and non-owner attempts, and remove the job and its applications only after confirmation.

## Developer AI matches — complete
- [x] Provide a private, developer-only AI Matches page with total match count, a color-coded legend (green 75%+, orange 50–74%, red below 50%), and ranked cards showing rank badge (#1, #2, #3…), job title, employer, animated progress bar, match score percentage, required skills and salary range. If there are no matches, show an empty state linking to add skills; when a developer has no profile skills, show this add-skills empty state rather than zero-score cards.
- [x] Implement skills-based matching as matched unique required skills divided by all unique required skills, multiplied by 100; normalize skill names case-insensitively, ignore unrelated extra profile skills, return zero when profile skills or role requirements are empty, round to one decimal place, and sort jobs by match score descending.
- [x] Explain each score by showing matched and missing unique required skills, exact matched/required counts, and the required-skill coverage calculation; state when a role has no required skills. Recalculate scores from current profile skills after a developer adds or removes skills, provide an easy refresh control, and link score explanations from Dashboard summaries to the detailed Matches page.

## AI Match accuracy — complete
- [x] Make the displayed score accurately represent role fit by calculating matched unique required skills divided by unique required skills, times 100; normalize names case-insensitively and ignore unrelated extra profile skills. Reuse the same calculation in developer matches, dashboard summaries, employer applicant reports and high-match alerts; return zero when no required skills or no profile skills exist; show the exact matched/required counts and recalculate after skill or job requirement changes.

## Developer profile and skills — complete
- [x] Provide a private Profile page with initials avatar, username, email and open-to-work status. The edit form supports bio, GitHub URL, LinkedIn URL, years of experience and the open-to-work toggle.
- [x] The profile supports adding a skill by typing or using quick-add buttons, removing a skill with an × button, and shows quick stats. Common skills include Python, Django, FastAPI, PostgreSQL, ML, React, JavaScript and Docker.
- [x] Implement DeveloperProfile one-to-one with User, containing bio, `github_url`, `linkedin_url`, `years_experience`, skills many-to-many Skill, and `is_open_to_work`. Implement Skill with unique name.

## Developer CV upload — complete
- [x] Let an authenticated developer upload, replace, remove and download one CV from the developer profile; accept only valid PDF or DOCX files up to 5 MiB, and validate file type/signature and sanitize the filename server-side. Store bytes and metadata durably in PostgreSQL, return metadata rather than file bytes in profile/application responses, and do not expose a public file URL. Allow private attachment downloads only to the CV owner or an employer whose own job received that developer's application; show the download action in that employer's applicant report only when a CV exists.

## CV preview — complete
- [x] When the developer selects View CV in their profile, open a private in-app preview: render PDFs inline and show DOCX text as safely escaped, read-only text with a note that formatting may differ. In the employer's report for an application they received, provide the same View CV action. Keep existing download support; require authentication and allow only the CV owner or the employer who owns the applied-to job; never expose public URLs or cache document bytes.

## Employer dashboard and applicant matching — complete
- [x] Provide an employer-only dashboard with stats for jobs posted, total applicants and available developers; show the employer's jobs with applicant counts and top applicants with AI match scores.
- [x] Display employer applicants with each applicant's fit score computed by the same unique required-skill coverage approach used by developer matches and high-match alerts.
- [x] Add a clearly labelled option on the employer dashboard to view all applications received for jobs owned by the signed-in employer, not only the top-ranked applicants; show each application with its applicant and associated job.
- [x] In the employer's all-applications view, separate applicants into Review, Accepted and Connect filters; Connect includes applicants with a pending request in either direction or an accepted connection between the employer and developer.
- [x] When the employer selects Review for an applicant, open that developer's report showing available profile details (bio, location, years of experience, skills, GitHub/LinkedIn links), the job applied for, cover letter, match score and application status; mark pending applications as reviewed and retain the existing accept/reject/connect actions. The keyboard-accessible report moves focus inside, traps Tab navigation, closes on Escape and restores focus to the control that opened it.

## Application notifications and incoming-app access — complete
- [x] When a developer creates a job application, send a persistent in-app “new application” notification to the employer who owns that job; repeated apply requests must not create duplicate applications or duplicate notifications.
- [x] When an employer accepts an application, send a persistent in-app acceptance notification to the developer who applied.
- [x] Authenticated users can open a notification center that shows their unread count and recent notifications, mark a notification or all notifications as read, and only view their own notifications.
- [x] Clearly label the employer's application panel “Incoming applications” and allow the new-application notification to open the employer dashboard where the full application list can be viewed.

## Employer incoming-application search — complete
- [x] In the employer's complete incoming-applications list, search by developer username, job title, applicant skills, location or application status; search results compose with the existing Review, Accepted and Connect filters and show a clear no-results state.

## Gmail inbox delivery and OAuth2 fallback — open
- [x] Django uses Gmail API OAuth2 only when all three protected OAuth values are configured; partial OAuth configuration is rejected; without OAuth, `EMAIL_HOST` selects generic SMTP and no provider settings select the local console backend. SMTP settings, OAuth values and sender address are read from runtime environment, never committed as credentials.
- [x] Store SMTP provider settings and the sender address in protected environment values, without committing the credentials.
- [x] Retry one test email using the newly supplied app password and the official Gmail SMTP endpoint; the SMTP connection closed (`SMTPServerDisconnected`) and no message was accepted.
- [x] The Gmail API OAuth2 backend calls `users.messages.send` with the send-only `https://www.googleapis.com/auth/gmail.send` scope, refreshes short-lived access tokens from protected OAuth credentials, auto-selects only when `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_OAUTH_REFRESH_TOKEN` are all present, rejects partial configuration, preserves SMTP/console fallbacks and reports sanitized errors. Django checks and all 28 backend tests pass, including token refresh, MIME payload encoding and provider-error sanitization.
- [ ] The account owner enables Gmail API, configures OAuth consent, authorizes the intended sender for the `gmail.send` scope, and supplies the client ID, client secret and refresh token through protected input; then confirm one test message is accepted by Gmail and arrives in the authorized inbox. Public OAuth apps may require Google's sensitive-scope verification.
- [ ] If OAuth2 cannot be used, a Google Workspace administrator configures `smtp-relay.gmail.com`, allowed senders and TLS plus approved IP or authentication rules in Admin Console; the app must use only that approved relay configuration. No relay/admin policy or stable cloud egress IP is assumed.

## Email delivery, rejection and accepted-application chat — complete
- [x] When a developer submits a new application, email the employer who owns the job; when an employer accepts or rejects an application, email the developer who applied. Include the job and a link to the relevant application, dashboard or conversation.
- [x] Persist each email as a database outbox delivery in the same transaction as its notification, then send asynchronously after commit using Django mail settings; track attempts/errors, retry transient failures with backoff and provide `manage.py send_pending_notification_emails` to recover pending work after a process restart. Email failure must not undo an application or employer decision. Local development may use the console backend; hosted deployment must configure Gmail API OAuth2 or SMTP/approved Workspace relay credentials in protected variables and schedule the retry command.
- [x] Give employers an explicit Reject action for their pending/reviewed applications. Rejecting saves `rejected` status and sends the applicant a persistent in-app notification and email; repeated requests must not create duplicate rejection notifications or emails.
- [x] When an employer accepts an application, enable a persistent chat for that application between only its applicant and owning employer. Both participants can view the conversation history and send messages; pending or rejected applications cannot be used to read or send chat messages.
- [x] Provide both roles with a Messages page listing accepted applications, opening a selected thread, loading existing messages, sending messages and refreshing the open conversation; acceptance notifications/email can open the relevant thread.

## High-match email notifications — complete
- [x] When a developer-skill change or employer job create/edit triggers a match evaluation, if the required-skill coverage score is strictly above 85% for a job the developer has not applied to, create one private in-app notification and one durable email-outbox delivery for that developer/job pair; include job title, the match score at alert time and a link to that job's AI match. Do not alert at exactly 85%, repeatedly on reads, or more than once for the same pair; recover pending delivery with the existing retry command.

## Connections, referrals and API contract — complete
- [x] Implement Connection with sender and receiver foreign keys to User and status (`pending` or `accepted`); support viewing connections, sending connection requests and accepting requests.
- [x] Implement Referral with referrer and candidate foreign keys to User, a job foreign key to Job, and status.
- [x] Provide these routes and methods: `POST /api/users/register/`; `POST /api/users/login/`; `GET /api/users/profile/`; `PUT /api/users/profile/`; `POST /api/users/profile/skills/`; `DELETE /api/users/profile/skills/`; `GET /api/users/skills/`; `GET /api/users/job-matches/`; `GET /api/jobs/`; `POST /api/jobs/`; `GET /api/jobs/<id>/`; `POST /api/jobs/<id>/apply/`; `GET /api/jobs/my-jobs/`; `GET /api/jobs/applications/`; `GET|POST /api/jobs/applications/<id>/messages/`; `GET /api/notifications/`; `POST /api/notifications/<id>/read/`; `POST /api/notifications/read-all/`; `GET /api/network/connections/`; `POST /api/network/connections/`; `POST /api/network/connections/<id>/accept/`.

## Python dependency security update — complete
- [x] Upgrade Django and all Python runtime dependencies to the latest stable, Python 3.12-compatible security releases; pin the complete resolved dependency set and resolve all supported dependency vulnerabilities reported by the security audit while preserving a working application build.

## PostgreSQL, Preview and Railway/Vercel readiness — complete (external deployment not performed)
- [x] Keep Django + Django REST Framework, PostgreSQL, SimpleJWT, the shared required-skill coverage matcher and React.js as the selected stack. Use PostgreSQL for local Preview and the Railway production database; do not substitute the Manus-managed MySQL database.
- [x] Make the Vite/React interface available through Preview on the project's configured port and the Django REST API on a separately declared port; configure a same-origin `/api` proxy for browser requests. Keep local credentials out of Git and provide an `.env.example` with placeholders.
- [x] Include Railway backend and Vercel frontend deployment configuration and setup instructions. External publication depends on provider access and required production environment values; do not state that either provider is deployed unless that is confirmed.

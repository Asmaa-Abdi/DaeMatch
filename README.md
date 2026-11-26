# DAEMatch — Developer And Employer Match

DAEMatch is Amana Software's skills-first hiring platform for Somali and African technology talent. It connects developers with relevant opportunities using explainable required-skill coverage scores: matched unique role requirements divided by all unique role requirements. Extra profile skills do not reduce a score. The public tagline is **“Where Developers Meet Employers.”**

## Stack and layout

- `frontend/`: React, TypeScript, Vite and responsive role-specific screens.
- `backend/`: Django, Django REST Framework, SimpleJWT, PostgreSQL and a shared Python required-skill coverage matcher.
- `backend/apps/accounts/`: users, developer profiles, skill catalog, JWT/profile APIs.
- `backend/apps/jobs/`: jobs, applications, accepted-application messages, match scoring and employer dashboard.
- `backend/apps/network/`: connections and referrals.
- `backend/apps/notifications/`: recipient-scoped in-app notifications and asynchronous transactional email delivery.
- Root deployment files: `backend/Dockerfile`, `railway.toml`, `vercel.json`.

Pricing displayed in the app is informational; checkout and subscription enforcement are not implemented.

## Local development

Prerequisites: Python 3.12+, Node.js 22+, pnpm 11+, and PostgreSQL. From the repository root:

```bash
cp .env.example .env
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
pnpm install
```

For a disposable development machine where `sudo` is available, run `bash scripts/setup-local-db.sh` after copying `.env.example` (the `pnpm dev` command also runs it automatically). It creates the local `daematch` role and database, grants that local role permission to create Django's isolated test database, and replaces the example values with a generated database password and Django `SECRET_KEY` stored only in ignored `.env`. The helper is for local development only; it does not touch a remote PostgreSQL server. `pnpm dev` refuses to start when `DATABASE_URL` points to a non-local host, preventing Preview migrations/seeding from modifying Railway or another production database. Use only a disposable local PostgreSQL database for development and tests.

Start both local services with:

```bash
pnpm dev
```

Vite/Preview listens on port `3000`; Django's API listens separately on port `8000`. Vite proxies `/api` and `/health/` to Django. The startup script applies migrations and idempotently seeds Python, Django, FastAPI, PostgreSQL, ML, React, JavaScript and Docker as common skills.

Password-reset and application notification emails use Django's console email backend locally when no provider is configured, so the development terminal prints messages instead of delivering them to inboxes. Hosted environments must configure either all three Gmail API OAuth2 values or a supported SMTP/Workspace relay provider in their protected environment to deliver to account email addresses. Application and high-match emails are recorded in a database outbox before asynchronous delivery; transient failures retry with backoff. A high-match alert is generated when a developer skill change or employer job create/edit results in a score strictly above 85% for a role the developer has not applied to; it is stored once per developer/job pair and links to that role's AI match. From the repository root, recover due or interrupted deliveries with `.venv/bin/python backend/manage.py send_pending_notification_emails` (add `--retry-failed` for permanently failed items); schedule the equivalent command periodically in production so pending work survives web-process restarts.

## API overview

- Accounts: `POST /api/users/register/` accepts role-specific fields (developer: username, email, password, location; employer: email, company website, company name, location, password). `POST /api/users/login/` accepts a developer username or employer email plus password; employer company name and website are returned and editable through `GET|PUT /api/users/profile/`. Password recovery uses `POST /api/users/password-reset/` to request a reset email and `POST /api/users/password-reset/confirm/` with `uid`, `token`, `new_password` and `confirm_password` to complete a reset. The account APIs also include `POST /api/users/token/refresh/`, `POST|DELETE /api/users/profile/skills/`, and `GET /api/users/skills/`.
- Developer CVs: `GET|POST|DELETE /api/users/profile/cv/` manages one private CV; `GET /api/users/profile/cv/download/` downloads the developer's own file; `GET /api/users/profile/cv/preview/` returns an authenticated inline PDF or extracted DOCX text preview. `GET /api/jobs/applications/<id>/cv/` downloads a CV, while `GET /api/jobs/applications/<id>/cv/preview/` previews it only for that applicant or the employer who received their application. Accept valid PDF/DOCX files up to 5 MiB, validate them server-side, store bytes in PostgreSQL, and return private no-store responses. Profile and application metadata APIs expose no file bytes or public URL.
- Matching: `GET /api/users/job-matches/` (developer role; includes matched and missing unique requirements, exact matched/required counts and the coverage-score explanation); `GET /api/users/developers/` (employer role; optional `job` and `search` query parameters). Employer applicant ranking, dashboard scores and high-match alerts use the same coverage function.
- Jobs: `GET|POST /api/jobs/`, `GET|PATCH|DELETE /api/jobs/<id>/`, `GET /api/jobs/role-templates/`, `POST /api/jobs/<id>/apply/`, `GET /api/jobs/my-jobs/`, `GET /api/jobs/applications/`, `GET /api/jobs/dashboard/`, employer-only `PUT /api/jobs/applications/<id>/status/`, and `GET|POST /api/jobs/applications/<id>/messages/` for accepted-application conversations. Only the applicant and owning employer can access a conversation, and only while the application is accepted. `GET /api/jobs/role-templates/` returns Backend Developer, Java Developer, Frontend Developer, DevOps Engineer, ML Engineer, Mobile Developer and QA Automation templates. Employer job creation and any update that supplies `required_skill_ids` must include at least three required skills; the UI can populate them from a selected role template. `PATCH /api/jobs/<id>/` accepts `title`, `description`, `salary_range`, `location_type` and `required_skill_ids` (an array of skill IDs); `employer` and `created_at` remain read-only. Only the owning employer can edit or delete a job. `DELETE` permanently removes the job and its applications through the database cascade; the UI confirms deletion and warns about the permanent application removal.
- Notifications: `GET /api/notifications/`, `POST /api/notifications/<id>/read/`, and `POST /api/notifications/read-all/`. New applications notify the job owner; accepted/rejected decisions notify the developer; qualifying high AI matches notify the developer with the saved score. Those events queue durable email through the configured Gmail API OAuth2 backend or generic SMTP backend.
- Connections: `GET|POST /api/network/connections/`, `POST /api/network/connections/<id>/accept/`.
- Health: `GET /health/` (public); landing statistics: `GET /api/public/stats/` (public).

JWT access and refresh tokens are stored in browser `localStorage` as requested. Use HTTPS and a strong production `SECRET_KEY` for hosted deployments.
When `DEBUG=false`, Django redirects non-HTTPS requests and enables one-year HSTS plus secure session/CSRF cookies; production domains must remain HTTPS. These protections stay disabled for the local HTTP Preview (`DEBUG=true`).

## Local checks

Run from the repository root:

```bash
set -a; source .env; set +a
.venv/bin/python backend/manage.py check
.venv/bin/python backend/manage.py test apps.accounts.tests apps.jobs.tests apps.network.tests apps.notifications.tests
pnpm --filter daematch-frontend typecheck
pnpm --filter daematch-frontend build
```

The Django test runner uses an isolated test database; it does not use the application database for test writes.

## Railway backend deployment

1. Create a Railway project and add a PostgreSQL service. Deploy the repository with the root directory as the build context; `railway.toml` selects `backend/Dockerfile`.
2. Attach/provide Railway's PostgreSQL connection string as `DATABASE_URL` for the Django service.
3. Set the Django service variables in Railway's protected Variables panel:
   - `SECRET_KEY`: generate a unique, private Django key (never commit it).
   - `DEBUG=false`.
   - `ALLOWED_HOSTS=<your-api-domain>` (include any additional API custom domain you configure).
   - `CORS_ALLOWED_ORIGINS=https://<your-vercel-domain>`.
   - `FRONTEND_URL=https://<your-vercel-domain>` (exact frontend origin with no trailing slash; password-reset and application emails link here).
   - Preferred Gmail fallback: enable the Gmail API in a Google Cloud project, configure its OAuth consent screen, and authorize the sender account with only the `https://www.googleapis.com/auth/gmail.send` scope. Create an OAuth client and complete an authorization-code flow with `access_type=offline` so Google returns a refresh token. Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_OAUTH_REFRESH_TOKEN` in protected Variables; the Django backend selects Gmail API OAuth2 when all three are present and refreshes access tokens at send time. Keep `DEFAULT_FROM_EMAIL` to the account or a verified sender alias. Google classifies `gmail.send` as a sensitive scope, so a public OAuth app may need verification; a Workspace-only app can be restricted to the organization's users. See [Gmail send API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send), [Gmail API scope guidance](https://developers.google.com/workspace/gmail/api/auth/scopes), and [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server).
   - If your Workspace administrator prefers SMTP relay, they must first configure and authorize it in Admin Console. Use `smtp-relay.gmail.com` with TLS on port 587 and the administrator-approved sender/authentication policy. IP authentication requires the cloud service's public egress IP to be allowed; confirm that address is stable before selecting this route. See [Google Workspace SMTP relay setup](https://knowledge.workspace.google.com/admin/gmail/advanced/route-outgoing-smtp-relay-messages-through-google). Webdev project secrets do not sync into Railway; configure the chosen provider's values separately there.
   - Add a Railway scheduled job that runs `python backend/manage.py send_pending_notification_emails` periodically to recover durable email outbox records after transient failures or process restarts. Use `--retry-failed` only when manually retrying terminal failures.
   - `PASSWORD_RESET_TIMEOUT=3600` for a one-hour reset-link lifetime.
   - `CSRF_TRUSTED_ORIGINS=https://<your-vercel-domain>` if using Django's browser-protected admin routes.
   - `DB_SSL_REQUIRE=true` only if your selected PostgreSQL endpoint requires SSL; Railway's provided connection string takes precedence.
4. Railway starts the container, applies migrations, seeds the common skills, collects static files and runs Gunicorn on Railway's `PORT`. Its health check is `GET /health/`.

## Vercel frontend deployment

1. Import the same repository into Vercel with the repository root as the project root. `vercel.json` installs the pnpm workspace, builds the React frontend and publishes `frontend/dist`; the rewrite supports React Router page paths.
2. Set `VITE_API_BASE_URL=https://<your-api-domain>` in Vercel's environment variables (no trailing slash and no `/api` suffix). The client appends `/api` automatically.
3. Set Railway's `CORS_ALLOWED_ORIGINS` to the exact public Vercel origin, then redeploy the backend if you changed its Variables. Add any Vercel custom domain to that allowlist as well.

External Railway/Vercel publication is not performed by this repository setup; it requires your provider accounts, Git connection, PostgreSQL service, domain and protected production variables. The landing-page pricing is not a payment integration.

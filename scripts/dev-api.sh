#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -x .venv/bin/python ]]; then
  echo "Python environment missing. Install backend/requirements.txt first." >&2
  exit 1
fi

# Preview and production both use PostgreSQL. Provide DATABASE_URL through the
# managed environment or an ignored project-root .env file; never fall back to
# SQLite because it hides PostgreSQL compatibility and does not persist data.
export DEBUG=true
export SECRET_KEY="${SECRET_KEY:-daematch-managed-preview-only-key}"
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required and must point to PostgreSQL (postgresql://...)." >&2
  exit 1
fi
case "$DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *)
    echo "DATABASE_URL must use PostgreSQL (postgres:// or postgresql://); SQLite and MySQL are not supported." >&2
    exit 1
    ;;
esac
export DB_SSL_REQUIRE="${DB_SSL_REQUIRE:-false}"
export ALLOWED_HOSTS="${ALLOWED_HOSTS:-localhost,127.0.0.1}"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://localhost:3000}"
export CSRF_TRUSTED_ORIGINS="${CSRF_TRUSTED_ORIGINS:-http://localhost:3000}"

.venv/bin/python backend/manage.py migrate --noinput
.venv/bin/python backend/manage.py bootstrap_skills
exec .venv/bin/python backend/manage.py runserver 0.0.0.0:8000 --noreload

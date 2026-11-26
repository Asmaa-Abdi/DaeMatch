#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -x .venv/bin/python ]]; then
  echo "Python environment missing. Create it and install backend/requirements.txt first." >&2
  exit 1
fi

bash scripts/setup-local-db.sh

if [[ -f .env ]]; then
  set -a
  # Local-only variables from the ignored .env file.
  source .env
  set +a
fi

DB_HOST="$(.venv/bin/python - <<'PY'
import os
from urllib.parse import urlsplit
print(urlsplit(os.environ.get('DATABASE_URL', '')).hostname or '')
PY
)"
if [[ "$DB_HOST" != "127.0.0.1" && "$DB_HOST" != "localhost" ]]; then
  echo "Refusing to start Preview with non-local DATABASE_URL ($DB_HOST). Configure a disposable local PostgreSQL database first." >&2
  exit 1
fi

.venv/bin/python backend/manage.py migrate --noinput
.venv/bin/python backend/manage.py bootstrap_skills

.venv/bin/python backend/manage.py runserver 0.0.0.0:8000 &
API_PID=$!
cleanup() {
  kill "$API_PID" 2>/dev/null || true
  wait "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pnpm --filter daematch-frontend dev

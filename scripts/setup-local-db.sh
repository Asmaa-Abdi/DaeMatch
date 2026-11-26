#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  sudo pg_ctlcluster 16 main start
fi

# Preserve an existing local daematch password; otherwise generate one that never enters Git.
DB_PASSWORD="$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlsplit
import re, secrets
text = Path('.env').read_text()
match = re.search(r'^DATABASE_URL=(.*)$', text, re.MULTILINE)
if match:
    raw = match.group(1).strip().strip('"\'')
    parsed = urlsplit(raw)
    if parsed.hostname in {'127.0.0.1', 'localhost'} and parsed.path == '/daematch' and parsed.username == 'daematch' and parsed.password not in {None, 'GENERATED_BY_LOCAL_SETUP'}:
        print(parsed.password)
    else:
        print(secrets.token_urlsafe(32))
else:
    print(secrets.token_urlsafe(32))
PY
)"

sudo -u postgres psql -v ON_ERROR_STOP=1 -v role_password="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE daematch WITH LOGIN CREATEDB PASSWORD %L', :'role_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daematch')
\gexec
ALTER ROLE daematch WITH LOGIN CREATEDB PASSWORD :'role_password';
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='daematch'" | grep -q 1; then
  sudo -u postgres createdb --owner=daematch daematch
fi

DB_PASSWORD="$DB_PASSWORD" python3 - <<'PY'
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit
import os, re, secrets
path = Path('.env')
text = path.read_text()
password = os.environ['DB_PASSWORD']
match = re.search(r'^DATABASE_URL=(.*)$', text, re.MULTILINE)
if match:
    raw = match.group(1).strip().strip('"\'')
    parsed = urlsplit(raw)
    if parsed.hostname in {'127.0.0.1', 'localhost'} and parsed.path == '/daematch':
        host = parsed.hostname
        port = parsed.port or 5432
        netloc = f'daematch:{quote(password, safe="")}@{host}:{port}'
        local_url = urlunsplit((parsed.scheme or 'postgresql', netloc, '/daematch', parsed.query, parsed.fragment))
        text = re.sub(r'^DATABASE_URL=.*$', 'DATABASE_URL=' + local_url, text, count=1, flags=re.MULTILINE)
if re.search(r'^SECRET_KEY=replace-this-local-development-key-before-deploying$', text, re.MULTILINE):
    text = re.sub(r'^SECRET_KEY=.*$', 'SECRET_KEY=' + secrets.token_urlsafe(48), text, count=1, flags=re.MULTILINE)
path.write_text(text)
PY

echo "Local DAEMatch PostgreSQL is ready at 127.0.0.1:5432/daematch; its generated credential is stored only in ignored .env."

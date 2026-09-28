#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail(){ printf 'Local setup: %s\n' "$1" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node.js >=22.16 is required."
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<16))process.exit(1)' ||
  fail "Node.js >=22.16 is required; found $(node --version)."
command -v npm >/dev/null 2>&1 || fail "npm is required."
command -v docker >/dev/null 2>&1 || fail "Docker is unavailable. Install and start Docker Desktop/Engine, then rerun npm run dev:local."
docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is required."

if [[ ! -f .env ]]; then
  cp .env.example .env
  node --input-type=module <<'NODE'
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
let env=readFileSync('.env','utf8');
for (const [key,value] of [['JWT_SECRET',randomBytes(48).toString('base64url')],['AUTH_ABUSE_KEY',randomBytes(48).toString('base64url')]]) {
  const line=new RegExp(`^${key}=.*$`,'m');
  if(!line.test(env)) throw new Error(`Missing ${key} in .env.example`);
  env=env.replace(line,`${key}=${value}`);
}
writeFileSync('.env',env);
NODE
  chmod 600 .env
  printf 'Created private local .env with fresh development-only secrets.\n'
fi

if grep -Eq '^JWT_SECRET=(REPLACE_|)$|^AUTH_ABUSE_KEY=(LOCAL_SYNTHETIC_|)$' .env; then
  fail ".env still contains example secrets. Replace JWT_SECRET and AUTH_ABUSE_KEY with random values of at least 48 characters."
fi

if [[ ! -x node_modules/.bin/tsx || ! -x apps/web/node_modules/.bin/next ]]; then
  printf 'Installing locked workspace dependencies…\n'
  npm ci
fi

printf 'Starting local PostgreSQL and Redis containers…\n'
docker compose --project-directory "$ROOT_DIR" -f infra/docker-compose.dev.yml up -d --wait postgres redis

set -a
# This file is created from the repository's simple KEY=value example and is private/ignored.
. ./.env
set +a

printf 'Generating Prisma client and applying local migrations…\n'
npm --workspace apps/api run db:generate
npm --workspace apps/api run db:migrate

mkdir -p .local
printf 'Starting API and web portal on this computer only…\n'
API_HOST=127.0.0.1 npm --workspace apps/api run dev >.local/api.log 2>&1 &
api_pid=$!
npm --workspace apps/web run dev >.local/web.log 2>&1 &
web_pid=$!

cleanup(){
  trap - EXIT INT TERM
  kill "$web_pid" "$api_pid" 2>/dev/null || true
  wait "$web_pid" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

ready=0
for _ in {1..60}; do
  if node --input-type=module -e "const a=await fetch('http://127.0.0.1:3001/api/v1/health').then(r=>r.ok).catch(()=>false);const w=await fetch('http://127.0.0.1:3000').then(r=>r.ok).catch(()=>false);if(a&&w)process.exit(0);process.exit(1)"; then
    ready=1
    break
  fi
  if ! kill -0 "$api_pid" 2>/dev/null || ! kill -0 "$web_pid" 2>/dev/null; then break; fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  printf 'Local services did not become ready. Check .local/api.log and .local/web.log.\n' >&2
  exit 1
fi

printf '\nLocal portal: http://localhost:3000\n'
printf 'API health:   http://127.0.0.1:3001/api/v1/health\n'
printf 'Logs:         %s/.local/api.log and %s/.local/web.log\n' "$ROOT_DIR" "$ROOT_DIR"
printf 'Stop both services with Ctrl+C. AI scoring remains disabled; use synthetic data only.\n\n'

set +e
wait -n "$api_pid" "$web_pid"
status=$?
exit "$status"

#!/usr/bin/env bash
# Preflight only by default. Full D1 is NOT complete until a real isolated DB and deps are tested.
set -euo pipefail
cd "$(dirname "$0")/.."
npm test
npm run typecheck
npm --workspace apps/api run typecheck:policies
(cd apps/ai-service && python -m pytest -q)
if [[ "${D1_FULL_VALIDATION:-0}" != 1 ]]; then
  echo 'STEP84 PREFLIGHT PASSED. Full NestJS/Prisma/PostgreSQL integration remains BLOCKED/UNVERIFIED.'
  exit 0
fi
: "${DATABASE_URL:?Set isolated test DATABASE_URL}"
case "$DATABASE_URL" in *_test) ;; *) echo 'Refusing full D1 tests outside *_test DB'; exit 2;; esac
npm --workspace apps/api run db:generate
npm --workspace apps/api run db:migrate
npm --workspace apps/api run typecheck
RUN_POSTGRES_INTEGRATION=1 npm --workspace apps/api run test:db
# Full D1 still needs API E2E + rate-limit/identity review before production; do not output RELEASE_APPROVED.
echo 'DB tests executed; API E2E/security and release review remain required.'

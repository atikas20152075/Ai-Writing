#!/usr/bin/env bash
# Offline source checks. This script DOES NOT complete Step 85 live integration.
set -euo pipefail
cd "$(dirname "$0")/.."
npm test
(cd apps/ai-service && python -m pytest -q)
if [[ -d node_modules/@types/node ]]; then
  npm run typecheck
  npm --workspace apps/api run typecheck:policies
else
  echo 'Typecheck BLOCKED until npm dependencies are installed; no success claim.'
fi
echo 'OFFLINE STEP85 CHECKS COMPLETE; LIVE DATABASE/HTTP GATES STILL REQUIRED.'

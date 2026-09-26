#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run test:domain
if [[ -x node_modules/.bin/tsc ]]; then
  npm run typecheck
else
  echo 'TypeScript typecheck requires npm install; run separately after installing dev dependencies.'
fi
(cd apps/ai-service && python -m pytest -q)
echo 'Domain and AI-boundary test suites complete. No live AI or database integration exists.'

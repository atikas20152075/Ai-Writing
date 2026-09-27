# Step93 continuation — real full-stack browser gate

Baseline: PR #14 merged at `e5da604faa27e3fd5ba44c7652b842a7b2eaed1d`.

## Scope

The separate `web-fullstack` CI job runs Chromium desktop and mobile against the actual Next.js gateway, NestJS API and PostgreSQL 17 with all committed migrations. It never starts the synthetic HTTP upstream. The existing 12 synthetic-upstream browser scenarios remain a separate job for controlled response-race and UI coverage.

The new suite checks a browser-entered typed submission against durable verified text, one submission row and its outbox event; a genuinely pending result; a result approved using the real two-person human-review service; a real English PDF; and student/guardian/teacher scope boundaries. Direct requests with another child's identifiers must fail. Guardian or teacher revocation must deny subsequent detail/report requests and remove records when the view refreshes. Previously displayed content is not remotely erased before another request, and already downloaded PDFs cannot be recalled.

Authentication checks exercise real Argon2 credentials, HttpOnly cookies, refresh-token rotation after removal of the access cookie, replay rejection for a logged-out access cookie, and cookie removal after database session revocation.

The CLI-only fixture creates unique synthetic identities and academic context through Prisma and existing administrative services. Marks and understanding observations are manually authored test data. A fixture simulates arrival in the human-review queue; actual review proposal and independent approval use the production service and database constraints. This is not a real AI grading or human-review UI test. No test-control endpoint is added to the application.

## Run

Use a fresh, disposable loopback PostgreSQL database named **writing_browser_test**. The fixture and Playwright configuration refuse another database name, a remote database, missing explicit acknowledgement or non-test NODE_ENV. Never put real records in this database. The suite adds unique fixtures and does not delete existing data; discard the dedicated database after the run. CI destroys its PostgreSQL service with the job.

```sh
npm ci
export NODE_ENV=test
export WRITING_FULLSTACK_ACK=ONLY_SYNTHETIC_TEST_DATA
export DATABASE_URL=postgresql://writing_ci:synthetic_ci_password@127.0.0.1:5432/writing_browser_test?schema=public
npm --workspace apps/api run db:generate
npm --workspace apps/api run db:migrate
npx tsc --noEmit -p apps/api/tsconfig.browser.json
node --test scripts/fullstack-safety.test.mjs
cd apps/web
npx playwright install --with-deps chromium
npm run test:e2e:fullstack
```

The harness owns ports 3021 (NestJS) and 3200 (Next.js). Existing servers are not reused. Ephemeral JWT/rate-limit secrets are generated for the API. No AI worker/provider is started. Next.js runs in development mode for loopback HTTP; optimized production build/typecheck remain independently checked in `web-portal`. Production HTTPS/Secure-cookie serving is a separate staging gate.

## Evidence and next checkpoint

Only a completed successful PR-head CI run is passing browser evidence. The job retains synthetic screenshots/failure traces for seven days. Local static checks are not a substitute for the PostgreSQL browser job.

After this gate passes, continue with current-revision PFCR learning views and the linked rewrite workflow. Bengali accessible font-embedded PDF, private report storage/lifecycle, handwriting/OCR, real AI academic validation, and production privacy/security/operational gates remain open.

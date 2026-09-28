# Changelog

## Unreleased

### Step 98 — Cohort analytics

- Added an authorized, read-only cohort analytics endpoint with current effective finalized revisions, descriptive score aggregates, and counts of pending assessments.
- Analytics are separated by immutable rubric version, count repeated assessments individually, omit learner and assessment identifiers, and return no-store responses.
- Added synthetic PostgreSQL coverage for rubric separation, pending-result handling, current-revision changes, and authorization revocation.
- PR #21 merged; exact-head CI run [36329851220](https://github.com/atikas20152075/Ai-Writing/actions/runs/36329851220) passed all three jobs.
- Next task: Step 99 — Production Hardening.

### Step 99 — API response hardening

- Apply private no-store and browser security headers to all API responses, including error responses; disable Express `X-Powered-By`.
- Extend synthetic loopback HTTP checks to enforce the headers on health and authenticated profile routes.
- PR #23 merged; exact-head CI run [36336277257](https://github.com/atikas20152075/Ai-Writing/actions/runs/36336277257) passed all three jobs.
- Next task: Step 100 — Production Release gates and readiness review.

### Step 100 — Production readiness review

- Recorded a source-backed **NO-GO** decision for production deployment and real learner-data processing.
- Separated green synthetic CI evidence from the still-open dependency, legal/privacy, scoring quality, accessibility, independent security, operations, and resilience gates.
- No release or deployment was performed or authorized by this review.

### Step 97 — Student dashboard

- Added an overview of a student's latest submissions and current finalized result.
- Added a minimal effective-score summary to the student-only, no-store submissions endpoint; pending assessments expose no score.
- Added synthetic desktop/mobile and full-stack coverage for dashboard status, current score revision, own-record scope, and private caching.
- Next task: Step 98 — Analytics Engine.
# Step 109 — Accessible HTML report alternative

- Added an authorized structured HTML report page with language-aware content and print/save controls, linked from finalized student/parent results and academic cohort rows.
- Added a rate-limited, no-store report snapshot route through the fixed-upstream portal gateway; it reuses current scope checks, immutable score revision snapshots and audit logging.
- Kept PDF generation before receipt commit and preserved its existing audit action and response verification.
- Added BFF snapshot route coverage; see `docs/step109-accessible-html-report.md` for verification and remaining accessibility review gates.
# Step 110 — Accessible report authorization coverage

- Added full-stack browser assertions for student, linked parent, and assigned teacher access to the HTML report, English/Bangla language, updated approved revisions, unrelated learners, and access revocation.
- Made immutable snapshot persistence concurrency-safe with an atomic upsert; updated synthetic upstream and teacher PDF control checks for the added accessible report action.
- Local PostgreSQL-backed browser execution remains pending exact-head CI because this workspace has no PostgreSQL/container runtime. See `docs/step110-accessible-report-e2e.md`.

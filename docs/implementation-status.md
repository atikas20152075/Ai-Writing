# Engineering status and evidence — AI Writing Assessment Platform

**Date:** 2026-09-27. This document must be updated only from actual commits and reproducible test evidence.

## Development snapshots

| Step | Delivered evidence | Not yet demonstrated |
|---|---|---|
| 83 | TypeScript rubric, evidence and fail-closed scoring boundary; Python AI service intentionally refuses unconfigured inference | Backend/database or real grading |
| 84 | NestJS/Prisma source, academic + guardian policy and submission foundation; original offline tests | Running NestJS and PostgreSQL integration at that time |
| 85 | GitHub Actions run [36235612532](https://github.com/atikas20152075/Ai-Writing/actions/runs/36235612532): Prisma client generation, baseline migration, 10 PostgreSQL tests, 26 synthetic HTTP checks, 44 JavaScript/TypeScript checks and six Python tests; all passed | Real AI model, OCR, production deployment and a committed dependency lockfile |
| 86 | Shared PostgreSQL auth-rate budgets with HMAC pseudonyms, migration, additional static/DB/HTTP tests; lockfile and CI hardening | Record exact CI run and only mark success after verification |

All runtime E2E fixtures use synthetic `example.test` identities and a disposable `_test` database. The preproduction AI service reports NOT_CONFIGURED, and the test API leaves accepted writing awaiting understanding; it does not fabricate scores.

## Pre-release blockers

1. **Dependency lockfile committed:** synthetic CI [36236724557](https://github.com/atikas20152075/Ai-Writing/actions/runs/36236724557) passed using `npm ci`. Latest strict `npm ci` CI plus ephemeral CI-only credentials must pass before this is considered a durable release gate.
2. Real AI Examiner and **independent** Verifier integration plus strict rubric/evidence validation and trusted DB finalizer/human review.
3. Expert adjudicated Bangla and English benchmarks by writing type and learner level; OCR separately gated on student verification.
4. Verified guardian onboarding, authorized child-data processing, provider diligence and data-retention/deletion mechanisms.
5. Distributed/edge abuse protection and secure operational monitoring; public demonstration data is not a production authorization.
6. Relevant end-to-end security, performance, accessibility, rollback and disaster recovery tests.

## Source organization

- `docs/master-blueprint-v2.md`: retained original corrected audit (Step 71 checkpoint).
- `docs/master-blueprint-v3-current.md`: full audited baseline with current index.
- `docs/architecture-steps-73-82.md`: subsequent consolidated architecture.
- `history/step83-source`, `history/step84-source`: source-only historical snapshots; any earlier tests are historical, not current release evidence.
- Current runnable development code is the repo root and `apps/`, `packages/`, `scripts/`.


### Step 87 — Real provider transport (gated)

Implemented a fixed-endpoint Responses API adapter, strict Pydantic scoring/evidence checks (including Bangla grapheme boundaries), separate different-model independent verifier and challenged verifier call, private token authentication, redacted validation errors, and a TypeScript locked-context bridge. All external inference remains disabled until explicit academic benchmark and child-data/vendor approval. **The resulting AI proposal is not a finalized grade**: the database-backed Understanding Snapshot, immutable attempts, policy-gated finalizer and expert-validated scoring benchmarks are still required. Refer to `step87-real-ai-examiner-verifier.md` and the actual GitHub CI results.

## Step 88 — Current in-repository implementation

`docs/step88-persistent-assessment.md` is the authoritative scope/release-boundary documentation for Step88. This step adds additive Prisma migration for immutable, linked assessment evidence and initial effective score revisions; reviewed-Understanding publication and fenced worker persistence; no provisional score leakage to students; synthetic pure-policy, disposable PostgreSQL and HTTP regression tests. Verified synthetic PostgreSQL migration and service integration on [GitHub Actions 36239714330](https://github.com/atikas20152075/Ai-Writing/actions/runs/36239714330), including order-independent canonical hash regression, 19 DB-backed tests, 42 synthetic HTTP checks and 11 mocked-provider Python tests. This does NOT imply live AI scoring, expert benchmarks or production deployment. Real expert-approved AI grading, vendor/legal gates, worker deployment, parent/teacher delivery and human score-appeal revisions remain outstanding.

## Step 89 — Two-person human scoring and appeal mechanics (development)

Implementation source: [Step89 reviewer and revision design](step89-human-score-revisions.md). Program-scoped academic reviewer grants, current verified student/guardian appeals, immutable factor-wise human proposals, independent approval/rejection/uphold, DB-guarded append-only HUMAN revisions, update of the single effective score pointer and six explicit PENDING derived-projection invalidation targets are implemented. Synthetic SQL tests exercise actual PostgreSQL triggers and reviewer revocation; only code/logic readiness is claimed. Human review UI, automated rebuilding of Feedback/Practice/Progress/Teacher/Parent/Report projections, independent academic benchmark validation, approved processing of real child manuscripts and production deployment remain BLOCKED.

## Step 90 — Version-aware propagation (development)

Implemented a guarded, transactional minimal parent-score read-model rebuild, revision-aware student projection-status endpoint, initial-AI six-target invalidation, and explicit BLOCKED statuses for unimplemented FEEDBACK/PRACTICE/PROGRESS/TEACHER/REPORT consumers. Detailed limitations and (when obtained) verified CI evidence: [Step90](step90-projection-freshness.md). Verified synthetic CI: [run 36245550983](https://github.com/atikas20152075/Ai-Writing/actions/runs/36245550983) PASSED (116 Node tests including 35 database tests, 45 loopback HTTP checks and 11 mocked Python tests). All testing is synthetic; never treat a BLOCKED target or stale report as CURRENT.

## Step 91 — Deterministic rubric feedback, practice targets and descriptive progress

Revision-pinned FEEDBACK/PRACTICE/PROGRESS materialization is now implemented in a development branch with strict original-writing evidence validation, immutable rubric scoring, cohort fingerprint freshness checks, SQL rejection of forged REBUILT receipts and a student-only learning endpoint. TEACHER/REPORT remain unsupported. Verified synthetic integration: [Step91 CI 36246662867](https://github.com/atikas20152075/Ai-Writing/actions/runs/36246662867) PASSED: 126 Node tests including 39 PostgreSQL tests, 47 synthetic loopback HTTP checks and 11 fully mocked Python tests; expert bilingual scoring, actual AI-written feedback, personalized questions and production rollout are not implemented. See [Step91 details](step91-revision-pinned-learning.md).

## Step 92 — Scoped teacher dashboard and on-demand English report (development)

Implements authenticated teacher/batch and program-admin read access without a global super-admin bypass; revision-aware current score and review-state metadata. Provides real minimal multipage English printable PDF bytes under current object-level access, an immutable database report snapshot and audit, and a version-scoped REPORT rebuild receipt. **The PDF is generated in-memory, not stored in private S3**; Bengali Unicode PDF and richer teacher UI remain release blockers. Verified [Step92 CI 36254187747](https://github.com/atikas20152075/Ai-Writing/actions/runs/36254187747) PASSED: 135 Node tests including 43 PostgreSQL tests, 52 synthetic HTTP checks and 11 mocked-provider Python tests; real child processing and production deploy remain blocked. See [Step92](step92-teacher-reports.md).

## Step93 continuation — current portal scope

PRs #11–12 added a local static student/teacher preview and scoped topic catalog/typed editor. The follow-up [family portal and session-safety increment](step93-family-portal.md) adds verified-family discovery/detail, parent/teacher pagination, and late-response fencing. The web workspace is still **not Next.js**. Step92 production closeout, browser E2E, bilingual reports and real-model/child-data approvals remain open. See the linked evidence for exact checks; historical sections above remain historical snapshots.

## Step93 — Next.js portal continuation

The [Next.js implementation](step93-nextjs-portal.md) replaces the web placeholder with role-specific student/parent/teacher workspaces and a server-side cookie authentication gateway. Prior static-portal limitations above are historical. Browser tests are isolated synthetic tests; backend PostgreSQL/HTTP validation remains independent. Bilingual report/private artifact lifecycle, live AI and production release gates remain open.
# Step93 full-stack browser continuation — 2026-09-27

PR #15 adds desktop/mobile browser checks through the actual Next.js gateway, NestJS and disposable PostgreSQL. Initial run 36291381408 passed all three CI jobs, including four new full-stack scenarios and the existing twelve synthetic-upstream browser scenarios. See `docs/step93-fullstack-browser.md` for tested privacy/session boundaries, fixture limitations and final-head verification requirements. Next development checkpoint: current-revision PFCR learning views and linked rewrites. Production deployment and real AI grading remain off.

## Step94 — PFCR learning UI and linked rewrites

Students can now view revision-pinned rubric feedback, practice targets and same-rubric progress beside an approved result, then create a correction plan and submit a new linked rewrite. The backend persists the rewrite link to the exact effective score revision and blocks stale, cross-student or scope-changed links at both service and database-trigger layers. Local verification passed Prisma generation, API/web typechecks, API/web builds, web unit tests and browser fixture compilation. Local Playwright was blocked by the missing scratch Chromium binary; final browser/PostgreSQL evidence must come from GitHub CI for the Step94 PR. See [Step94 details](step94-pfcr-linked-rewrites.md).

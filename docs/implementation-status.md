# Engineering status and evidence — AI Writing Assessment Platform

**Date:** 2026-09-26. This document must be updated only from actual commits and reproducible test evidence.

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

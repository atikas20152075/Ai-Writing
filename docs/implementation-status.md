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

1. **Dependency lockfile committed and validated:** synthetic CI run [36236724557](https://github.com/atikas20152075/Ai-Writing/actions/runs/36236724557) passed using `npm ci`. The CI script now requires `npm ci` with an ephemeral test secret setup and passed [strict run 36236815628](https://github.com/atikas20152075/Ai-Writing/actions/runs/36236815628).
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

## Step 87 — Tested gated external AI boundary

Implemented a non-streaming fixed-endpoint OpenAI Responses adapter with strict JSON Schema structured outputs, published-rubric exact-point/Unicode-evidence validation, independent verifier-model judgment *before* revealing the Examiner output, subsequent skeptical challenge, and a private TypeScript bridge that independently revalidates both results. HTTP validation errors redact raw child writing. All model calls remain **disabled by default**, subject to real child processing/vendor approval and expert Bangla/English benchmark gates. These are synthetic mocked-provider tests, **not real inference or deployable AI scoring**. The NestJS assessment remains pending until future versioned Understanding, durable run storage, and an authorized transactional finalizer are implemented. See `docs/step87-real-ai-examiner-verifier.md`.

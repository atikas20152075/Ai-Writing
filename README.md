# AI Writing Assessment Platform — Development repository

**Current development stage:** Step 91 (human review, protected score revisions). This is a **development-only** repository, not a deployed website or verified AI-grading product. No real students' data, real credentials or payment secrets belong in this public repository.

## Project documentation

- [Master Blueprint v3 index and retained v2 full architecture audit](docs/master-blueprint-v3-current.md)
- [Original audited Master Blueprint v2](docs/master-blueprint-v2.md)
- [Step 72 detailed Error Intelligence architecture](docs/step72-error-intelligence.md)
- [Detailed later-stage decisions, Steps 73–82](docs/architecture-steps-73-82.md)
- [Current actual test evidence and remaining release blockers](docs/implementation-status.md)
- [Step 86 authentication hardening and current plan](docs/step86-auth-integration.md)
- [Historical Step 83/84 source snapshots](history/README.md)

**History limitation:** The verbatim original Steps 1–60 were not recoverable; their known decisions are preserved by the corrected v2 audit, not misrepresented as full original transcripts. New detailed work is recorded from Step 73 onward.

## Implemented development features

- TypeScript rubric scoring, Unicode-grounded evidence validation and fail-closed finalization boundary.
- NestJS identity/session, program-enrollment/guardian policy, published academic topics/rubrics and durable typed-writing submission.
- Immutable verified writing and topic/rubric snapshots, transactional outbox and idempotent student submission.
- Shared PostgreSQL authentication abuse budgets with hashed-only keys (Step 86).
- FastAPI AI boundary intentionally reports unavailable until real examiner/verifier integration exists; no sample scores are presented as AI results.

## Synthetic-only developer setup

Node >=22.16, npm, Python >=3.11 and isolated PostgreSQL required. Use only a disposable database whose name ends `_test` for integration tests. Never copy a production database into CI.

```sh
cp .env.example .env
# Replace all example secrets before any real environment or shared deployment.
npm install
npm test
npm --workspace apps/api run db:generate
npm --workspace apps/api run typecheck
npm --workspace apps/api run db:migrate
RUN_POSTGRES_INTEGRATION=1 npm --workspace apps/api run test:db
```

Review `.github/workflows/step85-integration.yml` and `docs/implementation-status.md` for exact tested CI execution. The active workflow is named for Step 85 for historical continuity; Step 86 extends it. No production deployment is configured.

## Step 87 — Gated provider integration (development only)

Implemented a real OpenAI Responses HTTP adapter with strict JSON outputs; an independent different-model Verifier followed by explicit skeptical challenge; duplicate semantic/numerical checks in the trusted Node domain; and a private-only bridge that **never finalizes marks**. Unconfigured service fails closed. See [Step 87 detailed spec](docs/step87-real-ai-examiner-verifier.md) for approval gates and remaining blockers. All tests use synthetic/mock writing; no real external AI grading has been run.

## Step 88 — Durable vetted scoring pipeline (development-only)

Step88 adds reviewed Understanding snapshots, database-guarded immutable Examiner/Verifier results, lease-fenced internal processing, a canonical effective score revision and a student-only finalized-result endpoint. See [Step88 implementation and release blockers](docs/step88-persistent-assessment.md). All local/CI model-output fixtures are synthetic; real external model processing and production score release remain disabled pending expert benchmarks and privacy/vendor authorization.

## Step 89 — Scope-bound human review and grade revisions

Reviewed Understanding, two independently authorized academic reviewers, guarded append-only HUMAN score revisions, a single effective score pointer and PENDING invalidation records are implemented in the backend. Current, verified linked guardians can access the effective result using a single scoped SQL query; unrelated students cannot appeal another child's result. See [Step89 implementation and remaining release blockers](docs/step89-human-score-revisions.md). These synthetic integration tests do not qualify real AI scoring or constitute a deployed service.

## Step 90 — Revision-aware freshness (development)

Score revisions now generate six durable invalidations, including initial verified AI results. An opt-in PostgreSQL worker actually materializes a minimal current **PARENT** score summary and SQL verifies it against the canonical effective revision; other targets are explicitly BLOCKED until real rebuild engines exist. A student-scoped projection-status endpoint labels stale data correctly. See [Step90 scope and limitations](docs/step90-projection-freshness.md). No live notification delivery, feedback/PDF generation, production deployment or expert-approved AI grading is implied.

## Step 91 — Revision-pinned learning read models

Actual deterministic **rubric feedback**, **practice rewrite targets** and **same-rubric descriptive progress** are now versioned against the canonical effective score. Older materializations and changed comparable cohorts are withheld. Unsupported teacher/dashboard and PDF/report generation remain explicitly unavailable. See [Step91 engineering scope](docs/step91-revision-pinned-learning.md). No live AI, real student data or production deployment is configured.

## Step 92 — Scoped cohort dashboard and English-only printable score report

A backend-only authenticated teacher/cohort read endpoint uses current assignment, enrollment and educational processing scope; it does not provide global SUPER_ADMIN access or return raw child essays. Approved ENGLISH scores can be exported on demand as actual minimal PDF bytes only after current student/guardian/teacher/program scope rechecks in one transaction. Immutable as-of report snapshots and audit entries pin the canonical revision. Unsupported Bengali/mixed-script PDF remains explicitly unavailable pending approved Unicode typography and visual validation. See [Step92 engineering limits](docs/step92-teacher-reports.md). No UI deployment or private S3 archival is claimed.

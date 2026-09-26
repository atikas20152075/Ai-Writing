# AI Writing Assessment Platform — Development repository

**Current stage:** Step 86 (secure backend integration). This is a **development-only** repository, not a deployed website or verified AI-grading product. No real students' data, real credentials or payment secrets belong in this public repository.

## Project documentation

- [Master Blueprint v3 index and retained v2 full architecture audit](docs/master-blueprint-v3-current.md)
- [Original audited Master Blueprint v2](docs/master-blueprint-v2.md)
- [Step 72 Error Intelligence design](docs/step72-error-intelligence.md)
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

## Step 87 — Gated real-provider integration (development only)

A fixed-endpoint OpenAI Responses HTTP adapter, strict published-rubric/Unicode evidence validation, independent different-model Verifier plus critical challenge, and an internal TypeScript integration client have been added. This **does not finalize marks, use real student data, or imply benchmark-approved AI grading**. See [Step 87 implementation and release blockers](docs/step87-real-ai-examiner-verifier.md).

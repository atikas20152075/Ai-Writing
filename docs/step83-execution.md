# STEP 83 — Actual Development Execution Plan

Project status: **first engineering increment completed and tested locally; actual first working end-to-end web MVP NOT complete.**

## Delivery principles

- Deliver **tested vertical slices**, not a large number of unintegrated screens or modules.
- Pre-existing schema/roadmap material is architectural; code/tests must have their own auditable status.
- Code and benchmark changes require exact version identity. Don't use an unsupported AI model as a fallback.
- Never ingest genuine children's personal writing into demo, staging or model tests without reviewed authority and data-governance controls.

## Phase gates

| Gate | Work | Acceptance evidence | Current status |
|---|---|---|---|
| D0 | Domain foundation: scoring, pinned context, evidence, fail-closed finalization contract | Type-check; unit tests; no mock AI claims | **Implemented/tested locally** |
| D1 | NestJS project, Prisma/Postgres baseline, migration, outbox, auth and verified program/guardian policies | Migration integration; IDOR-negative tests; db constraints | Not started |
| D2 | Typed editor + saved drafts + immutable submit and verified-text locking | Real API+DB E2E; idempotent submit | Not started |
| D3 | Real AI Examiner and separate Verifier through Python gateway | Expert-adjudicated, bilingual, per-factor benchmarking and schema tests | Not started |
| D4 | Transactional score finalizer and human-review fallback | DB concurrency/verification-failure/score revision tests | Not started |
| D5 | Error Intelligence, evidence-backed feedback and one complete PFCR practice/rewrite cycle | Domain independence; review; linked rewrite E2E | Not started |
| D6 | Next.js premium accessible student UI; authorized guardian/teacher basic read views | WCAG 2.2 AA checks and cross-account negative tests | Not started |
| D7 | Secure multi-page OCR and verified-text correction | Separate Bengali/English OCR benchmarks | Not started |
| D8 | Report/commerce/scale only as required for pilot | PDF/privacy/payment E2E, monitoring and recovery drill | Not started |

## Dependency ordering

`D1 -> D2 -> D3 -> D4 -> D5 -> D6 -> D7`, with UX prototype work parallel to D1–D5. Payment can be deferred if the controlled pilot does not charge. Child privacy, backups and security are release requirements, not optional polish.

## Next coding deliverable (D1)

1. Scaffold NestJS with pinned versions + Prisma/Postgres and working CI.
2. Implement minimal `User`, `Program`, `Student`, `Enrollment`, `GuardianLink`, `Consent`, `TopicSnapshot`, `RubricVersion`, `Submission`, `VerifiedWritingText`, `AssessmentAttempt`, `ExaminerRun`, `VerificationAttempt`, `AssessmentFactorResult`, `ScoreRevision`, `OutboxEvent` models; avoid prematurely implementing every future module.
3. Implement real auth (`Argon2id`, short-lived access tokens, refresh rotation and reuse detection), an actual policy service, guardian verification and program-scoped enrollment; use test fixtures to deny cross-child/batch/object access.
4. Publish at least one human-authored, validated **illustrative** rubric; freeze version, topic, verified text and entire assessment input context.
5. Integrate the tested `@writing/domain` core into the NestJS application. A trusted worker must persist verification and finalization inside DB transactions.
6. Run Postgres-backed integration tests and capture migration results. Only then label D1 done.

## Current engineering risks and mandatory fixes

- **Verifier trust boundary:** `finalizeApprovedAssessment` accepts an already-trusted approval object as domain input. A real service must load its own trusted verification record from the authoritative DB; NEVER accept client-provided approvals.
- **Semantic evidence:** exact quotation/offset matching does not show that evidence actually supports the criterion; independent AI/human review is required.
- **Rubric publishing:** this domain library validates structural invariants but does not provide database uniqueness, publication approval or an immutable persisted schema.
- **Input hash:** currently computes SHA-256 over application-controlled serialized context; production must define canonical cross-service JSON encoding and verify snapshots against immutable DB records.
- **Unicode:** code-point offset validation and grapheme boundaries are tested on fixtures; real OCR/editor integration needs extra Bangla visual annotation tests.
- **Concurrency:** the core finalization demonstration is in memory. Only Postgres transactions, unique constraints, source-version checks and idempotent outbox handling will establish cross-worker correctness.
- **No claims of AI accuracy:** the fixed fixture gives a manual illustrative score, not evidence of model performance.

## External integration

GitHub can store the repository and run CI after the user explicitly connects an authorized account. This starter package remains downloadable and testable independently; no code has been committed remotely.

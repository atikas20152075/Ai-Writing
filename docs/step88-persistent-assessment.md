# STEP 88 — Durable AI runs and guarded effective score revisions

**Implementation milestone (development; synthetic only).** The Step87 fixed/private examiner–independent verifier provider contract now has a database-backed, lease-fenced persistence and initial score-finalization path. This does **not** establish the academic validity of any live models. No live vendor requests or actual student data processing are enabled or tested by default.

## Actual implementation

1. New Prisma models and an additive PostgreSQL migration: one immutable, human-reviewed `UnderstandingSnapshot` per current MVP assessment; a purpose/review/version-specific `AIReleaseGate`; replay-aware `AIProcessingAttempt` with lease token and retry budget; immutable `AIExaminerRun`, `AIVerificationAttempt` and initial `AssessmentScoreRevision`; and the canonical `Assessment.effectiveScoreRevisionId` pointer.
2. Postgres `BEFORE INSERT` guards cross-check Examiner's run, processing attempt and pinned gate; Verifier's model/context; and score revisions' exact corresponding PASS outcome, unchanged factor results, source hashes, program scope, rubric, language and non-revoked unexpired gate. `Assessment` cannot become `FINALIZED` without the effective revision. Attempts to overwrite/delete academic evidence are rejected by DB triggers. An initial auto-score revision has `revisionNo=1`, `source=AI`; separate human appeals/revisions are **not** enabled in this milestone.
3. `AssessmentPersistenceService.publishHumanUnderstanding` accepts evidence-grounded observations from **current assigned teachers or active academic admins only** and emits a transactional `ASSESSMENT_CONTEXT_APPROVED` outbox event. It does not generate Understanding from a placeholder hash or pretend that an AI Understanding engine is already implemented. This private service is **not** a new public admin endpoint, and the broad first-institution admin role needs granular institution scoping before multi-tenant expansion.
4. `claim` builds the immutable domain context from PostgreSQL (not caller-provided writing), revalidates both original snapshots, checks separate current educational AND external-AI processing authorities, requires a current human-identified gate with approved **distinct** pinned models and explicit server release flags; it deduplicates logical runs, acquires a 6-minute fenced lease and never makes vendor calls inside a database transaction.
5. `process` calls the Step87 internal gateway outside the transaction, then independently checks full results and current release/authority state again. Under a single serializable transaction it persists the Examiner and verifier, takes `PASS` through the deterministic domain finalizer, appends revision 1, advances the effective score pointer, writes an audited outbox event; `MAJOR_REVIEW`/`FAILED` are persisted **without** a final score and enqueue human review. Bounded failures use safe error codes only; retry and stale worker claims cannot publish contradictory marks. The outbox is at-least-once; persisted final effects are unique.
6. Private opt-in `apps/worker/src/assessment-job-consumer.ts` handles **only** `ASSESSMENT_CONTEXT_APPROVED` as a model call. `SUBMISSION_ACCEPTED` never causes a model call without the reviewed Understanding. The worker refuses to start without reviewed flags and internal service configuration. The existing outbox dispatcher must also be deliberately enabled once a tested consumer is deployed; the queue and worker are not deployed in this milestone.
7. A new student-only authenticated `GET /api/v1/assessments/mine/:id/result` endpoint returns `result:null` while pending/reviewing. It reads only the canonical effective revision after `FINALIZED` and denies cross-student results. Teacher/guardian score-reporting endpoints are separate, future authorization-reviewed work.

## Verified synthetic CI and input-hash correction

The approved assessment input hash is now generated with order-independent canonical JSON serialization in the domain layer. PostgreSQL JSONB can reorder nested rubric properties; the previous plain `JSON.stringify` calculation produced different hashes for equivalent approved rubrics and blocked a legitimate persisted run. A dedicated domain regression test reproduces and prevents this defect. This is a deliberate contract change **before any real finalized score exists**; future persisted contexts must pin the domain contract version during upgrades.

[GitHub Actions synthetic integration run 36239714330](https://github.com/atikas20152075/Ai-Writing/actions/runs/36239714330) passed: 19 domain, 24 auth/access, 8 AI bridge, 10 static, 10 new assessment pure-policy and 19 PostgreSQL tests; 42 synthetic HTTP checks and 11 mocked Python tests. No external model was called. This run validates mechanics and integrity, not academic scoring validity.

## Independent academic/security limits

- Synthetic fixtures **are not** expert benchmarks, proof of external vendor/privacy approval, real model evaluations, or real children's data. Test-only approval references are explicitly labelled SYNTHETIC and may not be copied into deployment configuration.
- The AI provider remains disabled unless `AI_RELEASE_GATE_APPROVED=true`, `AI_CHILD_PROCESSING_APPROVED=true`, an appropriate **separately approved** external-processing authority, reviewed unexpired program+rubric+language gate, distinct pinned approved models and private internal token are all present. Merely toggling flags is **not** evidence of actual approval. Gate provisioning is intentionally manual/privileged; no self-service approval endpoint exists.
- Database triggers protect data integrity from normal application errors. Any DB writer with credentials able to fabricate an approved release gate and all trusted run records remains a high-trust principal; restrict production DB roles and do not expose these writes through public endpoints.
- Reviewer attestation is human-provided in this version; semantic correctness of observation and AI score requires actual expert judgment. No automated Understanding has been claimed.
- Disputed/failed verifications require bounded human-review workflow before any authorized correction. Human score appeals and multi-revision lineage remain unimplemented.
- Transactional score effects are once-only. External model requests may repeat after ambiguous timeouts; this must be reflected in cost accounting, rate budgets and vendor-call idempotency limits before pilot.
- Release gate revocation checked both before transmission and before commit; an already-sent inference request cannot be retracted by retroactive consent revocation. Provider retention/contract/legal reviews still required.
- There is not yet a paid/live production backend, operational human-review UI, deployed worker, benchmark-approved examiner, direct student-data transfer, or active billing/credit integration.

## Verification gates

- `npm test`, `npm run typecheck`, `npm --workspace apps/api run db:generate`, `npm --workspace apps/api run typecheck`, `npm --workspace apps/api run db:migrate` and `RUN_POSTGRES_INTEGRATION=1 npm --workspace apps/api run test:db` on an isolated PostgreSQL database named `*_test`.
- `npm --workspace apps/worker run typecheck` after Prisma generation.
- `STEP85_SYNTHETIC_ACK=ONLY_SYNTHETIC_TEST_DATA npm run smoke:http` on a loopback-only NestJS API with a synthetic administrator.
- Existing Python provider-contract tests remain completely mocked and have no external vendor credentials.

## Next: Step 89

Implement a real authorization-reviewed human-review and appeal/revision workflow with provenance, safe scorer re-runs, post-revision downstream invalidation, production AI run observability and expert-labelled Bangla/English gated benchmarks before any real child-data inference.

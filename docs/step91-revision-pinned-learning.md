# STEP 91 — Revision-Pinned Feedback, Practice Targets & Comparable Progress

**Development-only implementation with synthetic tests.** Step90's single-parent-summary worker is extended with three **real, deterministic, non-generative** learning read models, each keyed to the exact effective score revision. No live model grading, personalized AI lesson creation, Bangla/English expert quality benchmark, deployed dashboard or actual child data is claimed.

## What is actually built

- **FEEDBACK**: stores the exact approved score factors and their published-rubric criterion descriptions, existing examiner or independent human review rationale, and already validated Unicode-grounded original evidence. This is **rubric-linked feedback**, not complete teacher editing, independent fact-checking, grammar correction or generated advice. The validator recomputes the frozen academic input fingerprint and checks each factor against the published rubric, evidence quote/offset, validated total score and immutable revision.
- **PRACTICE**: selects up to three factors with the largest *exact decimal* mark deficits and emits clearly labelled targeted rewrite objectives from the rubric, criterion and existing original evidence. These are **practice targets, not generated new questions**; exercises and scored rewrite submissions require later authorized learning modules.
- **PROGRESS**: stores a complete-cohort revision fingerprint for the **same student, program and immutable rubric version**; shows the latest six score points, total comparable count and an exact arithmetic descriptive score delta. Fewer than two comparable assessments explicitly returns `INSUFFICIENT_DATA`. A descriptive difference is not proof of learning gains, mastery or a causal effect. The fingerprint includes *all* comparable effective revision IDs: a new submission or correction in the cohort invalidates even a previously built progress snapshot without trusting asynchronous worker timing.
- **PARENT**: retains Step90's existing genuine minimal score summary, still protected by current guardian-link and program authorization at the actual parent result endpoint.
- **TEACHER** and **REPORT**: continue to be `BLOCKED`/`UNAVAILABLE`. Never present them as recomputed or expose old PDF reports as current.

## Database and worker invariants

- Additive PostgreSQL migration adds the three projection tables, FK-bound to Assessment and ScoreRevision, and trigger guards that require the revision to be the currently effective FINALIZED revision with an exact matching snapshot revision ID and schema.
- Extend invalidation guard: `REBUILT` is permitted only after the corresponding real materialization exists; `BLOCKED` remains valid only for unsupported TEACHER/REPORT. Historic previously blocked FEEDBACK/PRACTICE/PROGRESS jobs are requeued with empty error and processing timestamp, not silently considered complete.
- Parent-first assessment row lock then per-invalidation lock preserve Step89's lock ordering. An older job is `SUPERSEDED`; no old score is written as current.
- Pilot-only proactive cohort refresh: after pending revision jobs are handled, the worker scans stored progress snapshots, compares each full same-rubric cohort signature with current effective revisions and transactionally refreshes stale historical snapshots without changing the immutable original receipt. A cross-assessment synthetic PostgreSQL test exercises stale-on-new-assessment followed by refresh. This initial low-volume scan is deliberately **not** an at-scale queueing strategy; use durable scope-keyed invalidation, cursoring and backpressure before broad production deployment.
- The existing opt-in `projections:dev` worker uses the extended ProjectionService. It is not deployed. Approved source validation failures emit a sanitized `FAILED` receipt, never an invented derived artifact. Transient DB errors cause transaction rollback rather than falsely marking success.
- The student-only JWT endpoint `GET /api/v1/assessments/mine/:id/learning` returns only versions currently marked `CURRENT` using one repeatable-read transaction; revoked current educational-processing authority denies access. The prior `/projections` availability endpoint remains in place. Neither endpoint exposes another student's materials or unapproved reviewer notes.
- Real score endpoints still resolve the canonical effective revision directly; read models are optional and must not supersede authoritative marks.

## Remaining release blockers

Full pedagogical feedback generation, independently validated new exercises, PFCR correction-and-rewrite execution, trend cohorts across **different rubrics** (currently intentionally excluded), per-learner mastery inference, guardian learning UI, teacher dashboards, private revised PDF exports, data deletion and retention operations, permission-aware notifications, operational dead-letter policy, real expert-reviewed bilingual evaluation and production deployment. No direct payment, live children or external AI inference is involved in these synthetic tests.

## Verification

GitHub CI must pass locked dependencies, Prisma migrations, NestJS API/worker typechecking, pure deterministic builder and policy tests, version-aware PostgreSQL integration including forged completion and superseded revisions, student-only loopback HTTP access checks, and fully mocked Python AI-service tests. Attach the exact passing run before marking an implementation as verified; green synthetic CI does not validate real academic model quality.

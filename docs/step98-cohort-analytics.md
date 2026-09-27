# Step 98 — Cohort analytics

**Status:** implementation complete; waiting for verification and CI.

## Scope delivered

- Added `GET /api/v1/academic/cohorts/:batchId/analytics` for an active teacher assigned to the active batch or an academic administrator with a current program grant. Students and global administrators have no access.
- The handler checks user, program, batch, and assignment/grant in the same repeatable-read transaction as its aggregate query. The aggregate independently requires accepted submissions, current active enrollment, and active `CORE_ASSESSMENT` processing authority.
- It reads only the score revision referenced by `Assessment.effectiveScoreRevisionId` when the assessment is finalized. A missing current revision stays unavailable; pending assessments contribute only to the not-finalized count.
- Results are grouped by exact immutable rubric version. Repeated assessments count separately, while the response contains no student IDs, assessment IDs, writing, or review content. Responses are private and no-store.
- Each group reports assessment/current-revision/represented-learner/not-finalized/unavailable-current-result counts and, when finalized scores exist, total marks and mean/minimum/maximum score. A finalized assessment whose current revision is absent is counted as unavailable, not pending. An empty current-result group has null score statistics.

## Verification

Synthetic PostgreSQL integration coverage checks distinct rubric versions, pending result behavior, use of the current effective revision after a human correction, and loss of access after assignment revocation. The web gateway test checks the exact allowed route shape. Run API/web typechecks, builds, unit tests, the opt-in PostgreSQL suite, and CI before merge.

## Limits and next task

These are descriptive, assessment-weighted score statistics, not learner growth, mastery, causal effects, or a cross-rubric comparison. A learner with repeated assessments contributes each assessment to the score statistics; represented learner count is distinct within the rubric group. The endpoint provides no trend series, minimum cohort size suppression, or production readiness claim. It is an API milestone and does not add a new analytics dashboard.

**Next task pointer: Step 99 — Production Hardening.**

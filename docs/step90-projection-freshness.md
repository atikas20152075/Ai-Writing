# Step 90 — Revision-aware projection propagation (development, synthetic only)

**Implemented:** Every new effective score revision creates six unique PENDING invalidations in the same transaction (including initial AI finalization, which Step88 previously omitted). Migration backfills any existing effective revisions without creating fake projections. `ProjectionService` selects pending invalidations, locks the `Assessment` **before** the individual invalidation, then either:

- `SUPERSEDED`: the revision is no longer the effective score.
- `REBUILT`: only for `PARENT`, after materializing the actual, minimal `ParentScoreProjection` summary from the authoritative effective revision under the same PostgreSQL transaction; SQL trigger independently confirms canonical score and revision.
- `BLOCKED / TARGET_NOT_IMPLEMENTED`: `FEEDBACK`, `PRACTICE`, `PROGRESS`, `TEACHER`, `REPORT` have no actual projection engines yet; their invalidations are intentionally visible and no recomputation success is fabricated.

A student-only, JWT-protected `GET /api/v1/assessments/mine/:id/projections` returns availability per target using a **repeatable-read snapshot** and the canonical `effectiveScoreRevisionId`. A previously REBUILT summary instantly becomes `STALE` if a later revision is effective, even before a worker processes new invalidations. Existing student and parent score endpoints continue to read the authoritative revision directly, not the optional projection. No guardian or teacher access to unreviewed correction proposals or private reviewer notes is introduced.

`ENABLE_PROJECTION_REBUILDER=1 npm --workspace apps/worker run projections:dev` starts a dedicated *opt-in* Postgres-polling worker. It never invokes AI and cannot mark absent modules REBUILT. DB-level guards reject forged parent materializations, premature completion and changes to invalidation identity. The worker leaves unexpected failed attempts PENDING with a sanitized error so operators can investigate; retry limits and operational dead-letter policy must be added before deployment.

**Not yet implemented:** full feedback generation and practice recommendation rebuilds; progress trend regeneration; teacher and guardian dashboards; report/PDF artifact invalidation; production notification delivery or export revocation. These target statuses remain unavailable until dedicated version-pinned implementations and tests exist. No live child data, external AI benchmark or production deployment involved.

**Verification:** on disposable Postgres 17 `_test` CI: install locked dependencies, Prisma migrations/generation, API + worker typechecks, pure-policy and database tests, synthetic loopback HTTP access, mocked Python provider tests. Exact CI run evidence should be inserted only after a successful GitHub run.

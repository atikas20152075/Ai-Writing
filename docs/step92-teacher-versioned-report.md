# Step 92 — Assigned-Teacher Monitoring and Immutable JSON Report Foundations

**Development milestone; synthetic tests only.** The platform gains a minimally useful assigned-teacher assessment monitoring API and an immutable, version-pinned **JSON** academic report. This is **not** a Bengali/English PDF generator, private object-storage delivery system, or live production dashboard.

## Teacher scope and current scores

`GET /api/v1/teachers/me/batches/:batchId/assessments` accepts **TEACHER** only. The application checks current role/status, active assignment to the exact batch, active batch and academic program, active matching student enrollment, and active program-level CORE_ASSESSMENT authority. The query returns at most 50 latest assessments in scope without exposing unverified essays, another program's records, reviewer-only proposals or children's emails. A separate preflight scope check returns 404 when an assignment is missing; the assessment list query independently repeats active scope constraints. Cached teacher summary freshness is separately labelled `CURRENT` or `STALE`; grades in the response always come from the authoritative effective revision JOIN, never a stale cache. Revoking the teacher assignment removes access even to earlier assessments in that batch.

This is a backend monitoring API, **not** a complete interactive frontend teacher dashboard, batch-wide growth inference or staffing performance metric.

## Immutable version-specific report snapshots

Every finalized revision has six invalidations. `TEACHER` now materializes the exact canonical score and revision metadata with independent PostgreSQL guards. `REPORT` now stores a minimal immutable `AcademicReportSnapshot` keyed by `(assessmentId, scoreRevisionId)`. The snapshot includes approved factor results, pinned published-rubric/topic identifiers, writing language and fixed-decimal marks; it excludes reviewer notes, uploaded images and original full text. The database guard independently compares the snapshot's revision, numeric marks, factor JSON and academic metadata to the canonical currently effective approved assessment on initial insertion. Earlier revision reports remain immutable history, but requests **never** return a superseded historical report as current.

`GET /api/v1/assessments/mine/:assessmentId/report` is student-only. `GET /api/v1/parents/me/children/:studentId/assessments/:assessmentId/report` requires a currently verified and active own-child guardian link with active enrollment/CORE_ASSESSMENT authority. Both make scoped report and version checks inside one PostgreSQL repeatable-read transaction. If the authorized report is not rebuilt for the effective revision, it returns `status=PENDING`, `report=null` and `pdfStatus=NOT_IMPLEMENTED`. At no point can old revision results be passed off as current.

**Still blocked:** Production-ready PDF rendering and embedded/licensed Bengali font validation, PDF/CSV formula and metadata policy, private S3 object lifecycle, download-time authorization, background report storage and retention policy, signed URL expiry, frontend teacher charts, new notification delivery. These require separate implementation and security/academic gates, not a nominal `REBUILT` without an actual PDF.

## Automated verification

Tests use synthetic submissions in disposable PostgreSQL with transaction rollback, current teacher assignment and revocation, guardian-link revocation, forged DB report injection, immutable past revisions and score-correction invalidation. The HTTP smoke tests forbid report access from an outsider or SUPER_ADMIN and forbid report publishing for unfinalized assessments. Preserve exact passing GitHub Actions run evidence before merging. No real student data or external AI provider used.

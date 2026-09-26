# Step 92 — Scoped teacher dashboard & current-revision English PDF reports

This milestone adds real read-only **server-side teacher/cohort monitoring** and a small **on-demand English-only PDF extract**. It is a development milestone tested with **synthetic** accounts only. It is **not** the premium Next.js teacher interface, a multilingual PDF generator, private S3 file storage, guardian push notification, or production-ready student reporting.

## Teacher dashboard

- Authenticated GET `/api/v1/academic/cohorts/:batchId/assessments?cursor=<uuid>`.
- Only a currently assigned TEACHER for that exact batch or a scoped ACADEMIC_ADMIN for the batch's program. SUPER_ADMIN has **no** automatic essay/assessment read access.
- Both preliminary grant and final SQL require currently active enrollment and active CORE_ASSESSMENT processing authority. An ended assignment or enrollment stops visibility immediately on subsequent requests.
- Returns at most 20 canonical rows: opaque student ID, topic title, rubric version, assessment state, **current effective** score revision and approved marks, pending human-review flag, and whether a **current English** immutable report snapshot exists. Does not return the raw essay, private correction proposal, student email, or aggregate mean across incomparable rubrics.

## On-demand PDF

- Authenticated GET `/api/v1/reports/assessments/:id/pdf` is shared by own student, currently verified linked parent with active enrollment, scoped teacher, and program-scoped academic admin. Current CORE_ASSESSMENT authority and current role/assignment/link are checked **inside the same transaction** as the effective score snapshot.
- For finalized ENGLISH assessments whose approved **existing evidence and rationale can all be rendered as printable ASCII**, build a deterministic **report-v1** score extract, with explicit report-as-of revision marking. Reject Bengali/mixed-script and unsupported Unicode PDF with HTTP 409 instead of silently garbling scripts or substituting a font. The original score data remains accessible through existing authorized JSON endpoints; this export restriction does not affect grading.
- Generate true multipage PDF 1.4 bytes using a minimal, narrow-scope Helvetica renderer with no additional dependency; sample PDF has been rendered and visually checked. Not PDF/A, tagged accessible PDF, Bangla font embedding, rich feedback, a distributed rendering service or a scalable archival job.
- Persist only an **immutable, SQL-guarded JSON report snapshot and SHA-256** keyed by the exact effective scoring revision. No raw PDF bytes or public object links are persisted. Issuance is audited with actor and revision/hash, **not** child essay text. The generated response uses `Cache-Control: private, no-store`, `nosniff` and attachment disposition. There are no historical arbitrary-report download endpoints.
- A genuine current snapshot is required before the Step91 `REPORT` invalidation can become REBUILT. If the opt-in Step91 worker earlier set REPORT to BLOCKED, a real on-demand PDF request revives that exact receipt; fabricated data cannot create a REBUILT receipt by a direct DB write. An older score revision remains auditable but is superseded by subsequent score correction and cannot be served as the current PDF.

## Tests & operational limits

- Five local pure synthetic tests cover pinned report extraction, stable PDF bytes, actual multipage xref, Unicode refusal and malformed evidence.
- CI needs mandatory pinned `npm ci`, Prisma migrations and full API/worker TS checks, disposable PostgreSQL DB tests for scoped cohort authorization, report provenance, corrected-score replacement and guardian/teacher revocations; loopback HTTP checks for unauthorized and pending exports. No children, live AI calls or real private records.
- **Required before rollout**: independently approved Bengali font with embedded/subset rendering and visual comparison, strict report retention/deletion, security review and DoS/rate limiting for repeated PDF generation, provider-neutral private S3 archival with presigned access/revocation and object reconciliation, artifact accessibility testing, UI integration and documented RPO/RTO. No independent human rubric benchmark is inferred by synthetic tests.

## Verified synthetic integration evidence

[GitHub Actions run 36254187747](https://github.com/atikas20152075/Ai-Writing/actions/runs/36254187747) **PASSED** using pinned dependencies and a disposable PostgreSQL 17 service: **135 Node/TypeScript tests**, including **43 actual PostgreSQL integration tests**, **52 synthetic loopback HTTP checks**, and **11 Python AI service tests with mocked providers**. Prisma migrations and API/worker typechecks passed. DB tests exercised a real generated English PDF, independent teacher/guardian scope and revocation, SUPER_ADMIN denial, immutable old/new human score reports and DB rejection of forged receipts/scores. The pure tests also reject malformed or Bengali text instead of producing silent font corruption. This is engineering validation using synthetic data, **not academic benchmark approval, Bengali PDF support, production penetration testing or deployment**.

The on-demand renderer uses conservative maximum 52 printable ASCII characters per PDF line to avoid most Helvetica clipping. It remains intentionally minimal; accessibility and rich font/layout quality require a dedicated pre-release renderer.

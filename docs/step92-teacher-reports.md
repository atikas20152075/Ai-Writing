# Step 92 — Scoped teacher dashboard & current-revision PDF reports

This milestone originally added read-only **server-side teacher/cohort monitoring** and an on-demand English-only PDF extract. Step103 adds language-specific v2 PDF formats with Bangla shaping. These are development milestones tested with **synthetic** accounts only. They do not provide private artifact storage or production-ready student reporting.

## Teacher dashboard

- Authenticated GET `/api/v1/academic/cohorts/:batchId/assessments?cursor=<uuid>`.
- Only a currently assigned TEACHER for that exact batch or a scoped ACADEMIC_ADMIN for the batch's program. SUPER_ADMIN has **no** automatic essay/assessment read access.
- Both preliminary grant and final SQL require currently active enrollment and active CORE_ASSESSMENT processing authority. An ended assignment or enrollment stops visibility immediately on subsequent requests.
- Returns at most 20 canonical rows: opaque student ID, topic title, rubric version, assessment state, **current effective** score revision and approved marks, pending human-review flag, and whether a current immutable report snapshot exists. Does not return the raw essay, private correction proposal, student email, or aggregate mean across incomparable rubrics.

## On-demand PDF

- Authenticated GET `/api/v1/reports/assessments/:id/pdf` is shared by own student, currently verified linked parent with active enrollment, scoped teacher, and program-scoped academic admin. Current CORE_ASSESSMENT authority and current role/assignment/link are checked **inside the same transaction** as the effective score snapshot.
- Step92 supported finalized English printable ASCII using **report-v1**. Step103 supports approved ENGLISH and BANGLA using `rubric-report-v2-en` and `rubric-report-v2-bn`, with explicit report-as-of revision marking. It rejects unsupported text controls instead of silently altering content. The original score data remains accessible through existing authorized JSON endpoints; report format does not affect grading.
- Step103 uses bundled Noto Sans Bengali Regular/Bold and ReportLab/HarfBuzz; fonts are embedded/subset and mixed-script output has synthetic visual/extraction checks. A bounded subprocess is used. Output is not PDF/A, does not contain a validated structure tree, and is not PDF/UA. No screen-reader test, distributed rendering service or scalable archive is claimed.
- Persist only an **immutable, SQL-guarded JSON report snapshot and SHA-256** keyed by the exact effective scoring revision. No raw PDF bytes or public object links are persisted. Issuance is audited with actor and revision/hash, **not** child essay text. The generated response uses `Cache-Control: private, no-store`, `nosniff` and attachment disposition. There are no historical arbitrary-report download endpoints.
- A genuine current snapshot is required before the Step91 `REPORT` invalidation can become REBUILT. If the opt-in Step91 worker earlier set REPORT to BLOCKED, a real on-demand PDF request revives that exact receipt; fabricated data cannot create a REBUILT receipt by a direct DB write. An older score revision remains auditable but is superseded by subsequent score correction and cannot be served as the current PDF.

## Tests & operational limits

- Step103 pure synthetic tests cover pinned report extraction, version selection, embedded subset fonts, Bangla extraction, multipage layout, unsafe Unicode refusal and malformed evidence.
- CI needs mandatory pinned `npm ci`, Prisma migrations and full API/worker TS checks, disposable PostgreSQL DB tests for scoped cohort authorization, report provenance, corrected-score replacement and guardian/teacher revocations; loopback HTTP checks for unauthorized and pending exports. No children, live AI calls or real private records.
- **Required before rollout**: expert-approved language fixtures and independent Bangla review; real PDF structure tree and screen-reader test; strict report retention/deletion; security review and measured renderer capacity; provider-neutral private artifact storage, revocation/reconciliation, UI integration and documented RPO/RTO. No independent human rubric benchmark is inferred by synthetic tests.

## Verified synthetic integration evidence

[GitHub Actions run 36254187747](https://github.com/atikas20152075/Ai-Writing/actions/runs/36254187747) **PASSED** using pinned dependencies and a disposable PostgreSQL 17 service: **135 Node/TypeScript tests**, including **43 actual PostgreSQL integration tests**, **52 synthetic loopback HTTP checks**, and **11 Python AI service tests with mocked providers**. Prisma migrations and API/worker typechecks passed. DB tests exercised a real generated English PDF, independent teacher/guardian scope and revocation, SUPER_ADMIN denial, immutable old/new human score reports and DB rejection of forged receipts/scores. Pure report tests include synthetic Bangla shaping and extraction checks. This is engineering validation using synthetic data, **not academic benchmark approval, accessible PDF certification, production penetration testing or deployment**.

The legacy v1 renderer remains a historical format. New v2 PDFs use the bounded ReportLab/HarfBuzz renderer described in [Step103](step103-bilingual-reports.md); output is selectable and language-marked but lacks a validated PDF structure tree.

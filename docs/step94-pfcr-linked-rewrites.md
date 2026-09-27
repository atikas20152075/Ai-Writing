# Step94 — PFCR linked rewrite workflow

**Status:** development implementation for synthetic data only. This step makes the already revision-pinned learning material visible to students and adds a guarded linked rewrite submission path. It is not a production learning coach, real AI grader, OCR system or live child-data deployment.

## Implemented

- Student result view now loads current learning material for finalized assessments: rubric feedback, targeted practice items and same-rubric progress status.
- A student can start a PFCR rewrite only from the exact approved result currently open in the UI.
- The rewrite form requires a correction plan and sends a fresh writing attempt without modifying the original submission.
- `POST /submissions/rewrites` creates a normal typed-writing submission linked to a source assessment and exact score revision.
- Submission rows expose rewrite metadata so the student can distinguish original attempts from rewrites.
- The API rechecks the current student identity, active program/batch enrollment, published topic/rubric binding and current finalized source revision before accepting a rewrite.
- The database stores `rewriteOfAssessmentId`, `rewriteOfRevisionId` and `correctionNote`.
- A database trigger rejects forged links, stale source revisions, cross-student links, changed scope and mutation of an existing rewrite link or correction note.
- Idempotent replay is allowed only for the same text, source revision, scope and correction plan.

## Verified Locally

- `npm --workspace apps/api run db:generate`
- `npm --workspace apps/api run typecheck`
- `npm --workspace apps/api run build`
- `npm --workspace apps/web run typecheck`
- `npm --workspace apps/web run test`
- `npm --workspace apps/web run build`
- `npx tsc -p apps/api/tsconfig.browser.json --pretty false`

Local Playwright could start only with elevated port binding, but the scratch environment did not contain the Chromium binary and the download host is outside the current sandbox allow-list. The GitHub browser CI is the authoritative browser gate for this step.

## Release Boundaries

Still not implemented: generated personalized exercises, real AI feedback, OCR/handwriting ingestion, human-review UI for rewrites, teacher/guardian learning dashboards, Bengali/mixed-script PDF delivery, private artifact storage lifecycle, production deployment, expert bilingual benchmark approval and real child-data processing approval.

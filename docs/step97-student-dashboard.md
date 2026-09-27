# Step 97 — Student dashboard

**Status:** implementation on `step97-student-dashboard`; local checks pass. GitHub full-stack desktop/mobile browser CI is required before merge. Development fixtures use synthetic accounts and data only.

## Scope delivered

- The student Overview now summarizes the latest 50 own submissions: recent attempt count, non-finalized count, and finalized result count. The UI labels these as recent-list counts, not lifetime totals.
- It shows the newest attempt and the newest available approved result. Score, source, and revision come from the current `Assessment.effectiveScoreRevision` relation and appear only when the assessment is `FINALIZED`.
- A pending assessment has no score in the list response. Students can open its status, or open the current approved feedback and the existing revision-pinned PFCR view.
- `GET /submissions/mine` remains student-only, returns at most 50 newest submissions, and now includes the immutable topic title and minimal current effective-result summary. The response is marked `private, no-store`.
- The existing Assessments view remains available for the complete returned recent list. No new cross-rubric average, lifetime count, or inferred learning claim is introduced.

## Verification

Passed locally:

- `npm --workspace apps/api run typecheck`
- `npm --workspace apps/api run typecheck:policies`
- `npm --workspace apps/api run build`
- `npm --workspace apps/web run typecheck`
- `npm --workspace apps/web test` — 8 tests passed
- `npm --workspace apps/web run build`
- `npx tsc --noEmit -p apps/api/tsconfig.browser.json`
- `git diff --check`

The local Playwright suite could not launch because this workspace has no installed Chromium headless executable. The synthetic desktop/mobile browser tests are updated, and the full-stack tests assert the actual NestJS/PostgreSQL response, current HUMAN revision summary, no-store header, student-only row scope and dashboard rendering. Merge remains gated on successful GitHub CI for the exact PR head.

## Limits and next task

This is a student dashboard over existing authenticated records, not an analytics engine. It does not add score comparisons across rubric versions, generated practice exercises, appeals, OCR, guardian dashboard, or real learner data. Recent counts cover only up to 50 submissions. No real AI inference, academic efficacy, production deployment, or release readiness is claimed.

**Next task pointer: Step 98 — Analytics Engine.** Keep analytics descriptive and revision-aware; define comparable populations before aggregating, keep unlike rubric versions separate, and use only currently authorized records. Treat absent or stale source data as unavailable rather than estimating.

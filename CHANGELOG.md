# Changelog

## Unreleased

### Step 98 — Cohort analytics

- Added an authorized, read-only cohort analytics endpoint with current effective finalized revisions, descriptive score aggregates, and counts of pending assessments.
- Analytics are separated by immutable rubric version, count repeated assessments individually, omit learner and assessment identifiers, and return no-store responses.
- Added synthetic PostgreSQL coverage for rubric separation, pending-result handling, current-revision changes, and authorization revocation.
- Next task: Step 99 — Production Hardening.

### Step 97 — Student dashboard

- Added an overview of a student's latest submissions and current finalized result.
- Added a minimal effective-score summary to the student-only, no-store submissions endpoint; pending assessments expose no score.
- Added synthetic desktop/mobile and full-stack coverage for dashboard status, current score revision, own-record scope, and private caching.
- Next task: Step 98 — Analytics Engine.

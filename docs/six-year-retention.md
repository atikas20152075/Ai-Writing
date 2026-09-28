# Six-year writing-data retention

## Agreed product requirement

Per the project owner's report, guardians have signed consent for submission data to be used for AI assessment and retained for six years. The application records a six-calendar-year expiry boundary per accepted submission, measured from its acceptance timestamp. A leap-day acceptance expires on February 28 six years later. The database check constraint and update trigger prevent changing that boundary.

## Implemented in this change

- New `Submission.dataExpiresAt` field, backfilled for existing rows and indexed for due-work lookup.
- New submissions set `createdAt` and `dataExpiresAt` together.
- Database constraint enforces `dataExpiresAt = createdAt + INTERVAL '6 years'`.
- Policy unit tests cover ordinary dates, leap-day clamping, and invalid dates.

## Still required before describing deletion as automatic

This change records when data becomes due for deletion; it does **not** delete it. A production purge must be implemented and tested against the complete foreign-key graph, immutable-evidence triggers, rewrites, AI provider retention, generated reports, uploaded objects, caches, logs, and backup expiry. The existing schema deliberately blocks deleting immutable assessment evidence, so the purge needs an explicit, narrowly authorized privacy lifecycle path that preserves only counsel-approved minimal audit evidence. It must be idempotent, observable, retryable, and must not silently skip blocked submissions.

AI processing remains protected by the separate `EXTERNAL_AI_ASSESSMENT` authority/release gates. This retention change does not activate AI, prove the contents of the guardian agreement, or certify legal compliance.

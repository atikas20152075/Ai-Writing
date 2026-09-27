# Step96 — Evidence-first human review workbench

**Status:** development implementation for synthetic data. This step completes the review-facing UI over the existing immutable human proposal/decision contract. It does not activate AI scoring or authorize real learner data.

## Scope

- Authorized academic reviewers can inspect the topic, verified original writing and content hash, current effective revision, published rubric, current factor results/evidence and any immutable human proposal.
- Review-case detail reuses the existing per-request active teacher-batch or academic-program grant, enrollment, user-status and processing-authority checks. Active cases with stale revision/context are unavailable.
- A reviewer can submit a factor-wise correction proposal using only published rubric criteria, a 20–2,000 character reason, factor reasoning and exact quotes from verified writing. Existing service/domain validation checks exact evidence spans, factor completeness, criterion/score pairing and locked rubric/text hashes.
- Proposals stay immutable and do not change marks. The current reviewer who proposed cannot decide; a second currently authorized reviewer can approve or reject. For an existing finalized result, an independent reviewer can uphold it without a proposal.
- Approved proposals create the existing append-only HUMAN score revision, update the effective revision, invalidate six derived projections and enqueue the existing outbox event in the same transaction.
- Next.js BFF permits only exact UUID proposal/decision routes. Requests remain same-origin, cookie-authenticated and no-store; BFF does not accept user IDs or forward arbitrary cookies/tokens.

## Verification

- `npm --workspace apps/api run typecheck`
- `npm --workspace apps/api run typecheck:policies`
- `npm --workspace apps/web run typecheck`
- `npm --workspace apps/web test` — 8 portal/BFF tests passed, including exact review write-route matching and unauthenticated handling.
- `npm --workspace apps/web run build`
- `npx tsc --noEmit -p apps/api/tsconfig.browser.json`
- Desktop/mobile full-stack case added to `apps/web/e2e/fullstack/portal.spec.ts`: exact verified-text and factor-evidence display, proposal isolation, separate reviewer approval, and final state/revision visibility through Next.js, NestJS and PostgreSQL.
- Local Playwright could not start NestJS because scratch-container IPC returned `EPERM` for `/tmp/tsx-*.pipe`; the full-stack test must pass GitHub Actions before merge.

All fixtures use synthetic `example.test` accounts and disposable test data. No real learner data or provider call is used.

## Not Included

Student or guardian appeals UI, handwritten/OCR case materials, AI grading, bulk decisions, signed report artifacts, real-child processing, production deployment and legal/vendor/benchmark approval remain outside this step.

# Step95 — Authorized human-review queue

**Status:** development implementation for synthetic data. This step exposes existing human-review mechanics to authorized academic users as a read-only queue. It does not perform automated scoring, create score revisions or replace independent review.

## Scope

- `GET /review-cases?batchId=...` returns only OPEN and PROPOSED cases in a current authorized teacher batch or academic-admin program.
- Queue reads require an active user, current assignment/grant, active enrollment and active CORE_ASSESSMENT processing authority. Revoked assignments and authority are evaluated on every request.
- Each case is inspected through the existing `GET /review-cases/:id` path, which rechecks current scope before returning case reason and any immutable proposal.
- The Next.js portal offers the queue within the selected academic cohort. It deliberately has no correction or decision controls; those require assessment-locked evidence and a second independent reviewer.
- The BFF allows only exact review-case UUIDs and a single UUID `batchId` filter. Responses remain private/no-store.
- Synthetic full-stack coverage exercises pending case creation, assigned reviewer visibility, case detail access and denial outside current scope.

## Verification

- `npm --workspace apps/api run typecheck`
- `npm --workspace apps/api run build`
- `npm --workspace apps/web run typecheck`
- `npm --workspace apps/web run test`
- `npm --workspace apps/web run build`
- `npx tsc -p apps/api/tsconfig.browser.json --pretty false`
- `DATABASE_URL=postgresql://user:pass@localhost:5432/writing_test npx prisma validate --schema apps/api/prisma/schema.prisma`
- GitHub Actions run [36312337443](https://github.com/atikas20152075/Ai-Writing/actions/runs/36312337443) passed `backend-integration`, `web-portal` and `web-fullstack`, including desktop and mobile against disposable PostgreSQL.

The local scratch environment lacks the full browser/PostgreSQL setup; the passing CI run is the end-to-end verification for this step. Fixtures use synthetic identities and disposable test data.

## Not Included

Review proposal authoring UI, independent decision UI, student/guardian learning dashboards, live AI feedback, OCR, real child data, expert-approved benchmarks, production deployment and private report artifact storage remain outside this step.

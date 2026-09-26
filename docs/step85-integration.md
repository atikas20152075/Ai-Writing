# Step 85 — Live Backend Integration Candidate

## What changed from Step 84

1. Added a full synthetic-only HTTP smoke journey using native `fetch`: registration, student profile, admin-controlled program/batch/enrollment/processing authority, immutable published topic/rubric binding, authorized typed submission, duplicate-safe retry, forged context rejected, cross-student access denied, rotated refresh token and replay-triggered session revocation.
2. Added explicit PostgreSQL test cases for unique active program enrollment, composite program/batch FK, immutable published rubric/topic and verified writing, cross-scope rubric binding rejection, premature finalization fail-closed, atomic outbox rollback and unique student request identity. They **only run with** `RUN_POSTGRES_INTEGRATION=1` against an isolated `_test` database that has already been migrated.
3. Hardened concurrent refresh-token replay: if a second request reads the token before the first commits and then loses the atomic claim, its separate compensating transaction revokes the entire token family and emits an audit event.
4. Added a GitHub Actions pipeline using an ephemeral PostgreSQL service. It installs dependencies, generates the Prisma client, checks the actual NestJS types, runs migrations and DB tests, starts a real API, runs the HTTP smoke tests and executes Python service contract tests. **The workflow is an unexecuted candidate until Actions reports success.**
5. Added an offline static source-contract suite. It checks for declared constraints and explicit fail-closed code branches, but cannot prove that the migration itself is valid or runtime wiring works.

## Critical safeguards and caveats

- No real AI provider, scoring service, verifier or finalization worker is installed. Submitted writing remains `AWAITING_UNDERSTANDING`; never show an invented assessment score.
- The baseline PostgreSQL migration enforces `Assessment_no_finalization_without_verifier`; later assessment development needs a reviewed migration adding real verifier and immutable score-revision records **before** changing this constraint.
- The outbox dispatcher remains **disabled** until a real idempotent job consumer exists.
- Guardian verification in the starter assumes a human performed an external identity check; it must not be used with real children until the workflow and processing authority are reviewed.
- Public GitHub: do not commit actual student writing, secrets, production database dumps or private planning documents. The public GitHub export excludes `docs/master-blueprint-v2.md` and `docs/pre-step83-context.md`.
- Rate limits, brute-force prevention, abuse detection, guardian verified-evidence handling and operational monitoring are required prior to any pilot with real accounts.
- The first CI run currently bootstraps without a committed `package-lock.json` because npm registry access was unavailable locally. Generate and commit the resulting lockfile and switch to `npm ci` for reproducible releases. Until then, CI is **integration exploration, not a reproducible release gate**.

## Verification ledger

| Verification | Status |
|---|---|
| Domain core unit tests | Run locally in Step 85 |
| Academic access pure-policy tests | Run locally in Step 85 |
| Static migration/source sanity tests | Run locally in Step 85 |
| Python AI-service contract tests | Run locally in Step 85 |
| Full NestJS/Prisma typecheck | Await dependency-enabled CI/local run |
| PostgreSQL migration and constraint tests | Await real PostgreSQL CI/local run |
| Loopback HTTP full synthetic workflow | Await running NestJS CI/local run |
| Multi-instance auth rate limiting and real guardian evidence | Not yet implemented |
| Production-grade real AI examiner/verifier | Not yet implemented |

All tests requiring PostgreSQL or NestJS must retain explicit `NOT VERIFIED` status until actual command output is observed.

# Step 89 — Scoped two-person human review and score revisions

**Status:** Code prototype tested with synthetic data; not a production human-review program or live AI grading.

## Scope and mechanics

- Human-reviewed Understanding is a prerequisite. A finalized assessment can have an open appeal or a scoped academic correction; `HUMAN_REVIEW` with no effective score can receive an authorized academic AI-escalation case.
- A student can appeal **their own** finalized score. A parent can appeal only a currently verified/active linked child in the same enrolled academic program with active CORE_ASSESSMENT processing authority. Teachers need an active batch assignment and active student enrollment; academic admins need a **new explicit program grant** in `AcademicAdminProgram`. `SUPER_ADMIN` has no implicit child-writing review rights.
- One active `HumanReviewCase` per assessment, with immutable initial input context and prior effective score ID. Proposals are immutable, factor-wise, exact-published-criterion scores with independently cited Unicode-accurate original evidence and nontrivial reasoning.
- A **different currently authorized reviewer** must approve the proposal. The previous AI score, examiner run and verifier metadata remain immutable. `APPROVE` creates a new `HUMAN` revision, atomically updates the single effective pointer, records the approval and emits outbox events. `REJECT` and `UPHOLD` close the case without changing marks; an unfinalized escalation cannot be upheld.
- PostgreSQL backstops reject direct out-of-scope review case/proposal/decision creation, score changes without case/proposal/separate approver, stale source revisions, fabricated rubric factor scores and direct silent final-pointer replacements. No background AI action can write HUMAN revisions.
- Each successfully approved human revision creates six `DerivedProjectionInvalidation` records (`FEEDBACK`, `PRACTICE`, `PROGRESS`, `TEACHER`, `PARENT`, `REPORT`) and emits `ASSESSMENT_SCORE_REVISED` or `ASSESSMENT_SCORE_FINALIZED`. **These are PENDING; no downstream recalculation consumer is implemented in Step89.** Existing reports must never be silently presented as up to date.
- The student and parent result APIs read *only* the current authoritative effective revision, not interim proposed scores or private review notes. Parent query access requires current relationship and program scope and will not grant access based on historical links.

## Trust and release boundaries

The initial human score for an escalated assessment requires approved human-reviewed Understanding and two distinct scope-authorized academic reviewers. Old immutable AI proposals persist but are not silently accepted. Reviewer authorization is rechecked inside creation, proposal and approval transactions; PostgreSQL triggers provide defense in depth. The current backend is single-organization; scoped org memberships and robust review identity verification are future production requirements. A full appeal UX, reviewer queue UI, regulator-reviewed processing/privacy compliance, complete ongoing projection workers, expert-reviewed Bangla/English benchmark qualification, and real external AI tests are **not** implemented.

## Reproducible synthetic CI gates

Run `npm ci`, `npm test`, `npm run typecheck`, Prisma generate/migrate into disposable PostgreSQL, `RUN_POSTGRES_INTEGRATION=1 npm --workspace apps/api run test:db`, loopback synthetic HTTP checks, and `python -m pytest -q` in `apps/ai-service`. Review GitHub Actions results before making integration claims.

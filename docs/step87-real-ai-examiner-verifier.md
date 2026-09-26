# Step 87 — Gated real-provider Examiner and independently challenged Verifier

**Status:** Implemented and locally exercised against synthetic/mock transports. Live OpenAI inference, academic quality benchmarks, backend persistence, guardian authorization of actual model transfers, and production deployment have **not** been completed.

## Implemented transport and academic integrity

- `apps/ai-service/app/provider.py`: real non-streaming OpenAI Responses API HTTP adapter at the fixed official endpoint; uses JSON-Schema strict structured output, `store: false`, no tools, no redirects, bounded timeout. All provider failures are sanitized; child text is not logged and provider bodies are not forwarded in exceptions. `store: false` does **not** replace third-party retention, data-processing, legal, or vendor-risk review.
- `apps/ai-service/app/contracts.py`: strict Pydantic request/response schemas for locked assessment identity, exact verified-writing SHA-256, topic snapshot and published rubric factors/criterion scores. Deterministic exact-decimal point checks, Unicode code-point offsets, extended-grapheme boundaries and exact original evidence-quote validation; valid quote matching is not proof that the claim is *semantically* sound.
- `apps/ai-service/app/main.py`: three genuine provider calls on successful configured use: Examiner model; independently instructed, **different verifier model without seeing Examiner output**; a follow-up skeptical verifier challenge that sees original text, rubric, Examiner proposal and its previous independent evaluation. Disagreement/unsupported evidence => `MAJOR_REVIEW`; refusal/invalid vendor output => explicit failure, never accepted scores.
- `apps/api/src/ai/ai-gateway-client.ts`: **internal-only** NestJS-side TypeScript client that verifies locked domain context and topic fingerprint before transmitting any text, revalidates Examiner proposal using the original TypeScript domain scorer, checks Verifier run/input/factors/independent results, and returns `PASS_NOT_FINALIZED` or `HUMAN_REVIEW_REQUIRED`. It does not create a publicly exposed scoring route, mutate the database, or pretend to finalize a score.
- Auth boundary: independent `AI_SERVICE_SHARED_TOKEN` header checked using constant-time comparison. FastAPI returns a redacted validation error (no raw offending student payload echoed).

## Fail-closed configuration

Only approved backend workers should reach the private Python AI-service network route. No browser or external student API may invoke these endpoints directly. The following **environment variables are server-side only**:

```
OPENAI_API_KEY=                   # secret, not committed
OPENAI_EXAMINER_MODEL=            # approved pinned model identifier
OPENAI_VERIFIER_MODEL=            # DIFFERENT approved pinned model identifier
AI_SERVICE_SHARED_TOKEN=         # >=32 random characters, distinct from all other secrets
AI_RELEASE_GATE_APPROVED=false   # set true ONLY after expert bilingual benchmarks/release approval
AI_CHILD_PROCESSING_APPROVED=false # set true ONLY after verified processing/legal/vendor review
```

`GET /health` reports service liveness. `GET /ready` returns HTTP 503 unless *all* required configuration and release gates are set, including a different verifier model and a strong internal token. There is no configured live provider in the repository. Never set either approval flag just to make a readiness check green.

`OPENAI_API_KEY` must **not** be copied to `.env.example`, GitHub Actions or public repository. The repo's CI always uses synthetic fixtures and mock HTTP transport; it never runs a paid model or transmits real students' manuscripts. Provider use requires independent review of OpenAI endpoint data controls and cross-border transfer/guardian authority before using actual children's data. See [Responses API reference](https://platform.openai.com/docs/api-reference/responses) and [OpenAI platform data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint).

## Current important release barriers

1. **Step 88:** create an immutable, persisted `UnderstandingSnapshot` contract (not a placeholder hash), then database-backed `ExaminerRun`/`VerificationAttempt` append-only state, source-version pinning, secured worker dispatcher, exactly-once persisted effects and human-review workflow; only then can a trusted transactional finalizer consider `PASS`.
2. Expert-labelled Bangla and English benchmark suites for scoring agreement, factor-level reliability, false verifier approvals, error escalation, prompt injection and subgroup evaluation. Distinct model names alone do not prove independent academic judgment; expert evaluation remains mandatory.
3. Confirm real provider model/version availability and supported strict JSON-Schema output in a separately approved non-child-data sandbox. Vendor model aliases can silently change; use immutable approved version identifiers where supported.
4. Add per-task timeout, provider budget accounting, retry/idempotent job state and operational monitoring without leaking prompt text. Outbound child data remains disabled by default.

## Synthetic validation commands

```
python -m pip install -e 'apps/ai-service[test]'
(cd apps/ai-service && python -m pytest -q)
npm test
npm --workspace apps/api run typecheck:policies
```

Python tests validate real HTTP request **construction** via mocked HTTPS transport (`store:false`, strict schema, separate models, independent model not shown Examiner's proposal, challenge, invalid provider outputs, Bangla evidence boundaries, privacy-safe validation errors). The Node tests validate bridge interoperability and fail-closed behavior without pretending to call a real model. CI should run these tests and existing PostgreSQL + HTTP suites; only claim full passing status after checking that GitHub Actions actually completes.

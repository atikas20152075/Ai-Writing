# AI Writing Assessment Platform — Step 83 Starter

**Status: first tested engineering increment, NOT a deployed or complete MVP.**

Prepared for the Ideal Cadet Academy–originated platform. Architecture baseline is in `docs/master-blueprint-v2.md`. The first complete product vertical slice will be typed writing with authorized student enrollment, frozen human-authored rubric, separately benchmarked actual AI Examiner and Verifier, deterministic validation, transactional finalization, and scoped result reading. Handwriting OCR and PFCR follow. **No real student data should be used with this starter.**

## What is actually implemented and locally tested

- `packages/domain/src/index.ts`: published-rubric invariants, exact base-10 score-step arithmetic using BigInt, immutable verified-text hashing, pinned context hashing, Unicode code-point and grapheme-boundary evidence checks, complete factor-set/criterion validation, and fail-closed finalization contract.
- `packages/domain/test/scoring.test.ts`: automated domain invariants and failure cases, including Bangla offsets, rubric manipulation and verification disputes.
- `apps/ai-service/app/main.py`: runnable FastAPI **contract boundary** with health endpoint and strict Pydantic request validation. `ready`, `examine` and `verify` deliberately return HTTP 503 until vetted real models are configured.
- `apps/ai-service/tests/test_contract.py`: boundary tests.
- `scripts/typed-slice-demo.ts`: runs a **MANUALLY SCORED, simulated** proposal and simulated verifier approval through the actual domain validators. It is NOT an AI grading demo.
- `infra/docker-compose.dev.yml`: optional development Postgres/Redis configuration; Docker and Postgres integrations were **not** run here.

## Run the tested code

Requirements: Node.js >=22.16, Python >=3.11; for Python tests, `fastapi`, `pydantic`, `pytest`, `httpx`.

```bash
npm run test:domain
npm run demo

# Type-check after installing the declared development dependencies:
npm install
npm run typecheck

# In a separate shell for the Python service:
cd apps/ai-service
python -m pip install -e '.[test]'
python -m pytest -q
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
# GET /health -> 200, GET /ready -> 503 until real AI exists
```

Version constraints in the Python manifest specify compatible major lines, not proof that every future patch release is tested. Generate and commit dependency lockfiles, pin images and run CI before production work.

## Not implemented — required before real students

- No NestJS authenticated API or production database integration.
- No actual AI provider, expert benchmark, independently running verifier, OCR or real academic scoring.
- No implemented student UI, guardian verification, teacher dashboard, PFCR or payments.
- No production-safe transactional finalizer; this package checks a typed approval object but does not prove who issued it. In production only an authenticated, audited **backend verifier service** may persist the approval; the finalizer must read the accepted verifier attempt under a PostgreSQL transaction, not trust a client-supplied object.
- No persisted state, immutable database enforcement, migrations, outbox workers, backups, app authorization, or load testing.

The `FINALIZED` value printed by the fixture CLI is **only an in-memory domain demonstration**. It must never be presented to users as an evaluated student assessment.

## Architecture rules carried forward

1. NestJS is business/authorization/score-finalization authority. Python AI services only return constrained proposals.
2. PostgreSQL is authoritative. Redis/BullMQ and model output are not a source of truth.
3. Published rubrics are human-authored and immutable; assessment inputs reference locked verified text, topic, understanding and rubric versions/hashes.
4. Evidence requires exact source-text grounding **and separate semantic support review**.
5. AI Examiner proposes; backend validates; independently benchmarked Verifier challenges; trusted backend finalizer persists approved results.
6. Parent only verified linked children and teacher only assigned, program-scoped students; enforce scope inside every read, query and worker side effect.
7. Error Intelligence, feedback and practice cannot silently modify scores. Authorized later changes create append-only score revisions.
8. Pilot uses real, expert-adjudicated Bangla and English evaluation benchmarks, explicit release gates and documented privacy authority.

See `docs/step83-execution.md` for execution gates, dependencies and handoff.

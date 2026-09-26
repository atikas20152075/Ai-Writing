# AI Writing Assessment Platform — Step 84 Backend Source Increment

**State:** Real NestJS/Prisma source and hand-authored PostgreSQL baseline migration are provided, but **the NestJS runtime, generated Prisma client, PostgreSQL migration and API/database integration have NOT been executed here**. This is not a deployed or production-ready website. **No real child/student data may be used yet.**

This builds on the Step 83 tested domain foundation and unchanged Python AI-provider boundary. The actual AI examiner/verifier remain unavailable; the API accepts authorized typed text and creates a durable `AWAITING_UNDERSTANDING` assessment, not fictional marks.

## Files

- `apps/api/src/`: NestJS authentication, academic administration, scoped parent/teacher reads, typed-submission orchestration and PostgreSQL transactions.
- `apps/api/prisma/schema.prisma`: baseline Prisma models for users, rotating sessions, programs, cohorts, guardian links, separately recorded processing authority, published rubrics, typed submissions, assessments, audit and outbox.
- `apps/api/prisma/migrations/20260926_baseline/migration.sql`: hand-authored schema + PostgreSQL constraints and immutability triggers. **Must be tested against a disposable PostgreSQL database** before use.
- `apps/api/src/policies`: framework-free authorization and eligibility policies with 16 locally passing tests.
- `apps/api/test/postgres.integration.test.ts`: *opt-in, not run* PostgreSQL tests (requires a database whose name ends in `_test`).
- `apps/worker/src/outbox-dispatcher.ts`: disabled by default. Must not be enabled until the D2 consumer exists and is tested.
- `packages/domain/`: carried forward unchanged from Step 83; 18 passing tests.
- `apps/ai-service`: strict FastAPI boundary; 6 passing tests. Real grading is not configured.
- `docs/step84-implementation.md`: detailed workflow, setup, limitations and acceptance gates.

## Validated here

```bash
npm test                                    # 18 domain + 16 policy tests
npm run typecheck                           # only inherited domain/scripts TypeScript
npm --workspace apps/api run typecheck:policies
cd apps/ai-service && python -m pytest -q   # 6 Python contract tests
```

These checks validate domain/pure-policy logic and Python request contracts, **not** the running NestJS application or Prisma migrations. A TypeScript syntax-transpile check of app files was also performed; syntax validity does not imply type or runtime correctness.

## Local setup (run on a machine with internet + Docker)

```bash
cp .env.example .env
# Replace JWT_SECRET with >=48 random characters, e.g. `openssl rand -hex 48`.
# Never use the sample database credentials except in an isolated local environment.
set -a; . ./.env; set +a
npm install

docker compose -f infra/docker-compose.dev.yml up -d
npm --workspace apps/api run db:generate
npm --workspace apps/api run db:migrate
npm --workspace apps/api run typecheck

# Development FIXTURE super-admin only; never use this local provisioning CLI in production.
LOCAL_PROVISION_ACK=ONLY_SYNTHETIC_TEST_DATA \
LOCAL_PROVISION_EMAIL=local-admin@example.test \
LOCAL_PROVISION_PASSWORD='replace_with_a_unique_local_password' \
LOCAL_PROVISION_ROLE=SUPER_ADMIN \
npm --workspace apps/api run provision:local

npm --workspace apps/api run dev
```

Register/login/refresh require `Origin: http://localhost:3000` matching `WEB_ORIGIN`. The refresh token remains in a strict HttpOnly cookie. Store the returned short-lived access token in memory in an actual frontend; do not store it in browser localStorage by default.

**Run integration tests only on a disposable, migrated test database:**

```bash
# In a separate isolated test environment (with its own database/credentials):
# DATABASE_URL=postgresql://.../writing_test
RUN_POSTGRES_INTEGRATION=1 npm --workspace apps/api run test:db
```

Before using D1, implement and test perimeter/application login rate limits and account abuse protection; complete real-identity guardian verification and reviewed legal processing policy; verify the baseline migration and generated-client compatibility; run DB-backed authorization, transaction, concurrent submission and outbox tests. Two-person rubric governance, provider benchmarking, AI finalization and a student UI are separate subsequent gates.

**Do not enable** the outbox dispatcher merely to make the queue look active. There is no vetted AI consumer in this package.

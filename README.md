# AI Writing Assessment Platform — Step 85 integration candidate

**Status:** Development candidate. Tested pure domain/policy contracts and synthetic-only offline checks; **a live NestJS/PostgreSQL migration and HTTP E2E result has not been observed in this sandbox**. No real AI grading is configured. Do **not** upload actual children's writing or use production credentials.

Includes an implementation foundation for a typed-writing workflow: identity, program-scoped enrollment, reviewed processing authority, approved rubric/topic snapshots, immutable verified text, pending assessment and transactional outbox. The AI examiner/verifier deliberately do not output fabricated scores.

## Integration additions in Step 85

- PostgreSQL integration suite covering migration constraints, immutable records, exact program scope and outbox rollback. Requires a disposable `*_test` database.
- Synthetic loopback HTTP E2E for registration, scoped academic setup, durable typed submission, idempotent retries, cross-student access, and refresh-token replay handling.
- GitHub Actions pipeline that provisions ephemeral PostgreSQL, installs dependencies, runs Prisma migrations, builds/typechecks the API and runs the HTTP smoke test. **Observe actual Actions results before claiming integration passed.**
- Fix for parallel refresh-token replay: a failed concurrent claim now triggers an audited session-family revocation in a separate transaction.
- Static-only offline sanity checks. Their passing is not evidence that Prisma/PostgreSQL/NestJS integration works.

## Local development (synthetic data only)

Requires Node >=22.16, npm, Python >=3.11, Docker with Compose, and an internet connection for first dependency installation.

```sh
cp .env.example .env
# Set a unique strong JWT_SECRET in .env; the example is NEVER production-safe.
set -a; . ./.env; set +a
npm install
python -m pip install -e 'apps/ai-service[test]'
./scripts/check-step85.sh
```

### Live integration (dedicated disposable test database)

Use a separate PostgreSQL database **named ending `_test`**, migrate it first, then run the opt-in DB suite. The GitHub Actions workflow does this on every proposed change:

```sh
# Configure DATABASE_URL for e.g. writing_test; do NOT use writing_dev or any real data.
npm --workspace apps/api run db:generate
npm --workspace apps/api run typecheck
npm --workspace apps/api run db:migrate
RUN_POSTGRES_INTEGRATION=1 npm --workspace apps/api run test:db
```

For the HTTP smoke, create a synthetic admin with `LOCAL_PROVISION_ACK=ONLY_SYNTHETIC_TEST_DATA`, `LOCAL_PROVISION_EMAIL`, `LOCAL_PROVISION_PASSWORD`, `LOCAL_PROVISION_ROLE=SUPER_ADMIN`; run the API on loopback and execute:

```sh
STEP85_SYNTHETIC_ACK=ONLY_SYNTHETIC_TEST_DATA npm run smoke:http
```

The HTTP script rejects remote and production targets, makes uniquely named synthetic fixtures, and asserts assessment status `AWAITING_UNDERSTANDING`, never fake final scores. The test database is disposable; do not promote it to production.

## Release blockers

Full runtime/typecheck and live PostgreSQL integration must pass in an actual dependency-enabled environment, a committed lockfile is required for reproducible CI, and auth rate limiting/abuse protection, real guardian identity verification and independent AI assessment quality gates remain outstanding. Step 85 is **not production approval**.

See `docs/step85-integration.md` for scope and verification ledger.

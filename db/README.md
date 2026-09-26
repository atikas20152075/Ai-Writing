# Authoritative PostgreSQL/Prisma schema — D1 gate

The actual schema and initial migration are **not** included or tested in Step 83. Build the minimal connected model set described in `../docs/step83-execution.md` and validate against the retained Master Blueprint v2 before writing migrations. A partial, untested schema in the starter would create false confidence. D1 requires a reproducible real migration, database uniqueness constraints and Postgres-backed integration tests before claiming persistence or concurrency safety.

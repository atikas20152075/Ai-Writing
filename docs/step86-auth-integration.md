# Step 86 — Shared authentication abuse protection, dependency integrity, AI-integration readiness

## Actual code in this change

- A PostgreSQL-backed fixed-window abuse budget keyed exclusively by HMAC-SHA256 pseudonyms (separate `AUTH_ABUSE_KEY`), shared across all API replicas without direct persistence of IP addresses or email addresses. Different budgets exist for registration, login and refresh; login/register rate-limit both server-observed IP and normalized attempted email.
- An atomic PostgreSQL upsert under a transaction serializes concurrent attempts across API instances. Rejected requests emit a uniform 429 response. Malformed traffic and DDoS protection still require an upstream edge/proxy; this database service is *not* sufficient on its own for internet-exposed, large-scale deployments.
- Client-supplied `X-Forwarded-For` is not trusted unless a **specific** ingress CIDR list is configured in `TRUSTED_PROXY_CIDRS`; never use unrestricted blanket trust.
- `AUTH_ABUSE_KEY` is mandatory at API startup, not derived from or equal to JWT signing material. Rotate deliberately; changing the key invalidates currently tracked rate buckets. Dedicated `AuthRateWindow` migration and expiration index included. A cleanup job for expired pseudonyms is a separate operation and must not purge active buckets.
- Offline pure-policy tests and *required* PostgreSQL tests verify budgets and concurrent requests; HTTP synthetic smoke also verifies generic throttling for nonexistent accounts, case normalization and unaffected other identities. All tests remain explicitly synthetic.

## Build reproducibility

CI currently generates a dependency lockfile when none is committed. A controlled CI run will produce the missing lockfile; it must be reviewed and committed, after which the workflow will switch to unconditional `npm ci`. Until that step is done, release reproducibility remains blocked even if all integration tests pass.

## Next academic implementation

Build the actual versioned AI service adapter behind an internal-only gateway (approved provider/model and prompt config, no untrusted rubric creation); then independent verification, deterministic numerical/evidence validator, human-review escape hatch, trusted transactional finalizer and effective score revision. Do **not** publish AI marks until both scoring and verifier bilingual quality benchmarks pass.

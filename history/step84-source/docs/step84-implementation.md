# Step 84 — Backend Foundation: Implemented Source vs. Unverified Integration

## Deliverable

An incremental NestJS 10 / Prisma 6 source implementation, starting from the actual Step 83 domain contract. No new assessment grading claims are made. The legacy in-memory manually scored CLI remains a demonstration only.

### Implemented source

1. `POST /api/v1/auth/register`: STUDENT only; Argon2id password hash, student record, audit.
2. `POST /api/v1/auth/login`: short-lived access JWT; opaque random refresh token stored only as SHA-256 in DB; HttpOnly strict refresh cookie.
3. `POST /api/v1/auth/refresh`: old refresh token is atomically consumed, new token created; known consumed-token replay revokes that session family. Origin validation required.
4. `POST /api/v1/auth/logout`: DB session and refresh tokens revoked; authenticated JWT requests check current active DB session and current role.
5. Super-admin academic operations: programs, batches, enrollments, synthetic-test teacher assignment, external guardian-verification decision recording, separately reviewed processing authority recording, published topic, validated published rubric and explicit default binding. Revocation/end endpoints included.
6. `POST /api/v1/submissions/typed`: authenticated student ownership, current enrollment and processing authority, exact topic/rubric/program/language/binding checks, validated immutable snapshot, original verified text and hash, placeholder assessment awaiting understanding, outbox event, audit. All DB writes in one transaction. Per-student request ID provides submission idempotency; DB unique constraint backs it.
7. `GET /api/v1/students/me`, `GET /api/v1/submissions/mine`, `/mine/:id` plus minimal program-scoped guardian/teacher list routes. Teacher and guardian scope is queried again inside result retrieval.
8. Hand-authored PostgreSQL baseline migration: unique active enrollment per student/program, active teacher assignment, active assessment-processing authority, linked batch/program FK, published-content/verified-text immutable triggers and a fail-closed constraint blocking `Assessment.FINALIZED` until trusted verifier/finalization schema ships.
9. Disabled optional PostgreSQL→BullMQ outbox dispatcher. D2 adds the consumer; leaving events in PostgreSQL is deliberate.

### Known limitations / pre-pilot blockers

- No dependencies available in the execution environment for NestJS/Prisma; installation, generated Prisma client, full API TypeScript type-check, actual migrations and PostgreSQL integration have **not** been verified. Offline `npm view` failed. Only syntax transformation, pure TS domain/policies and Python boundary tests ran.
- No published-rubric two-person approval or benchmark results; only manually operated SUPER_ADMIN publishing for isolated dev fixtures. Actual academic review/release governance remains required.
- Guardian relationship checking is recorded through an explicitly privileged operation with an external verification reference; the actual out-of-band identity/authority review process must be implemented, documented and tested.
- Processing authority is a separate reviewed record, not inferred from guardian link or student registration. Storing a legal-basis string is NOT a determination of what law permits: approved purpose/policy and local legal review are required before real data.
- No production rate limit or anti-abuse controls; use only an isolated development environment until implemented and tested.
- No actual Examiner, Understanding Engine, independent Verifier, human review, persisted score revision or finalizer. A DB CHECK constraint prevents `FINALIZED` in this baseline.
- No student frontend, OCR, PFCR, PDF, payment, backups, metrics, RLS, distributed outbox consumer or production secrets manager. API routes include only a small testable foundation.
- Database raw SQL triggers intentionally add safeguards Prisma cannot model. Migration-drift inspection and hand-managed migration rules must be included in CI before expanding the schema.
- Existing generic student/parent/teacher roles are coarse. Next step should implement full permissions and operational invitation/verification workflows, rather than relying on the local fixture provisioner.

### Submission state and provenance

The original typed text becomes `VerifiedWritingText` immediately for typed submissions; handwriting follows a distinct student OCR-confirmation flow later. The immutable submission stores frozen topic/rubric JSON and their canonical SHA-256 hashes. The prepared `Assessment` stays `AWAITING_UNDERSTANDING`. No input hash covering UnderstandingRun can exist until a real Understanding Engine produces its versioned record; do not invent a placeholder understanding hash.

### D1 completion acceptance gates (still open)

- Install deps; generate Prisma client and pass full API typecheck.
- Migrate a clean disposable PostgreSQL database and run the opt-in integration suite.
- Add NestJS API E2E tests for auth, refresh replay, guardian IDOR, batch IDOR, admin privileges, rubric binding conflicts, original text immutability and concurrent same-request submissions.
- Verify outbox crash/recovery using actual PostgreSQL + Redis and a real idempotent consumer once D2 exists.
- Implement/benchmark API login throttling, guardian invite verification, reviewed processing authority and delegated academic governance.
- Ensure no original writing leaks into logs, queue payloads, unauthorized views or external providers.

### Following implementation slices

- D1b: Complete and prove the above baseline with PostgreSQL-backed tests and running NestJS API.
- D2: Pinned UnderstandingRun and actual configured, independently benchmarked AI Examiner/Verifier. Backend verifies all evidence and persistently finalizes only after trusted approval; no client-supplied verifier object.
- D3: Evidence-backed errors/feedback and PFCR correction/rewrite.
- D4: Secure multi-page handwriting OCR and student correction with separate Bangla and English quality gates.
- D5: Accessible Next.js web, verified parent access, assigned teacher workflows, validated reports and optional paid pilot.

# D1 NestJS API — source implementation, not yet runtime-integrated

Root README and `docs/step84-implementation.md` contain setup, tested work, limitations and release blockers. Real provider scoring remains disabled. `Assessment.FINALIZED` is explicitly prohibited by the baseline PostgreSQL migration until a trusted verification/finalization design is installed.

## Routes implemented in source

- `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`, `GET /api/v1/auth/me`.
- `POST /api/v1/admin/programs`, `/batches`, `/enrollments`, `/teacher-assignments`, `/guardian-verifications`, `/processing-authorities`, `/topic-versions/publish`, `/rubric-versions/publish`, `/rubric-bindings`.
- `POST /api/v1/admin/guardian-verifications/:id/revoke`, `/teacher-assignments/:id/end`, `/processing-authorities/:id/withdraw`.
- `POST /api/v1/submissions/typed`, `GET /api/v1/submissions/mine`, `GET /api/v1/submissions/mine/:id`.
- `GET /api/v1/students/me`, `/parents/me/children/:studentId/programs/:programId/submissions`, `/teachers/me/batches/:batchId/students/:studentId/submissions`.
- `GET /api/v1/health` (application health, **NOT** evidence that AI scoring is live).

Only pre-reviewed manual/synthetic admin operations are represented; identity proofing, production permission delegation, AI processing and release security gates are NOT finished. No API integration test can be claimed until dependencies and a disposable PostgreSQL test DB are available.

### Example staged API interaction (after dependencies + migration + admin fixture)

```bash
# Set API=http://localhost:3001 and ORIGIN=http://localhost:3000
curl -s "$API/api/v1/health"

# Obtain student ID only from an authenticated student session:
curl -s -H "Authorization: Bearer $STUDENT_ACCESS" "$API/api/v1/students/me"

# After admin creates the exact matching program, batch, enrollment,
# processing authority, published topic, published rubric and rubric binding:
curl -s -X POST "$API/api/v1/submissions/typed" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $STUDENT_ACCESS" \
  -d '{"programId":"REPLACE-UUID","batchId":"REPLACE-UUID","topicVersionId":"REPLACE-UUID","clientRequestId":"REPLACE-UUID","text":"An independently written test paragraph that is not real student data."}'
# Expected status after a successful accepted submission: AWAITING_UNDERSTANDING.
# Not a finalized score; real AI is not configured.
```

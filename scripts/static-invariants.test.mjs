/** Offline static contract checks only. These do NOT replace Prisma validation or database integration tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const migration=read('../apps/api/prisma/migrations/20260926_baseline/migration.sql');
const schema=read('../apps/api/prisma/schema.prisma');
const auth=read('../apps/api/src/auth/auth.service.ts');
const submission=read('../apps/api/src/submission/submission.service.ts');
const policy=read('../apps/api/src/policies/access-policy.ts');
const workflow=read('../.github/workflows/step85-integration.yml');
const smoke=read('./smoke-http-step85.mjs');

test('migration declares program-scoped enrollment foreign key',()=>{
  assert.match(migration,/CONSTRAINT "Enrollment_batch_program_fk" FOREIGN KEY \("batchId", "programId"\)/);
});
test('migration enforces single active enrollment',()=>{
  assert.match(migration,/CREATE UNIQUE INDEX "Enrollment_one_active_student_program"/);
});
test('migration rejects premature assessment finalization',()=>{
  assert.match(migration,/CONSTRAINT "Assessment_no_finalization_without_verifier" CHECK \("status" <> 'FINALIZED'\)/);
});
test('migration creates immutable writing and published-rubric triggers',()=>{
  assert.match(migration,/CREATE TRIGGER "VerifiedWritingText_immutable"/);
  assert.match(migration,/CREATE TRIGGER "RubricVersion_protect_published"/);
});
test('Prisma model preserves unique student request identity',()=>{
  assert.match(schema,/@@unique\(\[studentId, clientRequestId\]/);
});
test('refresh-token parallel replay failure explicitly revokes family',()=>{
  assert.match(auth,/class ConcurrentRefreshReplay extends Error/);
  assert.match(auth,/CONCURRENT_REFRESH_REPLAY_DETECTED/);
  assert.match(auth,/revokeTokenFamily\(existing\.sessionId/);
});
test('accepted submission, assessment and outbox event share database transaction',()=>{
  assert.match(submission,/this\.db\.\$transaction\(async tx=>/);
  assert.match(submission,/await tx\.assessment\.create/);
  assert.match(submission,/await tx\.outboxEvent\.create/);
});
test('guardian access requires verified and active exact program relationship',()=>{
  assert.match(policy,/link\.status === 'ACTIVE'/);
  assert.match(policy,/link\.programId === programId/);
});
test('CI runs migrated database tests and actual synthetic HTTP requests',()=>{
  assert.match(workflow,/RUN_POSTGRES_INTEGRATION=1/);
  assert.match(workflow,/db:migrate/);
  assert.match(workflow,/smoke-http-step85\.mjs/);
});
test('HTTP smoke guard forbids non-loopback targets',()=>{
  assert.match(smoke,/ONLY_SYNTHETIC_TEST_DATA/);
  assert.match(smoke,/127\.0\.0\.1/);
  assert.match(smoke,/localhost/);
});

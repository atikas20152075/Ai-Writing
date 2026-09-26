/** Strict opt-in database tests. Requires a disposable, MIGRATED PostgreSQL database named *_test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {AuthRateLimitService} from '../src/auth/auth-rate-limit.service.ts';
import {buildAuthRateTargets} from '../src/auth/rate-limit-policy.ts';

const run=process.env.RUN_POSTGRES_INTEGRATION==='1';
const url=process.env.DATABASE_URL;
if(run && (!url || !new URL(url).pathname.endsWith('_test')))
  throw new Error('Refusing PostgreSQL tests: DATABASE_URL database name MUST end with _test');
const db=run?new PrismaClient():undefined;
const marker='ROLLBACK_STEP85_FIXTURES';

/** All fixtures are created inside a transaction deliberately rolled back by each test. */
async function fixture(tx:any) {
  const user=await tx.user.create({data:{email:`student-${randomUUID()}@example.test`,passwordHash:'synthetic-test-only',role:'STUDENT'}});
  const student=await tx.student.create({data:{userId:user.id}});
  const program=await tx.academicProgram.create({data:{code:randomUUID(),name:'Synthetic Writing Test'}});
  const batch=await tx.batch.create({data:{programId:program.id,name:'Synthetic Batch'}});
  const topic=await tx.writingTopicVersion.create({data:{programId:program.id,writingType:'PARAGRAPH',language:'ENGLISH',title:'Synthetic Topic',instructions:'Write a sample paragraph',clues:['A','B'],status:'PUBLISHED'}});
  const rubric=await tx.rubricVersion.create({data:{programId:program.id,writingType:'PARAGRAPH',language:'ENGLISH',version:1,status:'PUBLISHED',snapshot:{test:true},snapshotHash:'f'.repeat(64),publishedAt:new Date()}});
  return {user,student,program,batch,topic,rubric};
}

async function expectTransactionRejects(fn:(tx:any)=>Promise<void>,matching:RegExp) {
  await assert.rejects(db!.$transaction(async tx=>{await fn(tx);throw Error('TEST_DID_NOT_FAIL');}),matching);
}

test('baseline indexes and fail-closed finalization constraint are installed',{skip:!run},async()=>{
  const indexes=await db!.$queryRaw<Array<{indexname:string}>>`SELECT indexname FROM pg_indexes WHERE schemaname=current_schema()`;
  const names=new Set(indexes.map(x=>x.indexname));
  for(const expected of ['Enrollment_one_active_student_program','TeacherBatch_one_active_assignment','ProcessingAuthority_one_active_purpose']) assert.ok(names.has(expected),expected);
  const constraints=await db!.$queryRaw<Array<{conname:string}>>`SELECT conname FROM pg_constraint WHERE conname='Assessment_no_finalization_without_verifier'`;
  assert.equal(constraints.length,1);
});

test('nested academic records and outbox roll back together',{skip:!run},async()=>{
  const dedupe=`submission-${randomUUID()}`;
  await assert.rejects(db!.$transaction(async tx=>{
    const {student,program,batch,topic,rubric}=await fixture(tx);
    const submission=await tx.submission.create({data:{studentId:student.id,programId:program.id,batchId:batch.id,topicVersionId:topic.id,rubricVersionId:rubric.id,clientRequestId:randomUUID(),topicSnapshot:{topic:true},rubricSnapshot:{rubric:true},topicHash:'a'.repeat(64),rubricHash:'b'.repeat(64)}});
    await tx.verifiedWritingText.create({data:{submissionId:submission.id,language:'ENGLISH',content:'Synthetic test writing.',contentHash:'c'.repeat(64),verifiedById:student.userId}});
    await tx.assessment.create({data:{submissionId:submission.id}});
    await tx.outboxEvent.create({data:{eventType:'SUBMISSION_ACCEPTED',dedupeKey:dedupe,payload:{submissionId:submission.id}}});
    throw Error(marker);
  }),{message:marker});
  assert.equal(await db!.outboxEvent.count({where:{dedupeKey:dedupe}}),0);
});

test('active enrollment uniqueness enforced across different batches',{skip:!run},async()=>{
  await expectTransactionRejects(async tx=>{
    const {student,program,batch}=await fixture(tx);
    const another=await tx.batch.create({data:{programId:program.id,name:'Second Synthetic Batch'}});
    await tx.enrollment.create({data:{studentId:student.id,programId:program.id,batchId:batch.id}});
    await tx.enrollment.create({data:{studentId:student.id,programId:program.id,batchId:another.id}});
  },/unique|constraint/i);
});

test('program and batch composite foreign key rejects cross-program enrollment',{skip:!run},async()=>{
  await expectTransactionRejects(async tx=>{
    const {student,batch}=await fixture(tx);
    const another=await tx.academicProgram.create({data:{code:randomUUID(),name:'Other Synthetic Program'}});
    await tx.enrollment.create({data:{studentId:student.id,programId:another.id,batchId:batch.id}});
  },/foreign key|constraint/i);
});

test('published rubric cannot be edited',{skip:!run},async()=>{
  await expectTransactionRejects(async tx=>{
    const {rubric}=await fixture(tx);
    await tx.rubricVersion.update({where:{id:rubric.id},data:{snapshotHash:'e'.repeat(64)}});
  },/immutable/i);
});

test('published topic cannot be edited',{skip:!run},async()=>{
  await expectTransactionRejects(async tx=>{
    const {topic}=await fixture(tx);
    await tx.writingTopicVersion.update({where:{id:topic.id},data:{title:'Modified topic'}});
  },/immutable/i);
});

test('rubric binding cannot cross academic program',{skip:!run},async()=>{
  await expectTransactionRejects(async tx=>{
    const {rubric}=await fixture(tx);
    const another=await tx.academicProgram.create({data:{code:randomUUID(),name:'Other Synthetic Program'}});
    await tx.rubricBinding.create({data:{programId:another.id,writingType:'PARAGRAPH',language:'ENGLISH',rubricVersionId:rubric.id}});
  },/binding must target|scope/i);
});

test('verified writing is immutable in PostgreSQL',{skip:!run},async()=>{
  await expectTransactionRejects(async tx=>{
    const {student,program,batch,topic,rubric}=await fixture(tx);
    const submission=await tx.submission.create({data:{studentId:student.id,programId:program.id,batchId:batch.id,topicVersionId:topic.id,rubricVersionId:rubric.id,clientRequestId:randomUUID(),topicSnapshot:{},rubricSnapshot:{},topicHash:'a'.repeat(64),rubricHash:'b'.repeat(64)}});
    const verified=await tx.verifiedWritingText.create({data:{submissionId:submission.id,language:'ENGLISH',content:'A synthetic writing.',contentHash:'c'.repeat(64),verifiedById:student.userId}});
    await tx.verifiedWritingText.update({where:{id:verified.id},data:{content:'Silently changed writing.'}});
  },/immutable/i);
});

test('database refuses FINALIZED until vetted verifier migration exists',{skip:!run},async()=>{
  await expectTransactionRejects(async tx=>{
    const {student,program,batch,topic,rubric}=await fixture(tx);
    const submission=await tx.submission.create({data:{studentId:student.id,programId:program.id,batchId:batch.id,topicVersionId:topic.id,rubricVersionId:rubric.id,clientRequestId:randomUUID(),topicSnapshot:{},rubricSnapshot:{},topicHash:'a'.repeat(64),rubricHash:'b'.repeat(64)}});
    const assessment=await tx.assessment.create({data:{submissionId:submission.id}});
    await tx.assessment.update({where:{id:assessment.id},data:{status:'FINALIZED'}});
  },/constraint|finalization|check/i);
});

test('unique student request identity blocks duplicate submitted records',{skip:!run},async()=>{
  await expectTransactionRejects(async tx=>{
    const {student,program,batch,topic,rubric}=await fixture(tx);
    const requestId=randomUUID();
    const payload={studentId:student.id,programId:program.id,batchId:batch.id,topicVersionId:topic.id,rubricVersionId:rubric.id,clientRequestId:requestId,topicSnapshot:{},rubricSnapshot:{},topicHash:'a'.repeat(64),rubricHash:'b'.repeat(64)};
    await tx.submission.create({data:payload});
    await tx.submission.create({data:payload});
  },/unique|constraint/i);
});

test('shared PostgreSQL auth budgets atomically reject excess attempts and store no raw email/IP',{skip:!run},async()=>{
  const secret='SYNTHETIC_DB_TEST_SECRET_USE_ONLY_FOR_TEST_0123456789_ABCD';
  const ip=`synthetic-${randomUUID()}`;
  const email=`synthetic-rate-${randomUUID()}@example.test`;
  const target=buildAuthRateTargets('login',ip,secret,email);
  const limiter=new AuthRateLimitService(db! as any);
  const previous=process.env.AUTH_ABUSE_KEY;
  process.env.AUTH_ABUSE_KEY=secret;
  try {
    for(let i=0;i<12;i++) await limiter.enforce('login',ip,email);
    await assert.rejects(limiter.enforce('login',ip,email.toUpperCase()),(error:any)=>error?.getStatus?.()===429);
    const stored=await db!.authRateWindow.findMany({where:{bucketKey:{in:target.map(t=>t.bucketKey)}}});
    assert.equal(stored.length,2);
    assert.deepEqual(stored.map(x=>x.attempts).sort((a,b)=>a-b),[12,12]);
    assert.ok(stored.every(x=>!x.bucketKey.includes('synthetic')));
  } finally {
    if(previous===undefined) delete process.env.AUTH_ABUSE_KEY; else process.env.AUTH_ABUSE_KEY=previous;
    await db!.authRateWindow.deleteMany({where:{bucketKey:{in:target.map(t=>t.bucketKey)}}});
  }
});

test('concurrent registration requests share one global identity budget',{skip:!run},async()=>{
  const secret='SYNTHETIC_DB_CONCURRENT_SECRET_USE_ONLY_FOR_TEST_0123456789';
  const ip=`synthetic-${randomUUID()}`;
  const email=`synthetic-parallel-${randomUUID()}@example.test`;
  const target=buildAuthRateTargets('register',ip,secret,email);
  const limiter=new AuthRateLimitService(db! as any);
  const previous=process.env.AUTH_ABUSE_KEY;
  process.env.AUTH_ABUSE_KEY=secret;
  try {
    const results=await Promise.allSettled(Array.from({length:5},()=>limiter.enforce('register',ip,email)));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,3);
    assert.equal(results.filter(x=>x.status==='rejected' && (x.reason as any)?.getStatus?.()===429).length,2);
    const stored=await db!.authRateWindow.findMany({where:{bucketKey:{in:target.map(t=>t.bucketKey)}}});
    assert.equal(stored.length,2);
    assert.equal(stored.find(x=>x.bucketKey===target[1].bucketKey)?.attempts,3);
  } finally {
    if(previous===undefined) delete process.env.AUTH_ABUSE_KEY; else process.env.AUTH_ABUSE_KEY=previous;
    await db!.authRateWindow.deleteMany({where:{bucketKey:{in:target.map(t=>t.bucketKey)}}});
  }
});

test.after(async()=>{if(db) await db.$disconnect();});

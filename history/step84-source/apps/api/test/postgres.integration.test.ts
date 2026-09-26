/** Explicit opt-in. Use disposable PostgreSQL test DB ONLY after `prisma migrate deploy`. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';

const run=process.env.RUN_POSTGRES_INTEGRATION==='1';
if(run && !new URL(process.env.DATABASE_URL??'postgresql://localhost/invalid').pathname.endsWith('_test'))
  throw new Error('Integration tests may run only against a database named *_test');
const db=run?new PrismaClient():undefined;
const rollbackMessage='INTENTIONAL_TEST_ROLLBACK';
test('migrations installed and essential constraints exist',{skip:!run},async()=>{
  const indexes=await db!.$queryRaw<Array<{indexname:string}>>`
    SELECT indexname FROM pg_indexes WHERE schemaname=current_schema()`;
  const names=indexes.map(x=>x.indexname);
  assert.ok(names.includes('Enrollment_one_active_student_program'));
  assert.ok(names.includes('TeacherBatch_one_active_assignment'));
  assert.ok(names.includes('ProcessingAuthority_one_active_purpose'));
});
test('transaction creates scoped records and rolls back atomically',{skip:!run},async()=>{
  await assert.rejects(db!.$transaction(async tx=>{
    const user=await tx.user.create({data:{email:`fixture-${randomUUID()}@example.test`,passwordHash:'fixture-only',role:'STUDENT'}});
    const student=await tx.student.create({data:{userId:user.id}});
    const program=await tx.academicProgram.create({data:{code:randomUUID(),name:'Test Writing'}});
    const batch=await tx.batch.create({data:{programId:program.id,name:'Test Batch'}});
    const enrollment=await tx.enrollment.create({data:{studentId:student.id,programId:program.id,batchId:batch.id}});
    assert.equal(enrollment.status,'ACTIVE');
    throw Error(rollbackMessage);
  }),{message:rollbackMessage});
});
test('published rubric immutability enforced by database trigger',{skip:!run},async()=>{
  // A trigger error rolls back the whole transaction, leaving no test records behind.
  await assert.rejects(db!.$transaction(async tx=>{
    const program=await tx.academicProgram.create({data:{code:randomUUID(),name:'Test Program'}});
    const rubric=await tx.rubricVersion.create({data:{programId:program.id,language:'ENGLISH',writingType:'PARAGRAPH',version:1,status:'PUBLISHED',publishedAt:new Date(),snapshot:{fixture:true},snapshotHash:'0'.repeat(64)}});
    await tx.rubricVersion.update({where:{id:rubric.id},data:{snapshotHash:'1'.repeat(64)}});
  }),/immutable/i);
});
test.after(async()=>{if(db) await db.$disconnect();});

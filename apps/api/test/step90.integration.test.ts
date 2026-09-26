/** Step90 disposable PostgreSQL integration. Each fixture is rolled back. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {hash,type PublishedRubric,type FactorProposal} from '../../../packages/domain/src/index.ts';
import {canonicalJson} from '../src/policies/submission-policy.ts';
import {AssessmentPersistenceService} from '../src/assessment/assessment-persistence.service.ts';
import {HumanReviewService} from '../src/review/review.service.ts';
import {ProjectionService} from '../src/projections/projection.service.ts';
const enabled=process.env.RUN_POSTGRES_INTEGRATION==='1';
if(enabled&&(!process.env.DATABASE_URL||!new URL(process.env.DATABASE_URL).pathname.endsWith('_test')))
  throw new Error('Step90 requires disposable _test PostgreSQL');
const db=enabled?new PrismaClient():undefined;
const rollback='STEP90_SYNTHETIC_ROLLBACK';
const reason='Synthetic request to verify revision propagation.';
const actor=(u:any)=>({userId:u.id,role:u.role,sessionId:randomUUID()});
const factors=(criterionId:'c2'|'c4',score:'2'|'4'):FactorProposal[]=>[
 {factorId:'content',criterionId,proposedScore:score,
  rationale:'Synthetic evidence is consistent with the selected content criterion.',
  evidence:[{startOffset:7,endOffset:12,exactQuote:'books',claim:'Student mentions books'}]}
];
async function fixture(tx:any){
 const a=await tx.user.create({data:{email:`reviewer-a-${randomUUID()}@example.test`,role:'ACADEMIC_ADMIN',passwordHash:'SYNTHETIC'}});
 const b=await tx.user.create({data:{email:`reviewer-b-${randomUUID()}@example.test`,role:'ACADEMIC_ADMIN',passwordHash:'SYNTHETIC'}});
 const user=await tx.user.create({data:{email:`student-${randomUUID()}@example.test`,role:'STUDENT',passwordHash:'SYNTHETIC'}});
 const student=await tx.student.create({data:{userId:user.id}});
 const program=await tx.academicProgram.create({data:{code:randomUUID(),name:'Step90 Synthetic Program'}});
 const batch=await tx.batch.create({data:{programId:program.id,name:'Synthetic Batch'}});
 await tx.enrollment.create({data:{studentId:student.id,programId:program.id,batchId:batch.id}});
 await tx.processingAuthority.create({data:{studentId:student.id,programId:program.id,purpose:'CORE_ASSESSMENT',
   legalBasis:'SYNTHETIC_ONLY',policyVersion:'step90',approvedById:a.id}});
 await tx.academicAdminProgram.createMany({data:[{userId:a.id,programId:program.id},{userId:b.id,programId:program.id}]});
 const topic=await tx.writingTopicVersion.create({data:{programId:program.id,writingType:'PARAGRAPH',
  language:'ENGLISH',title:'Synthetic reading',instructions:'Mention reading',clues:['reading'],status:'PUBLISHED'}});
 const rubricId=randomUUID();
 const rubric:PublishedRubric={id:rubricId,versionId:rubricId,status:'PUBLISHED',scoreStep:'1',totalMarks:'4',factors:[
  {id:'content',name:'Content',maxScore:'4',criteria:[{id:'c0',score:'0',description:'absent'},
    {id:'c2',score:'2',description:'partial'},{id:'c4',score:'4',description:'clear'}]}
 ]};
 await tx.rubricVersion.create({data:{id:rubricId,programId:program.id,writingType:'PARAGRAPH',language:'ENGLISH',
  version:1,status:'PUBLISHED',snapshot:rubric,snapshotHash:hash(canonicalJson(rubric)),publishedAt:new Date()}});
 const topicSnapshot={id:topic.id,programId:program.id,writingType:'PARAGRAPH',language:'ENGLISH',
  title:topic.title,instructions:topic.instructions,clues:['reading']};
 const text='I like books.';
 const sub=await tx.submission.create({data:{studentId:student.id,programId:program.id,batchId:batch.id,
  topicVersionId:topic.id,rubricVersionId:rubricId,clientRequestId:randomUUID(),
  topicSnapshot,rubricSnapshot:rubric,topicHash:hash(canonicalJson(topicSnapshot)),rubricHash:hash(canonicalJson(rubric))}});
 await tx.verifiedWritingText.create({data:{submissionId:sub.id,language:'ENGLISH',content:text,
  contentHash:hash(text),verifiedById:user.id}});
 const assessment=await tx.assessment.create({data:{submissionId:sub.id}});
 const assessmentSvc=new AssessmentPersistenceService({$transaction:async(cb:any)=>cb(tx)} as any);
 await assessmentSvc.publishHumanUnderstanding({assessmentId:assessment.id,reviewerId:a.id,
  observations:[{category:'IDEA',finding:'Synthetic human-reviewed observation.',
   evidence:{startOffset:7,endOffset:12,exactQuote:'books',claim:'Student mentions books'}}]});
 await tx.assessment.update({where:{id:assessment.id},data:{status:'HUMAN_REVIEW'}});
 const reviews=new HumanReviewService({$transaction:async(cb:any)=>cb(tx),
  humanReviewCase:tx.humanReviewCase,assessment:tx.assessment} as any);
 const projections=new ProjectionService({$transaction:async(cb:any)=>cb(tx)} as any);
 return {a,b,user,student,assessment,reviews,projections};
}
async function finalized(tx:any){
 const f=await fixture(tx);
 const c=await f.reviews.open(actor(f.a),f.assessment.id,reason);
 await f.reviews.propose(actor(f.a),c.caseId,factors('c2','2'),reason);
 await f.reviews.decide(actor(f.b),c.caseId,'APPROVE',reason);
 const current=await tx.assessment.findUniqueOrThrow({where:{id:f.assessment.id}});
 return {...f,firstRevision:current.effectiveScoreRevisionId as string};
}
async function rollbackCase(fn:(tx:any)=>Promise<void>){
 await assert.rejects(db!.$transaction(async tx=>{await fn(tx);throw new Error(rollback);},
   {timeout:45000}),{message:rollback});
}

test('real parent summary rebuilt transactionally; absent five modules remain unavailable',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const before=await f.projections.statusForAuthorizedStudent(f.user.id,f.assessment.id);
  assert.equal(before.projections.find(x=>x.target==='PARENT')?.availability,'STALE');
  assert.equal((await f.projections.processOne(f.assessment.id)).target,'PARENT');
  const current=await tx.parentScoreProjection.findUniqueOrThrow({where:{assessmentId:f.assessment.id}});
  assert.equal(current.scoreRevisionId,f.firstRevision);
  assert.equal(current.totalScore.toString(),'2');
  for(let i=0;i<5;i++)assert.equal((await f.projections.processOne(f.assessment.id)).status,'BLOCKED');
  assert.equal((await f.projections.processOne(f.assessment.id)).status,'EMPTY');
  const after=await f.projections.statusForAuthorizedStudent(f.user.id,f.assessment.id);
  assert.equal(after.projections.find(x=>x.target==='PARENT')?.availability,'CURRENT');
  assert.equal(after.projections.filter(x=>x.availability==='UNAVAILABLE').length,5);
  assert.equal(await tx.derivedProjectionInvalidation.count({where:{assessmentId:f.assessment.id,status:'REBUILT'}}),1);
  assert.equal(await tx.derivedProjectionInvalidation.count({where:{assessmentId:f.assessment.id,status:'BLOCKED'}}),5);
 });
});

test('revised score is immediately stale until the new revision is actually built',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  await f.projections.processOne(f.assessment.id);
  const appeal=await f.reviews.open(actor(f.user),f.assessment.id,reason);
  await f.reviews.propose(actor(f.a),appeal.caseId,factors('c4','4'),reason);
  await f.reviews.decide(actor(f.b),appeal.caseId,'APPROVE',reason);
  const pending=await f.projections.statusForAuthorizedStudent(f.user.id,f.assessment.id);
  assert.notEqual(pending.effectiveRevisionId,f.firstRevision);
  assert.equal(pending.projections.find(x=>x.target==='PARENT')?.availability,'STALE');
  // Rebuilder deterministically targets the *new* effective revision, never reads cached old points.
  const rebuilt=await f.projections.processOne(f.assessment.id);
  assert.equal(rebuilt.status,'REBUILT');
  assert.equal(rebuilt.revisionId,pending.effectiveRevisionId);
  const current=await tx.parentScoreProjection.findUniqueOrThrow({where:{assessmentId:f.assessment.id}});
  assert.equal(current.totalScore.toString(),'4');
  const after=await f.projections.statusForAuthorizedStudent(f.user.id,f.assessment.id);
  assert.equal(after.projections.find(x=>x.target==='PARENT')?.availability,'CURRENT');
 });
});

test('old PENDING invalidations are superseded, never rebuilt, after a newer correction',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const appeal=await f.reviews.open(actor(f.user),f.assessment.id,reason);
  await f.reviews.propose(actor(f.a),appeal.caseId,factors('c4','4'),reason);
  await f.reviews.decide(actor(f.b),appeal.caseId,'APPROVE',reason);
  const first=await f.projections.processOne(f.assessment.id);
  assert.equal(first.status,'SUPERSEDED');
  assert.equal(first.target,'PARENT');
  assert.equal(first.revisionId,f.firstRevision);
  assert.equal(await tx.parentScoreProjection.count({where:{assessmentId:f.assessment.id}}),0);
  const second=await f.projections.processOne(f.assessment.id);
  assert.equal(second.status,'REBUILT');
  assert.notEqual(second.revisionId,f.firstRevision);
 });
});

test('DB disallows fake rebuild without matching canonical parent materialization',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const pending=await tx.derivedProjectionInvalidation.findFirstOrThrow({where:{assessmentId:f.assessment.id,target:'PARENT'}});
  await assert.rejects(tx.derivedProjectionInvalidation.update({where:{id:pending.id},
   data:{status:'REBUILT',processedAt:new Date()}}),/STEP90_REBUILD_UNSUPPORTED_OR_STALE/);
 });
});

test('DB rejects parent projection with a forged non-authoritative score',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  await assert.rejects(tx.parentScoreProjection.create({data:{assessmentId:f.assessment.id,
    scoreRevisionId:f.firstRevision,revisionNo:1,source:'HUMAN',totalScore:1,totalMarks:4}}),
    /STEP90_PARENT_PROJECTION_NOT_CANONICAL/);
 });
});

test('student-only projection status cannot reveal another students assessment',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const other=await tx.user.create({data:{email:`stranger-${randomUUID()}@example.test`,
    role:'STUDENT',passwordHash:'SYNTHETIC'}});
  await assert.rejects(f.projections.statusForAuthorizedStudent(other.id,f.assessment.id),
    /Not Found|NotFound/i);
 });
});

test.after(async()=>{if(db)await db.$disconnect();});

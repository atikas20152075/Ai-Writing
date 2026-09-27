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
import {ReportService} from '../src/reports/report.service.ts';
import {TeacherDashboardService} from '../src/teacher/teacher.service.ts';
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
  for(const target of ['FEEDBACK','PRACTICE','PROGRESS']){
    const rebuilt=await f.projections.processOne(f.assessment.id);
    assert.equal(rebuilt.status,'REBUILT');
    assert.equal(rebuilt.target,target);
  }
  for(let i=0;i<2;i++)assert.equal((await f.projections.processOne(f.assessment.id)).status,'BLOCKED');
  assert.equal((await f.projections.processOne(f.assessment.id)).status,'EMPTY');
  const after=await f.projections.statusForAuthorizedStudent(f.user.id,f.assessment.id);
  for(const target of ['PARENT','FEEDBACK','PRACTICE','PROGRESS'])
    assert.equal(after.projections.find(x=>x.target===target)?.availability,'CURRENT');
  assert.equal(after.projections.filter(x=>x.availability==='UNAVAILABLE').length,2);
  assert.equal(await tx.derivedProjectionInvalidation.count({where:{assessmentId:f.assessment.id,status:'REBUILT'}}),4);
  assert.equal(await tx.derivedProjectionInvalidation.count({where:{assessmentId:f.assessment.id,status:'BLOCKED'}}),2);
  const learning=await f.projections.learningForAuthorizedStudent(f.user.id,f.assessment.id);
  assert.equal((learning as any).learning.feedback.schemaVersion,'rubric-feedback-v1');
  assert.equal((learning as any).learning.practice.targets[0].factorId,'content');
  assert.equal((learning as any).learning.progress.status,'INSUFFICIENT_DATA');
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


test('learning artifacts are immediately withheld when a score revision supersedes them',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  for(let n=0;n<4;n++)assert.equal((await f.projections.processOne(f.assessment.id)).status,'REBUILT');
  const appeal=await f.reviews.open(actor(f.user),f.assessment.id,reason);
  await f.reviews.propose(actor(f.a),appeal.caseId,factors('c4','4'),reason);
  await f.reviews.decide(actor(f.b),appeal.caseId,'APPROVE',reason);
  const stale=await f.projections.learningForAuthorizedStudent(f.user.id,f.assessment.id);
  assert.equal((stale as any).learning.feedback,null);
  assert.equal((stale as any).learning.practice,null);
  assert.equal((stale as any).learning.progress,null);
  const current=await f.projections.statusForAuthorizedStudent(f.user.id,f.assessment.id);
  assert.equal(current.projections.find(x=>x.target==='FEEDBACK')?.availability,'STALE');
  // Old invalidations that were already rebuilt remain immutable history.
  assert.equal(await tx.derivedProjectionInvalidation.count({where:{
    assessmentId:f.assessment.id,scoreRevisionId:f.firstRevision,status:'REBUILT'}}),4);
 });
});
test('database refuses fabricated feedback completion without a real matching artifact',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const row=await tx.derivedProjectionInvalidation.findFirstOrThrow({where:{
    assessmentId:f.assessment.id,target:'FEEDBACK'}});
  await assert.rejects(tx.derivedProjectionInvalidation.update({where:{id:row.id},
    data:{status:'REBUILT',processedAt:new Date()}}),/STEP90_REBUILD_UNSUPPORTED_OR_STALE/);
 });
});
test('learning endpoint cannot disclose another student academic material',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const other=await tx.user.create({data:{email:`learning-outsider-${randomUUID()}@example.test`,
    role:'STUDENT',passwordHash:'SYNTHETIC'}});
  await assert.rejects(f.projections.learningForAuthorizedStudent(other.id,f.assessment.id),
    /Not Found|NotFound/i);
 });
});

test('a new comparable assessment invalidates and proactively refreshes an older progress cohort',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  for(let i=0;i<4;i++)assert.equal((await f.projections.processOne(f.assessment.id)).status,'REBUILT');
  const initial=await f.projections.statusForAuthorizedStudent(f.user.id,f.assessment.id);
  assert.equal(initial.projections.find(x=>x.target==='PROGRESS')?.availability,'CURRENT');
  const first=await tx.assessment.findUniqueOrThrow({where:{id:f.assessment.id},
    include:{submission:{include:{verifiedText:true}}}});
  const s=first.submission;
  const nextSubmission=await tx.submission.create({data:{
    studentId:s.studentId,programId:s.programId,batchId:s.batchId,
    topicVersionId:s.topicVersionId,rubricVersionId:s.rubricVersionId,
    clientRequestId:randomUUID(),topicSnapshot:s.topicSnapshot,
    rubricSnapshot:s.rubricSnapshot,topicHash:s.topicHash,rubricHash:s.rubricHash
  }});
  const verified=await tx.verifiedWritingText.create({data:{
    submissionId:nextSubmission.id,language:'ENGLISH',content:'I like books.',
    contentHash:hash('I like books.'),verifiedById:f.user.id
  }});
  const next=await tx.assessment.create({data:{submissionId:nextSubmission.id}});
  const understanding=new AssessmentPersistenceService({$transaction:async(cb:any)=>cb(tx)} as any);
  await understanding.publishHumanUnderstanding({assessmentId:next.id,reviewerId:f.a.id,
    observations:[{category:'IDEA',finding:'Synthetic approved comparable observation.',
      evidence:{startOffset:7,endOffset:12,exactQuote:'books',claim:'Student mentions books'}}]});
  await tx.assessment.update({where:{id:next.id},data:{status:'HUMAN_REVIEW'}});
  const opened=await f.reviews.open(actor(f.a),next.id,reason);
  await f.reviews.propose(actor(f.a),opened.caseId,factors('c4','4'),reason);
  await f.reviews.decide(actor(f.b),opened.caseId,'APPROVE',reason);
  const stale=await f.projections.learningForAuthorizedStudent(f.user.id,f.assessment.id);
  assert.equal(stale.projections.find(x=>x.target==='PROGRESS')?.availability,'STALE');
  assert.equal((stale as any).learning.progress,null);
  // Existing unsupported TEACHER/REPORT receipts are resolved before the idle
  // cohort-refresh fallback is reached; no unsupported module can fake success.
  for(let n=0;n<2;n++)assert.equal((await f.projections.processOne(f.assessment.id)).status,'BLOCKED');
  const refreshed=await f.projections.processOne(f.assessment.id);
  assert.equal(refreshed.status,'REFRESHED');
  assert.equal(refreshed.target,'PROGRESS');
  const current=await f.projections.learningForAuthorizedStudent(f.user.id,f.assessment.id);
  assert.equal(current.projections.find(x=>x.target==='PROGRESS')?.availability,'CURRENT');
  assert.equal((current as any).learning.progress.comparableCount,2);
  assert.equal((current as any).learning.progress.status,'DESCRIPTIVE_DELTA');
  assert.equal(await tx.derivedProjectionInvalidation.count({where:{
    assessmentId:f.assessment.id,scoreRevisionId:f.firstRevision,status:'REBUILT'}}),4);
 });
});


test('Step103 bilingual PDF is a real scoped export with immutable current revision provenance',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const report=new ReportService({$transaction:async(cb:any)=>cb(tx)} as any);
  const first=await report.pdfReport(actor(f.user),f.assessment.id);
  assert.equal(first.pdf.subarray(0,5).toString(),'%PDF-');
  assert.equal(first.formatVersion,'rubric-report-v2-en');
  assert.equal(first.revisionId,f.firstRevision);
  const stored=await tx.reportSnapshot.findFirstOrThrow({where:{assessmentId:f.assessment.id}});
  assert.equal(stored.scoreRevisionId,f.firstRevision);
  assert.equal(stored.snapshotHash,first.snapshotHash);
  const receipt=await tx.derivedProjectionInvalidation.findFirstOrThrow({where:{
    assessmentId:f.assessment.id,scoreRevisionId:f.firstRevision,target:'REPORT'}});
  assert.equal(receipt.status,'REBUILT');
  const second=await report.pdfReport(actor(f.a),f.assessment.id);
  assert.equal(first.snapshotHash,second.snapshotHash);
  assert.equal(await tx.reportSnapshot.count({where:{assessmentId:f.assessment.id}}),1);
  const issued=await tx.auditEvent.count({where:{
    resourceId:f.assessment.id,action:'REPORT_PDF_GENERATED'}});
  assert.equal(issued,2);
 });
});
test('Step92 current-scoped teacher and guardian report; revoke rights, never bypass with super admin',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const report=new ReportService({$transaction:async(cb:any)=>cb(tx)} as any);
  const dashboard=new TeacherDashboardService({$transaction:async(cb:any)=>cb(tx),
    batch:tx.batch,user:tx.user,teacherBatch:tx.teacherBatch,
    academicAdminProgram:tx.academicAdminProgram} as any);
  const sub=await tx.submission.findUniqueOrThrow({where:{id:(
    await tx.assessment.findUniqueOrThrow({where:{id:f.assessment.id}})).submissionId}});
  const adminPage=await dashboard.cohort(actor(f.a),sub.batchId);
  assert.equal(adminPage.assessments[0].effectiveRevisionId,f.firstRevision);
  assert.equal(adminPage.assessments[0].totalScore,'2');
  const teacher=await tx.user.create({data:{email:`teacher-${randomUUID()}@example.test`,
    role:'TEACHER',passwordHash:'SYNTHETIC'}});
  const assignment=await tx.teacherBatch.create({data:{teacherId:teacher.id,batchId:sub.batchId}});
  const teacherPage=await dashboard.cohort(actor(teacher),sub.batchId);
  assert.equal(teacherPage.assessments.length,1);
  assert.equal((await report.pdfReport(actor(teacher),f.assessment.id)).revisionId,f.firstRevision);
  const guardian=await tx.user.create({data:{email:`guardian-${randomUUID()}@example.test`,
    role:'PARENT',passwordHash:'SYNTHETIC'}});
  const link=await tx.parentStudentLink.create({data:{guardianId:guardian.id,studentId:f.student.id,
    programId:sub.programId,status:'ACTIVE',verifiedAt:new Date(),activatedAt:new Date(),
    approvedById:f.a.id}});
  assert.equal((await report.pdfReport(actor(guardian),f.assessment.id)).revisionId,f.firstRevision);
  await tx.parentStudentLink.update({where:{id:link.id},data:{status:'REVOKED',revokedAt:new Date()}});
  await assert.rejects(report.pdfReport(actor(guardian),f.assessment.id),/Not Found|NotFound/i);
  await tx.teacherBatch.update({where:{id:assignment.id},data:{endedAt:new Date()}});
  await assert.rejects(dashboard.cohort(actor(teacher),sub.batchId),/Not Found|NotFound/i);
  await assert.rejects(report.pdfReport(actor(teacher),f.assessment.id),/Not Found|NotFound/i);
  const superUser=await tx.user.create({data:{email:`super-${randomUUID()}@example.test`,
    role:'SUPER_ADMIN',passwordHash:'SYNTHETIC'}});
  await assert.rejects(report.pdfReport(actor(superUser),f.assessment.id),/Not Found|NotFound/i);
  await assert.rejects(dashboard.cohort(actor(superUser),sub.batchId),/Forbidden/i);
 });
});
test('Step92 updated human grade always generates a NEW report revision; old snapshots remain history',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const service=new ReportService({$transaction:async(cb:any)=>cb(tx)} as any);
  const original=await service.pdfReport(actor(f.user),f.assessment.id);
  const appeal=await f.reviews.open(actor(f.user),f.assessment.id,reason);
  await f.reviews.propose(actor(f.a),appeal.caseId,factors('c4','4'),reason);
  await f.reviews.decide(actor(f.b),appeal.caseId,'APPROVE',reason);
  const current=await tx.assessment.findUniqueOrThrow({where:{id:f.assessment.id}});
  assert.notEqual(current.effectiveScoreRevisionId,original.revisionId);
  const revised=await service.pdfReport(actor(f.user),f.assessment.id);
  assert.notEqual(revised.revisionId,original.revisionId);
  assert.notEqual(revised.snapshotHash,original.snapshotHash);
  assert.equal(await tx.reportSnapshot.count({where:{assessmentId:f.assessment.id}}),2);
  await assert.rejects(tx.reportSnapshot.update({where:{
    assessmentId_scoreRevisionId_formatVersion:{assessmentId:f.assessment.id,
      scoreRevisionId:original.revisionId,formatVersion:'rubric-report-v2-en'}},
    data:{snapshotHash:'f'.repeat(64)}}),/STEP88_/);
 });
});
test('Step92 DB rejects forged report points or REPORT REBUILT without a real snapshot',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const receipt=await tx.derivedProjectionInvalidation.findFirstOrThrow({where:{
    assessmentId:f.assessment.id,target:'REPORT'}});
  await assert.rejects(tx.derivedProjectionInvalidation.update({where:{id:receipt.id},
    data:{status:'REBUILT',processedAt:new Date()}}),/STEP90_REBUILD_UNSUPPORTED_OR_STALE/);
 });
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const sub=await tx.submission.findUniqueOrThrow({where:{id:(
    await tx.assessment.findUniqueOrThrow({where:{id:f.assessment.id}})).submissionId}});
  await assert.rejects(tx.reportSnapshot.create({data:{assessmentId:f.assessment.id,
    scoreRevisionId:f.firstRevision,formatVersion:'rubric-report-v2-en',
    snapshotHash:'a'.repeat(64),createdById:f.a.id,
    snapshot:{schemaVersion:'rubric-report-v2',assessmentId:f.assessment.id,
      scoreRevisionId:f.firstRevision,revisionNo:1,rubricVersionId:sub.rubricVersionId,
      source:'HUMAN',language:'ENGLISH',topicTitle:'Synthetic reading',
      totalScore:'99',totalMarks:'4',factorResults:[]}}}),
    /STEP92_REPORT_NOT_CANONICAL/);
 });
});

test.after(async()=>{if(db)await db.$disconnect();});

// Step93 family discovery uses the same current scope as individual result reads.
import {ParentAssessmentResultController} from '../src/review/parent-result.controller.ts';
async function familyFixture(tx:any){
 const f=await finalized(tx);
 const sub=await tx.submission.findUniqueOrThrow({where:{id:f.assessment.submissionId}});
 const guardian=await tx.user.create({data:{email:`family-${randomUUID()}@example.test`,role:'PARENT',passwordHash:'SYNTHETIC'}});
 const link=await tx.parentStudentLink.create({data:{guardianId:guardian.id,studentId:f.student.id,
  programId:sub.programId,status:'ACTIVE',verifiedAt:new Date(),activatedAt:new Date(),approvedById:f.a.id}});
 const controller=new ParentAssessmentResultController(tx);
 const req={actor:actor(guardian)} as any;
 return {...f,sub,guardian,link,controller,req};
}
test('Step93 parent catalog exposes only linked program results and current score revision',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await familyFixture(tx),other=await finalized(tx);
  const first=await f.controller.list(f.req);
  assert.deepEqual(first.assessments.map(x=>x.assessmentId),[f.assessment.id]);
  assert.equal(first.assessments[0].totalScore,'2');
  assert.equal(first.assessments[0].effectiveRevisionId,f.firstRevision);
  assert.equal(first.nextCursor,null);
  assert.equal('factorResults' in first.assessments[0],false);
  await assert.rejects(f.controller.result(f.req,other.student.id,other.assessment.id),/Not Found/i);
  await assert.rejects(f.controller.list({actor:actor(f.a)} as any),/Forbidden/i);
  await assert.rejects(f.controller.list(f.req,'not-a-uuid'),/Invalid cursor/i);
  const appeal=await f.reviews.open(actor(f.user),f.assessment.id,reason);
  await f.reviews.propose(actor(f.a),appeal.caseId,factors('c4','4'),reason);
  await f.reviews.decide(actor(f.b),appeal.caseId,'APPROVE',reason);
  const current=(await f.controller.list(f.req)).assessments[0];
  assert.equal(current.totalScore,'4');assert.notEqual(current.effectiveRevisionId,f.firstRevision);
 });
});
test('Step93 guardian revocation, future verification and processing/enrollment loss hide list AND detail',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await familyFixture(tx);
  const absent=async()=>{
   assert.equal((await f.controller.list(f.req)).assessments.length,0);
   await assert.rejects(f.controller.result(f.req,f.student.id,f.assessment.id),/Not Found/i);
  };
  await tx.parentStudentLink.update({where:{id:f.link.id},data:{verifiedAt:new Date(Date.now()+86400000)}});await absent();
  await tx.parentStudentLink.update({where:{id:f.link.id},data:{status:'REVOKED',verifiedAt:new Date(),revokedAt:new Date()}});await absent();
  await tx.parentStudentLink.update({where:{id:f.link.id},data:{status:'ACTIVE',revokedAt:null}});
  await tx.processingAuthority.updateMany({where:{studentId:f.student.id},data:{endedAt:new Date()}});await absent();
  await tx.processingAuthority.updateMany({where:{studentId:f.student.id},data:{endedAt:null}});
  await tx.enrollment.updateMany({where:{studentId:f.student.id},data:{endedAt:new Date()}});await absent();
  await tx.enrollment.updateMany({where:{studentId:f.student.id},data:{endedAt:null}});
  await tx.user.update({where:{id:f.guardian.id},data:{status:'DISABLED'}});await absent();
 });
});
test('Step93 keyset pages exclude historical authority duplicates, unlinked programs and pending scores',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await familyFixture(tx);
  // Historical authority records must not duplicate a row in a page.
  // The database intentionally forbids two simultaneous ACTIVE authorities.
  await tx.processingAuthority.create({data:{studentId:f.student.id,programId:f.sub.programId,
   purpose:'CORE_ASSESSMENT',status:'WITHDRAWN',endedAt:new Date(),legalBasis:'SYNTHETIC_ONLY',policyVersion:'step93',approvedById:f.a.id}});
  for(let i=0;i<21;i++){
   const {id,createdAt,...copy}=f.sub;
   const sub=await tx.submission.create({data:{...copy,clientRequestId:randomUUID()}});
   await tx.assessment.create({data:{submissionId:sub.id}});
  }
  const first=await f.controller.list(f.req);
  assert.equal(first.assessments.length,20);assert.ok(first.nextCursor);
  const second=await f.controller.list(f.req,first.nextCursor!);
  assert.equal(second.assessments.length,2);assert.equal(second.nextCursor,null);
  const all=[...first.assessments,...second.assessments];
  assert.equal(new Set(all.map(x=>x.assessmentId)).size,22);
  for(const row of all.filter(x=>x.status!=='FINALIZED')){
   assert.equal(row.totalScore,null);assert.equal(row.effectiveRevisionId,null);
  }
  // Existing child with another active program does not imply a link to that program.
  const program=await tx.academicProgram.create({data:{code:randomUUID(),name:'Other synthetic program'}});
  await tx.parentStudentLink.update({where:{id:f.link.id},data:{programId:program.id}});
  assert.equal((await f.controller.list(f.req)).assessments.length,0);
 });
});

test('Step93 cohort discovery returns only active assigned batches and rejects global admin',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx),other=await finalized(tx);
  const sub=await tx.submission.findUniqueOrThrow({where:{id:f.assessment.submissionId}});
  const teacher=await tx.user.create({data:{email:`discovery-${randomUUID()}@example.test`,role:'TEACHER',passwordHash:'SYNTHETIC'}});
  const assignment=await tx.teacherBatch.create({data:{teacherId:teacher.id,batchId:sub.batchId}});
  const dashboard=new TeacherDashboardService(tx);
  assert.deepEqual((await dashboard.mine(actor(teacher))).cohorts.map(x=>x.id),[sub.batchId]);
  assert.deepEqual((await dashboard.mine(actor(f.a))).cohorts.map(x=>x.id),[sub.batchId]);
  await assert.rejects(dashboard.mine({...actor(f.a),role:'SUPER_ADMIN'}),/Forbidden/i);
  await tx.teacherBatch.update({where:{id:assignment.id},data:{endedAt:new Date()}});
  assert.deepEqual((await dashboard.mine(actor(teacher))).cohorts,[]);
  await tx.academicAdminProgram.updateMany({where:{userId:f.a.id},data:{endedAt:new Date()}});
  assert.deepEqual((await dashboard.mine(actor(f.a))).cohorts,[]);
 });
});

test('Step98 cohort analytics stays current, authorization scoped, and separated by immutable rubric',{skip:!enabled},async()=>{
 await rollbackCase(async tx=>{
  const f=await finalized(tx);
  const original=await tx.submission.findUniqueOrThrow({where:{id:f.assessment.submissionId}});
  const teacher=await tx.user.create({data:{email:`analytics-${randomUUID()}@example.test`,role:'TEACHER',passwordHash:'SYNTHETIC'}});
  const assignment=await tx.teacherBatch.create({data:{teacherId:teacher.id,batchId:original.batchId}});
  const dashboard=new TeacherDashboardService({$transaction:(cb:any)=>cb(tx)} as any);
  const secondUser=await tx.user.create({data:{email:`analytics-student-${randomUUID()}@example.test`,role:'STUDENT',passwordHash:'SYNTHETIC'}});
  const secondStudent=await tx.student.create({data:{userId:secondUser.id}});
  await tx.enrollment.create({data:{studentId:secondStudent.id,programId:original.programId,batchId:original.batchId}});
  await tx.processingAuthority.create({data:{studentId:secondStudent.id,programId:original.programId,
   purpose:'CORE_ASSESSMENT',legalBasis:'SYNTHETIC_ONLY',policyVersion:'step98',approvedById:f.a.id}});
  const rubric2Id=randomUUID();
  const rubric2={...(original.rubricSnapshot as any),id:rubric2Id,versionId:rubric2Id};
  await tx.rubricVersion.create({data:{id:rubric2Id,programId:original.programId,writingType:'PARAGRAPH',
   language:'ENGLISH',version:2,status:'PUBLISHED',snapshot:rubric2,snapshotHash:hash(canonicalJson(rubric2)),publishedAt:new Date()}});
  const submission2=await tx.submission.create({data:{studentId:secondStudent.id,programId:original.programId,
   batchId:original.batchId,topicVersionId:original.topicVersionId,rubricVersionId:rubric2Id,
   clientRequestId:randomUUID(),topicSnapshot:original.topicSnapshot,rubricSnapshot:rubric2,
   topicHash:original.topicHash,rubricHash:hash(canonicalJson(rubric2))}});
  await tx.assessment.create({data:{submissionId:submission2.id}});

  const first=await dashboard.analytics(actor(teacher),original.batchId);
  assert.equal(first.groups.length,2);
  const v1=first.groups.find((x:any)=>x.rubricVersionId===original.rubricVersionId)!;
  const v2=first.groups.find((x:any)=>x.rubricVersionId===rubric2Id)!;
  assert.equal(v1.meanScore,'2');assert.equal(v1.finalizedCount,1);assert.equal(v1.notFinalizedCount,0);
  assert.equal(v2.meanScore,null);assert.equal(v2.finalizedCount,0);assert.equal(v2.notFinalizedCount,1);
  assert.equal('studentId' in v1,false);assert.equal('assessmentId' in v1,false);

  const appeal=await f.reviews.open(actor(f.user),f.assessment.id,reason);
  await f.reviews.propose(actor(f.a),appeal.caseId,factors('c4','4'),reason);
  await f.reviews.decide(actor(f.b),appeal.caseId,'APPROVE',reason);
  const updated=await dashboard.analytics(actor(teacher),original.batchId);
  assert.equal(updated.groups.find((x:any)=>x.rubricVersionId===original.rubricVersionId)!.meanScore,'4');
  await tx.teacherBatch.update({where:{id:assignment.id},data:{endedAt:new Date()}});
  await assert.rejects(dashboard.analytics(actor(teacher),original.batchId),/Not Found|NotFound/i);
  await assert.rejects(dashboard.analytics(actor(f.user),original.batchId),/Forbidden/i);
  const superUser=await tx.user.create({data:{email:`analytics-super-${randomUUID()}@example.test`,role:'SUPER_ADMIN',passwordHash:'SYNTHETIC'}});
  await assert.rejects(dashboard.analytics(actor(superUser),original.batchId),/Forbidden/i);
 });
});

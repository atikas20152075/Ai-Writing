/** Synthetic-only PostgreSQL integration: every fixture is rolled back. */
import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {hash,createVerifiedText,lockAssessmentContext,type PublishedRubric,type FactorProposal} from '../../../packages/domain/src/index.ts';
import {canonicalJson} from '../src/policies/submission-policy.ts';
import {AssessmentPersistenceService} from '../src/assessment/assessment-persistence.service.ts';
import {HumanReviewService} from '../src/review/review.service.ts';
import {ParentAssessmentResultController} from '../src/review/parent-result.controller.ts';
import {AssessmentReadController} from '../src/assessment/assessment.controller.ts';
import type {AIResult,AIGatewayClient} from '../src/ai/ai-gateway-client.ts';
const enabled=process.env.RUN_POSTGRES_INTEGRATION==='1';
if(enabled&&(!process.env.DATABASE_URL||!new URL(process.env.DATABASE_URL).pathname.endsWith('_test')))
  throw new Error('Step89 tests require disposable PostgreSQL ending _test');
const db=enabled?new PrismaClient():undefined;
const rollback='SYNTHETIC_STEP89_TRANSACTION_ROLLBACK';
const reason='Synthetic request for independently evidenced score review.';
const factors:FactorProposal[]=[{factorId:'content',criterionId:'c2',proposedScore:'2',
  rationale:'Synthetic evidence supports partial development.',
  evidence:[{startOffset:7,endOffset:12,exactQuote:'books',claim:'Mentions books'}]}];
const actor=(u:any)=>({userId:u.id,role:u.role,sessionId:randomUUID()});
async function fixture(tx:any){
 const admin=await tx.user.create({data:{email:`acad-a-${randomUUID()}@example.test`,passwordHash:'SYNTHETIC',role:'ACADEMIC_ADMIN'}});
 const other=await tx.user.create({data:{email:`acad-b-${randomUUID()}@example.test`,passwordHash:'SYNTHETIC',role:'ACADEMIC_ADMIN'}});
 const studentUser=await tx.user.create({data:{email:`student-${randomUUID()}@example.test`,passwordHash:'SYNTHETIC',role:'STUDENT'}});
 const outsider=await tx.user.create({data:{email:`outsider-${randomUUID()}@example.test`,passwordHash:'SYNTHETIC',role:'ACADEMIC_ADMIN'}});
 const guardian=await tx.user.create({data:{email:`parent-${randomUUID()}@example.test`,passwordHash:'SYNTHETIC',role:'PARENT'}});
 const student=await tx.student.create({data:{userId:studentUser.id}});
 const program=await tx.academicProgram.create({data:{code:randomUUID(),name:'Synthetic writing'}});
 const batch=await tx.batch.create({data:{programId:program.id,name:'Synthetic cohort'}});
 await tx.academicAdminProgram.createMany({data:[{userId:admin.id,programId:program.id},{userId:other.id,programId:program.id}]});
 await tx.enrollment.create({data:{studentId:student.id,programId:program.id,batchId:batch.id}});
 await tx.processingAuthority.createMany({data:[{studentId:student.id,programId:program.id,purpose:'CORE_ASSESSMENT',
   legalBasis:'SYNTHETIC_ONLY',policyVersion:'t',approvedById:admin.id},
  {studentId:student.id,programId:program.id,purpose:'EXTERNAL_AI_ASSESSMENT',
   legalBasis:'SYNTHETIC_ONLY',policyVersion:'t',approvedById:admin.id}]});
 await tx.parentStudentLink.create({data:{studentId:student.id,programId:program.id,guardianId:guardian.id,
   status:'ACTIVE',verifiedAt:new Date(),activatedAt:new Date(),approvedById:admin.id}});
 const topic=await tx.writingTopicVersion.create({data:{programId:program.id,writingType:'PARAGRAPH',language:'ENGLISH',
   title:'Synthetic reading',instructions:'Mention reading',clues:['reading'],status:'PUBLISHED'}});
 const rubricId=randomUUID();const rubric:PublishedRubric={id:rubricId,versionId:rubricId,status:'PUBLISHED',
  scoreStep:'1',totalMarks:'4',factors:[{id:'content',name:'Content',maxScore:'4',criteria:[
   {id:'c0',score:'0',description:'absent'},{id:'c2',score:'2',description:'partial'},
   {id:'c4',score:'4',description:'clear'}]}]};
 const rub=await tx.rubricVersion.create({data:{id:rubricId,programId:program.id,writingType:'PARAGRAPH',
   language:'ENGLISH',version:1,status:'PUBLISHED',snapshot:rubric,snapshotHash:hash(canonicalJson(rubric)),publishedAt:new Date()}});
 const topicSnapshot={id:topic.id,programId:program.id,writingType:'PARAGRAPH',language:'ENGLISH',
   title:topic.title,instructions:topic.instructions,clues:['reading']};
 const text='I like books.';
 const sub=await tx.submission.create({data:{studentId:student.id,programId:program.id,batchId:batch.id,
   topicVersionId:topic.id,rubricVersionId:rub.id,clientRequestId:randomUUID(),topicSnapshot,rubricSnapshot:rubric,
   topicHash:hash(canonicalJson(topicSnapshot)),rubricHash:hash(canonicalJson(rubric))}});
 const verified=await tx.verifiedWritingText.create({data:{submissionId:sub.id,language:'ENGLISH',
   content:text,contentHash:hash(text),verifiedById:studentUser.id}});
 const a=await tx.assessment.create({data:{submissionId:sub.id}});
 const understanding=new AssessmentPersistenceService({$transaction:async(cb:any)=>cb(tx)} as any);
 await understanding.publishHumanUnderstanding({assessmentId:a.id,reviewerId:admin.id,observations:[
  {category:'IDEA',finding:'Synthetic observation made by a reviewer.',evidence:{startOffset:7,endOffset:12,
   exactQuote:'books',claim:'Student mentions books'}}]});
 return {admin,other,outsider,guardian,student,studentUser,program,batch,sub,a,rubric,verified,topicSnapshot,understanding};
}
async function rollbackCase(fn:(tx:any,s:HumanReviewService)=>Promise<void>){
 await assert.rejects(db!.$transaction(async tx=>{
   const service=new HumanReviewService({$transaction:async(cb:any)=>cb(tx),
     humanReviewCase:tx.humanReviewCase,assessment:tx.assessment} as any);
   await fn(tx,service);
   throw new Error(rollback);
 },{timeout:40000}),{message:rollback});
}
async function flagged(tx:any,f:any){await tx.assessment.update({where:{id:f.a.id},data:{status:'HUMAN_REVIEW'}});}
async function finalizedAI(tx:any,f:any){
 const env={AI_RELEASE_GATE_APPROVED:'true',AI_CHILD_PROCESSING_APPROVED:'true',
   OPENAI_EXAMINER_MODEL:'synthetic-e',OPENAI_VERIFIER_MODEL:'synthetic-v',
   AI_SERVICE_SHARED_TOKEN:'synthetic-only-internal-32-character-boundary-secret'};
 const prev=Object.fromEntries(Object.keys(env).map(x=>[x,process.env[x]]));Object.assign(process.env,env);
 try{
   await tx.aIReleaseGate.create({data:{programId:f.program.id,rubricVersionId:f.rubric.versionId,
     language:'ENGLISH',examinerModel:'synthetic-e',verifierModel:'synthetic-v',
     academicBenchmarkRef:'SYNTHETIC_ONLY_NOT_ACADEMIC_APPROVAL',privacyReviewRef:'SYNTHETIC_ONLY_NOT_PRIVACY_REVIEW',
     approvedById:f.admin.id,approvedAt:new Date(Date.now()-5000),expiresAt:new Date(Date.now()+86_400_000)}});
   const u=await tx.understandingSnapshot.findUniqueOrThrow({where:{assessmentId:f.a.id}});
   const ctx=lockAssessmentContext(f.a.id,createVerifiedText(f.verified.id,f.sub.id,'ENGLISH',f.verified.content),
     f.sub.topicHash,u.snapshotHash,f.rubric);
   const rawFactor={...factors[0],criterionId:'c4',proposedScore:'4'};
   const response:AIResult={state:'PASS_NOT_FINALIZED',proposal:{examinerRunId:'synthetic-e-1',
     assessmentId:f.a.id,inputHash:ctx.inputHash,totalScore:'4',totalMarks:'4',factorResults:[rawFactor]},
     examinerMetadata:{runId:'synthetic-e-1',model:'synthetic-e',promptVersion:'test-e-v1',providerRequestId:'synthetic-p1'},
     verifierMetadata:{attemptId:'synthetic-v-1',model:'synthetic-v',promptVersion:'test-v-v1',
       independentProviderRequestId:'synthetic-p2',challengeProviderRequestId:'synthetic-p3'},
     verification:{status:'PASS',reviewedFactorIds:['content'],scoreChangingCorrection:false,findings:[],
       independentFactorResults:[rawFactor]}};
   const result=await f.understanding.process(f.a.id,{runLocked:async()=>response} as unknown as AIGatewayClient);
   assert.equal(result.state,'FINALIZED');
 }finally{for(const [k,v] of Object.entries(prev)){
   if(v===undefined)delete process.env[k];else process.env[k]=v;
 }}
}

test('human escalations need independent approved first score and enqueue six projection rebuilds',{skip:!enabled},async()=>{
 await rollbackCase(async(tx,svc)=>{
  const f=await fixture(tx);await flagged(tx,f);
  const opened=await svc.open(actor(f.admin),f.a.id,reason);
  assert.equal(opened.status,'OPEN');
  assert.equal((await svc.open(actor(f.admin),f.a.id,reason)).replayed,true);
  await svc.propose(actor(f.admin),opened.caseId,factors,reason);
  await assert.rejects(svc.decide(actor(f.admin),opened.caseId,'APPROVE',reason),/TWO_PERSON|two.person/i);
  const done=await svc.decide(actor(f.other),opened.caseId,'APPROVE',reason);
  assert.equal(done.status,'RESOLVED_CORRECTED');
  const a=await tx.assessment.findUniqueOrThrow({where:{id:f.a.id},include:{effectiveScoreRevision:true}});
  assert.equal(a.status,'FINALIZED');assert.equal(a.effectiveScoreRevision?.source,'HUMAN');
  assert.equal(a.effectiveScoreRevision?.revisionNo,1);
  assert.equal(a.effectiveScoreRevision?.totalScore.toString(),'2');
  assert.equal(await tx.derivedProjectionInvalidation.count({where:{assessmentId:f.a.id,scoreRevisionId:a.effectiveScoreRevision!.id}}),6);
  assert.equal(await tx.outboxEvent.count({where:{eventType:'ASSESSMENT_SCORE_FINALIZED'}}),1);
  assert.equal((await svc.decide(actor(f.other),opened.caseId,'APPROVE',reason)).replayed,true);
 });
});
test('finalized AI mark remains immutable; distinct authorized reviewer creates revision 2',{skip:!enabled},async()=>{
 await rollbackCase(async(tx,svc)=>{
   const f=await fixture(tx);await finalizedAI(tx,f);
   const original=await tx.assessment.findUniqueOrThrow({where:{id:f.a.id}});
   const opened=await svc.open(actor(f.studentUser),f.a.id,reason);
   await assert.rejects(svc.propose(actor(f.outsider),opened.caseId,factors,reason),/grant|reviewer|scope/i);
   await svc.propose(actor(f.admin),opened.caseId,factors,reason);
   const approved=await svc.decide(actor(f.other),opened.caseId,'APPROVE',reason);
   const a=await tx.assessment.findUniqueOrThrow({where:{id:f.a.id},include:{effectiveScoreRevision:true}});
   assert.equal(approved.status,'RESOLVED_CORRECTED');
   assert.equal(a.effectiveScoreRevision?.revisionNo,2);
   assert.equal(a.effectiveScoreRevision?.totalScore.toString(),'2');
   assert.equal((await tx.assessmentScoreRevision.findUniqueOrThrow({where:{id:original.effectiveScoreRevisionId!}})).totalScore.toString(),'4');
   assert.equal(await tx.outboxEvent.count({where:{eventType:'ASSESSMENT_SCORE_REVISED'}}),1);
   const studentApi=new AssessmentReadController(tx as any);
   const studentResult=await studentApi.result({actor:actor(f.studentUser)} as any,f.a.id);
   assert.equal(studentResult.result?.totalScore,'2');
   const parentApi=new ParentAssessmentResultController(tx as any);
   const parentResult=await parentApi.result({actor:actor(f.guardian)} as any,f.student.id,f.a.id);
   assert.equal(parentResult.result?.totalScore,'2');
 });
});
test('revoked guardian cannot appeal or retrieve even a previously finalized result',{skip:!enabled},async()=>{
 await rollbackCase(async(tx,svc)=>{
  const f=await fixture(tx);await finalizedAI(tx,f);
  await tx.parentStudentLink.update({where:{guardianId_studentId_programId:{guardianId:f.guardian.id,
    studentId:f.student.id,programId:f.program.id}},data:{status:'REVOKED',revokedAt:new Date()}});
  await assert.rejects(svc.open(actor(f.guardian),f.a.id,reason),/Not Found|not found|NotFound/i);
  await assert.rejects(new ParentAssessmentResultController(tx as any).result({actor:actor(f.guardian)} as any,
    f.student.id,f.a.id),/Not Found|NotFound/i);
 });
});
test('PostgreSQL rejects a forged human score without a second reviewer',{skip:!enabled},async()=>{
 await rollbackCase(async(tx)=>{
  const f=await fixture(tx);await flagged(tx,f);
  await assert.rejects(tx.assessmentScoreRevision.create({data:{assessmentId:f.a.id,
    revisionNo:1,source:'HUMAN',inputHash:'a'.repeat(64),totalScore:4,totalMarks:4,factorResults:[],reviewDecisionId:null}}),
    /unapproved|constraint|source|violates/i);
 });
});
test('PostgreSQL rejects a premature FINALIZED transition without any score',{skip:!enabled},async()=>{
 await rollbackCase(async(tx)=>{
  const f=await fixture(tx);await flagged(tx,f);
  await assert.rejects(tx.assessment.update({where:{id:f.a.id},data:{status:'FINALIZED'}}),/constraint|finalization/i);
 });
});
test('reviewer permission revocation before approval prevents any score change',{skip:!enabled},async()=>{
 await rollbackCase(async(tx,svc)=>{
   const f=await fixture(tx);await flagged(tx,f);
   const opened=await svc.open(actor(f.admin),f.a.id,reason);
   await svc.propose(actor(f.admin),opened.caseId,factors,reason);
   await tx.academicAdminProgram.updateMany({where:{userId:f.other.id,programId:f.program.id,endedAt:null},
     data:{endedAt:new Date()}});
   await assert.rejects(svc.decide(actor(f.other),opened.caseId,'APPROVE',reason),/grant|scope|found/i);
   assert.equal(await tx.assessmentScoreRevision.count({where:{assessmentId:f.a.id}}),0);
 });
});
test('UPHOLD closes finalized appeal without changing the effective score',{skip:!enabled},async()=>{
 await rollbackCase(async(tx,svc)=>{
   const f=await fixture(tx);await finalizedAI(tx,f);
   const initial=(await tx.assessment.findUniqueOrThrow({where:{id:f.a.id}})).effectiveScoreRevisionId;
   const opened=await svc.open(actor(f.studentUser),f.a.id,reason);
   const beforeCount=await tx.derivedProjectionInvalidation.count({where:{assessmentId:f.a.id}});
   await svc.decide(actor(f.other),opened.caseId,'UPHOLD',reason);
   const unchanged=await tx.assessment.findUniqueOrThrow({where:{id:f.a.id}});
   assert.equal(unchanged.effectiveScoreRevisionId,initial);
   assert.equal(await tx.derivedProjectionInvalidation.count({where:{assessmentId:f.a.id}}),beforeCount);
 });
});

test('SQL trigger denies direct self-approval even when bypassing the NestJS reviewer service',{skip:!enabled},async()=>{
 await rollbackCase(async(tx,svc)=>{
   const f=await fixture(tx);await flagged(tx,f);
   const opened=await svc.open(actor(f.admin),f.a.id,reason);
   const proposal=await svc.propose(actor(f.admin),opened.caseId,factors,reason);
   await assert.rejects(tx.humanReviewDecision.create({data:{reviewCaseId:opened.caseId,
     proposalId:proposal.proposalId,decidedById:f.admin.id,decision:'APPROVE',reason}}),
     /STEP89_INVALID_REVIEW_DECISION/i);
 });
});
test('PostgreSQL makes a submitted human scoring proposal permanently immutable',{skip:!enabled},async()=>{
 await rollbackCase(async(tx,svc)=>{
   const f=await fixture(tx);await flagged(tx,f);
   const opened=await svc.open(actor(f.admin),f.a.id,reason);
   const proposal=await svc.propose(actor(f.admin),opened.caseId,factors,reason);
   await assert.rejects(tx.humanReviewProposal.update({where:{id:proposal.proposalId},
     data:{reason:'Unauthorized mutation of immutable scoring rationale.'}}),/immutable/i);
 });
});
test('an unrelated student cannot appeal a different students assessment',{skip:!enabled},async()=>{
 await rollbackCase(async(tx,svc)=>{
   const f=await fixture(tx);await finalizedAI(tx,f);
   const stranger=await tx.user.create({data:{email:`unrelated-${randomUUID()}@example.test`,
     passwordHash:'SYNTHETIC',role:'STUDENT'}});
   await assert.rejects(svc.open(actor(stranger),f.a.id,reason),/not found|NotFound/i);
   assert.equal(await tx.humanReviewCase.count({where:{assessmentId:f.a.id}}),0);
 });
});
test.after(async()=>{if(db)await db.$disconnect();});

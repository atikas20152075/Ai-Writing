/** Disposable PostgreSQL only. Every test rolls back; never operate on real student data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {createVerifiedText,hash,lockAssessmentContext,type PublishedRubric} from '../../../packages/domain/src/index.ts';
import {canonicalJson} from '../src/policies/submission-policy.ts';
import {AssessmentPersistenceService} from '../src/assessment/assessment-persistence.service.ts';
import type {HumanObservation} from '../src/assessment/assessment-policy.ts';
import type {AIResult,AIGatewayClient} from '../src/ai/ai-gateway-client.ts';

const run=process.env.RUN_POSTGRES_INTEGRATION==='1';
const url=process.env.DATABASE_URL;
if(run && (!url || !new URL(url).pathname.endsWith('_test')))
  throw new Error('Step88 tests require a DISPOSABLE PostgreSQL database ending in _test');
const db=run?new PrismaClient():undefined;
const rollback='SYNTHETIC_STEP88_ROLLBACK';
const synthetic=()=>({AI_RELEASE_GATE_APPROVED:'true',AI_CHILD_PROCESSING_APPROVED:'true',
  OPENAI_EXAMINER_MODEL:'synthetic-examiner-v1',OPENAI_VERIFIER_MODEL:'synthetic-verifier-v1',
  AI_SERVICE_SHARED_TOKEN:'synthetic-internal-secret-123456789012345678901234'});
async function fixture(tx:any){
  const admin=await tx.user.create({data:{email:`synthetic-admin-${randomUUID()}@example.test`,
    passwordHash:'SYNTHETIC-NOT-A-REAL-HASH',role:'ACADEMIC_ADMIN'}});
  const user=await tx.user.create({data:{email:`synthetic-student-${randomUUID()}@example.test`,
    passwordHash:'SYNTHETIC-NOT-A-REAL-HASH',role:'STUDENT'}});
  const student=await tx.student.create({data:{userId:user.id}});
  const program=await tx.academicProgram.create({data:{code:randomUUID(),name:'Synthetic academic program'}});
  const batch=await tx.batch.create({data:{programId:program.id,name:'Synthetic cohort'}});
  await tx.enrollment.create({data:{studentId:student.id,programId:program.id,batchId:batch.id}});
  for(const purpose of ['CORE_ASSESSMENT','EXTERNAL_AI_ASSESSMENT'])
    await tx.processingAuthority.create({data:{studentId:student.id,programId:program.id,purpose,
      legalBasis:'SYNTHETIC-TEST',policyVersion:'vTEST',approvedById:admin.id}});
  const topic=await tx.writingTopicVersion.create({data:{programId:program.id,writingType:'PARAGRAPH',language:'ENGLISH',
    title:'Synthetic books',instructions:'Write one sentence about books',clues:['reading'],status:'PUBLISHED'}});
  const rubricId=randomUUID();
  const rubric:PublishedRubric={id:rubricId,versionId:rubricId,status:'PUBLISHED',scoreStep:'1',totalMarks:'4',
    factors:[{id:'content',name:'Content',maxScore:'4',criteria:[{id:'c0',score:'0',description:'absent'},
      {id:'c2',score:'2',description:'partial'},{id:'c4',score:'4',description:'clear idea'}]}]};
  const rub=await tx.rubricVersion.create({data:{id:rubricId,programId:program.id,writingType:'PARAGRAPH',
    language:'ENGLISH',version:1,status:'PUBLISHED',snapshot:rubric,
    snapshotHash:hash(canonicalJson(rubric)),publishedAt:new Date()}});
  const topicSnapshot={id:topic.id,programId:program.id,writingType:'PARAGRAPH',language:'ENGLISH',
    title:topic.title,instructions:topic.instructions,clues:['reading']};
  const text='I like books.';
  const sub=await tx.submission.create({data:{studentId:student.id,programId:program.id,batchId:batch.id,
    topicVersionId:topic.id,rubricVersionId:rub.id,clientRequestId:randomUUID(),
    topicSnapshot,rubricSnapshot:rubric,topicHash:hash(canonicalJson(topicSnapshot)),
    rubricHash:hash(canonicalJson(rubric))}});
  const verified=await tx.verifiedWritingText.create({data:{submissionId:sub.id,language:'ENGLISH',
    content:text,contentHash:hash(text),verifiedById:user.id}});
  const assessment=await tx.assessment.create({data:{submissionId:sub.id}});
  const gate=await tx.aIReleaseGate.create({data:{programId:program.id,rubricVersionId:rub.id,language:'ENGLISH',
    examinerModel:'synthetic-examiner-v1',verifierModel:'synthetic-verifier-v1',
    academicBenchmarkRef:'SYNTHETIC_DATA_ONLY_NOT_ACADEMIC_APPROVAL',
    privacyReviewRef:'SYNTHETIC_DATA_ONLY_NOT_PRIVACY_APPROVAL',
    approvedById:admin.id,approvedAt:new Date(Date.now()-5_000),expiresAt:new Date(Date.now()+86_400_000)}});
  const observation:HumanObservation={category:'IDEA',finding:'Synthetic observation made by synthetic admin',
    evidence:{startOffset:7,endOffset:12,exactQuote:'books',claim:'Student names books'}};
  return {admin,student,program,sub,assessment,gate,rubric,verified,topicSnapshot,observation};
}
async function transactionCase(fn:(tx:any,service:AssessmentPersistenceService)=>Promise<void>){
  const env=synthetic();const backup=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
  Object.assign(process.env,env);
  try {
    await assert.rejects(db!.$transaction(async tx=>{
      const service=new AssessmentPersistenceService({$transaction:async(callback:any)=>callback(tx)} as any);
      await fn(tx,service);
      throw new Error(rollback);
    },{timeout:30000}),{message:rollback});
  } finally {for(const [k,v] of Object.entries(backup)){
    if(v===undefined)delete process.env[k];else process.env[k]=v;
  }}
}
function syntheticGateway(expected:{assessmentId:string;inputHash:string;model?:string},decision:'PASS'|'MAJOR_REVIEW'='PASS'){
  const factor={factorId:'content',criterionId:decision==='PASS'?'c4':'c2',proposedScore:decision==='PASS'?'4':'2',
    rationale:'SYNTHETIC TEST ONLY',evidence:[{startOffset:7,endOffset:12,exactQuote:'books',claim:'Synthetic evidence'}]};
  const result:AIResult={state:decision==='PASS'?'PASS_NOT_FINALIZED':'HUMAN_REVIEW_REQUIRED',
    proposal:{examinerRunId:'synthetic-run',assessmentId:expected.assessmentId,
      inputHash:expected.inputHash,totalScore:factor.proposedScore,totalMarks:'4',factorResults:[factor]},
    examinerMetadata:{runId:'synthetic-run',model:'synthetic-examiner-v1',promptVersion:'synthetic-ex-v1',
      providerRequestId:'synthetic-provider-1'},
    verifierMetadata:{attemptId:'synthetic-verify',model:'synthetic-verifier-v1',promptVersion:'synthetic-ver-v1',
      independentProviderRequestId:'synthetic-provider-2',challengeProviderRequestId:'synthetic-provider-3'},
    verification:{status:decision,reviewedFactorIds:['content'],scoreChangingCorrection:false,findings:[],
      independentFactorResults:[factor]}};
  return {runLocked:async(ctx:any)=>{
    assert.equal(ctx.inputHash,expected.inputHash);return result;
  }} as unknown as AIGatewayClient;
}

test('Step88 reviewed Understanding is idempotent and transactional',{skip:!run},async()=>{
  await transactionCase(async(tx,svc)=>{
    const f=await fixture(tx);
    const first=await svc.publishHumanUnderstanding({assessmentId:f.assessment.id,
      reviewerId:f.admin.id,observations:[f.observation]});
    assert.equal(first.status,'UNDERSTANDING_READY');
    const repeat=await svc.publishHumanUnderstanding({assessmentId:f.assessment.id,
      reviewerId:f.admin.id,observations:[f.observation]});
    assert.equal(repeat.replayed,true);
    assert.equal(await tx.outboxEvent.count({where:{eventType:'ASSESSMENT_CONTEXT_APPROVED'}}),1);
  });
});

test('Step88 PostgreSQL rejects modification of reviewed Understanding',{skip:!run},async()=>{
  await assert.rejects(db!.$transaction(async tx=>{
    const f=await fixture(tx);
    const service=new AssessmentPersistenceService({$transaction:async(callback:any)=>callback(tx)} as any);
    const approved=await service.publishHumanUnderstanding({assessmentId:f.assessment.id,
      reviewerId:f.admin.id,observations:[f.observation]});
    await tx.understandingSnapshot.update({where:{id:approved.snapshotId},data:{schemaVersion:'tampered'}});
  },{timeout:12000}),/immutable/i);
});

test('Step88 refuses any premature FINALIZED transition without effective verified revision',{skip:!run},async()=>{
  await assert.rejects(db!.$transaction(async tx=>{
    const f=await fixture(tx);
    await tx.assessment.update({where:{id:f.assessment.id},data:{status:'FINALIZED'}});
  },{timeout:12000}),/constraint|finalization/i);
});

test('Step88 private synthetic runner persists PASS once and canonical student score',{skip:!run},async()=>{
  await transactionCase(async(tx,svc)=>{
    const f=await fixture(tx);
    await svc.publishHumanUnderstanding({assessmentId:f.assessment.id,reviewerId:f.admin.id,
      observations:[f.observation]});
    const human=await tx.understandingSnapshot.findUniqueOrThrow({where:{assessmentId:f.assessment.id}});
    const context=lockAssessmentContext(f.assessment.id,createVerifiedText(f.verified.id,f.sub.id,'ENGLISH',f.verified.content),
      f.sub.topicHash,human.snapshotHash,f.rubric);
    const done=await svc.process(f.assessment.id,syntheticGateway({assessmentId:f.assessment.id,inputHash:context.inputHash}));
    assert.equal(done.state,'FINALIZED');
    const row=await tx.assessment.findUniqueOrThrow({where:{id:f.assessment.id},include:{effectiveScoreRevision:true}});
    assert.equal(row.status,'FINALIZED');assert.equal(row.effectiveScoreRevision?.totalScore.toString(),'4');
    assert.equal(await tx.aIExaminerRun.count({where:{assessmentId:f.assessment.id}}),1);
    assert.equal(await tx.assessmentScoreRevision.count({where:{assessmentId:f.assessment.id}}),1);
    assert.equal((await svc.process(f.assessment.id,syntheticGateway({assessmentId:f.assessment.id,inputHash:context.inputHash}))).state,'NO_ACTION');
    assert.equal(await tx.outboxEvent.count({where:{eventType:'ASSESSMENT_SCORE_FINALIZED'}}),1);
  });
});

test('Step88 verifier escalation persists independently but never exposes final marks',{skip:!run},async()=>{
  await transactionCase(async(tx,svc)=>{
    const f=await fixture(tx);
    await svc.publishHumanUnderstanding({assessmentId:f.assessment.id,reviewerId:f.admin.id,observations:[f.observation]});
    const u=await tx.understandingSnapshot.findUniqueOrThrow({where:{assessmentId:f.assessment.id}});
    const context=lockAssessmentContext(f.assessment.id,createVerifiedText(f.verified.id,f.sub.id,'ENGLISH',f.verified.content),
      f.sub.topicHash,u.snapshotHash,f.rubric);
    const result=await svc.process(f.assessment.id,syntheticGateway({assessmentId:f.assessment.id,inputHash:context.inputHash},'MAJOR_REVIEW'));
    assert.equal(result.state,'HUMAN_REVIEW_REQUIRED');
    const a=await tx.assessment.findUniqueOrThrow({where:{id:f.assessment.id}});
    assert.equal(a.effectiveScoreRevisionId,null);
    assert.equal(await tx.aIVerificationAttempt.count({where:{status:'MAJOR_REVIEW'}}),1);
  });
});

test('Step88 worker refuses incomplete external AI approval before any provider call',{skip:!run},async()=>{
  await transactionCase(async(tx,svc)=>{
    const f=await fixture(tx);
    await svc.publishHumanUnderstanding({assessmentId:f.assessment.id,reviewerId:f.admin.id,observations:[f.observation]});
    const prev=process.env.AI_CHILD_PROCESSING_APPROVED;process.env.AI_CHILD_PROCESSING_APPROVED='false';
    try {await assert.rejects(svc.claim(f.assessment.id),/approved|processing/i);
      assert.equal(await tx.aIProcessingAttempt.count({where:{assessmentId:f.assessment.id}}),0);
    } finally {process.env.AI_CHILD_PROCESSING_APPROVED=prev;}
  });
});

test('Step88 issued release gate revocation blocks processing BEFORE any model call',{skip:!run},async()=>{
  await transactionCase(async(tx,svc)=>{
    const f=await fixture(tx);
    await svc.publishHumanUnderstanding({assessmentId:f.assessment.id,reviewerId:f.admin.id,observations:[f.observation]});
    await tx.aIReleaseGate.update({where:{id:f.gate.id},data:{revokedAt:new Date()}});
    await assert.rejects(svc.claim(f.assessment.id),/release gate/i);
  });
});

test.after(async()=>{if(db)await db.$disconnect();});

/** Step88: private trusted worker/reviewer API only. No client-facing mark-writing route. */
import {ConflictException,ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma,type PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {hash,createVerifiedText,lockAssessmentContext,validatePublishedRubric,
  finalizeApprovedAssessment,type LockedContext,type PublishedRubric} from '../../../../packages/domain/src/index.ts';
import {canonicalJson} from '../policies/submission-policy.ts';
import {PrismaService} from '../prisma/prisma.service.ts';
import {projectionTargets} from '../projections/projection-policy.ts';
import {AIGatewayClient,AIContractError,type AIResult,type TopicSnapshot} from '../ai/ai-gateway-client.ts';
import {checkedSnapshot,requireLiveAIApproval,
  understandingHash,validateHumanUnderstanding,validatePersistedAIResult,
  type HumanUnderstanding,type HumanObservation} from './assessment-policy.ts';

type Db=PrismaClient;
type Claim={attemptId:string;leaseToken:string;gateId:string;inputHash:string;
  context:LockedContext;topic:TopicSnapshot;understanding:HumanUnderstanding;
  expected:{examinerModel:string;verifierModel:string}};
const sixMinutes=6*60*1000;

@Injectable()
export class AssessmentPersistenceService {
  constructor(@Inject(PrismaService) private readonly db:PrismaService){}

  private async snapshotOf(tx:Prisma.TransactionClient,assessmentId:string){
    const assessment=await tx.assessment.findUnique({where:{id:assessmentId},
      include:{submission:{include:{verifiedText:true,rubric:true,topic:true}},understanding:true}});
    if(!assessment||assessment.submission.status!=='ACCEPTED'||!assessment.submission.verifiedText)
      throw new NotFoundException('Assessment context unavailable');
    const s=assessment.submission;
    const text=createVerifiedText(s.verifiedText!.id,s.id,s.verifiedText!.language,s.verifiedText!.content);
    if(text.contentHash!==s.verifiedText!.contentHash||hash(canonicalJson(s.topicSnapshot))!==s.topicHash||
      hash(canonicalJson(s.rubricSnapshot))!==s.rubricHash||s.rubric.status!=='PUBLISHED'||
      s.rubric.snapshotHash!==s.rubricHash||s.rubricVersionId!==s.rubric.id)
      throw new ConflictException('Immutable assessment sources failed integrity checks');
    const rubric=s.rubricSnapshot as unknown as PublishedRubric;
    validatePublishedRubric(rubric);
    if(rubric.versionId!==s.rubricVersionId)throw new ConflictException('Rubric version mismatch');
    const topic=s.topicSnapshot as unknown as TopicSnapshot;
    if(topic.id!==s.topicVersionId||topic.programId!==s.programId||topic.language!==text.language||
      !Array.isArray(topic.clues)||topic.clues.some(c=>typeof c!=='string'))
      throw new ConflictException('Topic snapshot context mismatch');
    return {assessment,s,text,rubric,topic};
  }

  /** A reviewer must already be a current, scope-authorized human. This is not an AI summary. */
  async publishHumanUnderstanding(input:{assessmentId:string;reviewerId:string;observations:HumanObservation[]}){
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Assessment" WHERE id=${input.assessmentId}::uuid FOR UPDATE`;
      const {assessment,s,text,rubric}=await this.snapshotOf(tx,input.assessmentId);
      const reviewer=await tx.user.findUnique({where:{id:input.reviewerId}});
      if(!reviewer||reviewer.status!=='ACTIVE'||!['TEACHER','ACADEMIC_ADMIN'].includes(reviewer.role))
        throw new ForbiddenException('Active academic reviewer required');
      if(reviewer.role==='TEACHER'){
        const [assignment,enrollment]=await Promise.all([
          tx.teacherBatch.findFirst({where:{teacherId:reviewer.id,batchId:s.batchId,endedAt:null,assignedAt:{lte:new Date()}}}),
          tx.enrollment.findFirst({where:{studentId:s.studentId,programId:s.programId,batchId:s.batchId,status:'ACTIVE',endedAt:null}})
        ]);
        if(!assignment||!enrollment)throw new ForbiddenException('Reviewer not assigned to current student cohort');
      }
      const authority=await tx.processingAuthority.findFirst({where:{studentId:s.studentId,programId:s.programId,
        purpose:'CORE_ASSESSMENT',status:'ACTIVE',endedAt:null}});
      if(!authority)throw new ForbiddenException('Current educational processing authorization required');
      const snapshot:HumanUnderstanding={source:'HUMAN_REVIEWED',schemaVersion:'understanding-human-v1',
        language:text.language,verifiedTextId:text.id,verifiedTextHash:text.contentHash,
        topicHash:s.topicHash,rubricHash:s.rubricHash,observations:input.observations};
      validateHumanUnderstanding(snapshot,text,s.topicHash,s.rubricHash);
      const digest=understandingHash(snapshot);
      if(assessment.understanding){
        if(assessment.understanding.snapshotHash!==digest||assessment.understanding.reviewedById!==reviewer.id)
          throw new ConflictException('Published Understanding is immutable');
        return {snapshotId:assessment.understanding.id,status:assessment.status,replayed:true};
      }
      if(assessment.status!=='AWAITING_UNDERSTANDING')throw new ConflictException('Understanding already processing');
      const record=await tx.understandingSnapshot.create({data:{assessmentId:assessment.id,
        verifiedTextId:text.id,verifiedTextHash:text.contentHash,topicHash:s.topicHash,
        rubricHash:s.rubricHash,schemaVersion:snapshot.schemaVersion,
        snapshot:snapshot as unknown as Prisma.InputJsonValue,snapshotHash:digest,reviewedById:reviewer.id}});
      await tx.assessment.update({where:{id:assessment.id},data:{status:'UNDERSTANDING_READY'}});
      await tx.outboxEvent.create({data:{eventType:'ASSESSMENT_CONTEXT_APPROVED',
        dedupeKey:`understanding-${assessment.id}-${digest}`,
        payload:{assessmentId:assessment.id}}});
      await tx.auditEvent.create({data:{actorId:reviewer.id,action:'UNDERSTANDING_HUMAN_REVIEWED',
        resourceType:'Assessment',resourceId:assessment.id,
        details:{understandingSnapshotId:record.id,programId:s.programId}}});
      return {snapshotId:record.id,status:'UNDERSTANDING_READY',replayed:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:10000});
  }

  /** Claims are deduplicated by locked academic context PLUS the separately approved release gate. */
  async claim(assessmentId:string):Promise<Claim|null>{
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Assessment" WHERE id=${assessmentId}::uuid FOR UPDATE`;
      const {assessment,s,text,rubric,topic}=await this.snapshotOf(tx,assessmentId);
      const u=assessment.understanding;
      if(!u)throw new ConflictException('Human-reviewed Understanding is not published');
      const human=u.snapshot as unknown as HumanUnderstanding;
      if(u.verifiedTextId!==text.id||u.verifiedTextHash!==text.contentHash||
        u.topicHash!==s.topicHash||u.rubricHash!==s.rubricHash||
        understandingHash(human)!==u.snapshotHash)
        throw new ConflictException('Understanding snapshot integrity failure');
      const context=lockAssessmentContext(assessment.id,text,s.topicHash,u.snapshotHash,rubric);
      checkedSnapshot(context,topic,human);
      if(assessment.status==='FINALIZED'||assessment.status==='HUMAN_REVIEW'||assessment.status==='FAILED')return null;
      if(!['UNDERSTANDING_READY','EXAMINER_PENDING'].includes(assessment.status))
        throw new ConflictException('Assessment is not ready for trusted processing');
      const gate=await tx.aIReleaseGate.findFirst({where:{programId:s.programId,rubricVersionId:s.rubricVersionId,
        language:text.language,revokedAt:null,approvedAt:{lte:new Date()},expiresAt:{gt:new Date()}},
        orderBy:{approvedAt:'desc'}});
      if(!gate)throw new ConflictException('No reviewed AI release gate for this academic scope');
      requireLiveAIApproval(process.env,{examinerModel:gate.examinerModel,verifierModel:gate.verifierModel});
      const approver=await tx.user.findUnique({where:{id:gate.approvedById}});
      if(!approver||approver.status!=='ACTIVE'||approver.role!=='ACADEMIC_ADMIN')
        throw new ForbiddenException('AI release gate needs active academic approval');
      const authority=await tx.processingAuthority.findFirst({where:{studentId:s.studentId,programId:s.programId,
        purpose:'EXTERNAL_AI_ASSESSMENT',status:'ACTIVE',endedAt:null}});
      if(!authority)throw new ForbiddenException('Separate external AI processing authority required');
      const key=hash(canonicalJson({assessmentId,inputHash:context.inputHash,gateId:gate.id}));
      const found=await tx.aIProcessingAttempt.findUnique({where:{runKey:key}});
      if(found?.status==='COMPLETED'||found?.status==='HUMAN_REVIEW'||found?.status==='FAILED')return null;
      if(found?.status==='CLAIMED'&&found.leaseUntil>new Date())return null;
      if(found&&found.attemptCount>=3){
        await tx.aIProcessingAttempt.update({where:{id:found.id},data:{status:'FAILED',errorCode:'RETRIES_EXHAUSTED'}});
        await tx.assessment.update({where:{id:assessmentId},data:{status:'HUMAN_REVIEW'}});
        await tx.outboxEvent.create({data:{eventType:'ASSESSMENT_TECHNICAL_REVIEW_REQUIRED',
          dedupeKey:`processing-exhausted-${found.id}`,payload:{assessmentId}}});
        return null;
      }
      const token=randomUUID(),leaseUntil=new Date(Date.now()+sixMinutes);
      const attempt=found?await tx.aIProcessingAttempt.update({where:{id:found.id},data:{
        status:'CLAIMED',leaseToken:token,leaseUntil,attemptCount:{increment:1},errorCode:null}}):
        await tx.aIProcessingAttempt.create({data:{assessmentId,gateId:gate.id,runKey:key,
          inputHash:context.inputHash,leaseToken:token,leaseUntil,status:'CLAIMED'}});
      if(assessment.status==='UNDERSTANDING_READY')await tx.assessment.update({where:{id:assessmentId},data:{status:'EXAMINER_PENDING'}});
      return {attemptId:attempt.id,leaseToken:token,gateId:gate.id,inputHash:context.inputHash,
        context,topic,understanding:human,expected:{examinerModel:gate.examinerModel,verifierModel:gate.verifierModel}};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:10000});
  }

  /** External calls happen outside the DB transaction. A stale worker can NEVER publish results. */
  async process(assessmentId:string,gateway:AIGatewayClient){
    const claim=await this.claim(assessmentId);
    if(!claim)return {state:'NO_ACTION'} as const;
    try{
      const result=await gateway.runLocked(claim.context,claim.topic);
      return await this.complete(claim,result);
    }catch(error){
      await this.fail(claim,error);
      throw error;
    }
  }

  private async complete(claim:Claim,result:AIResult){
    const {verified,proposed}=validatePersistedAIResult(claim.context,result,claim.expected);
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Assessment" WHERE id=${claim.context.assessmentId}::uuid FOR UPDATE`;
      const attempt=await tx.aIProcessingAttempt.findUnique({where:{id:claim.attemptId}});
      if(!attempt||attempt.leaseToken!==claim.leaseToken||attempt.status!=='CLAIMED'||
        attempt.leaseUntil<=new Date()||attempt.inputHash!==claim.inputHash||attempt.gateId!==claim.gateId)
        throw new ConflictException('Stale or superseded AI worker lease');
      const {assessment,s,text,rubric,topic}=await this.snapshotOf(tx,claim.context.assessmentId);
      const u=assessment.understanding;
      if(!u||understandingHash(u.snapshot as unknown as HumanUnderstanding)!==u.snapshotHash||
        lockAssessmentContext(assessment.id,text,s.topicHash,u.snapshotHash,rubric).inputHash!==claim.inputHash)
        throw new ConflictException('Approved academic context changed');
      const gate=await tx.aIReleaseGate.findUnique({where:{id:claim.gateId}});
      if(!gate||gate.revokedAt||gate.expiresAt<=new Date()||gate.programId!==s.programId||
        gate.rubricVersionId!==s.rubricVersionId||gate.language!==text.language||
        gate.examinerModel!==claim.expected.examinerModel||gate.verifierModel!==claim.expected.verifierModel)
        throw new ForbiddenException('AI release authorization changed');
      requireLiveAIApproval(process.env,claim.expected);
      const authority=await tx.processingAuthority.findFirst({where:{studentId:s.studentId,programId:s.programId,
        purpose:'EXTERNAL_AI_ASSESSMENT',status:'ACTIVE',endedAt:null}});
      if(!authority)throw new ForbiddenException('External processing authority withdrawn');
      if(assessment.status!=='EXAMINER_PENDING'||hash(canonicalJson(topic))!==s.topicHash)
        throw new ConflictException('Assessment state changed during inference');
      const examiner=await tx.aIExaminerRun.create({data:{assessmentId:assessment.id,processingAttemptId:attempt.id,
        gateId:gate.id,externalRunId:result.examinerMetadata.runId,inputHash:claim.inputHash,
        proposal:proposed as unknown as Prisma.InputJsonValue,proposalHash:hash(canonicalJson(proposed)),
        totalScore:verified.totalScore,totalMarks:verified.totalMarks,
        model:result.examinerMetadata.model,promptVersion:result.examinerMetadata.promptVersion,
        providerRequestId:result.examinerMetadata.providerRequestId}});
      const verification=await tx.aIVerificationAttempt.create({data:{examinerRunId:examiner.id,
        externalAttemptId:result.verifierMetadata.attemptId,inputHash:claim.inputHash,
        status:result.verification.status,scoreChangingCorrection:result.verification.scoreChangingCorrection,
        reviewedFactorIds:result.verification.reviewedFactorIds,independentFactorResults:result.verification.independentFactorResults as unknown as Prisma.InputJsonValue,
        findings:result.verification.findings,model:result.verifierMetadata.model,
        promptVersion:result.verifierMetadata.promptVersion,
        independentProviderRequestId:result.verifierMetadata.independentProviderRequestId,
        challengeProviderRequestId:result.verifierMetadata.challengeProviderRequestId}});
      if(result.state!=='PASS_NOT_FINALIZED'){
        await tx.aIProcessingAttempt.update({where:{id:attempt.id},data:{status:'HUMAN_REVIEW'}});
        await tx.assessment.update({where:{id:assessment.id},data:{status:'HUMAN_REVIEW'}});
        await tx.outboxEvent.create({data:{eventType:'ASSESSMENT_HUMAN_REVIEW_REQUIRED',
          dedupeKey:`verification-review-${verification.id}`,payload:{assessmentId:assessment.id}}});
        return {state:'HUMAN_REVIEW_REQUIRED',assessmentId:assessment.id};
      }
      finalizeApprovedAssessment(verified,{verificationAttemptId:result.verifierMetadata.attemptId,
        acceptedExaminerRunId:result.examinerMetadata.runId,inputHash:claim.inputHash,
        status:'PASS',reviewedFactorIds:result.verification.reviewedFactorIds,
        scoreChangingCorrection:result.verification.scoreChangingCorrection});
      await tx.assessment.update({where:{id:assessment.id},data:{status:'VERIFIER_PENDING'}});
      const revision=await tx.assessmentScoreRevision.create({data:{assessmentId:assessment.id,
        revisionNo:1,examinerRunId:examiner.id,verificationId:verification.id,inputHash:claim.inputHash,
        totalScore:verified.totalScore,totalMarks:verified.totalMarks,
        factorResults:proposed.factorResults as unknown as Prisma.InputJsonValue,source:'AI'}});
      await tx.assessment.update({where:{id:assessment.id},data:{status:'FINALIZED',effectiveScoreRevisionId:revision.id}});
      await tx.aIProcessingAttempt.update({where:{id:attempt.id},data:{status:'COMPLETED'}});
      // Same transaction as finalization: never leave an AI score without downstream invalidation.
      await tx.derivedProjectionInvalidation.createMany({data:projectionTargets.map(target=>({
        assessmentId:assessment.id,scoreRevisionId:revision.id,target,status:'PENDING'})),skipDuplicates:true});
      await tx.outboxEvent.create({data:{eventType:'ASSESSMENT_SCORE_FINALIZED',
        dedupeKey:`score-revision-${revision.id}`,payload:{assessmentId:assessment.id,revisionId:revision.id}}});
      await tx.auditEvent.create({data:{action:'AI_SCORE_VERIFIED_FINALIZATION',
        resourceType:'Assessment',resourceId:assessment.id,
        details:{gateId:gate.id,examinerRunId:examiner.id,verificationId:verification.id,revisionId:revision.id}}});
      return {state:'FINALIZED' as const,assessmentId:assessment.id,scoreRevisionId:revision.id};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000});
  }

  private async fail(claim:Claim,error:unknown){
    const permitted=new Set(['AI_PROVIDER_UNAVAILABLE','AI_BAD_RESPONSE','AI_EXTERNAL_PROCESSING_NOT_APPROVED',
      'AI_UNSUPPORTED_VERIFIER_PASS','AI_INDEPENDENT_DISAGREEMENT']);
    const code=error instanceof AIContractError&&permitted.has(error.code)?error.code:'AI_PROCESSING_RETRY_REQUIRED';
    // Failure records contain ONLY safe code and IDs, never model prompts, student text or provider bodies.
    await this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Assessment" WHERE id=${claim.context.assessmentId}::uuid FOR UPDATE`;
      const attempt=await tx.aIProcessingAttempt.findUnique({where:{id:claim.attemptId}});
      if(attempt?.leaseToken!==claim.leaseToken||attempt?.status!=='CLAIMED')return;
      const terminal=code==='AI_EXTERNAL_PROCESSING_NOT_APPROVED'||attempt.attemptCount>=3;
      await tx.aIProcessingAttempt.update({where:{id:attempt.id},data:{
        status:terminal?'FAILED':'RETRYABLE',errorCode:code,leaseUntil:new Date()}});
      if(terminal){
        await tx.assessment.update({where:{id:claim.context.assessmentId},data:{status:'HUMAN_REVIEW'}});
        await tx.outboxEvent.upsert({where:{dedupeKey:`processing-failure-${attempt.id}`},
          create:{eventType:'ASSESSMENT_TECHNICAL_REVIEW_REQUIRED',dedupeKey:`processing-failure-${attempt.id}`,
            payload:{assessmentId:claim.context.assessmentId}},update:{}});
      }
    });
  }
}

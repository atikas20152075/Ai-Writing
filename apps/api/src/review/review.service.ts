/** Step89 human grade reviews: current scoped authorization + 2-person audit + immutable revision pointer. */
import {ConflictException,ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma, type PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {createVerifiedText,hash,lockAssessmentContext,type FactorProposal,type PublishedRubric} from '../../../../packages/domain/src/index.ts';
import {canonicalJson} from '../policies/submission-policy.ts';
import {understandingHash,type HumanUnderstanding} from '../assessment/assessment-policy.ts';
import {PrismaService} from '../prisma/prisma.service.ts';
import type {Actor} from '../auth/jwt.guard.ts';
import {checkDecision,checkIndependentApproval,checkOpening,derivedTargets,reviewReason,
  validateHumanCorrection,ReviewPolicyError,type ReviewCaseKind} from './review-policy.ts';

interface Subject {assessmentId:string;studentId:string;programId:string;batchId:string;
  studentUserId:string;status:string;effectiveScoreRevisionId:string|null;understandingHash:string;}
@Injectable()
export class HumanReviewService {
  constructor(@Inject(PrismaService) private readonly db:PrismaService){}
  private async subject(tx:Prisma.TransactionClient,id:string){
    const a=await tx.assessment.findUnique({where:{id},include:{submission:{include:{student:true,verifiedText:true}},
      understanding:true,effectiveScoreRevision:true}});
    if(!a||!a.submission.verifiedText||!a.understanding)throw new NotFoundException('Reviewable assessment not available');
    const s=a.submission;
    if(s.status!=='ACCEPTED'||a.understanding.verifiedTextHash!==s.verifiedText!.contentHash||
      a.understanding.rubricHash!==s.rubricHash||a.understanding.topicHash!==s.topicHash||
      understandingHash(a.understanding.snapshot as unknown as HumanUnderstanding)!==a.understanding.snapshotHash)
      throw new ConflictException('Academic source snapshot changed');
    const subject:Subject={assessmentId:id,studentId:s.studentId,programId:s.programId,
      batchId:s.batchId,studentUserId:s.student.userId,status:a.status,
      effectiveScoreRevisionId:a.effectiveScoreRevisionId,understandingHash:a.understanding.snapshotHash};
    return {a,s,subject};
  }
  private async requireCoreAuthority(tx:Prisma.TransactionClient,subject:Subject){
    const authority=await tx.processingAuthority.findFirst({where:{studentId:subject.studentId,programId:subject.programId,
      purpose:'CORE_ASSESSMENT',status:'ACTIVE',endedAt:null}});
    if(!authority)throw new ForbiddenException('Current educational processing authority required');
  }
  private async reviewer(tx:Prisma.TransactionClient,actor:Actor,subject:Subject):Promise<void>{
    const user=await tx.user.findUnique({where:{id:actor.userId},select:{role:true,status:true}});
    if(!user||user.status!=='ACTIVE'||!['ACADEMIC_ADMIN','TEACHER'].includes(user.role))throw new ForbiddenException();
    await this.requireCoreAuthority(tx,subject);
    if(user.role==='ACADEMIC_ADMIN'){
      const grant=await tx.academicAdminProgram.findFirst({where:{userId:actor.userId,programId:subject.programId,
        assignedAt:{lte:new Date()},endedAt:null}});
      if(!grant)throw new NotFoundException('No current academic program grant');
    }else{
      const [assignment,enrollment]=await Promise.all([
        tx.teacherBatch.findFirst({where:{teacherId:actor.userId,batchId:subject.batchId,
          assignedAt:{lte:new Date()},endedAt:null}}),
        tx.enrollment.findFirst({where:{studentId:subject.studentId,programId:subject.programId,
          batchId:subject.batchId,status:'ACTIVE',startedAt:{lte:new Date()},endedAt:null}})
      ]);
      if(!assignment||!enrollment)throw new NotFoundException('Not an active assigned cohort reviewer');
    }
  }
  private async requester(tx:Prisma.TransactionClient,actor:Actor,subject:Subject){
    const user=await tx.user.findUnique({where:{id:actor.userId},select:{role:true,status:true}});
    if(!user||user.status!=='ACTIVE')throw new ForbiddenException();
    await this.requireCoreAuthority(tx,subject);
    if(user.role==='STUDENT'){
      if(actor.userId!==subject.studentUserId)throw new NotFoundException();
      return 'STUDENT_APPEAL' as ReviewCaseKind;
    }
    if(user.role==='PARENT'){
      const [link,enrollment]=await Promise.all([
        tx.parentStudentLink.findUnique({where:{guardianId_studentId_programId:{guardianId:actor.userId,
          studentId:subject.studentId,programId:subject.programId}}}),
        tx.enrollment.findFirst({where:{studentId:subject.studentId,programId:subject.programId,
          status:'ACTIVE',startedAt:{lte:new Date()},endedAt:null}})
      ]);
      if(!link||link.status!=='ACTIVE'||!link.verifiedAt||!link.activatedAt||link.revokedAt||!enrollment)
        throw new NotFoundException();
      return 'GUARDIAN_APPEAL' as ReviewCaseKind;
    }
    await this.reviewer(tx,actor,subject);
    return subject.status==='HUMAN_REVIEW'?'AI_ESCALATION':'ACADEMIC_CORRECTION' as ReviewCaseKind;
  }
  private async activeCase(tx:Prisma.TransactionClient,id:string){
    const c=await tx.humanReviewCase.findUnique({where:{id}});
    if(!c)throw new NotFoundException('Review case not found');
    // Always lock the academic parent before locking the case: same order in every write transaction.
    await tx.$queryRaw`SELECT id FROM "Assessment" WHERE id=${c.assessmentId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "HumanReviewCase" WHERE id=${id}::uuid FOR UPDATE`;
    const {a,s,subject}=await this.subject(tx,c.assessmentId);
    if(c.understandingHash!==subject.understandingHash||
      c.priorRevisionId!==subject.effectiveScoreRevisionId||
      !['FINALIZED','HUMAN_REVIEW'].includes(subject.status))
      throw new ConflictException('Review case is stale or underlying score changed');
    return {c,a,s,subject};
  }
  async open(actor:Actor,assessmentId:string,reasonRaw:unknown){
    const reason=reviewReason(reasonRaw);
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Assessment" WHERE id=${assessmentId}::uuid FOR UPDATE`;
      const {subject}=await this.subject(tx,assessmentId);
      const kind=await this.requester(tx,actor,subject);
      checkOpening(kind,subject.status,subject.effectiveScoreRevisionId!==null);
      const existing=await tx.humanReviewCase.findFirst({where:{assessmentId,status:{in:['OPEN','PROPOSED']}}});
      if(existing){
        if(existing.openedById===actor.userId&&existing.kind===kind&&existing.reason===reason)
          return {caseId:existing.id,status:existing.status,replayed:true};
        throw new ConflictException('An active review case already exists for this assessment');
      }
      const created=await tx.humanReviewCase.create({data:{assessmentId,openedById:actor.userId,kind,
        status:'OPEN',priorRevisionId:subject.effectiveScoreRevisionId,understandingHash:subject.understandingHash,reason}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'HUMAN_REVIEW_CASE_OPENED',
        resourceType:'HumanReviewCase',resourceId:created.id,details:{assessmentId,kind}}});
      return {caseId:created.id,status:created.status,replayed:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});
  }
  private lockedContext(a:Awaited<ReturnType<HumanReviewService['subject']>>['a']){
    const s=a.submission, v=s.verifiedText!;
    if(hash(v.content)!==v.contentHash||hash(canonicalJson(s.rubricSnapshot))!==s.rubricHash||
      hash(canonicalJson(s.topicSnapshot))!==s.topicHash)throw new ConflictException('Academic source hash mismatch');
    const rubric=s.rubricSnapshot as unknown as PublishedRubric;
    if(rubric.versionId!==s.rubricVersionId)throw new ConflictException('Wrong published rubric');
    const verified=createVerifiedText(v.id,s.id,v.language,v.content);
    return lockAssessmentContext(a.id,verified,s.topicHash,a.understanding!.snapshotHash,rubric);
  }
  async propose(actor:Actor,caseId:string,factors:FactorProposal[],reasonRaw:unknown){
    const reason=reviewReason(reasonRaw);
    return this.db.$transaction(async tx=>{
      const {c,a,s,subject}=await this.activeCase(tx,caseId);
      await this.reviewer(tx,actor,subject);
      const validated=validateHumanCorrection(this.lockedContext(a),factors);
      if(c.status==='PROPOSED'){
        const existing=await tx.humanReviewProposal.findUnique({where:{reviewCaseId:caseId}});
        if(existing?.proposedById===actor.userId&&existing.reason===reason&&
          canonicalJson(existing.factorResults)===canonicalJson(factors))
          return {proposalId:existing.id,status:'PROPOSED',replayed:true};
        throw new ConflictException('Case already contains an immutable proposal');
      }
      if(c.status!=='OPEN')throw new ConflictException('Review case cannot accept proposals');
      const result=await tx.humanReviewProposal.create({data:{reviewCaseId:caseId,proposedById:actor.userId,
        inputHash:validated.inputHash,rubricHash:s.rubricHash,
        factorResults:factors as unknown as Prisma.InputJsonValue,
        totalScore:validated.totalScore,totalMarks:validated.totalMarks,reason}});
      await tx.humanReviewCase.update({where:{id:caseId},data:{status:'PROPOSED'}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'HUMAN_SCORE_CORRECTION_PROPOSED',
        resourceType:'HumanReviewCase',resourceId:caseId,details:{proposalId:result.id,assessmentId:a.id}}});
      return {proposalId:result.id,status:'PROPOSED',replayed:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:18000});
  }
  async decide(actor:Actor,caseId:string,decision:'APPROVE'|'REJECT'|'UPHOLD',reasonRaw:unknown){
    const reason=reviewReason(reasonRaw);
    return this.db.$transaction(async tx=>{
      // Even replayed decisions require CURRENT reviewer authorization; historical approval grants no access.
      const previous=await tx.humanReviewDecision.findUnique({where:{reviewCaseId:caseId}});
      if(previous){
        const current=await tx.humanReviewCase.findUnique({where:{id:caseId}});
        if(!current)throw new NotFoundException();
        const {subject}=await this.subject(tx,current.assessmentId);
        await this.reviewer(tx,actor,subject);
        if(previous.decidedById===actor.userId&&previous.decision===decision&&previous.reason===reason &&
          current.status.startsWith('RESOLVED_'))return {decisionId:previous.id,status:current.status,replayed:true};
        throw new ConflictException('Case already has an immutable review decision');
      }
      const {c,a,subject}=await this.activeCase(tx,caseId);
      await this.reviewer(tx,actor,subject);
      const proposal=await tx.humanReviewProposal.findUnique({where:{reviewCaseId:caseId}});
      checkDecision(c.status,decision,c.priorRevisionId,Boolean(proposal));
      if(proposal)checkIndependentApproval(proposal.proposedById,actor.userId,true,
        c.priorRevisionId,subject.effectiveScoreRevisionId);
      if(decision==='UPHOLD'&&actor.userId===c.openedById)
        throw new ForbiddenException('Reviewer cannot independently uphold their own request');
      if(decision==='APPROVE'){
        // Revalidate immutable human score and current rubric/context immediately before publication.
        const current=this.lockedContext(a);
        const validated=validateHumanCorrection(current,proposal!.factorResults as unknown as FactorProposal[]);
        if(validated.inputHash!==proposal!.inputHash||proposal!.rubricHash!==a.submission.rubricHash||
          !new Prisma.Decimal(validated.totalScore).equals(proposal!.totalScore)||
          !new Prisma.Decimal(validated.totalMarks).equals(proposal!.totalMarks))
          throw new ConflictException('Approved proposal no longer matches assessment context');
      }
      const decided=await tx.humanReviewDecision.create({data:{reviewCaseId:caseId,
        proposalId:proposal?.id??null,decidedById:actor.userId,decision,reason}});
      if(decision==='APPROVE'){
        const prior=c.priorRevisionId?await tx.assessmentScoreRevision.findUnique({where:{id:c.priorRevisionId}}):null;
        const rev=await tx.assessmentScoreRevision.create({data:{assessmentId:a.id,revisionNo:(prior?.revisionNo??0)+1,
          examinerRunId:null,verificationId:null,reviewDecisionId:decided.id,source:'HUMAN',
          inputHash:proposal!.inputHash,totalScore:proposal!.totalScore,totalMarks:proposal!.totalMarks,
          factorResults:proposal!.factorResults as Prisma.InputJsonValue}});
        await tx.assessment.update({where:{id:a.id},data:{status:'FINALIZED',effectiveScoreRevisionId:rev.id}});
        await tx.humanReviewCase.update({where:{id:caseId},data:{status:'RESOLVED_CORRECTED',resolvedAt:new Date()}});
        for(const target of derivedTargets)await tx.derivedProjectionInvalidation.create({data:{assessmentId:a.id,
          scoreRevisionId:rev.id,target,status:'PENDING'}});
        await tx.outboxEvent.create({data:{eventType:prior?'ASSESSMENT_SCORE_REVISED':'ASSESSMENT_SCORE_FINALIZED',
          dedupeKey:`score-revision-${rev.id}`,payload:{assessmentId:a.id,
            previousRevisionId:c.priorRevisionId,newRevisionId:rev.id}}});
        await tx.auditEvent.create({data:{actorId:actor.userId,action:'HUMAN_SCORE_REVISION_APPROVED',
          resourceType:'Assessment',resourceId:a.id,details:{caseId,proposalId:proposal!.id,
            decisionId:decided.id,oldRevisionId:c.priorRevisionId,newRevisionId:rev.id}}});
        return {decisionId:decided.id,status:'RESOLVED_CORRECTED',effectiveRevisionId:rev.id,replayed:false};
      }
      const status=decision==='UPHOLD'?'RESOLVED_UPHELD':'RESOLVED_REJECTED';
      await tx.humanReviewCase.update({where:{id:caseId},data:{status,resolvedAt:new Date()}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:`HUMAN_REVIEW_${decision}`,
        resourceType:'HumanReviewCase',resourceId:caseId,details:{decisionId:decided.id,assessmentId:a.id}}});
      return {decisionId:decided.id,status,effectiveRevisionId:c.priorRevisionId,replayed:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000});
  }
  async readCase(actor:Actor,id:string){
    const c=await this.db.humanReviewCase.findUnique({where:{id}});
    if(!c)throw new NotFoundException();
    // Current grant and educational authority, even for already resolved historical cases.
    return this.db.$transaction(async tx=>{
      const {subject,s,a}=await this.subject(tx,c.assessmentId);
      if(['OPEN','PROPOSED'].includes(c.status)&&
        (c.priorRevisionId!==subject.effectiveScoreRevisionId||!['FINALIZED','HUMAN_REVIEW'].includes(subject.status)))
        throw new NotFoundException();
      const user=await tx.user.findUnique({where:{id:actor.userId}});
      if(!user||user.status!=='ACTIVE')throw new NotFoundException();
      if(user.role==='STUDENT'&&subject.studentUserId===actor.userId){await this.requireCoreAuthority(tx,subject);
        return {caseId:id,assessmentId:c.assessmentId,status:c.status,kind:c.kind,openedAt:c.createdAt};}
      if(user.role==='PARENT'){
        await this.requester(tx,actor,subject);
        return {caseId:id,assessmentId:c.assessmentId,status:c.status,kind:c.kind,openedAt:c.createdAt};
      }
      await this.reviewer(tx,actor,subject);
      const proposal=await tx.humanReviewProposal.findUnique({where:{reviewCaseId:id},
        select:{id:true,proposedById:true,createdAt:true,reason:true,factorResults:true,totalScore:true,totalMarks:true}});
      return {caseId:id,assessmentId:c.assessmentId,kind:c.kind,status:c.status,openedAt:c.createdAt,
        reason:c.reason,priorRevisionId:c.priorRevisionId,effectiveRevisionId:subject.effectiveScoreRevisionId,
        topic:s.topicSnapshot,rubric:s.rubricSnapshot,verifiedText:{language:s.verifiedText!.language,content:s.verifiedText!.content,
          contentHash:s.verifiedText!.contentHash},effectiveScore:a.effectiveScoreRevision?{
          totalScore:a.effectiveScoreRevision.totalScore.toString(),totalMarks:a.effectiveScoreRevision.totalMarks.toString(),
          factorResults:a.effectiveScoreRevision.factorResults}:null,proposal};
    });
  }

  async queue(actor:Actor,batchId?:string){
    if(!['TEACHER','ACADEMIC_ADMIN'].includes(actor.role))throw new ForbiddenException();
    const rows=await this.db.$queryRaw<Array<{caseId:string;assessmentId:string;batchId:string;topicTitle:string;
      status:string;kind:string;createdAt:Date}>>`
      SELECT c.id AS "caseId",a.id AS "assessmentId",s."batchId",
        s."topicSnapshot"->>'title' AS "topicTitle",c.status::text AS status,c.kind::text AS kind,c."createdAt"
      FROM "HumanReviewCase" c
      JOIN "Assessment" a ON a.id=c."assessmentId"
      JOIN "Submission" s ON s.id=a."submissionId" AND s.status='ACCEPTED'
      JOIN "User" u ON u.id=${actor.userId}::uuid AND u.status='ACTIVE' AND u.role::text=${actor.role}
      WHERE c.status IN ('OPEN','PROPOSED')
        AND ((c."priorRevisionId" IS NULL AND a.status='HUMAN_REVIEW') OR
          (c."priorRevisionId"=a."effectiveScoreRevisionId" AND a.status='FINALIZED'))
        AND (${batchId??null}::uuid IS NULL OR s."batchId"=${batchId??null}::uuid)
        AND EXISTS(SELECT 1 FROM "Enrollment" e WHERE e."studentId"=s."studentId"
          AND e."programId"=s."programId" AND e."batchId"=s."batchId" AND e.status='ACTIVE'
          AND e."startedAt"<=statement_timestamp() AND e."endedAt" IS NULL)
        AND EXISTS(SELECT 1 FROM "ProcessingAuthority" p WHERE p."studentId"=s."studentId"
          AND p."programId"=s."programId" AND p.purpose='CORE_ASSESSMENT' AND p.status='ACTIVE' AND p."endedAt" IS NULL)
        AND ((u.role='TEACHER' AND EXISTS(SELECT 1 FROM "TeacherBatch" t WHERE t."teacherId"=u.id
              AND t."batchId"=s."batchId" AND t."assignedAt"<=statement_timestamp() AND t."endedAt" IS NULL))
          OR (u.role='ACADEMIC_ADMIN' AND EXISTS(SELECT 1 FROM "AcademicAdminProgram" ap WHERE ap."userId"=u.id
              AND ap."programId"=s."programId" AND ap."assignedAt"<=statement_timestamp() AND ap."endedAt" IS NULL)))
      ORDER BY c."createdAt",c.id LIMIT 101`;
    return {cases:rows.slice(0,100),truncated:rows.length>100};
  }
}

/** Step91: only persist real rubric-derived artifacts; unsupported modules stay BLOCKED. */
import {Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {hash,createVerifiedText,lockAssessmentContext,validateExaminerProposal,
  DomainValidationError,type PublishedRubric,type FactorProposal} from '../../../../packages/domain/src/index.ts';
import {canonicalJson} from '../policies/submission-policy.ts';
import {PrismaService} from '../prisma/prisma.service.ts';
import {decideProjectionWork,projectionAvailability,type MaterializedVersions} from './projection-policy.ts';
import {buildRubricFeedback,buildRubricPractice,buildComparableProgress,comparableSignature,
  type ComparablePoint} from './learning-builders.ts';
interface Candidate {id:string;assessmentId:string;scoreRevisionId:string;target:string}
interface LockedAssessment {id:string;effectiveScoreRevisionId:string|null;status:string}
interface CohortRow {
  assessmentId:string;revisionId:string;createdAt:Date;score:Prisma.Decimal;totalMarks:Prisma.Decimal;
}
@Injectable()
export class ProjectionService {
  constructor(@Inject(PrismaService)private readonly db:PrismaService){}
  private async comparable(tx:Prisma.TransactionClient,studentId:string,programId:string,rubricVersionId:string)
    :Promise<ComparablePoint[]>{
    // Entire version-pinned cohort, not just the displayed last 6: this detects added/revised peers.
    const rows=await tx.$queryRaw<CohortRow[]>`
      SELECT a.id AS "assessmentId",r.id AS "revisionId",a."createdAt",
        r."totalScore" AS score,r."totalMarks"
      FROM "Assessment" a JOIN "Submission" s ON s.id=a."submissionId"
        JOIN "AssessmentScoreRevision" r ON r.id=a."effectiveScoreRevisionId" AND r."assessmentId"=a.id
      WHERE s."studentId"=${studentId}::uuid AND s."programId"=${programId}::uuid
        AND s."rubricVersionId"=${rubricVersionId}::uuid
        AND a.status='FINALIZED' AND s.status='ACCEPTED'
      ORDER BY a."createdAt",a.id`;
    return rows.map(r=>({assessmentId:r.assessmentId,revisionId:r.revisionId,
      createdAt:r.createdAt.toISOString(),score:r.score.toString(),totalMarks:r.totalMarks.toString()}));
  }
  async processOne(assessmentId?:string):Promise<{status:string;target?:string;revisionId?:string}>{
    return this.db.$transaction(async tx=>{
      const candidates=assessmentId
        ?await tx.$queryRaw<Candidate[]>`SELECT id,"assessmentId","scoreRevisionId",target
          FROM "DerivedProjectionInvalidation" WHERE status='PENDING' AND "assessmentId"=${assessmentId}::uuid
          ORDER BY CASE target WHEN 'PARENT' THEN 0 WHEN 'FEEDBACK' THEN 1
            WHEN 'PRACTICE' THEN 2 WHEN 'PROGRESS' THEN 3 ELSE 4 END,"createdAt",target LIMIT 20`
        :await tx.$queryRaw<Candidate[]>`SELECT id,"assessmentId","scoreRevisionId",target
          FROM "DerivedProjectionInvalidation" WHERE status='PENDING'
          ORDER BY CASE target WHEN 'PARENT' THEN 0 WHEN 'FEEDBACK' THEN 1
            WHEN 'PRACTICE' THEN 2 WHEN 'PROGRESS' THEN 3 ELSE 4 END,"createdAt",target LIMIT 20`;
      for(const item of candidates){
        // Assessment-first locking matches the human correction transaction.
        const assessment=(await tx.$queryRaw<LockedAssessment[]>`
          SELECT id,"effectiveScoreRevisionId",status::text AS status FROM "Assessment"
          WHERE id=${item.assessmentId}::uuid FOR UPDATE SKIP LOCKED`)[0];
        if(!assessment)continue;
        const job=(await tx.$queryRaw<Candidate[]>`
          SELECT id,"assessmentId","scoreRevisionId",target
          FROM "DerivedProjectionInvalidation" WHERE id=${item.id}::uuid AND status='PENDING'
          FOR UPDATE SKIP LOCKED`)[0];
        if(!job)continue;
        const next=decideProjectionWork(job.target,job.scoreRevisionId,
          assessment.effectiveScoreRevisionId,assessment.status==='FINALIZED');
        if(next==='SUPERSEDED'){
          await tx.derivedProjectionInvalidation.update({where:{id:job.id},
            data:{status:'SUPERSEDED',processedAt:new Date(),errorCode:null}});
          return {status:'SUPERSEDED',target:job.target,revisionId:job.scoreRevisionId};
        }
        if(next==='BLOCKED'){
          await tx.derivedProjectionInvalidation.update({where:{id:job.id},
            data:{status:'BLOCKED',processedAt:new Date(),errorCode:'TARGET_NOT_IMPLEMENTED'}});
          return {status:'BLOCKED',target:job.target,revisionId:job.scoreRevisionId};
        }
        const revision=await tx.assessmentScoreRevision.findUnique({where:{id:job.scoreRevisionId}});
        if(!revision||revision.assessmentId!==assessment.id)throw new Error('STEP91_CURRENT_REVISION_MISSING');
        if(next==='PUBLISH_PARENT'){
          await tx.parentScoreProjection.upsert({where:{assessmentId:assessment.id},
            create:{assessmentId:assessment.id,scoreRevisionId:revision.id,revisionNo:revision.revisionNo,
              source:revision.source,totalScore:revision.totalScore,totalMarks:revision.totalMarks},
            update:{scoreRevisionId:revision.id,revisionNo:revision.revisionNo,source:revision.source,
              totalScore:revision.totalScore,totalMarks:revision.totalMarks,updatedAt:new Date()}});
        }else{
          try{
            const a=await tx.assessment.findUniqueOrThrow({where:{id:assessment.id},
              include:{submission:{include:{verifiedText:true}},understanding:true}});
            const sub=a.submission,v=sub.verifiedText,u=a.understanding;
            if(!v||!u||hash(v.content)!==v.contentHash||
              hash(canonicalJson(sub.rubricSnapshot))!==sub.rubricHash||
              hash(canonicalJson(sub.topicSnapshot))!==sub.topicHash)
              throw new Error('STEP91_SNAPSHOT_INVALID');
            const rubric=sub.rubricSnapshot as unknown as PublishedRubric;
            if(rubric.versionId!==sub.rubricVersionId)throw new Error('STEP91_RUBRIC_VERSION_INVALID');
            const locked=lockAssessmentContext(a.id,createVerifiedText(v.id,sub.id,v.language,v.content),
              sub.topicHash,u.snapshotHash,rubric);
            if(revision.inputHash!==locked.inputHash)throw new Error('STEP91_INPUT_FINGERPRINT_MISMATCH');
            const factors=revision.factorResults as unknown as FactorProposal[];
            const validated=validateExaminerProposal(locked,{examinerRunId:'STEP91_DERIVED',
              assessmentId:a.id,verifiedTextId:v.id,rubricVersionId:rubric.versionId,
              inputHash:locked.inputHash,factorResults:factors});
            if(!new Prisma.Decimal(validated.totalScore).equals(revision.totalScore)||
              !new Prisma.Decimal(validated.totalMarks).equals(revision.totalMarks))
              throw new Error('STEP91_SCORE_MISMATCH');
            if(next==='PUBLISH_FEEDBACK'){
              const snapshot=buildRubricFeedback(revision.id,rubric,factors);
              await tx.feedbackProjection.upsert({where:{assessmentId:a.id},
                create:{assessmentId:a.id,scoreRevisionId:revision.id,
                  snapshot:snapshot as unknown as Prisma.InputJsonValue},
                update:{scoreRevisionId:revision.id,snapshot:snapshot as unknown as Prisma.InputJsonValue,updatedAt:new Date()}});
            }else if(next==='PUBLISH_PRACTICE'){
              const snapshot=buildRubricPractice(revision.id,rubric,factors);
              await tx.practiceProjection.upsert({where:{assessmentId:a.id},
                create:{assessmentId:a.id,scoreRevisionId:revision.id,
                  snapshot:snapshot as unknown as Prisma.InputJsonValue},
                update:{scoreRevisionId:revision.id,snapshot:snapshot as unknown as Prisma.InputJsonValue,updatedAt:new Date()}});
            }else if(next==='PUBLISH_PROGRESS'){
              const points=await this.comparable(tx,sub.studentId,sub.programId,sub.rubricVersionId);
              const signature=hash(comparableSignature(points));
              const snapshot=buildComparableProgress(revision.id,points,signature);
              await tx.progressProjection.upsert({where:{assessmentId:a.id},
                create:{assessmentId:a.id,scoreRevisionId:revision.id,cohortSignature:signature,
                  snapshot:snapshot as unknown as Prisma.InputJsonValue},
                update:{scoreRevisionId:revision.id,cohortSignature:signature,
                  snapshot:snapshot as unknown as Prisma.InputJsonValue,updatedAt:new Date()}});
            }
          }catch(error){
            if(error instanceof DomainValidationError||
              (error instanceof Error&&error.message.startsWith('STEP91_'))){
              await tx.derivedProjectionInvalidation.update({where:{id:job.id},
                data:{status:'FAILED',processedAt:new Date(),errorCode:'INVALID_APPROVED_SOURCE'}});
              return {status:'FAILED',target:job.target,revisionId:job.scoreRevisionId};
            }
            throw error; // Transient DB errors roll back; no fabricated rebuilt receipt.
          }
        }
        await tx.derivedProjectionInvalidation.update({where:{id:job.id},
          data:{status:'REBUILT',processedAt:new Date(),errorCode:null}});
        await tx.auditEvent.create({data:{action:'SCORE_PROJECTION_REBUILT',
          resourceType:'Assessment',resourceId:assessment.id,
          details:{revisionId:revision.id,target:job.target,scope:'VERSION_PINNED'}}});
        return {status:'REBUILT',target:job.target,revisionId:revision.id};
      }
      // Pilot-only cohort fanout: a NEW comparable assessment makes an older progress
      // snapshot stale even when that old assessment's own revision has not changed.
      // No receipt is faked: refresh only after recomputing the full current cohort.
      // At scale replace this bounded-pilot scan with scope-keyed durable invalidations.
      const prior=await tx.progressProjection.findMany({
        ...(assessmentId?{where:{assessmentId}}:{}),
        select:{assessmentId:true,scoreRevisionId:true,cohortSignature:true},
        orderBy:{updatedAt:'asc'}
      });
      for(const old of prior){
        const locked=(await tx.$queryRaw<LockedAssessment[]>`
          SELECT id,"effectiveScoreRevisionId",status::text AS status FROM "Assessment"
          WHERE id=${old.assessmentId}::uuid FOR UPDATE SKIP LOCKED`)[0];
        if(!locked||locked.status!=='FINALIZED'||locked.effectiveScoreRevisionId!==old.scoreRevisionId)
          continue;
        const row=(await tx.$queryRaw<Array<{scoreRevisionId:string;cohortSignature:string}>>`
          SELECT "scoreRevisionId","cohortSignature" FROM "ProgressProjection"
          WHERE "assessmentId"=${old.assessmentId}::uuid FOR UPDATE SKIP LOCKED`)[0];
        if(!row||row.scoreRevisionId!==locked.effectiveScoreRevisionId)continue;
        const own=await tx.assessment.findUniqueOrThrow({where:{id:old.assessmentId},
          select:{submission:{select:{studentId:true,programId:true,rubricVersionId:true}}}});
        const points=await this.comparable(tx,own.submission.studentId,
          own.submission.programId,own.submission.rubricVersionId);
        const signature=hash(comparableSignature(points));
        if(signature===row.cohortSignature)continue;
        const snapshot=buildComparableProgress(row.scoreRevisionId,points,signature);
        await tx.progressProjection.update({where:{assessmentId:old.assessmentId},
          data:{cohortSignature:signature,snapshot:snapshot as unknown as Prisma.InputJsonValue,
            updatedAt:new Date()}});
        await tx.auditEvent.create({data:{action:'PROGRESS_COHORT_RECOMPUTED',
          resourceType:'Assessment',resourceId:old.assessmentId,
          details:{revisionId:row.scoreRevisionId,scope:'FULL_COMPARABLE_COHORT'}}});
        return {status:'REFRESHED',target:'PROGRESS',revisionId:row.scoreRevisionId};
      }
      return {status:'EMPTY'};
    },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,timeout:16000});
  }
  private async studentView(tx:Prisma.TransactionClient,userId:string,assessmentId:string,withData:boolean){
    const a=await tx.assessment.findFirst({where:{id:assessmentId,submission:{student:{userId}}},
      select:{id:true,status:true,effectiveScoreRevisionId:true,
        submission:{select:{studentId:true,programId:true,rubricVersionId:true}}}});
    if(!a)throw new NotFoundException();
    const authority=await tx.processingAuthority.findFirst({where:{studentId:a.submission.studentId,
      programId:a.submission.programId,purpose:'CORE_ASSESSMENT',status:'ACTIVE',endedAt:null}});
    if(!authority)throw new NotFoundException();
    const receipts=a.effectiveScoreRevisionId
      ?await tx.derivedProjectionInvalidation.findMany({where:{assessmentId:a.id,
        scoreRevisionId:a.effectiveScoreRevisionId},select:{target:true,status:true,scoreRevisionId:true}}):[];
    const [parent,feedback,practice,progress]=await Promise.all([
      tx.parentScoreProjection.findUnique({where:{assessmentId:a.id},select:{scoreRevisionId:true}}),
      tx.feedbackProjection.findUnique({where:{assessmentId:a.id}}),
      tx.practiceProjection.findUnique({where:{assessmentId:a.id}}),
      tx.progressProjection.findUnique({where:{assessmentId:a.id}})
    ]);
    let progressRev:string|null=null;
    if(a.effectiveScoreRevisionId&&progress?.scoreRevisionId===a.effectiveScoreRevisionId){
      const points=await this.comparable(tx,a.submission.studentId,a.submission.programId,a.submission.rubricVersionId);
      if(progress.cohortSignature===hash(comparableSignature(points)))progressRev=progress.scoreRevisionId;
    }
    const versions:MaterializedVersions={FEEDBACK:feedback?.scoreRevisionId??null,
      PRACTICE:practice?.scoreRevisionId??null,PROGRESS:progressRev};
    const availability=projectionAvailability(a.effectiveScoreRevisionId,receipts,
      parent?.scoreRevisionId??null,versions);
    const base={assessmentId:a.id,assessmentStatus:a.status,
      effectiveRevisionId:a.effectiveScoreRevisionId,projections:availability};
    if(!withData)return base;
    const visible=(target:string)=>availability.find(x=>x.target===target)?.availability==='CURRENT';
    // Same repeatable-read snapshot guards against a score change between status and data.
    return {...base,learning:{
      feedback:visible('FEEDBACK')?feedback?.snapshot:null,
      practice:visible('PRACTICE')?practice?.snapshot:null,
      progress:visible('PROGRESS')?progress?.snapshot:null
    }};
  }
  async statusForAuthorizedStudent(userId:string,assessmentId:string){
    return this.db.$transaction(tx=>this.studentView(tx,userId,assessmentId,false),
      {isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:10000});
  }
  async learningForAuthorizedStudent(userId:string,assessmentId:string){
    return this.db.$transaction(tx=>this.studentView(tx,userId,assessmentId,true),
      {isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:10000});
  }
}

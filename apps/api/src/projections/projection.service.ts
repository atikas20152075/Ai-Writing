/** Step90: transactionally materialize ONLY the existing parent score summary.
 * All absent modules fail closed instead of marking nonexistent outputs as rebuilt. */
import {Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.ts';
import {decideProjectionWork,projectionAvailability} from './projection-policy.ts';

interface Candidate {id:string;assessmentId:string;scoreRevisionId:string;target:string}
interface LockedAssessment {id:string;effectiveScoreRevisionId:string|null;status:string}
@Injectable()
export class ProjectionService {
  constructor(@Inject(PrismaService)private readonly db:PrismaService){}
  /** One small bounded transaction; assessment is always locked BEFORE its invalidation. */
  async processOne(assessmentId?:string):Promise<{status:string;target?:string;revisionId?:string}>{
    return this.db.$transaction(async tx=>{
      const candidates=assessmentId
        ?await tx.$queryRaw<Candidate[]>`SELECT id,"assessmentId","scoreRevisionId",target
          FROM "DerivedProjectionInvalidation" WHERE status='PENDING' AND "assessmentId"=${assessmentId}::uuid
          ORDER BY CASE WHEN target='PARENT' THEN 0 ELSE 1 END,"createdAt",target LIMIT 20`
        :await tx.$queryRaw<Candidate[]>`SELECT id,"assessmentId","scoreRevisionId",target
          FROM "DerivedProjectionInvalidation" WHERE status='PENDING'
          ORDER BY CASE WHEN target='PARENT' THEN 0 ELSE 1 END,"createdAt",target LIMIT 20`;
      for(const item of candidates){
        // Consistent parent-first locking with the Step89 human-review transaction prevents deadlocks.
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
        // The effective pointer and immutable revision are locked under the same DB transaction.
        const revision=await tx.assessmentScoreRevision.findUnique({where:{id:job.scoreRevisionId}});
        if(!revision||revision.assessmentId!==assessment.id)
          throw new Error('STEP90_CURRENT_SCORE_REVISION_NOT_FOUND');
        await tx.parentScoreProjection.upsert({where:{assessmentId:assessment.id},
          create:{assessmentId:assessment.id,scoreRevisionId:revision.id,revisionNo:revision.revisionNo,
            source:revision.source,totalScore:revision.totalScore,totalMarks:revision.totalMarks},
          update:{scoreRevisionId:revision.id,revisionNo:revision.revisionNo,source:revision.source,
            totalScore:revision.totalScore,totalMarks:revision.totalMarks,updatedAt:new Date()}});
        await tx.derivedProjectionInvalidation.update({where:{id:job.id},
          data:{status:'REBUILT',processedAt:new Date(),errorCode:null}});
        await tx.auditEvent.create({data:{action:'PARENT_SCORE_PROJECTION_REBUILT',
          resourceType:'Assessment',resourceId:assessment.id,
          details:{revisionId:revision.id,target:'PARENT'}}});
        return {status:'REBUILT',target:'PARENT',revisionId:revision.id};
      }
      return {status:'EMPTY'};
    },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,timeout:12000});
  }
  /** Safe response for an already object-authorized assessment; both reads share one snapshot. */
  async statusForAuthorizedStudent(userId:string,assessmentId:string){
    return this.db.$transaction(async tx=>{
      const a=await tx.assessment.findFirst({where:{id:assessmentId,
        submission:{student:{userId}}},select:{id:true,status:true,effectiveScoreRevisionId:true}});
      if(!a)throw new NotFoundException();
      const receipt=a.effectiveScoreRevisionId
        ?await tx.derivedProjectionInvalidation.findMany({where:{assessmentId:a.id,
          scoreRevisionId:a.effectiveScoreRevisionId},select:{target:true,status:true,scoreRevisionId:true}}):[];
      const parent=await tx.parentScoreProjection.findUnique({where:{assessmentId:a.id},
        select:{scoreRevisionId:true}});
      return {assessmentId:a.id,assessmentStatus:a.status,effectiveRevisionId:a.effectiveScoreRevisionId,
        projections:projectionAvailability(a.effectiveScoreRevisionId,receipt,parent?.scoreRevisionId??null)};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:10000});
  }
}

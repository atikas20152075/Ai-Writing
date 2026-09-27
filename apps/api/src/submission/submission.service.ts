import {BadRequestException,ConflictException,ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {hash,createVerifiedText,type PublishedRubric} from '../../../../packages/domain/src/index.ts';
import {PrismaService} from '../prisma/prisma.service.ts';
import {assertTypedSubmissionEligible,canonicalJson} from '../policies/submission-policy.ts';
import type {Actor} from '../auth/jwt.guard.ts';
import type {CreateTypedSubmissionDto,CreateRewriteSubmissionDto} from './submission.dto.ts';

@Injectable()
export class SubmissionService {
  constructor(@Inject(PrismaService) private readonly db:PrismaService){}
  async createRewrite(actor:Actor,dto:CreateRewriteSubmissionDto){
    if(actor.role!=='STUDENT')throw new ForbiddenException('Student access required');
    const student=await this.db.student.findUnique({where:{userId:actor.userId}});
    if(!student)throw new NotFoundException();
    const prior=await this.db.submission.findUnique({where:{studentId_clientRequestId:{studentId:student.id,
      clientRequestId:dto.clientRequestId}},include:{verifiedText:true,assessment:true}});
    if(prior){
      if(prior.rewriteOfAssessmentId!==dto.sourceAssessmentId||prior.rewriteOfRevisionId!==dto.expectedRevisionId||
        prior.verifiedText?.contentHash!==hash(dto.text)||prior.correctionNote!==dto.correctionNote.trim())
        throw new ConflictException('Idempotency key reused');
      return {submissionId:prior.id,assessmentId:prior.assessment?.id,status:prior.assessment?.status,
        rewriteOfAssessmentId:prior.rewriteOfAssessmentId,rewriteOfRevisionId:prior.rewriteOfRevisionId,replayed:true};
    }
    const source=await this.db.assessment.findFirst({where:{id:dto.sourceAssessmentId,
      submission:{studentId:student.id,status:'ACCEPTED'}},select:{status:true,effectiveScoreRevisionId:true,
      submission:{select:{programId:true,batchId:true,topicVersionId:true}}}});
    if(!source)throw new NotFoundException();
    if(source.status!=='FINALIZED'||source.effectiveScoreRevisionId!==dto.expectedRevisionId)
      throw new ConflictException('Approved source revision has changed');
    return this.createTyped(actor,{programId:source.submission.programId,batchId:source.submission.batchId,
      topicVersionId:source.submission.topicVersionId,clientRequestId:dto.clientRequestId,text:dto.text},
      {assessmentId:dto.sourceAssessmentId,revisionId:dto.expectedRevisionId,note:dto.correctionNote.trim()});
  }
  async createTyped(actor:Actor,dto:CreateTypedSubmissionDto,
    rewrite?:{assessmentId:string;revisionId:string;note:string}){
    if(actor.role!=='STUDENT') throw new ForbiddenException('Student access required');
    const student=await this.db.student.findUnique({where:{userId:actor.userId}});
    if(!student) throw new ForbiddenException('Student record missing');
    try {
      return await this.db.$transaction(async tx=>{
        const existing=await tx.submission.findUnique({where:{studentId_clientRequestId:{studentId:student.id,clientRequestId:dto.clientRequestId}},include:{verifiedText:true,assessment:true}});
        if(existing){
          const identical=existing.verifiedText?.contentHash===hash(dto.text) && existing.topicVersionId===dto.topicVersionId && existing.programId===dto.programId && existing.batchId===dto.batchId &&
            existing.rewriteOfAssessmentId===(rewrite?.assessmentId??null) && existing.rewriteOfRevisionId===(rewrite?.revisionId??null) &&
            existing.correctionNote===(rewrite?.note??null);
          if(!identical) throw new ConflictException('Idempotency key reused for different writing or context');
          return {submissionId:existing.id,assessmentId:existing.assessment?.id,status:existing.assessment?.status,
            rewriteOfAssessmentId:existing.rewriteOfAssessmentId,rewriteOfRevisionId:existing.rewriteOfRevisionId,replayed:true};
        }
        const [program,batch,enrollment,authority,topic]=await Promise.all([
          tx.academicProgram.findUnique({where:{id:dto.programId}}),
          tx.batch.findFirst({where:{id:dto.batchId,programId:dto.programId}}),
          tx.enrollment.findFirst({where:{studentId:student.id,programId:dto.programId,batchId:dto.batchId,status:'ACTIVE',endedAt:null}}),
          tx.processingAuthority.findFirst({where:{studentId:student.id,programId:dto.programId,purpose:'CORE_ASSESSMENT',status:'ACTIVE',endedAt:null},orderBy:{approvedAt:'desc'}}),
          tx.writingTopicVersion.findUnique({where:{id:dto.topicVersionId}})
        ]);
        if(!topic) throw new BadRequestException('Published topic required');
        const binding=await tx.rubricBinding.findUnique({where:{programId_writingType_language:{programId:dto.programId,writingType:topic.writingType,language:topic.language}}});
        const rubric=binding?await tx.rubricVersion.findUnique({where:{id:binding.rubricVersionId}}):null;
        if(!binding||!rubric) throw new BadRequestException('Published default rubric required');
        try {assertTypedSubmissionEligible({studentId:student.id,programId:dto.programId,batchId:dto.batchId,enrollment,authority,
          programActive:program?.status==='ACTIVE',batchActive:batch?.active===true,
          topic,rubric:{...rubric,snapshot:rubric.snapshot as unknown as PublishedRubric},
          boundRubricVersionId:binding.rubricVersionId,selectedRubricVersionId:rubric.id,text:dto.text});}
        catch(e:any){throw new ForbiddenException(e.message);}
        const rubricSnapshot=rubric.snapshot as unknown as PublishedRubric;
        if(hash(canonicalJson(rubricSnapshot))!==rubric.snapshotHash) throw new ConflictException('Rubric snapshot integrity failure');
        if(rewrite){
          // Lock the source before validating its current approved revision. The DB trigger
          // independently enforces the linkage and blocks concurrent score changes.
          await tx.$queryRaw`SELECT id FROM "Assessment" WHERE id=${rewrite.assessmentId}::uuid FOR SHARE`;
          const source=await tx.assessment.findFirst({where:{id:rewrite.assessmentId,status:'FINALIZED',
            effectiveScoreRevisionId:rewrite.revisionId,submission:{studentId:student.id,status:'ACCEPTED',
              programId:dto.programId,batchId:dto.batchId,topicVersionId:dto.topicVersionId,
              rubricVersionId:rubric.id}},select:{id:true}});
          if(!source)throw new ConflictException('Approved source revision or writing scope changed');
        }
        const topicSnapshot={id:topic.id,programId:topic.programId,writingType:topic.writingType,language:topic.language,title:topic.title,instructions:topic.instructions,clues:topic.clues};
        const created=await tx.submission.create({data:{studentId:student.id,programId:dto.programId,batchId:dto.batchId,
          topicVersionId:topic.id,rubricVersionId:rubric.id,clientRequestId:dto.clientRequestId,
          rewriteOfAssessmentId:rewrite?.assessmentId,rewriteOfRevisionId:rewrite?.revisionId,
          correctionNote:rewrite?.note,
          topicSnapshot:topicSnapshot as Prisma.InputJsonValue,rubricSnapshot:rubricSnapshot as unknown as Prisma.InputJsonValue,
          topicHash:hash(canonicalJson(topicSnapshot)),rubricHash:rubric.snapshotHash}});
        const verified=createVerifiedText(randomUUID(),created.id,topic.language as 'BANGLA'|'ENGLISH',dto.text);
        await tx.verifiedWritingText.create({data:{id:verified.id,submissionId:created.id,language:topic.language,content:verified.text,contentHash:verified.contentHash,verifiedById:actor.userId}});
        const assessment=await tx.assessment.create({data:{submissionId:created.id,status:'AWAITING_UNDERSTANDING'}});
        await tx.outboxEvent.create({data:{eventType:'SUBMISSION_ACCEPTED',dedupeKey:`submission-${created.id}`,payload:{submissionId:created.id,assessmentId:assessment.id}}});
        await tx.auditEvent.create({data:{actorId:actor.userId,
          action:rewrite?'LINKED_REWRITE_ACCEPTED':'TYPED_SUBMISSION_ACCEPTED',resourceType:'Submission',
          resourceId:created.id,details:{programId:dto.programId,topicVersionId:topic.id,
            ...(rewrite?{sourceAssessmentId:rewrite.assessmentId,sourceRevisionId:rewrite.revisionId}:{})}}});
        return {submissionId:created.id,assessmentId:assessment.id,status:assessment.status,
          rewriteOfAssessmentId:created.rewriteOfAssessmentId,rewriteOfRevisionId:created.rewriteOfRevisionId,replayed:false};
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:10000});
    }catch(e:any){
      // Concurrent same-key requests may violate the DB unique constraint: resolve the winner only for identical payload.
      if(e?.code==='P2034') throw new ConflictException('Concurrent submission; retry with the same request ID');
      if(e?.code==='P2002'){
        const original=await this.db.submission.findUnique({where:{studentId_clientRequestId:{studentId:student.id,clientRequestId:dto.clientRequestId}},include:{verifiedText:true,assessment:true}});
        if(original && original.verifiedText?.contentHash===hash(dto.text) && original.topicVersionId===dto.topicVersionId && original.programId===dto.programId && original.batchId===dto.batchId &&
          original.rewriteOfAssessmentId===(rewrite?.assessmentId??null)&&original.rewriteOfRevisionId===(rewrite?.revisionId??null)&&
          original.correctionNote===(rewrite?.note??null))
          return {submissionId:original.id,assessmentId:original.assessment?.id,status:original.assessment?.status,
            rewriteOfAssessmentId:original.rewriteOfAssessmentId,rewriteOfRevisionId:original.rewriteOfRevisionId,replayed:true};
        throw new ConflictException('Idempotency key conflict');
      }
      throw e;
    }
  }
  async listMine(actor:Actor){
    if(actor.role!=='STUDENT') throw new ForbiddenException();
    const s=await this.db.student.findUnique({where:{userId:actor.userId}});
    if(!s) throw new ForbiddenException();
    return this.db.submission.findMany({where:{studentId:s.id},select:{id:true,programId:true,batchId:true,topicVersionId:true,
      rewriteOfAssessmentId:true,rewriteOfRevisionId:true,createdAt:true,status:true,
      assessment:{select:{id:true,status:true}}},orderBy:{createdAt:'desc'},take:50});
  }
  async findMine(actor:Actor,id:string){
    if(actor.role!=='STUDENT') throw new ForbiddenException();
    const s=await this.db.student.findUnique({where:{userId:actor.userId}});
    if(!s) throw new ForbiddenException();
    const result=await this.db.submission.findFirst({where:{id,studentId:s.id},select:{id:true,createdAt:true,status:true,
      rewriteOfAssessmentId:true,rewriteOfRevisionId:true,correctionNote:true,topicSnapshot:true,
      verifiedText:{select:{content:true,language:true,contentHash:true}},assessment:{select:{id:true,status:true}}}});
    if(!result) throw new NotFoundException();
    return result;
  }
}

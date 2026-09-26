import {BadRequestException,ConflictException,ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {hash,createVerifiedText,type PublishedRubric} from '../../../../packages/domain/src/index.ts';
import {PrismaService} from '../prisma/prisma.service.ts';
import {assertTypedSubmissionEligible,canonicalJson} from '../policies/submission-policy.ts';
import type {Actor} from '../auth/jwt.guard.ts';
import type {CreateTypedSubmissionDto} from './submission.dto.ts';

@Injectable()
export class SubmissionService {
  constructor(@Inject(PrismaService) private readonly db:PrismaService){}
  async createTyped(actor:Actor,dto:CreateTypedSubmissionDto){
    if(actor.role!=='STUDENT') throw new ForbiddenException('Student access required');
    const student=await this.db.student.findUnique({where:{userId:actor.userId}});
    if(!student) throw new ForbiddenException('Student record missing');
    try {
      return await this.db.$transaction(async tx=>{
        const existing=await tx.submission.findUnique({where:{studentId_clientRequestId:{studentId:student.id,clientRequestId:dto.clientRequestId}},include:{verifiedText:true,assessment:true}});
        if(existing){
          const identical=existing.verifiedText?.contentHash===hash(dto.text) && existing.topicVersionId===dto.topicVersionId && existing.programId===dto.programId && existing.batchId===dto.batchId;
          if(!identical) throw new ConflictException('Idempotency key reused for different writing or context');
          return {submissionId:existing.id,assessmentId:existing.assessment?.id,status:existing.assessment?.status,replayed:true};
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
        const topicSnapshot={id:topic.id,programId:topic.programId,writingType:topic.writingType,language:topic.language,title:topic.title,instructions:topic.instructions,clues:topic.clues};
        const created=await tx.submission.create({data:{studentId:student.id,programId:dto.programId,batchId:dto.batchId,
          topicVersionId:topic.id,rubricVersionId:rubric.id,clientRequestId:dto.clientRequestId,
          topicSnapshot:topicSnapshot as Prisma.InputJsonValue,rubricSnapshot:rubricSnapshot as unknown as Prisma.InputJsonValue,
          topicHash:hash(canonicalJson(topicSnapshot)),rubricHash:rubric.snapshotHash}});
        const verified=createVerifiedText(randomUUID(),created.id,topic.language as 'BANGLA'|'ENGLISH',dto.text);
        await tx.verifiedWritingText.create({data:{id:verified.id,submissionId:created.id,language:topic.language,content:verified.text,contentHash:verified.contentHash,verifiedById:actor.userId}});
        const assessment=await tx.assessment.create({data:{submissionId:created.id,status:'AWAITING_UNDERSTANDING'}});
        await tx.outboxEvent.create({data:{eventType:'SUBMISSION_ACCEPTED',dedupeKey:`submission-${created.id}`,payload:{submissionId:created.id,assessmentId:assessment.id}}});
        await tx.auditEvent.create({data:{actorId:actor.userId,action:'TYPED_SUBMISSION_ACCEPTED',resourceType:'Submission',resourceId:created.id,details:{programId:dto.programId,topicVersionId:topic.id}}});
        return {submissionId:created.id,assessmentId:assessment.id,status:assessment.status,replayed:false};
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:10000});
    }catch(e:any){
      // Concurrent same-key requests may violate the DB unique constraint: resolve the winner only for identical payload.
      if(e?.code==='P2034') throw new ConflictException('Concurrent submission; retry with the same request ID');
      if(e?.code==='P2002'){
        const original=await this.db.submission.findUnique({where:{studentId_clientRequestId:{studentId:student.id,clientRequestId:dto.clientRequestId}},include:{verifiedText:true,assessment:true}});
        if(original && original.verifiedText?.contentHash===hash(dto.text) && original.topicVersionId===dto.topicVersionId && original.programId===dto.programId && original.batchId===dto.batchId)
          return {submissionId:original.id,assessmentId:original.assessment?.id,status:original.assessment?.status,replayed:true};
        throw new ConflictException('Idempotency key conflict');
      }
      throw e;
    }
  }
  async listMine(actor:Actor){
    if(actor.role!=='STUDENT') throw new ForbiddenException();
    const s=await this.db.student.findUnique({where:{userId:actor.userId}});
    if(!s) throw new ForbiddenException();
    return this.db.submission.findMany({where:{studentId:s.id},select:{id:true,programId:true,batchId:true,createdAt:true,status:true,assessment:{select:{id:true,status:true}}},orderBy:{createdAt:'desc'},take:50});
  }
  async findMine(actor:Actor,id:string){
    if(actor.role!=='STUDENT') throw new ForbiddenException();
    const s=await this.db.student.findUnique({where:{userId:actor.userId}});
    if(!s) throw new ForbiddenException();
    const result=await this.db.submission.findFirst({where:{id,studentId:s.id},select:{id:true,createdAt:true,status:true,topicSnapshot:true,verifiedText:{select:{content:true,language:true,contentHash:true}},assessment:{select:{id:true,status:true}}}});
    if(!result) throw new NotFoundException();
    return result;
  }
}

import {BadRequestException,ConflictException,ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service.ts';
import {hash,validatePublishedRubric,type PublishedRubric} from '../../../../packages/domain/src/index.ts';
import {canonicalJson} from '../policies/submission-policy.ts';
import type {Actor} from '../auth/jwt.guard.ts';
import type {CreateProgramDto,CreateBatchDto,CreateEnrollmentDto,CreateGuardianLinkDto,CreateProcessingAuthorityDto,PublishTopicDto,PublishRubricDto,AssignTeacherDto} from './admin.dto.ts';

const requireRoot=(actor:Actor) => {if(actor.role!=='SUPER_ADMIN') throw new ForbiddenException('Administrative privilege required');};
@Injectable()
export class AdminService {
  constructor(@Inject(PrismaService) private readonly db:PrismaService){}
  async createProgram(actor:Actor,dto:CreateProgramDto){requireRoot(actor);
    return this.db.$transaction(async tx=>{
      const p=await tx.academicProgram.create({data:{code:dto.code.trim().toUpperCase(),name:dto.name.trim()}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'PROGRAM_CREATED',resourceType:'AcademicProgram',resourceId:p.id}});
      return {id:p.id,code:p.code,name:p.name};
    });
  }
  async createBatch(actor:Actor,dto:CreateBatchDto){requireRoot(actor);
    return this.db.$transaction(async tx=>{
      const p=await tx.academicProgram.findUnique({where:{id:dto.programId}});
      if(p?.status!=='ACTIVE') throw new BadRequestException('Active program required');
      const b=await tx.batch.create({data:{programId:p.id,name:dto.name.trim()}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'BATCH_CREATED',resourceType:'Batch',resourceId:b.id}});
      return {id:b.id,programId:b.programId};
    });
  }
  async enroll(actor:Actor,dto:CreateEnrollmentDto){requireRoot(actor);
    return this.db.$transaction(async tx=>{
      const [student,program,batch]=await Promise.all([
        tx.student.findUnique({where:{id:dto.studentId}}),
        tx.academicProgram.findUnique({where:{id:dto.programId}}),
        tx.batch.findUnique({where:{id:dto.batchId}})
      ]);
      if(!student || program?.status!=='ACTIVE' || !batch?.active || batch.programId!==program.id)
        throw new BadRequestException('Enrollment entities must match active program and batch');
      const existing=await tx.enrollment.findFirst({where:{studentId:student.id,programId:program.id,status:'ACTIVE'}});
      if(existing) throw new ConflictException('End current enrollment before transfer');
      const e=await tx.enrollment.create({data:{studentId:student.id,programId:program.id,batchId:batch.id}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'STUDENT_ENROLLED',resourceType:'Enrollment',resourceId:e.id}});
      return {id:e.id};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
  async assignTeacher(actor:Actor,dto:AssignTeacherDto){requireRoot(actor);
    return this.db.$transaction(async tx=>{
      const [user,batch]=await Promise.all([tx.user.findUnique({where:{id:dto.teacherId}}),tx.batch.findUnique({where:{id:dto.batchId}})]);
      if(user?.role!=='TEACHER' || user.status!=='ACTIVE'||!batch?.active) throw new BadRequestException('Teacher and active batch required');
      const current=await tx.teacherBatch.findFirst({where:{teacherId:user.id,batchId:batch.id,endedAt:null}});
      if(current) return {id:current.id};
      const a=await tx.teacherBatch.create({data:{teacherId:user.id,batchId:batch.id}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'TEACHER_ASSIGNED',resourceType:'TeacherBatch',resourceId:a.id}});
      return {id:a.id};
    });
  }
  async verifyGuardian(actor:Actor,dto:CreateGuardianLinkDto){requireRoot(actor);
    // IMPORTANT: evidence has to be verified by an authorized real-world process before invoking this API.
    return this.db.$transaction(async tx=>{
      const guardian=await tx.user.findUnique({where:{id:dto.guardianId}});
      const enrollment=await tx.enrollment.findFirst({where:{studentId:dto.studentId,programId:dto.programId,status:'ACTIVE',endedAt:null}});
      if(guardian?.role!=='PARENT' || guardian.status!=='ACTIVE' || !enrollment)
        throw new BadRequestException('Verified guardian and eligible student enrollment required');
      const at=new Date();
      const link=await tx.parentStudentLink.upsert({where:{guardianId_studentId_programId:{guardianId:dto.guardianId,studentId:dto.studentId,programId:dto.programId}},create:{guardianId:dto.guardianId,studentId:dto.studentId,programId:dto.programId,status:'ACTIVE',verifiedAt:at,activatedAt:at,approvedById:actor.userId},update:{status:'ACTIVE',verifiedAt:at,activatedAt:at,revokedAt:null,approvedById:actor.userId}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'GUARDIAN_APPROVED_AFTER_EXTERNAL_CHECK',resourceType:'ParentStudentLink',resourceId:link.id,details:{verificationReference:dto.verificationReference}}});
      return {id:link.id,status:link.status};
    });
  }
  async authorizeProcessing(actor:Actor,dto:CreateProcessingAuthorityDto){requireRoot(actor);
    // This records a prior legal/organizational review; it is NOT an automated legal determination.
    return this.db.$transaction(async tx=>{
      const enrolled=await tx.enrollment.findFirst({where:{studentId:dto.studentId,programId:dto.programId,status:'ACTIVE',endedAt:null}});
      if(!enrolled) throw new BadRequestException('Current enrollment required');
      const active=await tx.processingAuthority.findFirst({where:{studentId:dto.studentId,programId:dto.programId,purpose:dto.purpose,status:'ACTIVE',endedAt:null}});
      if(active) throw new ConflictException('Withdraw existing active authority before replacing');
      const authorization=await tx.processingAuthority.create({data:{studentId:dto.studentId,programId:dto.programId,purpose:dto.purpose,legalBasis:dto.legalBasis,policyVersion:dto.policyVersion,approvedById:actor.userId}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'PROCESSING_AUTHORITY_RECORDED',resourceType:'ProcessingAuthority',resourceId:authorization.id,details:{reviewReference:dto.reviewReference}}});
      return {id:authorization.id,status:authorization.status};
    });
  }
  async revokeGuardian(actor:Actor,id:string){requireRoot(actor);
    return this.db.$transaction(async tx=>{
      const link=await tx.parentStudentLink.findUnique({where:{id}});
      if(!link) throw new NotFoundException();
      const updated=await tx.parentStudentLink.update({where:{id},data:{status:'REVOKED',revokedAt:new Date()}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'GUARDIAN_REVOKED',resourceType:'ParentStudentLink',resourceId:id}});
      return {id:updated.id,status:updated.status};
    });
  }
  async endTeacherAssignment(actor:Actor,id:string){requireRoot(actor);
    return this.db.$transaction(async tx=>{
      const assignment=await tx.teacherBatch.findUnique({where:{id}});
      if(!assignment) throw new NotFoundException();
      if(!assignment.endedAt) await tx.teacherBatch.update({where:{id},data:{endedAt:new Date()}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'TEACHER_ASSIGNMENT_ENDED',resourceType:'TeacherBatch',resourceId:id}});
      return {id,ended:true};
    });
  }
  async withdrawProcessing(actor:Actor,id:string){requireRoot(actor);
    return this.db.$transaction(async tx=>{
      const existing=await tx.processingAuthority.findUnique({where:{id}});
      if(!existing) throw new NotFoundException();
      await tx.processingAuthority.update({where:{id},data:{status:'WITHDRAWN',endedAt:new Date()}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'PROCESSING_AUTHORITY_WITHDRAWN',resourceType:'ProcessingAuthority',resourceId:id}});
      return {id,status:'WITHDRAWN'};
    });
  }
  async publishTopic(actor:Actor,dto:PublishTopicDto){requireRoot(actor);
    const p=await this.db.academicProgram.findUnique({where:{id:dto.programId}});
    if(p?.status!=='ACTIVE'||!dto.clues.every(c=>c.length<=300)) throw new BadRequestException('Invalid academic topic');
    return this.db.$transaction(async tx=>{
      const t=await tx.writingTopicVersion.create({data:{...dto,clues:dto.clues,status:'PUBLISHED'}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'TOPIC_PUBLISHED',resourceType:'WritingTopicVersion',resourceId:t.id}});
      return {id:t.id,status:t.status};
    });
  }
  async publishRubric(actor:Actor,dto:PublishRubricDto){requireRoot(actor);
    const program=await this.db.academicProgram.findUnique({where:{id:dto.programId}});
    if(program?.status!=='ACTIVE') throw new BadRequestException('Active program required');
    const id=randomUUID();
    const snapshot:PublishedRubric={id,versionId:id,status:'PUBLISHED',scoreStep:dto.scoreStep,totalMarks:dto.totalMarks,factors:dto.factors as unknown as PublishedRubric['factors']};
    try {validatePublishedRubric(snapshot);} catch(e:any){throw new BadRequestException(e.message);}
    const snapshotHash=hash(canonicalJson(snapshot));
    return this.db.$transaction(async tx=>{
      const published=await tx.rubricVersion.create({data:{id,programId:dto.programId,writingType:dto.writingType,language:dto.language,version:dto.version,status:'PUBLISHED',snapshot:snapshot as unknown as Prisma.InputJsonValue,snapshotHash,publishedAt:new Date()}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'RUBRIC_PUBLISHED_MANUAL',resourceType:'RubricVersion',resourceId:published.id,details:{snapshotHash}}});
      return {id,status:published.status,snapshotHash};
    });
  }
  async bindRubric(actor:Actor, rubricVersionId:string){requireRoot(actor);
    return this.db.$transaction(async tx=>{
      const version=await tx.rubricVersion.findUnique({where:{id:rubricVersionId}});
      if(version?.status!=='PUBLISHED') throw new BadRequestException('Published rubric required');
      const where={programId_writingType_language:{programId:version.programId,writingType:version.writingType,language:version.language}};
      const binding=await tx.rubricBinding.upsert({where,create:{programId:version.programId,writingType:version.writingType,language:version.language,rubricVersionId},update:{rubricVersionId}});
      await tx.auditEvent.create({data:{actorId:actor.userId,action:'RUBRIC_BOUND',resourceType:'RubricBinding',resourceId:binding.id,details:{rubricVersionId}}});
      return {id:binding.id,rubricVersionId};
    });
  }
}

import {ForbiddenException,Inject,Injectable} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.ts';
import type {Actor} from '../auth/jwt.guard.ts';
import {publicWritingOptions,type WritingOptionRow} from './writing-options-policy.ts';
/** Read-only current enrollment catalog: no global program/topic enumeration. */
@Injectable()
export class WritingOptionsService{
 constructor(@Inject(PrismaService)private readonly db:PrismaService){}
 async mine(actor:Actor){
  if(actor.role!=='STUDENT')throw new ForbiddenException('Student only');
  return this.db.$transaction(async tx=>{
   const student=await tx.student.findUnique({where:{userId:actor.userId},
    select:{id:true,user:{select:{status:true,role:true}}}});
   if(!student||student.user.status!=='ACTIVE'||student.user.role!=='STUDENT')
    throw new ForbiddenException('Active student required');
   const rows=await tx.$queryRaw<WritingOptionRow[]>`
    SELECT p.id AS "programId",p.name AS "programName",b.id AS "batchId",b.name AS "batchName",
      t.id AS "topicVersionId",t.title,t."writingType",t.language::text AS language,
      t.instructions,t.clues
    FROM "Enrollment" e
    JOIN "AcademicProgram" p ON p.id=e."programId" AND p.status='ACTIVE'
    JOIN "Batch" b ON b.id=e."batchId" AND b."programId"=p.id AND b.active=true
    JOIN "WritingTopicVersion" t ON t."programId"=p.id AND t.status='PUBLISHED'
    JOIN "RubricBinding" rb ON rb."programId"=p.id
      AND rb."writingType"=t."writingType" AND rb.language=t.language
    JOIN "RubricVersion" rv ON rv.id=rb."rubricVersionId" AND rv.status='PUBLISHED'
      AND rv."programId"=p.id AND rv."writingType"=t."writingType" AND rv.language=t.language
    WHERE e."studentId"=${student.id}::uuid AND e.status='ACTIVE' AND e."endedAt" IS NULL
      AND e."startedAt"<=statement_timestamp()
      AND EXISTS(SELECT 1 FROM "ProcessingAuthority" pa
       WHERE pa."studentId"=e."studentId" AND pa."programId"=e."programId"
         AND pa.purpose='CORE_ASSESSMENT' AND pa.status='ACTIVE'
         AND pa."approvedAt"<=statement_timestamp() AND pa."endedAt" IS NULL)
    ORDER BY p.name,b.name,t.title,t.id LIMIT 101`;
   return {options:publicWritingOptions(rows),truncated:rows.length>100,
    reminder:'These options can expire: every actual submission is re-authorized at write time.'};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:10000});
 }
}

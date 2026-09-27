/** Scoped, live, revision-aware teacher/academic-administrator read dashboard.
 * No full-class mark averages across unrelated rubrics or global-super-admin bypass. */
import {ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.ts';
import type {Actor} from '../auth/jwt.guard.ts';
interface TeacherRow{
 assessmentId:string;studentId:string;rubricVersionId:string;topicTitle:string;
 status:string;revisionId:string|null;revisionNo:number|null;
 totalScore:Prisma.Decimal|null;totalMarks:Prisma.Decimal|null;
 reviewPending:boolean;reportReady:boolean;
}
@Injectable()
export class TeacherDashboardService{
 constructor(@Inject(PrismaService)private readonly db:PrismaService){}
 async mine(actor:Actor){
  if(actor.role!=='TEACHER'&&actor.role!=='ACADEMIC_ADMIN')throw new ForbiddenException();
  const rows=await this.db.$queryRaw<Array<{id:string;name:string;programName:string}>>`
   SELECT b.id,b.name,p.name AS "programName" FROM "Batch" b
    JOIN "AcademicProgram" p ON p.id=b."programId" AND p.status='ACTIVE'
    JOIN "User" u ON u.id=${actor.userId}::uuid AND u.status='ACTIVE' AND u.role::text=${actor.role}
   WHERE b.active=true AND (
    (u.role='TEACHER' AND EXISTS(SELECT 1 FROM "TeacherBatch" t WHERE t."teacherId"=u.id
      AND t."batchId"=b.id AND t."assignedAt"<=statement_timestamp() AND t."endedAt" IS NULL)) OR
    (u.role='ACADEMIC_ADMIN' AND EXISTS(SELECT 1 FROM "AcademicAdminProgram" a WHERE a."userId"=u.id
      AND a."programId"=p.id AND a."assignedAt"<=statement_timestamp() AND a."endedAt" IS NULL)))
   ORDER BY p.name,b.name,b.id LIMIT 101`;
  return {cohorts:rows.slice(0,100),truncated:rows.length>100};
 }
 async cohort(actor:Actor,batchId:string,cursor?:string){
  if(actor.role!=='TEACHER'&&actor.role!=='ACADEMIC_ADMIN')throw new ForbiddenException();
  if(cursor&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor))
   throw new NotFoundException();
  return this.db.$transaction(async tx=>{
   const batch=await tx.batch.findUnique({where:{id:batchId},select:{id:true,programId:true}});
   if(!batch)throw new NotFoundException();
   const user=await tx.user.findUnique({where:{id:actor.userId},select:{id:true,role:true,status:true}});
   if(!user||user.status!=='ACTIVE'||user.role!==actor.role)throw new NotFoundException();
   if(user.role==='TEACHER'){
    const assignment=await tx.teacherBatch.findFirst({where:{teacherId:user.id,batchId,
      assignedAt:{lte:new Date()},endedAt:null}});
    if(!assignment)throw new NotFoundException();
   }else{
    const grant=await tx.academicAdminProgram.findFirst({where:{userId:user.id,
      programId:batch.programId,assignedAt:{lte:new Date()},endedAt:null}});
    if(!grant)throw new NotFoundException();
   }
   // All member checks are embedded in the actual data query as a second backstop.
   // Users can't enumerate names, essays or review notes; only synthetic/student IDs
   // and the authoritative effective score are returned.
   const rows=await tx.$queryRaw<TeacherRow[]>`
    SELECT a.id AS "assessmentId",s."studentId",s."rubricVersionId",
      s."topicSnapshot"->>'title' AS "topicTitle",a.status::text AS status,
      r.id AS "revisionId",r."revisionNo",r."totalScore",r."totalMarks",
      EXISTS(SELECT 1 FROM "HumanReviewCase" c WHERE c."assessmentId"=a.id
        AND c.status IN ('OPEN','PROPOSED')) AS "reviewPending",
      EXISTS(SELECT 1 FROM "ReportSnapshot" rep
        WHERE rep."assessmentId"=a.id AND rep."scoreRevisionId"=a."effectiveScoreRevisionId"
          AND rep."formatVersion"='english-rubric-report-v1') AS "reportReady"
    FROM "Assessment" a JOIN "Submission" s ON s.id=a."submissionId"
      LEFT JOIN "AssessmentScoreRevision" r
        ON r.id=a."effectiveScoreRevisionId" AND a.status='FINALIZED'
    WHERE s."batchId"=${batchId}::uuid AND s."programId"=${batch.programId}::uuid
      AND s.status='ACCEPTED'
      AND (${cursor??null}::uuid IS NULL OR a.id > ${cursor??null}::uuid)
      AND EXISTS(SELECT 1 FROM "Enrollment" e WHERE e."studentId"=s."studentId"
        AND e."programId"=s."programId" AND e."batchId"=s."batchId"
        AND e.status='ACTIVE' AND e."startedAt"<=statement_timestamp() AND e."endedAt" IS NULL)
      AND EXISTS(SELECT 1 FROM "ProcessingAuthority" p WHERE p."studentId"=s."studentId"
        AND p."programId"=s."programId" AND p.purpose='CORE_ASSESSMENT'
        AND p.status='ACTIVE' AND p."endedAt" IS NULL)
    ORDER BY a.id LIMIT 21`;
   const page=rows.slice(0,20),last=page.at(-1);
   return {batchId,programId:batch.programId,scope:'CURRENT_ENROLLMENT',
    disclaimer:'Only current assigned-batch members; marks are canonical per immutable rubric, not cross-rubric averages.',
    assessments:page.map(x=>({assessmentId:x.assessmentId,studentId:x.studentId,
      rubricVersionId:x.rubricVersionId,topicTitle:x.topicTitle,status:x.status,
      effectiveRevisionId:x.revisionId,revisionNo:x.revisionNo,
      totalScore:x.totalScore?.toString()??null,totalMarks:x.totalMarks?.toString()??null,
      reviewPending:x.reviewPending,englishPdfCurrent:x.reportReady&&x.revisionId!==null})),
    nextCursor:rows.length>20?last?.assessmentId??null:null};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:10000});
 }
}

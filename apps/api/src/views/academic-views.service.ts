/** Step92: all authorizations checked against current SQL relationships at request time.
 * Teacher gets minimal canonical score summary; report users get only CURRENT JSON.
 * PDF rendering, file storage and notifications are deliberately NOT implemented. */
import {Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.ts';
interface BatchRow {batchId:string}
interface TeacherAssessmentRow {
 assessmentId:string;studentId:string;status:string;rubricVersionId:string;
 createdAt:Date;revisionId:string|null;revisionNo:number|null;source:string|null;
 totalScore:Prisma.Decimal|null;totalMarks:Prisma.Decimal|null;
 teacherProjectionRevisionId:string|null;
}
interface ReportRow {assessmentId:string;effectiveRevisionId:string|null;id:string|null;
 scoreRevisionId:string|null;snapshot:unknown|null;receiptStatus:string|null}
@Injectable()
export class AcademicViewsService {
 constructor(@Inject(PrismaService)private readonly db:PrismaService){}
 /** No raw essay or reviewer-only comment escapes the teacher list endpoint. */
 async teacherBatch(actorId:string,batchId:string){
  return this.db.$transaction(async tx=>{
   const grant=await tx.$queryRaw<BatchRow[]>`
    SELECT b.id AS "batchId" FROM "Batch" b
      JOIN "AcademicProgram" p ON p.id=b."programId"
      JOIN "TeacherBatch" tb ON tb."batchId"=b.id
      JOIN "User" u ON u.id=tb."teacherId"
    WHERE b.id=${batchId}::uuid AND tb."teacherId"=${actorId}::uuid
      AND u.role='TEACHER' AND u.status='ACTIVE'
      AND tb."assignedAt"<=statement_timestamp() AND tb."endedAt" IS NULL
      AND b.active AND p.status='ACTIVE' LIMIT 1`;
   if(!grant.length)throw new NotFoundException();
   const rows=await tx.$queryRaw<TeacherAssessmentRow[]>`
    SELECT a.id AS "assessmentId",s."studentId",a.status::text AS status,
      s."rubricVersionId",a."createdAt",r.id AS "revisionId",r."revisionNo",
      r.source,r."totalScore",r."totalMarks",
      t."scoreRevisionId" AS "teacherProjectionRevisionId"
    FROM "Assessment" a JOIN "Submission" s ON s.id=a."submissionId"
      JOIN "TeacherBatch" tb ON tb."batchId"=s."batchId"
      JOIN "Batch" b ON b.id=s."batchId" AND b."programId"=s."programId"
      JOIN "AcademicProgram" ap ON ap.id=s."programId"
      JOIN "User" u ON u.id=tb."teacherId"
      LEFT JOIN "AssessmentScoreRevision" r ON r.id=a."effectiveScoreRevisionId"
        AND r."assessmentId"=a.id AND a.status='FINALIZED'
      LEFT JOIN "TeacherScoreProjection" t ON t."assessmentId"=a.id
    WHERE s."batchId"=${batchId}::uuid AND tb."teacherId"=${actorId}::uuid
      AND u.role='TEACHER' AND u.status='ACTIVE'
      AND tb."assignedAt"<=statement_timestamp() AND tb."endedAt" IS NULL
      AND b.active AND ap.status='ACTIVE' AND s.status='ACCEPTED'
      AND EXISTS(SELECT 1 FROM "Enrollment" e WHERE e."studentId"=s."studentId"
        AND e."programId"=s."programId" AND e."batchId"=s."batchId"
        AND e.status='ACTIVE' AND e."startedAt"<=statement_timestamp()
        AND e."endedAt" IS NULL)
      AND EXISTS(SELECT 1 FROM "ProcessingAuthority" pa WHERE
        pa."studentId"=s."studentId" AND pa."programId"=s."programId"
        AND pa.purpose='CORE_ASSESSMENT' AND pa.status='ACTIVE'
        AND pa."endedAt" IS NULL)
    ORDER BY a."createdAt" DESC,a.id DESC LIMIT 50`;
   return {batchId,items:rows.map(row=>({
     assessmentId:row.assessmentId,studentId:row.studentId,status:row.status,
     rubricVersionId:row.rubricVersionId,createdAt:row.createdAt,
     result:row.revisionId?{revisionId:row.revisionId,revisionNo:row.revisionNo,
       source:row.source,totalScore:String(row.totalScore),totalMarks:String(row.totalMarks)}:null,
     summaryStatus:row.revisionId&&row.teacherProjectionRevisionId===row.revisionId?
       'CURRENT':row.revisionId?'STALE':'UNAVAILABLE'
   })),limit:50,hasMoreUnknown:true};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:10000});
 }
 /** Student, guardian access are separate paths; share neither teacher access nor old snapshots. */
 async currentReport(actorId:string,assessmentId:string,studentId?:string){
  return this.db.$transaction(async tx=>{
    const owned=studentId?await tx.$queryRaw<ReportRow[]>`
      SELECT a.id AS "assessmentId",a."effectiveScoreRevisionId" AS "effectiveRevisionId",
        rep.id,rep."scoreRevisionId",rep.snapshot,inv.status AS "receiptStatus"
      FROM "Assessment" a JOIN "Submission" s ON s.id=a."submissionId"
        JOIN "ParentStudentLink" l ON l."studentId"=s."studentId" AND l."programId"=s."programId"
        JOIN "User" u ON u.id=l."guardianId"
        LEFT JOIN "AcademicReportSnapshot" rep ON rep."assessmentId"=a.id
          AND rep."scoreRevisionId"=a."effectiveScoreRevisionId"
        LEFT JOIN "DerivedProjectionInvalidation" inv ON inv."assessmentId"=a.id
          AND inv."scoreRevisionId"=a."effectiveScoreRevisionId" AND inv.target='REPORT'
      WHERE a.id=${assessmentId}::uuid AND s."studentId"=${studentId}::uuid
        AND l."guardianId"=${actorId}::uuid AND l.status='ACTIVE'
        AND l."verifiedAt"<=statement_timestamp() AND l."activatedAt"<=statement_timestamp()
        AND l."revokedAt" IS NULL AND u.role='PARENT' AND u.status='ACTIVE'
        AND EXISTS(SELECT 1 FROM "Enrollment" e WHERE e."studentId"=s."studentId"
          AND e."programId"=s."programId" AND e.status='ACTIVE'
          AND e."startedAt"<=statement_timestamp() AND e."endedAt" IS NULL)
        AND EXISTS(SELECT 1 FROM "ProcessingAuthority" pa
          WHERE pa."studentId"=s."studentId" AND pa."programId"=s."programId"
          AND pa.purpose='CORE_ASSESSMENT' AND pa.status='ACTIVE'
          AND pa."endedAt" IS NULL)
      LIMIT 1`:await tx.$queryRaw<ReportRow[]>`
      SELECT a.id AS "assessmentId",a."effectiveScoreRevisionId" AS "effectiveRevisionId",
        rep.id,rep."scoreRevisionId",rep.snapshot,inv.status AS "receiptStatus"
      FROM "Assessment" a JOIN "Submission" s ON s.id=a."submissionId"
        JOIN "Student" st ON st.id=s."studentId"
        JOIN "User" u ON u.id=st."userId"
        LEFT JOIN "AcademicReportSnapshot" rep ON rep."assessmentId"=a.id
          AND rep."scoreRevisionId"=a."effectiveScoreRevisionId"
        LEFT JOIN "DerivedProjectionInvalidation" inv ON inv."assessmentId"=a.id
          AND inv."scoreRevisionId"=a."effectiveScoreRevisionId" AND inv.target='REPORT'
      WHERE a.id=${assessmentId}::uuid AND st."userId"=${actorId}::uuid
        AND u.role='STUDENT' AND u.status='ACTIVE'
        AND EXISTS(SELECT 1 FROM "ProcessingAuthority" pa
          WHERE pa."studentId"=s."studentId" AND pa."programId"=s."programId"
          AND pa.purpose='CORE_ASSESSMENT' AND pa.status='ACTIVE'
          AND pa."endedAt" IS NULL)
      LIMIT 1`;
    const row=owned[0];if(!row)throw new NotFoundException();
    if(!row.effectiveRevisionId||!row.id||row.scoreRevisionId!==row.effectiveRevisionId||
      row.receiptStatus!=='REBUILT')
      return {assessmentId,status:'PENDING',report:null,pdfStatus:'NOT_IMPLEMENTED'};
    return {assessmentId,status:'CURRENT',report:row.snapshot,pdfStatus:'NOT_IMPLEMENTED'};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:12000});
 }
}

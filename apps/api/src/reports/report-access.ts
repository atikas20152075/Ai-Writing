/** Object-level academic scope. This runs inside the SAME transaction as report generation. */
import {NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import type {Actor} from '../auth/jwt.guard.ts';
export interface AuthorizedReportRow{
 assessmentId:string;scoreRevisionId:string;revisionNo:number;source:string;
 rubricVersionId:string;totalScore:Prisma.Decimal;totalMarks:Prisma.Decimal;
 factorResults:unknown;topicSnapshot:unknown;language:string;studentId:string;programId:string;
}
export async function authorizedReport(tx:Prisma.TransactionClient,actor:Actor,assessmentId:string)
 :Promise<AuthorizedReportRow>{
 // A scope must be rechecked every request. No global admin bypass, no shared
 // parent-wide membership inference and no downloadable static signed URL.
 const rows=await tx.$queryRaw<AuthorizedReportRow[]>`
 SELECT a.id AS "assessmentId",r.id AS "scoreRevisionId",r."revisionNo",r.source,
   s."rubricVersionId",r."totalScore",r."totalMarks",r."factorResults",
   s."topicSnapshot",v.language::text AS language,s."studentId",s."programId"
 FROM "Assessment" a
 JOIN "Submission" s ON s.id=a."submissionId" AND s.status='ACCEPTED'
 JOIN "VerifiedWritingText" v ON v."submissionId"=s.id
 JOIN "AssessmentScoreRevision" r ON r.id=a."effectiveScoreRevisionId" AND r."assessmentId"=a.id
 JOIN "Student" st ON st.id=s."studentId"
 JOIN "User" actor ON actor.id=${actor.userId}::uuid AND actor.status='ACTIVE'
 WHERE a.id=${assessmentId}::uuid AND a.status='FINALIZED'
   AND EXISTS(SELECT 1 FROM "ProcessingAuthority" pa
     WHERE pa."studentId"=s."studentId" AND pa."programId"=s."programId"
       AND pa.purpose='CORE_ASSESSMENT' AND pa.status='ACTIVE' AND pa."endedAt" IS NULL)
   AND (
     (actor.role='STUDENT' AND st."userId"=actor.id)
     OR (actor.role='PARENT' AND EXISTS(
       SELECT 1 FROM "ParentStudentLink" gl JOIN "Enrollment" e
       ON e."studentId"=gl."studentId" AND e."programId"=gl."programId"
       WHERE gl."guardianId"=actor.id AND gl."studentId"=s."studentId"
         AND gl."programId"=s."programId" AND gl.status='ACTIVE'
         AND gl."verifiedAt" IS NOT NULL AND gl."activatedAt" IS NOT NULL
         AND gl."revokedAt" IS NULL
         AND e.status='ACTIVE' AND e."startedAt"<=statement_timestamp() AND e."endedAt" IS NULL))
     OR (actor.role='TEACHER' AND EXISTS(
       SELECT 1 FROM "TeacherBatch" tb JOIN "Enrollment" e ON e."batchId"=tb."batchId"
       WHERE tb."teacherId"=actor.id AND tb."batchId"=s."batchId"
         AND tb."assignedAt"<=statement_timestamp() AND tb."endedAt" IS NULL
         AND e."studentId"=s."studentId" AND e."programId"=s."programId"
         AND e.status='ACTIVE' AND e."startedAt"<=statement_timestamp() AND e."endedAt" IS NULL))
     OR (actor.role='ACADEMIC_ADMIN' AND EXISTS(
       SELECT 1 FROM "AcademicAdminProgram" ap WHERE ap."userId"=actor.id
         AND ap."programId"=s."programId" AND ap."assignedAt"<=statement_timestamp()
         AND ap."endedAt" IS NULL))
   )
 FOR UPDATE OF a`;
 if(rows.length!==1)throw new NotFoundException('Report is not available for this account');
 return rows[0];
}

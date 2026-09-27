/** Scoped, live, revision-aware teacher/academic-administrator read dashboard.
 * No full-class mark averages across unrelated rubrics or global-super-admin bypass. */
import {ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.ts';
import type {Actor} from '../auth/jwt.guard.ts';
const COHORT_ANALYTICS_MIN_FINALIZED_LEARNERS=5;
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
          AND rep."formatVersion" IN ('english-rubric-report-v1','rubric-report-v2-en','rubric-report-v2-bn')) AS "reportReady"
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

 async analytics(actor:Actor,batchId:string){
  if(actor.role!=='TEACHER'&&actor.role!=='ACADEMIC_ADMIN')throw new ForbiddenException();
  return this.db.$transaction(async tx=>{
   // Resolve the scope and the actor in the same snapshot as the aggregate.
   // A revoked assignment, inactive user/program, or inactive batch is unavailable.
   const scope=await tx.$queryRaw<Array<{batchId:string;programId:string;asOf:Date}>>`
    SELECT b.id AS "batchId",p.id AS "programId",transaction_timestamp() AS "asOf"
    FROM "Batch" b JOIN "AcademicProgram" p ON p.id=b."programId" AND p.status='ACTIVE'
    JOIN "User" u ON u.id=${actor.userId}::uuid AND u.status='ACTIVE' AND u.role::text=${actor.role}
    WHERE b.id=${batchId}::uuid AND b.active=true AND (
     (u.role='TEACHER' AND EXISTS(SELECT 1 FROM "TeacherBatch" t WHERE t."teacherId"=u.id
       AND t."batchId"=b.id AND t."assignedAt"<=statement_timestamp() AND t."endedAt" IS NULL)) OR
     (u.role='ACADEMIC_ADMIN' AND EXISTS(SELECT 1 FROM "AcademicAdminProgram" g WHERE g."userId"=u.id
       AND g."programId"=p.id AND g."assignedAt"<=statement_timestamp() AND g."endedAt" IS NULL)))`;
   const authorized=scope[0];
   if(!authorized)throw new NotFoundException();
   const rows=await tx.$queryRaw<Array<{rubricVersionId:string;rubricVersion:number;writingType:string;language:string;totalMarks:Prisma.Decimal|null;
     assessmentCount:bigint;finalizedCount:bigint;representedLearnerCount:bigint;
     notFinalizedCount:bigint;unavailableResultCount:bigint;meanScore:Prisma.Decimal|null;minimumScore:Prisma.Decimal|null;
     maximumScore:Prisma.Decimal|null}>>`
    SELECT s."rubricVersionId",v.version AS "rubricVersion",v."writingType",v.language,
     MAX(r."totalMarks") AS "totalMarks",
     COUNT(a.id)::bigint AS "assessmentCount",
     COUNT(r.id)::bigint AS "finalizedCount",
     COUNT(DISTINCT s."studentId") FILTER (WHERE r.id IS NOT NULL)::bigint AS "representedLearnerCount",
     COUNT(a.id) FILTER (WHERE a.status<>'FINALIZED')::bigint AS "notFinalizedCount",
     COUNT(a.id) FILTER (WHERE a.status='FINALIZED' AND r.id IS NULL)::bigint AS "unavailableResultCount",
     ROUND(AVG(r."totalScore"),2) AS "meanScore",MIN(r."totalScore") AS "minimumScore",
     MAX(r."totalScore") AS "maximumScore"
    FROM "Submission" s
    JOIN "RubricVersion" v ON v.id=s."rubricVersionId" AND v."programId"=s."programId"
    JOIN "Assessment" a ON a."submissionId"=s.id
    LEFT JOIN "AssessmentScoreRevision" r ON r.id=a."effectiveScoreRevisionId"
     AND r."assessmentId"=a.id AND a.status='FINALIZED'
    WHERE s."programId"=${authorized.programId}::uuid AND s."batchId"=${authorized.batchId}::uuid
     AND s.status='ACCEPTED'
     AND EXISTS(SELECT 1 FROM "Enrollment" e WHERE e."studentId"=s."studentId"
       AND e."programId"=s."programId" AND e."batchId"=s."batchId"
       AND e.status='ACTIVE' AND e."startedAt"<=statement_timestamp() AND e."endedAt" IS NULL)
     AND EXISTS(SELECT 1 FROM "ProcessingAuthority" p WHERE p."studentId"=s."studentId"
       AND p."programId"=s."programId" AND p.purpose='CORE_ASSESSMENT'
       AND p.status='ACTIVE' AND p."endedAt" IS NULL)
    GROUP BY s."rubricVersionId",v.version,v."writingType",v.language ORDER BY s."rubricVersionId"`;
   return {batchId:authorized.batchId,programId:authorized.programId,scope:'CURRENT_AUTHORIZED_ENROLLMENT',
    asOf:authorized.asOf.toISOString(),
    disclaimer:'Descriptive, assessment-weighted current results. Repeated assessments count separately; rubric versions are reported separately and are not comparable across groups. Groups with fewer than five represented learners are withheld for privacy.',
    groups:rows.map(x=>{
     const suppressed=Number(x.representedLearnerCount)<COHORT_ANALYTICS_MIN_FINALIZED_LEARNERS;
     return {rubricVersionId:x.rubricVersionId,rubricVersion:x.rubricVersion,
      writingType:x.writingType,language:x.language,suppressed,
      assessmentCount:suppressed?null:Number(x.assessmentCount),
      finalizedCount:suppressed?null:Number(x.finalizedCount),
      representedLearnerCount:suppressed?null:Number(x.representedLearnerCount),
      notFinalizedCount:suppressed?null:Number(x.notFinalizedCount),
      unavailableResultCount:suppressed?null:Number(x.unavailableResultCount),
      totalMarks:suppressed?null:x.totalMarks?.toString()??null,
      meanScore:suppressed?null:x.meanScore?.toString()??null,
      minimumScore:suppressed?null:x.minimumScore?.toString()??null,
      maximumScore:suppressed?null:x.maximumScore?.toString()??null};
    })};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:10000});
 }
}

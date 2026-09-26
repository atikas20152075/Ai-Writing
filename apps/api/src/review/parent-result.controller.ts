/** Parent discovery and detail apply the same live scope in each data query. */
import {Controller,Get,Header,Inject,Param,ParseUUIDPipe,Query,Req,UseGuards,ForbiddenException,NotFoundException,BadRequestException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.ts';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
interface ParentResultRow {
  assessmentId:string;studentId:string;programId:string;topicTitle:string;createdAt:Date;
  status:string;rubricVersionId:string;
  revisionId:string|null;revisionNo:number|null;source:string|null;
  totalScore:unknown;totalMarks:unknown;factorResults:unknown;finalizedAt:Date|null;
}
// EXISTS avoids duplicate assessments when several enrollment/authority rows qualify.
// No guardian/student ID supplied by the client can replace the authenticated actor.
function parentScope(guardianId:string){return Prisma.sql`
  s.status='ACCEPTED'
  AND EXISTS(SELECT 1 FROM "ParentStudentLink" l JOIN "User" u ON u.id=l."guardianId"
    WHERE l."studentId"=s."studentId" AND l."programId"=s."programId"
      AND l."guardianId"=${guardianId}::uuid AND l.status='ACTIVE'
      AND l."verifiedAt"<=statement_timestamp() AND l."activatedAt"<=statement_timestamp()
      AND l."revokedAt" IS NULL AND u.role='PARENT' AND u.status='ACTIVE')
  AND EXISTS(SELECT 1 FROM "Enrollment" e WHERE e."studentId"=s."studentId"
    AND e."programId"=s."programId" AND e.status='ACTIVE'
    AND e."startedAt"<=statement_timestamp() AND e."endedAt" IS NULL)
  AND EXISTS(SELECT 1 FROM "ProcessingAuthority" p WHERE p."studentId"=s."studentId"
    AND p."programId"=s."programId" AND p.purpose='CORE_ASSESSMENT'
    AND p.status='ACTIVE' AND p."approvedAt"<=statement_timestamp() AND p."endedAt" IS NULL)`;}
@Controller('parents/me/children') @UseGuards(JwtGuard)
export class ParentAssessmentResultController {
  constructor(@Inject(PrismaService)private readonly db:PrismaService){}
  @Get('assessments') @Header('Cache-Control','private, no-store, max-age=0')
  async list(@Req()req:AuthenticatedRequest,@Query('cursor')cursor?:string){
    if(req.actor.role!=='PARENT')throw new ForbiddenException();
    if(cursor!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor))
      throw new BadRequestException('Invalid cursor');
    const rows=await this.db.$queryRaw<ParentResultRow[]>(Prisma.sql`
      SELECT a.id AS "assessmentId",s."studentId",s."programId",s."rubricVersionId",
        s."topicSnapshot"->>'title' AS "topicTitle",s."createdAt",a.status::text AS status,
        r.id AS "revisionId",r."revisionNo",r."totalScore",r."totalMarks"
      FROM "Assessment" a JOIN "Submission" s ON s.id=a."submissionId"
        LEFT JOIN "AssessmentScoreRevision" r ON r.id=a."effectiveScoreRevisionId" AND a.status='FINALIZED'
      WHERE ${parentScope(req.actor.userId)}
        AND (${cursor??null}::uuid IS NULL OR a.id>${cursor??null}::uuid)
      ORDER BY a.id LIMIT 21`);
    const page=rows.slice(0,20);
    return {assessments:page.map(row=>({assessmentId:row.assessmentId,studentId:row.studentId,
      programId:row.programId,rubricVersionId:row.rubricVersionId,topicTitle:row.topicTitle,
      createdAt:row.createdAt,status:row.status,effectiveRevisionId:row.revisionId,
      revisionNo:row.revisionNo,totalScore:row.revisionId?String(row.totalScore):null,
      totalMarks:row.revisionId?String(row.totalMarks):null})),
      nextCursor:rows.length>20?page.at(-1)!.assessmentId:null};
  }
  @Get(':studentId/assessments/:assessmentId/result') @Header('Cache-Control','private, no-store, max-age=0')
  async result(@Req()req:AuthenticatedRequest,
    @Param('studentId',new ParseUUIDPipe())studentId:string,
    @Param('assessmentId',new ParseUUIDPipe())assessmentId:string){
    if(req.actor.role!=='PARENT')throw new ForbiddenException();
    const rows=await this.db.$queryRaw<ParentResultRow[]>(Prisma.sql`
      SELECT a.id AS "assessmentId",a.status::text AS status,s."rubricVersionId",
        r.id AS "revisionId",r."revisionNo",r.source,r."totalScore",r."totalMarks",
        r."factorResults",r."createdAt" AS "finalizedAt"
      FROM "Assessment" a JOIN "Submission" s ON s.id=a."submissionId"
        LEFT JOIN "AssessmentScoreRevision" r ON r.id=a."effectiveScoreRevisionId" AND a.status='FINALIZED'
      WHERE a.id=${assessmentId}::uuid AND s."studentId"=${studentId}::uuid
        AND ${parentScope(req.actor.userId)} LIMIT 1`);
    const row=rows[0];
    if(!row)throw new NotFoundException();
    if(row.status!=='FINALIZED'||!row.revisionId)
      return {assessmentId:row.assessmentId,status:row.status,result:null};
    return {assessmentId:row.assessmentId,status:row.status,rubricVersionId:row.rubricVersionId,
      result:{revisionId:row.revisionId,revisionNo:row.revisionNo,source:row.source,
        totalScore:String(row.totalScore),totalMarks:String(row.totalMarks),
        factorResults:row.factorResults,finalizedAt:row.finalizedAt}};
  }
}

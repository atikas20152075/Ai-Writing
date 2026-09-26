/** A single authorized SQL statement resolves one parent's current, effective child score. */
import {Controller,Get,Inject,Param,ParseUUIDPipe,Req,UseGuards,ForbiddenException,NotFoundException} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service.ts';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
interface ParentResultRow {
  assessmentId:string;status:string;rubricVersionId:string;
  revisionId:string|null;revisionNo:number|null;source:string|null;
  totalScore:unknown;totalMarks:unknown;factorResults:unknown;finalizedAt:Date|null;
}
@Controller('parents/me/children') @UseGuards(JwtGuard)
export class ParentAssessmentResultController {
  constructor(@Inject(PrismaService)private readonly db:PrismaService){}
  @Get(':studentId/assessments/:assessmentId/result') async result(@Req()req:AuthenticatedRequest,
    @Param('studentId',new ParseUUIDPipe())studentId:string,
    @Param('assessmentId',new ParseUUIDPipe())assessmentId:string){
    if(req.actor.role!=='PARENT')throw new ForbiddenException();
    // Scope and effective revision resolved in ONE database snapshot; no grade is read before link authorization.
    const rows=await this.db.$queryRaw<ParentResultRow[]>`
      SELECT a.id AS "assessmentId",a.status::text AS status,s."rubricVersionId",
        r.id AS "revisionId",r."revisionNo",r.source,r."totalScore",r."totalMarks",
        r."factorResults",r."createdAt" AS "finalizedAt"
      FROM "Assessment" a JOIN "Submission" s ON s.id=a."submissionId"
        JOIN "ParentStudentLink" l ON l."studentId"=s."studentId" AND l."programId"=s."programId"
        JOIN "Enrollment" e ON e."studentId"=s."studentId" AND e."programId"=s."programId"
        JOIN "ProcessingAuthority" p ON p."studentId"=s."studentId" AND p."programId"=s."programId"
        JOIN "User" u ON u.id=l."guardianId"
        LEFT JOIN "AssessmentScoreRevision" r ON r.id=a."effectiveScoreRevisionId"
      WHERE a.id=${assessmentId}::uuid AND s."studentId"=${studentId}::uuid
        AND l."guardianId"=${req.actor.userId}::uuid AND l.status='ACTIVE'
        AND l."verifiedAt"<=statement_timestamp() AND l."activatedAt"<=statement_timestamp()
        AND l."revokedAt" IS NULL AND u.role='PARENT' AND u.status='ACTIVE'
        AND e.status='ACTIVE' AND e."startedAt"<=statement_timestamp() AND e."endedAt" IS NULL
        AND p.purpose='CORE_ASSESSMENT' AND p.status='ACTIVE' AND p."endedAt" IS NULL
      LIMIT 1`;
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

/** Current authorization is checked BEFORE loading a child's score; no historical link grants access. */
import {Controller,Get,Inject,Param,ParseUUIDPipe,Req,UseGuards,ForbiddenException,NotFoundException} from '@nestjs/common';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {PrismaService} from '../prisma/prisma.service.ts';
@Controller('parents/me/children') @UseGuards(JwtGuard)
export class ParentAssessmentResultController {
  constructor(@Inject(PrismaService)private readonly db:PrismaService){}
  @Get(':studentId/assessments/:assessmentId/result') async result(@Req()req:AuthenticatedRequest,
    @Param('studentId',new ParseUUIDPipe())studentId:string,
    @Param('assessmentId',new ParseUUIDPipe())assessmentId:string){
    if(req.actor.role!=='PARENT')throw new ForbiddenException();
    const now=new Date();
    // Only minimum routing metadata is read before verifying this parent/program relationship.
    const meta=await this.db.assessment.findFirst({where:{id:assessmentId,submission:{studentId}},
      select:{id:true,submission:{select:{programId:true}}}});
    if(!meta)throw new NotFoundException();
    const link=await this.db.parentStudentLink.findFirst({where:{guardianId:req.actor.userId,
      studentId,programId:meta.submission.programId,status:'ACTIVE',verifiedAt:{lte:now},
      activatedAt:{lte:now},revokedAt:null,
      student:{enrollments:{some:{programId:meta.submission.programId,status:'ACTIVE',startedAt:{lte:now},endedAt:null}},
        authorities:{some:{programId:meta.submission.programId,purpose:'CORE_ASSESSMENT',status:'ACTIVE',endedAt:null}}}}}});
    if(!link)throw new NotFoundException();
    // Repeat current link, enrollment and authority predicates when fetching actual private marks.
    const a=await this.db.assessment.findFirst({where:{id:assessmentId,submission:{studentId,
      programId:meta.submission.programId,
      student:{guardianLinks:{some:{guardianId:req.actor.userId,programId:meta.submission.programId,
        status:'ACTIVE',verifiedAt:{lte:now},activatedAt:{lte:now},revokedAt:null}},
        enrollments:{some:{programId:meta.submission.programId,status:'ACTIVE',startedAt:{lte:now},endedAt:null}},
        authorities:{some:{programId:meta.submission.programId,purpose:'CORE_ASSESSMENT',status:'ACTIVE',endedAt:null}}}}}},
      include:{submission:{select:{rubricVersionId:true}},effectiveScoreRevision:{select:{id:true,source:true,
        revisionNo:true,totalScore:true,totalMarks:true,factorResults:true,createdAt:true}}}});
    if(!a)throw new NotFoundException();
    if(a.status!=='FINALIZED'||!a.effectiveScoreRevision)
      return {assessmentId:a.id,status:a.status,result:null};
    const r=a.effectiveScoreRevision;
    return {assessmentId:a.id,status:a.status,rubricVersionId:a.submission.rubricVersionId,
      result:{revisionId:r.id,revisionNo:r.revisionNo,source:r.source,totalScore:r.totalScore.toString(),
        totalMarks:r.totalMarks.toString(),factorResults:r.factorResults,finalizedAt:r.createdAt}};
  }
}

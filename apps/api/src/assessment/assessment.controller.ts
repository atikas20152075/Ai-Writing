import {Controller,Get,Inject,Param,ParseUUIDPipe,Req,UseGuards,ForbiddenException,NotFoundException} from '@nestjs/common';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {PrismaService} from '../prisma/prisma.service.ts';

/** A student may see ONLY their own canonical effective revision; never a provisional AI score. */
@Controller('assessments') @UseGuards(JwtGuard)
export class AssessmentReadController {
  constructor(@Inject(PrismaService)private readonly db:PrismaService){}
  @Get('mine/:id/result') async result(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string){
    if(req.actor.role!=='STUDENT')throw new ForbiddenException();
    const student=await this.db.student.findUnique({where:{userId:req.actor.userId}});
    if(!student)throw new NotFoundException();
    const assessment=await this.db.assessment.findFirst({where:{id,submission:{studentId:student.id}},
      select:{id:true,status:true,submission:{select:{rubricVersionId:true,programId:true}},
        effectiveScoreRevision:{select:{id:true,source:true,revisionNo:true,totalScore:true,totalMarks:true,factorResults:true,createdAt:true,inputHash:true}}}});
    if(!assessment)throw new NotFoundException();
    if(assessment.status!=='FINALIZED'||!assessment.effectiveScoreRevision){
      return {assessmentId:assessment.id,status:assessment.status,result:null};
    }
    const r=assessment.effectiveScoreRevision;
    return {assessmentId:assessment.id,status:'FINALIZED',rubricVersionId:assessment.submission.rubricVersionId,
      result:{revisionId:r.id,revisionNo:r.revisionNo,source:r.source,totalScore:r.totalScore.toString(),totalMarks:r.totalMarks.toString(),
        factorResults:r.factorResults,finalizedAt:r.createdAt}};
  }
}

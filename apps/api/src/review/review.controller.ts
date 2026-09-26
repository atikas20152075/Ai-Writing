import {Body,Controller,Get,Inject,Param,ParseUUIDPipe,Post,Req,UseGuards} from '@nestjs/common';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {HumanReviewService} from './review.service.ts';
import {DecideReviewDto,OpenReviewDto,ProposeCorrectionDto} from './review.dto.ts';

@Controller('assessments') @UseGuards(JwtGuard)
export class OpenAssessmentReviewController {
  constructor(@Inject(HumanReviewService)private readonly review:HumanReviewService){}
  @Post(':assessmentId/review-cases') open(@Req() req:AuthenticatedRequest,
    @Param('assessmentId',new ParseUUIDPipe()) assessmentId:string,@Body() body:OpenReviewDto){
    return this.review.open(req.actor,assessmentId,body.reason);
  }
}
@Controller('review-cases') @UseGuards(JwtGuard)
export class ReviewCasesController {
  constructor(@Inject(HumanReviewService)private readonly review:HumanReviewService){}
  @Get(':id') read(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string){
    return this.review.readCase(req.actor,id);
  }
  @Post(':id/proposals') propose(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,
    @Body() body:ProposeCorrectionDto){return this.review.propose(req.actor,id,body.factorResults,body.reason);}
  @Post(':id/decisions') decide(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,
    @Body() body:DecideReviewDto){return this.review.decide(req.actor,id,body.decision,body.reason);}
}

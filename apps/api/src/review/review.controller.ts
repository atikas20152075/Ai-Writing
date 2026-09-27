import {Body,Controller,Get,Inject,Param,ParseUUIDPipe,Post,Query,Req,UseGuards,UseFilters} from '@nestjs/common';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {HumanReviewService} from './review.service.ts';
import {ReviewErrorFilter} from './review-error.filter.ts';
import {DecideReviewDto,OpenReviewDto,ProposeCorrectionDto} from './review.dto.ts';

@Controller('assessments') @UseGuards(JwtGuard) @UseFilters(ReviewErrorFilter)
export class OpenAssessmentReviewController {
  constructor(@Inject(HumanReviewService)private readonly review:HumanReviewService){}
  @Post(':assessmentId/review-cases') open(@Req() req:AuthenticatedRequest,
    @Param('assessmentId',new ParseUUIDPipe()) assessmentId:string,@Body() body:OpenReviewDto){
    return this.review.open(req.actor,assessmentId,body.reason);
  }
}
@Controller('review-cases') @UseGuards(JwtGuard) @UseFilters(ReviewErrorFilter)
export class ReviewCasesController {
  constructor(@Inject(HumanReviewService)private readonly review:HumanReviewService){}
  @Get() queue(@Req() req:AuthenticatedRequest,@Query('batchId',new ParseUUIDPipe({optional:true}))batchId?:string){
    return this.review.queue(req.actor,batchId);
  }
  @Get(':id') read(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string){
    return this.review.readCase(req.actor,id);
  }
  @Post(':id/proposals') propose(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,
    @Body() body:ProposeCorrectionDto){return this.review.propose(req.actor,id,body.factorResults,body.reason);}
  @Post(':id/decisions') decide(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string,
    @Body() body:DecideReviewDto){return this.review.decide(req.actor,id,body.decision,body.reason);}
}

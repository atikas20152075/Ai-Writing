import {Body,Controller,Get,Header,Inject,Param,ParseUUIDPipe,Post,Req,UseGuards} from '@nestjs/common';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {SubmissionService} from './submission.service.ts';
import {WritingOptionsService} from './writing-options.service.ts';
import {CreateTypedSubmissionDto,CreateRewriteSubmissionDto} from './submission.dto.ts';
@Controller('submissions') @UseGuards(JwtGuard)
export class SubmissionController {
  constructor(@Inject(SubmissionService) private readonly submissions:SubmissionService,
  @Inject(WritingOptionsService) private readonly options:WritingOptionsService){}
  @Get('mine/writing-options') choices(@Req() req:AuthenticatedRequest){return this.options.mine(req.actor);}
  @Post('typed') create(@Req() req:AuthenticatedRequest,@Body() dto:CreateTypedSubmissionDto){return this.submissions.createTyped(req.actor,dto);}
  @Post('rewrites') rewrite(@Req() req:AuthenticatedRequest,@Body() dto:CreateRewriteSubmissionDto){return this.submissions.createRewrite(req.actor,dto);}
  @Get('mine') @Header('Cache-Control','private, no-store, max-age=0')
  list(@Req() req:AuthenticatedRequest){return this.submissions.listMine(req.actor);}
  @Get('mine/:id') get(@Req() req:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string){return this.submissions.findMine(req.actor,id);}
}

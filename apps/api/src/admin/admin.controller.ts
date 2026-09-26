import {Body,Controller,Inject,Param,Post,Req,UseGuards,ParseUUIDPipe} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.ts';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {AdminService} from './admin.service.ts';
import {BindRubricDto,CreateBatchDto,CreateEnrollmentDto,CreateGuardianLinkDto,CreateProcessingAuthorityDto,CreateProgramDto,PublishRubricDto,PublishTopicDto,AssignTeacherDto} from './admin.dto.ts';
@Controller('admin') @UseGuards(JwtGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin:AdminService){}
  @Post('programs') createProgram(@Req() r:AuthenticatedRequest,@Body() d:CreateProgramDto){return this.admin.createProgram(r.actor,d);}
  @Post('batches') createBatch(@Req() r:AuthenticatedRequest,@Body() d:CreateBatchDto){return this.admin.createBatch(r.actor,d);}
  @Post('enrollments') enroll(@Req() r:AuthenticatedRequest,@Body() d:CreateEnrollmentDto){return this.admin.enroll(r.actor,d);}
  @Post('teacher-assignments') assign(@Req() r:AuthenticatedRequest,@Body() d:AssignTeacherDto){return this.admin.assignTeacher(r.actor,d);}
  @Post('guardian-verifications') guardian(@Req() r:AuthenticatedRequest,@Body() d:CreateGuardianLinkDto){return this.admin.verifyGuardian(r.actor,d);}
  @Post('processing-authorities') authority(@Req() r:AuthenticatedRequest,@Body() d:CreateProcessingAuthorityDto){return this.admin.authorizeProcessing(r.actor,d);}
  @Post('topic-versions/publish') topic(@Req() r:AuthenticatedRequest,@Body() d:PublishTopicDto){return this.admin.publishTopic(r.actor,d);}
  @Post('rubric-versions/publish') rubric(@Req() r:AuthenticatedRequest,@Body() d:PublishRubricDto){return this.admin.publishRubric(r.actor,d);}
  @Post('guardian-verifications/:id/revoke') revokeGuardian(@Req() r:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string){return this.admin.revokeGuardian(r.actor,id);}
  @Post('teacher-assignments/:id/end') endTeacher(@Req() r:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string){return this.admin.endTeacherAssignment(r.actor,id);}
  @Post('processing-authorities/:id/withdraw') withdraw(@Req() r:AuthenticatedRequest,@Param('id',new ParseUUIDPipe()) id:string){return this.admin.withdrawProcessing(r.actor,id);}
  @Post('rubric-bindings') binding(@Req() r:AuthenticatedRequest,@Body() d:BindRubricDto){return this.admin.bindRubric(r.actor,d.rubricVersionId);}
}

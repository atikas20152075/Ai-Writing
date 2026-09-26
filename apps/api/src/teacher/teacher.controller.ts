import {Controller,ForbiddenException,Get,Inject,Param,ParseUUIDPipe,Query,Req,UseGuards} from '@nestjs/common';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {TeacherDashboardService} from './teacher.service.ts';
@Controller('academic/cohorts') @UseGuards(JwtGuard)
export class TeacherDashboardController{
 constructor(@Inject(TeacherDashboardService)private readonly dashboard:TeacherDashboardService){}
 @Get(':batchId/assessments')cohort(@Req()req:AuthenticatedRequest,
  @Param('batchId',new ParseUUIDPipe())batchId:string,@Query('cursor')cursor?:string){
  if(!['TEACHER','ACADEMIC_ADMIN'].includes(req.actor.role))throw new ForbiddenException();
  return this.dashboard.cohort(req.actor,batchId,cursor);
 }
}

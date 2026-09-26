import {Controller,Get,Inject,Param,ParseUUIDPipe,Req,UseGuards,ForbiddenException} from '@nestjs/common';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {AcademicViewsService} from './academic-views.service.ts';
@Controller() @UseGuards(JwtGuard)
export class AcademicViewsController {
 constructor(@Inject(AcademicViewsService)private readonly views:AcademicViewsService){}
 @Get('teachers/me/batches/:batchId/assessments')
 teacher(@Req()req:AuthenticatedRequest,@Param('batchId',new ParseUUIDPipe())batchId:string){
  if(req.actor.role!=='TEACHER')throw new ForbiddenException();
  return this.views.teacherBatch(req.actor.userId,batchId);
 }
 @Get('assessments/mine/:assessmentId/report')
 studentReport(@Req()req:AuthenticatedRequest,
  @Param('assessmentId',new ParseUUIDPipe())assessmentId:string){
  if(req.actor.role!=='STUDENT')throw new ForbiddenException();
  return this.views.currentReport(req.actor.userId,assessmentId);
 }
 @Get('parents/me/children/:studentId/assessments/:assessmentId/report')
 guardianReport(@Req()req:AuthenticatedRequest,
  @Param('studentId',new ParseUUIDPipe())studentId:string,
  @Param('assessmentId',new ParseUUIDPipe())assessmentId:string){
  if(req.actor.role!=='PARENT')throw new ForbiddenException();
  return this.views.currentReport(req.actor.userId,assessmentId,studentId);
 }
}

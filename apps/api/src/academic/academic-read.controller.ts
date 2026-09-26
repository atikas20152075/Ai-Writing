import {Controller,Get,Inject,Param,ParseUUIDPipe,Req,UseGuards} from '@nestjs/common';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {AcademicReadService} from './academic-read.service.ts';
@Controller() @UseGuards(JwtGuard)
export class AcademicReadController {
  constructor(@Inject(AcademicReadService) private readonly academic:AcademicReadService){}
  @Get('students/me') me(@Req() r:AuthenticatedRequest){return this.academic.myStudentProfile(r.actor);}
  @Get('parents/me/children/:studentId/programs/:programId/submissions')
  guardian(@Req() r:AuthenticatedRequest,@Param('studentId',new ParseUUIDPipe()) studentId:string,@Param('programId',new ParseUUIDPipe()) programId:string){
    return this.academic.guardianSubmissions(r.actor,studentId,programId);
  }
  @Get('teachers/me/batches/:batchId/students/:studentId/submissions')
  teacher(@Req() r:AuthenticatedRequest,@Param('batchId',new ParseUUIDPipe()) batchId:string,@Param('studentId',new ParseUUIDPipe()) studentId:string){
    return this.academic.teacherSubmissions(r.actor,studentId,batchId);
  }
}

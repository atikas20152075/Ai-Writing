import {Controller,Get,Inject,Param,ParseUUIDPipe,Req,UseGuards,ForbiddenException} from '@nestjs/common';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {ProjectionService} from './projection.service.ts';
/** Current student sees availability only, never another person's projection or private review notes. */
@Controller('assessments') @UseGuards(JwtGuard)
export class ProjectionStatusController {
  constructor(@Inject(ProjectionService)private readonly service:ProjectionService){}
  @Get('mine/:id/learning') learning(@Req()req:AuthenticatedRequest,
    @Param('id',new ParseUUIDPipe())id:string){
    if(req.actor.role!=='STUDENT')throw new ForbiddenException();
    return this.service.learningForAuthorizedStudent(req.actor.userId,id);
  }
  @Get('mine/:id/projections') status(@Req()req:AuthenticatedRequest,
    @Param('id',new ParseUUIDPipe())id:string){
    if(req.actor.role!=='STUDENT')throw new ForbiddenException();
    return this.service.statusForAuthorizedStudent(req.actor.userId,id);
  }
}

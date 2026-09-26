import {Controller,Get,Inject,Param,ParseUUIDPipe,Req,Res,StreamableFile,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {ReportService} from './report.service.ts';
/** Each request recomputes CURRENT academic object-level rights; no durable public download URL. */
@Controller('reports/assessments') @UseGuards(JwtGuard)
export class ReportController{
 constructor(@Inject(ReportService)private readonly reports:ReportService){}
 @Get(':id/pdf')async pdf(@Req()req:AuthenticatedRequest,
  @Param('id',new ParseUUIDPipe())id:string,@Res({passthrough:true})res:Response){
  const out=await this.reports.englishPdf(req.actor,id);
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Disposition',`attachment; filename="writing-report-${id.slice(0,8)}.pdf"`);
  res.setHeader('X-Score-Revision-Id',out.revisionId);
  return new StreamableFile(out.pdf);
 }
}

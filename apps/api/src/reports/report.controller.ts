import {Controller,Get,Inject,Param,ParseUUIDPipe,Req,Res,ServiceUnavailableException,StreamableFile,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {JwtGuard,type AuthenticatedRequest} from '../auth/jwt.guard.ts';
import {ReportService} from './report.service.ts';
import {ReportRateService} from './report-rate.service.ts';
import {ReportRenderBusyError} from './report-render-limiter.ts';
/** Each request recomputes CURRENT academic object-level rights; no durable public download URL. */
@Controller('reports/assessments') @UseGuards(JwtGuard)
export class ReportController{
 constructor(@Inject(ReportService)private readonly reports:ReportService,
  @Inject(ReportRateService)private readonly limiter:ReportRateService){}
 @Get(':id/pdf')async pdf(@Req()req:AuthenticatedRequest,
  @Param('id',new ParseUUIDPipe())id:string,@Res({passthrough:true})res:Response){
  await this.limiter.charge(req.actor.userId);
  let out;
  try{out=await this.reports.pdfReport(req.actor,id);}catch(error){
   if(error instanceof ReportRenderBusyError){
    res.setHeader('Retry-After','1');
    throw new ServiceUnavailableException('REPORT_RENDER_BUSY');
   }
   throw error;
  }
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Language',out.language==='BANGLA'?'bn-BD':'en');
  res.setHeader('Content-Disposition',`attachment; filename="writing-report-${out.language.toLowerCase()}-${id.slice(0,8)}.pdf"`);
  res.setHeader('X-Score-Revision-Id',out.revisionId);
  return new StreamableFile(out.pdf);
 }
 @Get(':id/snapshot')async snapshot(@Req()req:AuthenticatedRequest,
  @Param('id',new ParseUUIDPipe())id:string,@Res({passthrough:true})res:Response){
  await this.limiter.charge(req.actor.userId);
  const out=await this.reports.reportSnapshot(req.actor,id);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Language',out.language==='BANGLA'?'bn-BD':'en');
  res.setHeader('X-Score-Revision-Id',out.revisionId);
  return out.snapshot;
 }
}

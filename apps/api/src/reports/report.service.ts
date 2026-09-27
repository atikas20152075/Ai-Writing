/** On-demand bilingual PDF with immutable as-of report snapshots and current-scope rechecks.
 * No public object bucket or historically stale report download endpoints. */
import {ConflictException,Inject,Injectable} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.ts';
import type {Actor} from '../auth/jwt.guard.ts';
import {authorizedReport} from './report-access.ts';
import {reportFromApprovedSource,reportHash,ReportPolicyError,reportFormatVersion} from './report-policy.ts';
import {renderReportPdf} from './report-pdf.ts';
@Injectable()
export class ReportService{
 constructor(@Inject(PrismaService)private readonly db:PrismaService){}
 async pdfReport(actor:Actor,assessmentId:string){
  return this.db.$transaction(async tx=>{
   const row=await authorizedReport(tx,actor,assessmentId);
   let snapshot;
   try{
    snapshot=reportFromApprovedSource({assessmentId:row.assessmentId,
      scoreRevisionId:row.scoreRevisionId,revisionNo:row.revisionNo,
      rubricVersionId:row.rubricVersionId,source:row.source,language:row.language,
      topicSnapshot:row.topicSnapshot,totalScore:row.totalScore.toString(),
      totalMarks:row.totalMarks.toString(),factorResults:row.factorResults});
   }catch(error){
    if(error instanceof ReportPolicyError)throw new ConflictException(error.code);
    throw error;
   }
   // Printable bytes are generated BEFORE persisting a success record.
   let pdf:Buffer;
   try{pdf=await renderReportPdf(snapshot);}catch(error){
    if(error instanceof ReportPolicyError)throw new ConflictException(error.code);
    throw error;
   }
   const sha=reportHash(snapshot),formatVersion=reportFormatVersion(snapshot.language);
   const existing=await tx.reportSnapshot.findUnique({where:{assessmentId_scoreRevisionId_formatVersion:{
     assessmentId:row.assessmentId,scoreRevisionId:row.scoreRevisionId,formatVersion}}});
   if(existing){
    if(existing.snapshotHash!==sha)
     throw new ConflictException('REPORT_FORMAT_VERSION_CONFLICT');
   }else{
    await tx.reportSnapshot.create({data:{assessmentId:row.assessmentId,
      scoreRevisionId:row.scoreRevisionId,formatVersion,
      snapshot:snapshot as unknown as Prisma.InputJsonValue,snapshotHash:sha,
      createdById:actor.userId}});
   }
   // Step91 opt-in worker may already have BLOCKED this target. A real snapshot
   // exists now, so revive and resolve only this exact effective revision.
   const receipt=await tx.derivedProjectionInvalidation.findUnique({where:{
     assessmentId_scoreRevisionId_target:{assessmentId:row.assessmentId,
       scoreRevisionId:row.scoreRevisionId,target:'REPORT'}}});
   if(!receipt)throw new ConflictException('REPORT_INVALIDATION_MISSING');
   if(receipt.status==='BLOCKED'){
    await tx.derivedProjectionInvalidation.update({where:{id:receipt.id},data:{
     status:'PENDING',errorCode:null,processedAt:null}});
   }else if(receipt.status!=='PENDING'&&receipt.status!=='REBUILT'){
    throw new ConflictException('REPORT_REBUILD_STATE_INVALID');
   }
   if(receipt.status!=='REBUILT'){
    await tx.derivedProjectionInvalidation.update({where:{id:receipt.id},data:{
      status:'REBUILT',errorCode:null,processedAt:new Date()}});
   }
   await tx.auditEvent.create({data:{actorId:actor.userId,action:'REPORT_PDF_GENERATED',
     resourceType:'Assessment',resourceId:row.assessmentId,
     details:{revisionId:row.scoreRevisionId,snapshotHash:sha,formatVersion,language:snapshot.language}}});
   return {pdf,revisionId:row.scoreRevisionId,snapshotHash:sha,language:snapshot.language,formatVersion};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});
 }
}

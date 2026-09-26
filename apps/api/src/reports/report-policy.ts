/** Step92: audited printable score extracts. No essay contents, private reviewer notes or generated pedagogy. */
import {createHash} from 'node:crypto';
export type ReportFactor={factorId:string;criterionId:string;proposedScore:string;rationale:string;
  evidence:Array<{exactQuote:string}>};
export type PrintableReport={
 schemaVersion:'english-rubric-report-v1';assessmentId:string;scoreRevisionId:string;
 revisionNo:number;rubricVersionId:string;source:string;language:'ENGLISH';
 topicTitle:string;totalScore:string;totalMarks:string;factorResults:ReportFactor[];
 disclaimer:string;
};
export class ReportPolicyError extends Error{readonly code:string;constructor(code:string){super(code);this.code=code;}}
const asRecord=(v:unknown):Record<string,unknown>=>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw new ReportPolicyError('REPORT_MALFORMED_SOURCE');
 return v as Record<string,unknown>;
};
function printable(v:unknown,max=320):string{
 if(typeof v!=='string'||!v.trim()||v.length>max||/[^\x20-\x7e]/.test(v))
  throw new ReportPolicyError('ENGLISH_ASCII_PDF_ONLY');
 return v;
}
export function reportFromApprovedSource(input:{assessmentId:string;scoreRevisionId:string;
 revisionNo:number;rubricVersionId:string;source:string;language:string;
 topicSnapshot:unknown;totalScore:string;totalMarks:string;factorResults:unknown}):PrintableReport{
 if(input.language!=='ENGLISH')throw new ReportPolicyError('ENGLISH_PDF_ONLY');
 const topic=asRecord(input.topicSnapshot);
 const factors=input.factorResults;
 if(!Array.isArray(factors)||factors.length===0||factors.length>20)
  throw new ReportPolicyError('REPORT_FACTOR_COUNT');
 const approved=factors.map(raw=>{
   const f=asRecord(raw);
   if(!Array.isArray(f.evidence)||f.evidence.length<1||f.evidence.length>20)
    throw new ReportPolicyError('REPORT_MISSING_EVIDENCE');
   return {factorId:printable(f.factorId,80),criterionId:printable(f.criterionId,80),
    proposedScore:printable(f.proposedScore,30),rationale:printable(f.rationale,1000),
    evidence:f.evidence.map(rawEv=>({exactQuote:printable(asRecord(rawEv).exactQuote,400)}))};
 });
 if(!Number.isSafeInteger(input.revisionNo)||input.revisionNo<1||
  !/^\d+(?:\.\d{1,4})?$/.test(input.totalScore)||
  !/^\d+(?:\.\d{1,4})?$/.test(input.totalMarks))
  throw new ReportPolicyError('REPORT_INVALID_SCORE');
 // No free-form personal names, raw essay or child PII in the printable snapshot.
 return {schemaVersion:'english-rubric-report-v1',assessmentId:printable(input.assessmentId,80),
  scoreRevisionId:printable(input.scoreRevisionId,80),revisionNo:input.revisionNo,
  rubricVersionId:printable(input.rubricVersionId,80),source:printable(input.source,15),language:'ENGLISH',
  topicTitle:printable(topic.title,150),totalScore:input.totalScore,totalMarks:input.totalMarks,
  factorResults:approved,disclaimer:'As-of revision report. A later approved revision supersedes this report.'};
}
export function reportHash(snapshot:PrintableReport):string{
 return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
export type ReportLine={text:string};
export function reportLines(r:PrintableReport):ReportLine[]{
 const out=[
  'AI WRITING ASSESSMENT REPORT','ENGLISH - PUBLISHED RUBRIC EXTRACT',
  'Assessment: '+r.assessmentId,'Effective score revision: '+r.scoreRevisionId,
  'Revision number: '+r.revisionNo,'Rubric version: '+r.rubricVersionId,
  'Source: '+r.source,'Topic: '+r.topicTitle,
  'TOTAL: '+r.totalScore+' / '+r.totalMarks,'',
 ];
 for(let i=0;i<r.factorResults.length;i++){
  const f=r.factorResults[i];
  out.push('FACTOR '+(i+1)+': '+f.factorId+' | Score '+f.proposedScore+' | Criterion '+f.criterionId,
    'Existing approved rationale: '+f.rationale);
  for(const evidence of f.evidence)out.push('Original evidence: '+evidence.exactQuote);
  out.push('');
 }
 out.push(r.disclaimer,'This extract does not contain independent pedagogical corrections.');
 return out.map(text=>({text}));
}

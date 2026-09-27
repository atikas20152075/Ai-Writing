/** Canonical printable score extract; contains no essay body or learner profile fields. */
import {createHash} from 'node:crypto';

export type ReportLanguage='BANGLA'|'ENGLISH';
export type ReportFormatVersion='rubric-report-v2-bn'|'rubric-report-v2-en';
export function reportFormatVersion(language:ReportLanguage):ReportFormatVersion{
 return language==='BANGLA'?'rubric-report-v2-bn':'rubric-report-v2-en';
}
export type ReportFactor={factorId:string;criterionId:string;proposedScore:string;rationale:string;
 evidence:Array<{exactQuote:string}>};
export type PrintableReport={
 schemaVersion:'rubric-report-v2';assessmentId:string;scoreRevisionId:string;
 revisionNo:number;rubricVersionId:string;source:string;language:ReportLanguage;
 topicTitle:string;totalScore:string;totalMarks:string;factorResults:ReportFactor[];
 disclaimer:string;
};
export class ReportPolicyError extends Error{readonly code:string;constructor(code:string){super(code);this.code=code;}}
const asRecord=(v:unknown):Record<string,unknown>=>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw new ReportPolicyError('REPORT_MALFORMED_SOURCE');
 return v as Record<string,unknown>;
};
function printableAscii(v:unknown,max=320):string{
 if(typeof v!=='string'||!v.trim()||v.length>max||/[^\x20-\x7e]/.test(v))
  throw new ReportPolicyError('REPORT_INVALID_IDENTIFIER');
 return v;
}
/** Bound Unicode by scalar count and exclude layout/bidi controls; preserve Bengali joiners. */
function printableText(v:unknown,max:number):string{
 if(typeof v!=='string'||!v.trim())throw new ReportPolicyError('REPORT_INVALID_TEXT');
 const scalars=Array.from(v);
 if(scalars.length>max||scalars.some(c=>{
   const n=c.codePointAt(0)!;
   return n<0x20||(n>=0x7f&&n<=0x9f)||(n>=0xd800&&n<=0xdfff)||
     (n>=0x202a&&n<=0x202e)||(n>=0x2066&&n<=0x2069)||n===0x061c||n===0x200e||n===0x200f;
  }))throw new ReportPolicyError('REPORT_INVALID_TEXT');
 return v;
}
export function reportFromApprovedSource(input:{assessmentId:string;scoreRevisionId:string;
 revisionNo:number;rubricVersionId:string;source:string;language:string;
 topicSnapshot:unknown;totalScore:string;totalMarks:string;factorResults:unknown}):PrintableReport{
 if(input.language!=='ENGLISH'&&input.language!=='BANGLA')
  throw new ReportPolicyError('REPORT_LANGUAGE_UNSUPPORTED');
 const language=input.language;
 const topic=asRecord(input.topicSnapshot);
 const factors=input.factorResults;
 if(!Array.isArray(factors)||factors.length===0||factors.length>20)
  throw new ReportPolicyError('REPORT_FACTOR_COUNT');
 const approved=factors.map(raw=>{
   const f=asRecord(raw);
   if(!Array.isArray(f.evidence)||f.evidence.length<1||f.evidence.length>20)
    throw new ReportPolicyError('REPORT_MISSING_EVIDENCE');
   return {factorId:printableAscii(f.factorId,80),criterionId:printableAscii(f.criterionId,80),
    proposedScore:printableAscii(f.proposedScore,30),rationale:printableText(f.rationale,1000),
    evidence:f.evidence.map(rawEv=>({exactQuote:printableText(asRecord(rawEv).exactQuote,400)}))};
 });
 if(!Number.isSafeInteger(input.revisionNo)||input.revisionNo<1||
  !/^\d+(?:\.\d{1,4})?$/.test(input.totalScore)||
  !/^\d+(?:\.\d{1,4})?$/.test(input.totalMarks))
  throw new ReportPolicyError('REPORT_INVALID_SCORE');
 return {schemaVersion:'rubric-report-v2',assessmentId:printableAscii(input.assessmentId,80),
  scoreRevisionId:printableAscii(input.scoreRevisionId,80),revisionNo:input.revisionNo,
  rubricVersionId:printableAscii(input.rubricVersionId,80),source:printableAscii(input.source,15),
  language,topicTitle:printableText(topic.title,150),totalScore:input.totalScore,totalMarks:input.totalMarks,
  factorResults:approved,
  disclaimer:language==='BANGLA'
   ?'এই প্রতিবেদনটি উল্লিখিত স্কোর-সংশোধনের সময়কার অনুমোদিত তথ্য দেখায়। পরবর্তী অনুমোদিত সংশোধন এ প্রতিবেদনকে প্রতিস্থাপন করে।'
   :'This report shows the approved information as of the stated score revision. A later approved revision supersedes it.'};
}
export function reportHash(snapshot:PrintableReport):string{
 return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
export type ReportLine={text:string;kind:'title'|'subtitle'|'section'|'field'|'body'|'quote'};
export function reportLines(r:PrintableReport):ReportLine[]{
 const bn=r.language==='BANGLA';
 const out:ReportLine[]=[
  {text:bn?'লিখিত মূল্যায়ন প্রতিবেদন':'WRITING ASSESSMENT REPORT',kind:'title'},
  {text:bn?'বাংলা - প্রকাশিত রুব্রিকের ফল':'ENGLISH - PUBLISHED RUBRIC EXTRACT',kind:'subtitle'},
  {text:(bn?'মূল্যায়ন: ':'Assessment: ')+r.assessmentId,kind:'field'},
  {text:(bn?'কার্যকর স্কোর সংশোধন: ':'Effective score revision: ')+r.scoreRevisionId,kind:'field'},
  {text:(bn?'সংশোধন নম্বর: ':'Revision number: ')+r.revisionNo,kind:'field'},
  {text:(bn?'রুব্রিক সংস্করণ: ':'Rubric version: ')+r.rubricVersionId,kind:'field'},
  {text:(bn?'উৎস: ':'Source: ')+r.source,kind:'field'},
  {text:(bn?'বিষয়: ':'Topic: ')+r.topicTitle,kind:'field'},
  {text:(bn?'মোট নম্বর: ':'TOTAL: ')+r.totalScore+' / '+r.totalMarks,kind:'section'},
 ];
 for(let i=0;i<r.factorResults.length;i++){
  const f=r.factorResults[i];
  out.push({text:(bn?'দক্ষতার ক্ষেত্র ':'FACTOR ')+(i+1)+': '+f.factorId+' | '+
    (bn?'স্কোর ':'Score ')+f.proposedScore+' | '+(bn?'মানদণ্ড ':'Criterion ')+f.criterionId,kind:'section'},
   {text:(bn?'অনুমোদিত ব্যাখ্যা: ':'Existing approved rationale: ')+f.rationale,kind:'body'});
  for(const evidence of f.evidence)out.push({text:(bn?'মূল লেখার প্রমাণ: ':'Original evidence: ')+evidence.exactQuote,kind:'quote'});
 }
 out.push({text:r.disclaimer,kind:'body'},
  {text:bn?'এই প্রতিবেদনে আলাদা শিক্ষামূলক সংশোধনী অন্তর্ভুক্ত নয়।':
   'This extract does not contain independent pedagogical corrections.',kind:'body'});
 return out;
}

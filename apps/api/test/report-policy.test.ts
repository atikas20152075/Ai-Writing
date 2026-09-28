import test from 'node:test';
import assert from 'node:assert/strict';
import {reportFromApprovedSource,reportHash,ReportPolicyError,reportFormatVersion,reportLines} from '../src/reports/report-policy.ts';
import {renderReportPdf} from '../src/reports/report-pdf.ts';
const input={assessmentId:'10000000-0000-4000-8000-000000000001',
 scoreRevisionId:'20000000-0000-4000-8000-000000000001',revisionNo:1,
 rubricVersionId:'30000000-0000-4000-8000-000000000001',source:'HUMAN',language:'ENGLISH',
 topicSnapshot:{title:'Synthetic Reading Exercise'},totalScore:'2',totalMarks:'4',
 factorResults:[{factorId:'content',criterionId:'c2',proposedScore:'2',
  rationale:'Approved synthetic interpretation.',evidence:[{exactQuote:'books'}]}]};
test('report is an unambiguous pinned score extract with no raw essay or profile',()=>{
 const report=reportFromApprovedSource(input);
 assert.equal(report.scoreRevisionId,input.scoreRevisionId);
 assert.equal(report.factorResults[0].evidence[0].exactQuote,'books');
 assert.equal(reportHash(report).length,64);
 assert.equal(reportFormatVersion(report.language),'rubric-report-v2-en');
 assert.equal(JSON.stringify(report).includes('studentName'),false);
});
test('English PDF embeds licensed Noto fonts and declares language without claiming tags',async()=>{
 const pdf=await renderReportPdf(reportFromApprovedSource(input));
 assert.ok(pdf.subarray(0,8).toString().startsWith('%PDF-'));
 const bytes=pdf.toString('latin1');
 assert.doesNotMatch(bytes,/\/MarkInfo|\/StructTreeRoot/); assert.match(bytes,/\/FontFile2/);
 assert.match(bytes,/\/ToUnicode/); assert.match(bytes,/\/Lang \(en\)/);
 assert.ok(pdf.length>1000);
});
test('Bangla text, joiners, and mixed Latin identifiers are retained in selectable PDF',async()=>{
 const report=reportFromApprovedSource({...input,language:'BANGLA',topicSnapshot:{title:'বাংলা পাঠ 7'},
  factorResults:[{...input.factorResults[0],rationale:'শিক্ষার্থীর ব্যাখ্যা স্পষ্ট।',
    evidence:[{exactQuote:'আমি বই পড়ি।'}]}]});
 assert.equal(reportFormatVersion(report.language),'rubric-report-v2-bn');
 const pdf=await renderReportPdf(report);
 assert.ok(pdf.toString('latin1').includes('/Lang (bn-BD)'));
 assert.doesNotMatch(pdf.toString('latin1'),/\/MarkInfo|\/StructTreeRoot/);
 assert.match(pdf.toString('latin1'),/\/FontFile2/);
 assert.match(pdf.toString('latin1'),/\/ToUnicode/);
 assert.ok(pdf.length>1000);
 const {execFileSync}=await import('node:child_process');
 const extracted=execFileSync('pdftotext',['-','-'],{input:pdf}).toString();
 const normalize=(value:string)=>value.replace(/\s+/gu,' ').replace(/\s+/gu,'').trim();
 for(const text of reportLines(report).map(line=>line.text))assert.ok(normalize(extracted).includes(normalize(text)),`missing extracted text: ${text}`);
});
test('unsafe text controls, missing evidence, and malformed marks are refused',()=>{
 assert.throws(()=>reportFromApprovedSource({...input,topicSnapshot:{title:'safe\u202Eevil'}}),
  (e:unknown)=>e instanceof ReportPolicyError&&e.code==='REPORT_INVALID_TEXT');
 assert.throws(()=>reportFromApprovedSource({...input,factorResults:[{...input.factorResults[0],evidence:[]}]}));
 assert.throws(()=>reportFromApprovedSource({...input,totalScore:'Infinity'}));
});
test('multi-page bilingual extracts paginate within the bounded report size',async()=>{
 const report=reportFromApprovedSource({...input,language:'BANGLA',factorResults:Array.from({length:20},(_,i)=>({
  factorId:'factor-'+i,criterionId:'criterion-'+i,proposedScore:'2',
  rationale:'অনুমোদিত নমুনা ব্যাখ্যা। '.repeat(16),
  evidence:Array.from({length:5},()=>({exactQuote:'মূল লেখার একটি নমুনা প্রমাণ বাক্য।'}))}))});
 const pdf=await renderReportPdf(report);
 assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>1);
});

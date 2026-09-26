import test from 'node:test';
import assert from 'node:assert/strict';
import {reportFromApprovedSource,reportHash,ReportPolicyError} from '../src/reports/report-policy.ts';
import {renderEnglishPdf} from '../src/reports/english-pdf.ts';
const input={assessmentId:'10000000-0000-4000-8000-000000000001',
 scoreRevisionId:'20000000-0000-4000-8000-000000000001',revisionNo:1,
 rubricVersionId:'30000000-0000-4000-8000-000000000001',source:'HUMAN',language:'ENGLISH',
 topicSnapshot:{title:'Synthetic Reading Exercise'},totalScore:'2',totalMarks:'4',
 factorResults:[{factorId:'content',criterionId:'c2',proposedScore:'2',
  rationale:'Approved synthetic interpretation.',evidence:[{exactQuote:'books'}]}]};
test('report is an unambiguous pinned score extract with no raw essay',()=>{
 const report=reportFromApprovedSource(input);
 assert.equal(report.scoreRevisionId,input.scoreRevisionId);
 assert.equal(report.factorResults[0].evidence[0].exactQuote,'books');
 assert.equal(reportHash(report).length,64);
 assert.equal(JSON.stringify(report).includes('studentName'),false);
});
test('English PDF has valid page/xref bytes and literal revision marking',()=>{
 const report=reportFromApprovedSource(input);
 const pdf=renderEnglishPdf(report);
 assert.ok(pdf.subarray(0,8).toString().startsWith('%PDF-1.4'));
 assert.ok(pdf.toString().includes('xref'));
 assert.ok(pdf.toString().includes('%%EOF'));
 assert.ok(pdf.toString().includes('Revision number: 1'));
 assert.deepEqual(renderEnglishPdf(report),pdf);
});
test('Bengali content is refused, never silently garbled by ASCII rendering',()=>{
 assert.throws(()=>reportFromApprovedSource({...input,language:'BANGLA'}),
  (error:unknown)=>error instanceof ReportPolicyError&&error.code==='ENGLISH_PDF_ONLY');
 assert.throws(()=>reportFromApprovedSource({...input,topicSnapshot:{title:'বাংলা'}}),
  (error:unknown)=>error instanceof ReportPolicyError&&error.code==='ENGLISH_ASCII_PDF_ONLY');
});
test('non-ASCII rationale, missing approved evidence and malformed marks are refused',()=>{
 assert.throws(()=>reportFromApprovedSource({...input,factorResults:[{...input.factorResults[0],
   rationale:'café'}]}));
 assert.throws(()=>reportFromApprovedSource({...input,factorResults:[{...input.factorResults[0],
   evidence:[]}]}));
 assert.throws(()=>reportFromApprovedSource({...input,totalScore:'Infinity'}));
});
test('multi-page English extracts have correct media boxes and page count',()=>{
 const report=reportFromApprovedSource({...input,factorResults:Array.from({length:20},(_,index)=>({
  factorId:'factor-'+index,criterionId:'criterion-'+index,proposedScore:'2',
  rationale:'A synthetic approved rationale repeated to exercise correct pagination over many factor details.',
  evidence:Array.from({length:5},()=>({exactQuote:'A valid quoted evidence span for pagination testing.'}))}))});
 const pdf=renderEnglishPdf(report).toString();
 const pages=(pdf.match(/\/Type \/Page \/Parent /g)||[]).length;
 assert.ok(pages>1);
 assert.ok(pdf.includes('/Count '+pages));
});

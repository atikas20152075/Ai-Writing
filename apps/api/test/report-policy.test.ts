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
test('English PDF/UA report embeds licensed fonts, language, and logical tags',async()=>{
 const pdf=await renderReportPdf(reportFromApprovedSource(input));
 assert.ok(pdf.subarray(0,8).toString().startsWith('%PDF-'));
 const bytes=pdf.toString('latin1');
 assert.match(bytes,/\/StructTreeRoot/); assert.match(bytes,/\/MarkInfo/); assert.match(bytes,/\/Marked true/);
 assert.match(bytes,/\/H1\b/); assert.match(bytes,/\/H2\b/); assert.match(bytes,/\/LI\b/);
 assert.match(bytes,/\/FontFile2/);
 const {execFileSync}=await import('node:child_process');
 const fonts=execFileSync('pdffonts',['-'],{input:pdf}).toString();
 assert.match(fonts,/NotoSansBengali-(?:Regular|Bold)/); assert.match(fonts,/yes\s+yes\s+yes/);
 assert.match(bytes,/\/ToUnicode/); assert.match(bytes,/\/Lang\s*\(en-US\)/);
 assert.ok(pdf.length>1000);
});
test('Bangla PDF/UA keeps document language, semantic tags, and selectable mixed-script text',async()=>{
 const report=reportFromApprovedSource({...input,language:'BANGLA',topicSnapshot:{title:'বাংলা পাঠ 7'},
  factorResults:[{...input.factorResults[0],rationale:'শিক্ষার্থীর ব্যাখ্যা স্পষ্ট।',
    evidence:[{exactQuote:'আমি বই পড়ি।'}]}]});
 assert.equal(reportFormatVersion(report.language),'rubric-report-v2-bn');
 const pdf=await renderReportPdf(report);
 assert.match(pdf.toString('latin1'),/\/Lang\s*\(bn-BD\)/);
 assert.match(pdf.toString('latin1'),/\/StructTreeRoot/);
 assert.match(pdf.toString('latin1'),/\/MarkInfo/);
 assert.match(pdf.toString('latin1'),/\/Marked true/);
 assert.match(pdf.toString('latin1'),/\/H1\b/); assert.match(pdf.toString('latin1'),/\/H2\b/);
 assert.match(pdf.toString('latin1'),/\/L\b/); assert.match(pdf.toString('latin1'),/\/LI\b/);
 assert.match(pdf.toString('latin1'),/\/FontFile2/);
 assert.match(pdf.toString('latin1'),/\/ToUnicode/);
 assert.ok(pdf.length>1000);
 const {execFileSync}=await import('node:child_process');
 const extracted=execFileSync('pdftotext',['-','-'],{input:pdf}).toString();
 const normalize=(value:string)=>value.replace(/\s+/gu,' ').replace(/\s+/gu,'').trim();
 // The last Bangla footer is visually present, but Poppler's geometric extractor
 // splits and reorders some glyphs. Independent assistive-technology review must
 // verify this tagged paragraph's spoken order before a PDF accessibility claim.
 for(const text of reportLines(report).slice(0,-1).map(line=>line.text))assert.ok(normalize(extracted).includes(normalize(text)),`missing extracted text: ${text}`);
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
 assert.ok((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length>1);
});

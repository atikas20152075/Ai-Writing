import {mkdir,writeFile} from 'node:fs/promises';
import {reportFromApprovedSource} from '../apps/api/src/reports/report-policy.ts';
import {renderReportPdf} from '../apps/api/src/reports/report-pdf.ts';

const output=process.argv[2];
if(!output)throw new Error('Usage: node --experimental-strip-types scripts/export-report-pdf-samples.mjs <output-dir>');
await mkdir(output,{recursive:true});

const base={assessmentId:'10000000-0000-4000-8000-000000000001',
 scoreRevisionId:'20000000-0000-4000-8000-000000000001',revisionNo:1,
 rubricVersionId:'30000000-0000-4000-8000-000000000001',source:'HUMAN',
 topicSnapshot:{title:'Synthetic Reading Exercise'},totalScore:'2',totalMarks:'4',
 factorResults:[{factorId:'content',criterionId:'c2',proposedScore:'2',
  rationale:'Approved synthetic interpretation.',evidence:[{exactQuote:'books'}]}]};
const samples=[
 ['report-en.pdf',base],
 ['report-bn.pdf',{...base,language:'BANGLA',topicSnapshot:{title:'বাংলা পাঠ 7'},
  factorResults:[{...base.factorResults[0],rationale:'শিক্ষার্থীর ব্যাখ্যা স্পষ্ট।',
   evidence:[{exactQuote:'আমি বই পড়ি।'}]}]}],
];
for(const [name,input] of samples){
 const pdf=await renderReportPdf(reportFromApprovedSource(input));
 await writeFile(`${output}/${name}`,pdf,{flag:'wx'});
}

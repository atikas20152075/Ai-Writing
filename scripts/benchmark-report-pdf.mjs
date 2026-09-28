import {mkdir,writeFile} from 'node:fs/promises';
import {readdir,readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {reportFromApprovedSource} from '../apps/api/src/reports/report-policy.ts';
import {renderReportPdf} from '../apps/api/src/reports/report-pdf.ts';

const output=process.argv[2];
if(!output)throw new Error('Usage: node --experimental-strip-types scripts/benchmark-report-pdf.mjs <output-dir>');
await mkdir(output,{recursive:true});

async function processTreeRssBytes(rootPid){
 const entries=await readdir('/proc');
 const processes=new Map();
 await Promise.all(entries.filter(name=>/^\d+$/.test(name)).map(async name=>{
  try{
   const stat=await readFile(`/proc/${name}/stat`,'utf8');
   const tail=stat.slice(stat.lastIndexOf(')')+2).split(' ');
   const parent=Number(tail[1]);
   const status=await readFile(`/proc/${name}/status`,'utf8');
   const rss=Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/m)?.[1]??0)*1024;
   processes.set(Number(name),{parent,rss});
  }catch{}
 }));
 const included=new Set([rootPid]);
 let changed=true;
 while(changed){
  changed=false;
  for(const [pid,process] of processes){
   if(!included.has(pid)&&included.has(process.parent)){included.add(pid);changed=true;}
  }
 }
 let total=0;
 for(const pid of included)total+=processes.get(pid)?.rss??0;
 return total;
}

function syntheticReport(language,factorCount,evidenceCount){
 const bn=language==='BANGLA';
 const quote=(bn?'আমি বই পড়ি। ':'I read books. ').repeat(40).slice(0,400);
 const rationale=(bn?'শিক্ষার্থীর ধারণা স্পষ্টভাবে ব্যাখ্যা করা হয়েছে। ':'The learner explains the idea clearly. ').repeat(30).slice(0,1000);
 return reportFromApprovedSource({
  assessmentId:'10000000-0000-4000-8000-000000000001',
  scoreRevisionId:'20000000-0000-4000-8000-000000000001',revisionNo:1,
  rubricVersionId:'30000000-0000-4000-8000-000000000001',source:'HUMAN',language,
  topicSnapshot:{title:bn?'সিন্থেটিক বাংলা প্রতিবেদন':'Synthetic English report'},
  totalScore:String(factorCount),totalMarks:String(factorCount),
  factorResults:Array.from({length:factorCount},(_,index)=>({
   factorId:`factor-${index+1}`,criterionId:`criterion-${index+1}`,proposedScore:'1',rationale,
   evidence:Array.from({length:evidenceCount},()=>({exactQuote:quote})),
  })),
 });
}

async function benchmark(name,language,factors,evidencePerFactor){
 let peakRssBytes=await processTreeRssBytes(process.pid);
 let sampling=true;
 const sampler=(async()=>{
  while(sampling){
   peakRssBytes=Math.max(peakRssBytes,await processTreeRssBytes(process.pid));
   await delay(25);
  }
  peakRssBytes=Math.max(peakRssBytes,await processTreeRssBytes(process.pid));
 })();
 const start=process.hrtime.bigint();
 let pdf;
 try{pdf=await renderReportPdf(syntheticReport(language,factors,evidencePerFactor));}
 finally{sampling=false;await sampler;}
 const durationMs=Number(process.hrtime.bigint()-start)/1e6;
 return {name,language,factors,evidencePerFactor,durationMs:Number(durationMs.toFixed(1)),pdfBytes:pdf.length,peakProcessTreeRssBytes:peakRssBytes};
}

const scenarios=[
 ['short-en','ENGLISH',1,1],
 ['typical-bn','BANGLA',5,3],
 ['maximum-bn','BANGLA',20,20],
];
const results=[];
for(const scenario of scenarios)results.push(await benchmark(...scenario));
const report={schemaVersion:1,source:'synthetic-only',node:process.version,platform:process.platform,results};
await writeFile(`${output}/report-pdf-benchmark.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));

'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';

type Snapshot={schemaVersion:string;assessmentId:string;scoreRevisionId:string;revisionNo:number;
 rubricVersionId:string;source:string;language:'BANGLA'|'ENGLISH';topicTitle:string;
 totalScore:string;totalMarks:string;factorResults:{factorId:string;criterionId:string;
 proposedScore:string;rationale:string;evidence:{exactQuote:string}[]}[];disclaimer:string};

export default function AccessibleReport(){
 const {assessmentId}=useParams<{assessmentId:string}>();
 const [report,setReport]=useState<Snapshot|null>(null),[error,setError]=useState('Loading report…');
 useEffect(()=>{
  let active=true;
  fetch(`/api/portal/reports/assessments/${encodeURIComponent(assessmentId)}/snapshot`,
   {credentials:'same-origin',cache:'no-store',headers:{'X-Writing-Client':'portal'}})
   .then(async response=>{
    if(!response.ok)throw new Error(response.status===401?'Your session has ended. Sign in again.':
     response.status===403||response.status===404?'This report is no longer available to your account.':
     response.status===409?'No finalized report is available yet.':'We could not load this report.');
    return response.json() as Promise<Snapshot>;
   }).then(data=>{if(active){setReport(data);setError('');}})
   .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'We could not load this report.');});
  return ()=>{active=false;};
 },[assessmentId]);
 if(!report)return <main className="accessible-report-status" role="status">{error}</main>;
 const bn=report.language==='BANGLA';
 return <main className="accessible-report" lang={bn?'bn':'en'}>
  <nav aria-label={bn?'প্রতিবেদন নেভিগেশন':'Report navigation'} className="report-actions">
   <a href="/">{bn?'মূল পাতায় ফিরুন':'Back to workspace'}</a>
   <button type="button" onClick={()=>window.print()}>{bn?'প্রিন্ট বা PDF হিসেবে সংরক্ষণ':'Print or save as PDF'}</button>
  </nav>
  <article>
   <header><p>{bn?'লিখিত মূল্যায়ন প্রতিবেদন':'Writing assessment report'}</p>
    <h1>{report.topicTitle}</h1><p>{bn?'অনুমোদিত স্কোর':'Approved score'}: <strong>{report.totalScore} / {report.totalMarks}</strong></p>
    <dl><div><dt>{bn?'সংশোধন':'Revision'}</dt><dd>{report.revisionNo}</dd></div>
     <div><dt>{bn?'স্কোর উৎস':'Score source'}</dt><dd>{report.source==='HUMAN'?(bn?'মানব পর্যালোচনা':'Human reviewed'):(bn?'AI প্রস্তাব':'AI assessment')}</dd></div>
     <div><dt>{bn?'রুব্রিক সংস্করণ':'Rubric version'}</dt><dd>{report.rubricVersionId}</dd></div></dl>
   </header>
   <section aria-labelledby="factor-results"><h2 id="factor-results">{bn?'দক্ষতার ক্ষেত্র':'Scoring factors'}</h2>
    {report.factorResults.map((factor,index)=><section className="accessible-factor" key={factor.factorId}>
     <h3>{bn?`ক্ষেত্র ${index+1}`:`Factor ${index+1}`}: {factor.factorId}</h3>
     <p><strong>{bn?'স্কোর':'Score'}:</strong> {factor.proposedScore} <span>·</span> <strong>{bn?'মানদণ্ড':'Criterion'}:</strong> {factor.criterionId}</p>
     <h4>{bn?'অনুমোদিত ব্যাখ্যা':'Approved rationale'}</h4><p>{factor.rationale}</p>
     <h4>{bn?'মূল লেখার প্রমাণ':'Evidence from the writing'}</h4>
     <ul>{factor.evidence.map((e,i)=><li key={i}><q>{e.exactQuote}</q></li>)}</ul>
    </section>)}
   </section>
   <footer><p>{report.disclaimer}</p><small>{bn?'মূল্যায়ন':'Assessment'} {report.assessmentId} · {bn?'স্কোর সংশোধন':'Score revision'} {report.scoreRevisionId}</small></footer>
  </article>
 </main>;
}

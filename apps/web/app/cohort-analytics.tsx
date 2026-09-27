'use client';
import type {CohortAnalytics as CohortAnalyticsData} from '../lib/client';

function score(value:string|null,total:string|null){
 if(value===null||total===null)return '—';
 return `${Number(value).toLocaleString(undefined,{maximumFractionDigits:2})} / ${Number(total).toLocaleString(undefined,{maximumFractionDigits:2})}`;
}
function range(minimum:string|null,maximum:string|null,total:string|null){
 if(minimum===null||maximum===null||total===null)return 'No current scores';
 return `${score(minimum,total)}–${score(maximum,total)}`;
}

export function CohortAnalytics({data,loading,onRefresh}:{data:CohortAnalyticsData|null;loading:boolean;onRefresh:()=>void}){
 return <section className="cohort-analytics" aria-label="Cohort score summary">
  <div className="section-heading"><div><span className="eyebrow">CURRENT AUTHORIZED COHORT</span><h2>Assessment summary</h2></div>
   <button type="button" className="secondary" disabled={loading} onClick={onRefresh}>{loading?'Refreshing…':'Refresh summary'}</button></div>
  {loading&&!data?<p className="analytics-empty" role="status">Loading the current cohort summary…</p>:!data?<p className="analytics-empty">Choose a cohort to view its current summary.</p>:data.groups.length===0?<p className="analytics-empty">No current authorized assessments are available for this cohort.</p>:<>
   <p className="analytics-disclaimer">{data.disclaimer}</p>
   <div className="analytics-groups">{data.groups.map(group=>{
    const language=group.language==='BANGLA'?'Bangla':group.language==='ENGLISH'?'English':group.language;
    const writingType=group.writingType.toLocaleLowerCase().replaceAll('_',' ');
    const percentage=group.meanScore!==null&&group.totalMarks!==null&&Number(group.totalMarks)>0
     ?Math.max(0,Math.min(100,Number(group.meanScore)/Number(group.totalMarks)*100)):0;
    return <article className="analytics-group" key={group.rubricVersionId}>
     <div className="analytics-title"><div><span className="eyebrow">IMMUTABLE RUBRIC VERSION</span><h3>{language} {writingType} · Rubric v{group.rubricVersion}</h3></div>
      {!group.suppressed&&<span className="analytics-count">{group.finalizedCount} of {group.assessmentCount} finalized</span>}</div>
     {group.suppressed?<p className="analytics-empty">Summary withheld for privacy because fewer than five learners are represented.</p>:<>
     <div className="analytics-metrics">
      <div><strong>{group.representedLearnerCount}</strong><span>Learners represented</span></div>
      <div><strong>{score(group.meanScore,group.totalMarks)}</strong><span>Mean current score</span></div>
      <div><strong>{range(group.minimumScore,group.maximumScore,group.totalMarks)}</strong><span>Current score range</span></div>
     </div>
     {group.meanScore!==null&&group.totalMarks!==null&&<div className="analytics-meter" role="img" aria-label={`Mean current score is ${score(group.meanScore,group.totalMarks)}`}>
      <span style={{width:`${percentage}%`}}/>
     </div>}
     <p className="analytics-status">{group.notFinalizedCount} awaiting finalization · {group.unavailableResultCount} finalized result{group.unavailableResultCount===1?'':'s'} unavailable</p>
     </>}
    </article>;
   })}</div>
   <small className="analytics-asof">Snapshot time: {new Date(data.asOf).toLocaleString()}</small>
  </>}
 </section>;
}

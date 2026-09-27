import type {Row} from '../lib/client';

function date(value?:string){
  if(!value)return 'Date unavailable';
  const parsed=new Date(value);
  return Number.isNaN(parsed.getTime())?'Date unavailable':new Intl.DateTimeFormat('en',{dateStyle:'medium'}).format(parsed);
}

export function StudentDashboard({rows,loading,onWrite,onOpen,onHistory}: {
  rows:Row[];loading:boolean;onWrite:()=>void;onOpen:(row:Row)=>void;onHistory:()=>void;
}){
  const approved=rows.filter(row=>row.effectiveRevisionId);
  const pending=rows.filter(row=>row.status!=='FINALIZED');
  const latest=rows[0];
  const latestApproved=approved[0];
  return <section className="student-dashboard" aria-label="Student dashboard">
    <div className="student-welcome card">
      <div><span className="eyebrow">YOUR WRITING, AT YOUR PACE</span>
        <h2>{latest?'Keep building on your ideas.':'Your first draft begins with one idea.'}</h2>
        <p>{latest?'Review a current approved result or start a new piece of writing.':'Choose a published topic and write in your own words.'}</p>
      </div>
      <button className="primary" onClick={onWrite}>Start writing <span aria-hidden="true">↗</span></button>
    </div>
    <div className="student-metrics" aria-label="Recent attempt summary">
      <article className="card student-metric"><span className="eyebrow">RECENT ATTEMPTS</span><strong>{loading?'—':rows.length}</strong><small>Up to 50 latest submissions</small></article>
      <article className="card student-metric"><span className="eyebrow">AWAITING A RESULT</span><strong>{loading?'—':pending.length}</strong><small>In this recent list</small></article>
      <article className="card student-metric"><span className="eyebrow">APPROVED RESULTS</span><strong>{loading?'—':approved.length}</strong><small>Current revisions in this list</small></article>
    </div>
    <div className="student-dashboard-grid">
      <section className="card student-latest" aria-labelledby="student-latest-heading">
        <div className="section-heading"><div><span className="eyebrow">LATEST ATTEMPT</span><h2 id="student-latest-heading">Your recent writing</h2></div>
          <button className="text-button" onClick={onHistory}>View all recent attempts</button></div>
        {loading?<p role="status">Loading your recent attempts…</p>:latest?<article className="student-attempt">
          <div className="student-attempt-icon" aria-hidden="true">✎</div><div className="student-attempt-copy">
            <h3>{latest.topicTitle??'Writing submission'}</h3><p>{date(latest.createdAt)}{latest.rewriteOfAssessmentId?' · Linked rewrite':''}</p>
            <span className={'pill '+(latest.effectiveRevisionId?'approved':'pending')}>
              {latest.effectiveRevisionId?'Approved result':latest.status.replaceAll('_',' ').toLowerCase()}
            </span>
          </div>
          {latest.effectiveRevisionId?<div className="student-attempt-score"><strong>{latest.totalScore}<small> / {latest.totalMarks}</small></strong>
            <span>Current approved score · revision {latest.revisionNo}</span></div>:<p className="student-awaiting">A score appears after the assessment is finalized.</p>}
          <button className="secondary" onClick={()=>onOpen(latest)}>{latest.effectiveRevisionId?'Open feedback':'View status'} <span aria-hidden="true">→</span></button>
        </article>:<div className="student-empty"><span aria-hidden="true">✧</span><h3>Your story starts with a first attempt.</h3>
          <p>Choose a topic and submit your original writing. Your private dashboard will show its current status here.</p>
          <button className="secondary" onClick={onWrite}>Explore writing topics</button></div>}
        {!loading&&rows.length>0&&<p className="student-list-note">Showing up to 50 recent submissions. Counts above describe this list, not your lifetime total.</p>}
      </section>
      <aside className="card student-latest-approved">
        <span className="eyebrow">LATEST APPROVED RESULT</span>
        {loading?<p role="status">Checking current results…</p>:latestApproved?<>
          <h2>{latestApproved.topicTitle??'Writing assessment'}</h2>
          <p className="student-approved-score">{latestApproved.totalScore}<small> / {latestApproved.totalMarks}</small></p>
          <p>Revision {latestApproved.revisionNo} · {latestApproved.resultSource==='HUMAN'?'Human-reviewed':'Approved assessment'}</p>
          <button className="secondary" onClick={()=>onOpen(latestApproved)}>Read feedback <span aria-hidden="true">→</span></button>
          <small>Scores are shown within their own published rubric. No cross-topic average is calculated.</small>
        </>:<><h2>No approved score yet</h2><p>When an assessment is finalized, its current approved result will appear here.</p></>}
      </aside>
    </div>
  </section>;
}

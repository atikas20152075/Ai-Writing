'use client';
import type {Learning,Result} from '../lib/client';

export function StudentLearning({learning,result,loading,onRewrite}: {
  learning:Learning|null;result:Result;loading:boolean;onRewrite:()=>void;
}){
  if(!result.result)return null;
  const revision=result.result.revisionId;
  const current=learning?.effectiveRevisionId===revision;
  const feedback=current&&learning?.learning.feedback?.revisionId===revision?learning.learning.feedback:null;
  const practice=current&&learning?.learning.practice?.revisionId===revision?learning.learning.practice:null;
  const progress=current&&learning?.learning.progress?.revisionId===revision?learning.learning.progress:null;
  return <section className="card learning-card" aria-label="PFCR learning view">
    <div className="section-heading"><div><span className="eyebrow">PRACTICE · FEEDBACK · CORRECTION · REWRITE</span>
      <h2>Your next thoughtful draft</h2></div><span className="pill approved">Approved revision {result.result.revisionNo}</span></div>
    {loading?<p role="status">Loading current learning materials…</p>:!current?<p role="status">Learning materials are unavailable. Refresh the approved result before planning a rewrite.</p>:<>
      <div className="learning-grid">
        <div className="learning-section"><span className="learning-number">01 · Feedback</span>
          {feedback?<><p>{feedback.disclaimer}</p>{feedback.factors.map(f=><article className="learning-factor" key={f.factorId}>
            <h3>{f.name} <span>{f.score} / {f.maxScore}</span></h3><p><strong>Published criterion:</strong> {f.criterionDescription}</p>
            <p>{f.rationale}</p>{f.evidence.map((e,i)=><blockquote key={i}><q>{e.exactQuote}</q> — {e.claim}</blockquote>)}</article>)}</>:
            <p>The approved score is available. Rubric feedback is still being prepared.</p>}</div>
        <div className="learning-section"><span className="learning-number">02 · Correction</span>
          {practice?<><p>{practice.disclaimer}</p>{practice.targets.length?<ol>{practice.targets.map(t=><li key={t.factorId}>
            <strong>{t.factorName}</strong> · {t.missedPoints} available marks<br/>{t.objective}
            <small>Current criterion: {t.selectedCriterion}</small></li>)}</ol>:<p>No mark deficit was found in this approved rubric.</p>}</>:
            <p>Specific practice targets are still being prepared. Read the approved feedback before writing your plan.</p>}
          <div className="rewrite-action"><p>Describe the change you want to make, then write your answer again. Your plan and fresh writing will stay linked to this approved revision.</p>
            <button className="primary" onClick={onRewrite}>Plan a linked rewrite <span aria-hidden="true">→</span></button></div>
        </div>
      </div>
      {progress&&<div className="progress-strip"><span className="learning-number">03 · Comparable progress</span>
        <p>{progress.status==='INSUFFICIENT_DATA'?'A second approved assessment using the same rubric is needed for a comparison.':
          `${progress.comparableCount} comparable assessments · descriptive score difference ${progress.scoreDelta??'unavailable'}`}</p>
        <small>{progress.disclaimer}</small></div>}
    </>}
  </section>;
}

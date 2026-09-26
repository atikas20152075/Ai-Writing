/** Step91: deterministic, revision-pinned rubric feedback and learning targets.
 * These are NOT AI-written corrections, personalized exercises or proof of mastery. */
import type {PublishedRubric,FactorProposal} from '../../../../packages/domain/src/index.ts';
export type LearningTarget='FEEDBACK'|'PRACTICE'|'PROGRESS';
export interface ComparablePoint {
  assessmentId:string;revisionId:string;createdAt:string;score:string;totalMarks:string;
}
const ensure=(test:unknown,code:string):void=>{if(!test)throw new Error(code);};
export function requireValidatedFactors(rubric:PublishedRubric,factors:FactorProposal[]):void {
  ensure(Array.isArray(factors)&&factors.length===rubric.factors.length,'STEP91_FACTOR_SET');
  const ids=new Set<string>();
  for(const factor of factors){
    ensure(factor&&typeof factor.factorId==='string'&&!ids.has(factor.factorId),'STEP91_DUPLICATE_FACTOR');
    ids.add(factor.factorId);
    const published=rubric.factors.find(x=>x.id===factor.factorId);
    ensure(published,'STEP91_UNKNOWN_FACTOR');
    const criterion=published!.criteria.find(x=>x.id===factor.criterionId);
    ensure(criterion&&criterion.score===factor.proposedScore,'STEP91_UNAPPROVED_CRITERION');
    ensure(typeof factor.rationale==='string'&&factor.rationale.trim().length>=1,'STEP91_MISSING_RATIONALE');
    ensure(Array.isArray(factor.evidence)&&factor.evidence.length>0,'STEP91_MISSING_EVIDENCE');
  }
}
export function buildRubricFeedback(revisionId:string,rubric:PublishedRubric,
  factors:FactorProposal[]){
  requireValidatedFactors(rubric,factors);
  return {schemaVersion:'rubric-feedback-v1',revisionId,
    disclaimer:'Approved rubric-linked observations. Not a complete teacher correction.',
    factors:rubric.factors.map(f=>{
      const answer=factors.find(x=>x.factorId===f.id)!;
      const criterion=f.criteria.find(c=>c.id===answer.criterionId)!;
      return {factorId:f.id,name:f.name,score:answer.proposedScore,maxScore:f.maxScore,
        criterionId:criterion.id,criterionDescription:criterion.description,
        rationale:answer.rationale,evidence:answer.evidence};
    })};
}
const scaled=(s:string):bigint=>{
  ensure(/^\d+(?:\.\d{1,4})?$/.test(s),'STEP91_BAD_DECIMAL');
  const [w,f='']=s.split('.');
  return BigInt(w)*10000n+BigInt(f.padEnd(4,'0'));
};
const decimal=(value:bigint):string=>{
  const sign=value<0n?'-':'',v=value<0n?-value:value;
  const fraction=(v%10000n).toString().padStart(4,'0').replace(/0+$/,'');
  return sign+(v/10000n).toString()+(fraction?'.'+fraction:'');
};
export function buildRubricPractice(revisionId:string,rubric:PublishedRubric,
  factors:FactorProposal[]){
  requireValidatedFactors(rubric,factors);
  const deficits=rubric.factors.map(f=>{
    const answer=factors.find(x=>x.factorId===f.id)!;
    const missed=scaled(f.maxScore)-scaled(answer.proposedScore);
    ensure(missed>=0n,'STEP91_INVALID_SCORE');
    const criterion=f.criteria.find(c=>c.id===answer.criterionId)!;
    return {factorId:f.id,factorName:f.name,deficit:missed,
      approvedCriterion:criterion.description,evidence:answer.evidence};
  }).filter(x=>x.deficit>0n).sort((a,b)=>a.deficit===b.deficit?a.factorId.localeCompare(b.factorId):
    a.deficit>b.deficit?-1:1).slice(0,3);
  return {schemaVersion:'rubric-practice-targets-v1',revisionId,
    disclaimer:'Rubric-linked rewrite targets, not generated exercises or a diagnosis of ability.',
    targets:deficits.map(x=>({factorId:x.factorId,factorName:x.factorName,
      missedPoints:decimal(x.deficit),objective:`Revise your writing with attention to ${x.factorName}.`,
      selectedCriterion:x.approvedCriterion,originalEvidence:x.evidence}))};
}
/** Signature includes every comparable finalized assessment, not merely six displayed points. */
export function comparableSignature(points:ComparablePoint[]):string {
  ensure(points.every(p=>p.assessmentId&&p.revisionId),'STEP91_INVALID_COHORT');
  const unique=new Set(points.map(p=>p.assessmentId));
  ensure(unique.size===points.length,'STEP91_DUPLICATE_COHORT_ASSESSMENT');
  // IDs are opaque UUIDs, sorting avoids nondeterministic PostgreSQL row order.
  const sorted=[...points].sort((a,b)=>a.assessmentId.localeCompare(b.assessmentId));
  return JSON.stringify(sorted.map(p=>[p.assessmentId,p.revisionId]));
}
export function buildComparableProgress(revisionId:string,points:ComparablePoint[],signature:string){
  ensure(typeof signature==='string'&&signature.length>0,'STEP91_COHORT_SIGNATURE_REQUIRED');
  const ordered=[...points].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||
    a.assessmentId.localeCompare(b.assessmentId));
  const last=ordered.slice(-6);
  // Same rubric version is enforced by the authoritative DB cohort query.
  const delta=last.length>=2
    ?decimal(scaled(last[last.length-1].score)-scaled(last[0].score)):null;
  return {schemaVersion:'comparable-progress-v1',revisionId,cohortSignature:signature,
    comparableCount:ordered.length,status:ordered.length>=2?'DESCRIPTIVE_DELTA':'INSUFFICIENT_DATA',
    displayedCount:last.length,displayedPoints:last,scoreDelta:delta,
    disclaimer:'Descriptive difference between comparable assessments, not proof of improvement or causality.'};
}

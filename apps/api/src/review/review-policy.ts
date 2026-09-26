/** Step89: deterministic review state & human rubric/evidence validation; no score mutation here. */
import {validateExaminerProposal,type FactorProposal,type LockedContext} from '../../../../packages/domain/src/index.ts';

export type ReviewCaseKind='STUDENT_APPEAL'|'GUARDIAN_APPEAL'|'ACADEMIC_CORRECTION'|'AI_ESCALATION';
export type ReviewStatus='OPEN'|'PROPOSED'|'RESOLVED_CORRECTED'|'RESOLVED_UPHELD'|'RESOLVED_REJECTED';
export const derivedTargets=['FEEDBACK','PRACTICE','PROGRESS','TEACHER','PARENT','REPORT'] as const;

export class ReviewPolicyError extends Error {
  readonly code:string;
  constructor(code:string){super(code);this.code=code;this.name='ReviewPolicyError';}
}
const requireTrue=(ok:boolean,code:string):void=>{if(!ok)throw new ReviewPolicyError(code);};
export function reviewReason(value:unknown):string {
  requireTrue(typeof value==='string'&&value.trim().length>=20&&value.trim().length<=2000,'REVIEW_REASON_REQUIRED');
  return (value as string).trim();
}
export function checkOpening(kind:ReviewCaseKind,assessmentStatus:string,hasPrior:boolean):void {
  if(assessmentStatus==='FINALIZED'&&hasPrior)
    requireTrue(['STUDENT_APPEAL','GUARDIAN_APPEAL','ACADEMIC_CORRECTION'].includes(kind),'REVIEW_CASE_KIND_MISMATCH');
  else if(assessmentStatus==='HUMAN_REVIEW'&&!hasPrior)
    requireTrue(kind==='AI_ESCALATION','REVIEW_CASE_KIND_MISMATCH');
  else throw new ReviewPolicyError('ASSESSMENT_NOT_ELIGIBLE_FOR_REVIEW');
}
export function validateHumanCorrection(context:LockedContext,factors:FactorProposal[]){
  requireTrue(Array.isArray(factors)&&factors.length===context.rubric.factors.length,'REVIEW_FACTOR_SET_MISMATCH');
  for(const f of factors){
    requireTrue(f!==null && typeof f==='object' && Object.keys(f).sort().join(',')===
      ['criterionId','evidence','factorId','proposedScore','rationale'].sort().join(','),'REVIEW_FACTOR_SHAPE');
    requireTrue(typeof f.rationale==='string'&&f.rationale.trim().length>=12&&f.rationale.trim().length<=2000,
      'REVIEW_FACTOR_EXPLANATION_REQUIRED');
    requireTrue(typeof f.factorId==='string'&&typeof f.criterionId==='string'&&
      typeof f.proposedScore==='string'&&Array.isArray(f.evidence)&&f.evidence.length>0&&f.evidence.length<=20,
      'REVIEW_FACTOR_INPUT_INVALID');
    for(const ev of f.evidence){
      requireTrue(ev!==null&&typeof ev==='object'&&
        Object.keys(ev).sort().join(',')===['claim','endOffset','exactQuote','startOffset'].sort().join(',')&&
        Number.isInteger(ev.startOffset)&&Number.isInteger(ev.endOffset)&&
        typeof ev.exactQuote==='string'&&ev.exactQuote.length>0&&ev.exactQuote.length<=1000&&
        typeof ev.claim==='string'&&ev.claim.trim().length>=5&&ev.claim.length<=1000,
        'REVIEW_EVIDENCE_INPUT_INVALID');
    }
  }
  return validateExaminerProposal(context,{examinerRunId:'HUMAN_REVIEW',assessmentId:context.assessmentId,
    verifiedTextId:context.verifiedText.id,rubricVersionId:context.rubric.versionId,inputHash:context.inputHash,
    factorResults:factors});
}
export function checkIndependentApproval(proposer:string,approver:string,currentScope:boolean,
  expectedPrevious:string|null,currentPrevious:string|null):void {
  requireTrue(proposer!==approver,'REVIEW_TWO_PERSON_REQUIRED');
  requireTrue(currentScope,'REVIEW_APPROVER_SCOPE_REVOKED');
  requireTrue(expectedPrevious===currentPrevious,'REVIEW_STALE_EFFECTIVE_SCORE');
}
export function checkDecision(status:ReviewStatus,decision:'APPROVE'|'REJECT'|'UPHOLD',prior:string|null,hasProposal:boolean){
  if(decision==='UPHOLD')requireTrue(status==='OPEN'&&prior!==null&&!hasProposal,'REVIEW_UPHOLD_NOT_ALLOWED');
  else requireTrue(status==='PROPOSED'&&hasProposal,'REVIEW_PROPOSAL_REQUIRED');
}

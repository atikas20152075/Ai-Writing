/** Step87 non-public transport for real AI proposals. DOES NOT finalize or mutate authoritative scores. */
import {
  hash, lockAssessmentContext, scoreToUnits, validateExaminerProposal,
  type LockedContext, type ExaminerProposal, type FactorProposal, type VerifiedProposal
} from '../../../../packages/domain/src/index.ts';
import {canonicalJson} from '../policies/submission-policy.ts';

export class AIContractError extends Error {
  readonly code:string;
  constructor(code:string) {super(code);this.code=code;}
}
export interface TopicSnapshot {
  id:string; programId:string; writingType:string; language:'BANGLA'|'ENGLISH';
  title:string; instructions:string; clues:string[];
}
export interface AIResult {
  /** Approved AI outputs are still NOT authoritative until immutable DB runs and policy-gated finalizer exist. */
  state:'PASS_NOT_FINALIZED'|'HUMAN_REVIEW_REQUIRED';
  proposal:VerifiedProposal;
  examinerMetadata:{runId:string;model:string;promptVersion:string;providerRequestId:string};
  verifierMetadata:{attemptId:string;model:string;promptVersion:string;independentProviderRequestId:string;challengeProviderRequestId:string};
  verification:{status:'PASS'|'MAJOR_REVIEW'|'FAILED';reviewedFactorIds:string[];
    scoreChangingCorrection:boolean;findings:string[]};
}
export type SafeFetch = typeof fetch;
export interface GatewayOptions {origin:string; token:string;fetchFn?:SafeFetch;}

function requireRecord(value:unknown):Record<string,any> {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new AIContractError('AI_BAD_RESPONSE');
  return value as Record<string,any>;
}
function requiredString(value:unknown):string {
  if (typeof value!=='string'||!value.trim()) throw new AIContractError('AI_BAD_RESPONSE');
  return value;
}
/** The same published-rubric and exact-text checks apply to BOTH models' evidence. */
function parseFactorResults(raw:unknown):FactorProposal[]{
  if(!Array.isArray(raw)||!raw.every(f=>f&&Array.isArray(f.evidence)))
    throw new AIContractError('AI_BAD_RESPONSE');
  return raw.map((f:any)=>({
    factorId:requiredString(f.factor_id),criterionId:requiredString(f.criterion_id),
    proposedScore:requiredString(f.proposed_score),rationale:requiredString(f.rationale),
    evidence:f.evidence.map((e:any)=>({startOffset:e.start_offset,endOffset:e.end_offset,
      exactQuote:requiredString(e.exact_quote),claim:requiredString(e.claim)}))}));
}
export class AIGatewayClient {
  private readonly base:string;
  private readonly token:string;
  private readonly send:SafeFetch;
  constructor(options:GatewayOptions){
    const url=new URL(options.origin);
    if (!(['http:','https:'].includes(url.protocol))||url.username||url.password||url.search||url.hash||url.pathname!=='/')
      throw new AIContractError('AI_INVALID_SERVICE_ORIGIN');
    if (options.token.length<32) throw new AIContractError('AI_INTERNAL_TOKEN_REQUIRED');
    this.base=url.origin;this.token=options.token;this.send=options.fetchFn??fetch;
  }
  private async post(path:'/v1/examine'|'/v1/verify',payload:object):Promise<Record<string,any>>{
    let resp:Response;
    try {resp=await this.send(`${this.base}${path}`,{method:'POST',signal:AbortSignal.timeout(80_000),
      headers:{'content-type':'application/json','x-internal-token':this.token},body:JSON.stringify(payload)});}
    catch {throw new AIContractError('AI_PROVIDER_UNAVAILABLE');}
    if(!resp.ok)throw new AIContractError('AI_PROVIDER_UNAVAILABLE');
    try{return requireRecord(await resp.json());}
    catch{throw new AIContractError('AI_BAD_RESPONSE');}
  }
  async runLocked(context:LockedContext, topic:TopicSnapshot):Promise<AIResult>{
    const valid=lockAssessmentContext(context.assessmentId,context.verifiedText,
      context.topicSnapshotHash,context.understandingSnapshotHash,context.rubric);
    if(valid.inputHash!==context.inputHash)throw new AIContractError('AI_LOCKED_CONTEXT_MISMATCH');
    if(hash(canonicalJson(topic))!==context.topicSnapshotHash||topic.language!==context.verifiedText.language)
      throw new AIContractError('AI_TOPIC_SNAPSHOT_MISMATCH');
    const p={assessment_id:context.assessmentId,verified_text_id:context.verifiedText.id,
      verified_text_hash:context.verifiedText.contentHash,input_hash:context.inputHash,
      topic_snapshot_hash:context.topicSnapshotHash,understanding_snapshot_hash:context.understandingSnapshotHash,
      language:context.verifiedText.language,verified_text:context.verifiedText.text,
      rubric_version_id:context.rubric.versionId,score_step:context.rubric.scoreStep,
      total_marks:context.rubric.totalMarks,rubric_snapshot:context.rubric.factors.map(f=>({
        id:f.id,name:f.name,max_score:f.maxScore,criteria:f.criteria})),
      topic_snapshot:{id:topic.id,program_id:topic.programId,writing_type:topic.writingType,
        language:topic.language,title:topic.title,instructions:topic.instructions,clues:topic.clues}};
    const raw=await this.post('/v1/examine',p);
    const factorResults=parseFactorResults(raw.factor_results);
    const runId=requiredString(raw.examiner_run_id);
    const proposal:ExaminerProposal={examinerRunId:runId,assessmentId:requiredString(raw.assessment_id),
      verifiedTextId:requiredString(raw.verified_text_id),rubricVersionId:requiredString(raw.rubric_version_id),
      inputHash:requiredString(raw.input_hash),factorResults};
    const validated=validateExaminerProposal(context,proposal);
    if (scoreToUnits(requiredString(raw.total_score),context.rubric.scoreStep)!==
        scoreToUnits(validated.totalScore,context.rubric.scoreStep) ||
        scoreToUnits(requiredString(raw.total_marks),context.rubric.scoreStep)!==
        scoreToUnits(validated.totalMarks,context.rubric.scoreStep))
      throw new AIContractError('AI_TOTAL_SCORE_MISMATCH');
    const examinerModel=requiredString(raw.model);
    const verifier=await this.post('/v1/verify',{...p,examiner_proposal:raw});
    if (verifier.input_hash!==context.inputHash || verifier.accepted_examiner_run_id!==runId ||
        typeof verifier.verification_attempt_id!=='string'||!verifier.verification_attempt_id ||
        !['PASS','MAJOR_REVIEW','FAILED'].includes(verifier.status) ||
        typeof verifier.score_changing_correction!=='boolean'||
        !Array.isArray(verifier.reviewed_factor_ids)||!Array.isArray(verifier.findings)||
        !Array.isArray(verifier.independent_factor_results)||
        verifier.model===examinerModel)
      throw new AIContractError('AI_VERIFIER_CONTRACT_VIOLATION');
    const expected=new Set(context.rubric.factors.map(f=>f.id));
    const actual=verifier.reviewed_factor_ids;
    if(actual.length!==expected.size||new Set(actual).size!==actual.length||actual.some((id:unknown)=>!expected.has(id as string)))
      throw new AIContractError('AI_VERIFIER_FACTOR_MISMATCH');
    // PASS from an external model alone cannot override independent-score disagreements.
    const indep=parseFactorResults(verifier.independent_factor_results);
    if(indep.length!==factorResults.length||new Set(indep.map(f=>f.factorId)).size!==expected.size)
      throw new AIContractError('AI_VERIFIER_INDEPENDENCE_MISMATCH');
    // Never rely on Python's validation alone; validate the returned verifier evidence again.
    validateExaminerProposal(context,{...proposal,examinerRunId:requiredString(verifier.verification_attempt_id),
      factorResults:indep});
    const byId=new Map(indep.map(f=>[f.factorId,f]));
    const disagree=proposal.factorResults.some(f=>{
      const i=byId.get(f.factorId);
      return !i||i.criterionId!==f.criterionId||
        scoreToUnits(i.proposedScore,context.rubric.scoreStep)!==
        scoreToUnits(f.proposedScore,context.rubric.scoreStep);
    });
    if(verifier.status==='PASS' && (disagree||verifier.score_changing_correction))
      throw new AIContractError('AI_UNSUPPORTED_VERIFIER_PASS');
    const pass=verifier.status==='PASS';
    return {
      state:pass?'PASS_NOT_FINALIZED':'HUMAN_REVIEW_REQUIRED', proposal:validated,
      examinerMetadata:{runId,model:examinerModel,promptVersion:requiredString(raw.prompt_version),
        providerRequestId:requiredString(raw.provider_request_id)},
      verifierMetadata:{attemptId:verifier.verification_attempt_id,model:requiredString(verifier.model),
        promptVersion:requiredString(verifier.prompt_version),
        independentProviderRequestId:requiredString(verifier.independent_provider_request_id),
        challengeProviderRequestId:requiredString(verifier.challenge_provider_request_id)},
      verification:{status:verifier.status,reviewedFactorIds:actual,scoreChangingCorrection:verifier.score_changing_correction,
        findings:verifier.findings.map(requiredString)}
    };
  }
}

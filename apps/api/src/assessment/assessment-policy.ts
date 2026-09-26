/** Step88: purely deterministic, evidence-grounded human Understanding and trusted result checks. */
import {hash,validateEvidence,validateExaminerProposal,scoreToUnits,
  type EvidenceSpan,type LockedContext,type ExaminerProposal,type FactorProposal,
  type PublishedRubric,type VerifiedText} from '../../../../packages/domain/src/index.ts';
import {canonicalJson} from '../policies/submission-policy.ts';
import {AIContractError,type AIResult,type TopicSnapshot} from '../ai/ai-gateway-client.ts';

export interface HumanObservation {category:'TOPIC'|'IDEA'|'STRUCTURE';finding:string;evidence:EvidenceSpan;}
export interface HumanUnderstanding {
  source:'HUMAN_REVIEWED';schemaVersion:'understanding-human-v1';language:'BANGLA'|'ENGLISH';
  verifiedTextId:string;verifiedTextHash:string;topicHash:string;rubricHash:string;
  observations:HumanObservation[];
}
export const understandingHash=(value:HumanUnderstanding)=>hash(canonicalJson(value));
export function validateHumanUnderstanding(u:HumanUnderstanding, verified:VerifiedText, topicHash:string, rubricHash:string){
  const keys=Object.keys(u).sort().join(',');
  if(keys!==['language','observations','rubricHash','schemaVersion','source','topicHash','verifiedTextHash','verifiedTextId'].sort().join(',') ||
    u.source!=='HUMAN_REVIEWED'||u.schemaVersion!=='understanding-human-v1'||
    u.language!==verified.language||u.verifiedTextId!==verified.id||u.verifiedTextHash!==verified.contentHash||
    u.topicHash!==topicHash||u.rubricHash!==rubricHash||!Array.isArray(u.observations)||u.observations.length<1||u.observations.length>30)
    throw new AIContractError('UNDERSTANDING_INVALID_CONTEXT');
  for(const obs of u.observations){
    if(!obs || !['TOPIC','IDEA','STRUCTURE'].includes(obs.category)||typeof obs.finding!=='string'||
      !obs.finding.trim()||obs.finding.length>1000||!obs.evidence ||
      Object.keys(obs).sort().join(',')!==['category','evidence','finding'].sort().join(','))
      throw new AIContractError('UNDERSTANDING_INVALID_OBSERVATION');
    // Offset matching and grapheme integrity, NOT semantic academic validity (human reviewer is responsible).
    validateEvidence(verified.text,obs.evidence);
  }
}
export function checkedSnapshot(context:LockedContext, topic:TopicSnapshot, human:HumanUnderstanding):void {
  validateHumanUnderstanding(human,context.verifiedText,context.topicSnapshotHash,hash(canonicalJson(context.rubric)));
  if(hash(canonicalJson(topic))!==context.topicSnapshotHash)throw new AIContractError('AI_TOPIC_SNAPSHOT_MISMATCH');
  if(context.understandingSnapshotHash!==understandingHash(human))throw new AIContractError('AI_UNDERSTANDING_HASH_MISMATCH');
}
export function validatePersistedAIResult(context:LockedContext, result:AIResult, expected:{examinerModel:string;verifierModel:string}){
  if(result.proposal.assessmentId!==context.assessmentId||result.proposal.inputHash!==context.inputHash||
    result.proposal.examinerRunId!==result.examinerMetadata.runId||
    result.examinerMetadata.model!==expected.examinerModel||result.verifierMetadata.model!==expected.verifierModel||
    expected.examinerModel===expected.verifierModel||!result.examinerMetadata.providerRequestId||
    !result.verifierMetadata.independentProviderRequestId||!result.verifierMetadata.challengeProviderRequestId)
    throw new AIContractError('AI_PERSISTENCE_METADATA_MISMATCH');
  const proposed:ExaminerProposal={...result.proposal,verifiedTextId:context.verifiedText.id,
    rubricVersionId:context.rubric.versionId,factorResults:[...result.proposal.factorResults]};
  const verified=validateExaminerProposal(context,proposed);
  if(verified.totalScore!==result.proposal.totalScore||verified.totalMarks!==result.proposal.totalMarks)
    throw new AIContractError('AI_PERSISTENCE_TOTAL_MISMATCH');
  const checked=result.verification;
  if(checked.status!=='PASS'&&checked.status!=='MAJOR_REVIEW'&&checked.status!=='FAILED')
    throw new AIContractError('AI_INVALID_VERIFIER_STATUS');
  if(checked.status==='PASS'&&(checked.scoreChangingCorrection||result.state!=='PASS_NOT_FINALIZED'))
    throw new AIContractError('AI_UNSUPPORTED_VERIFIER_PASS');
  if(checked.status!=='PASS'&&result.state!=='HUMAN_REVIEW_REQUIRED')
    throw new AIContractError('AI_UNTRUSTED_VERIFIER_RESULT');
  const actual=checked.reviewedFactorIds;
  const expectedFactorIds=new Set(context.rubric.factors.map(f=>f.id));
  if(actual.length!==expectedFactorIds.size||new Set(actual).size!==expectedFactorIds.size||
    actual.some(id=>!expectedFactorIds.has(id)))throw new AIContractError('AI_VERIFIER_FACTOR_MISMATCH');
  const independent=checked.independentFactorResults;
  if(!Array.isArray(independent))throw new AIContractError('AI_MISSING_INDEPENDENT_EVALUATION');
  validateExaminerProposal(context,{...proposed,examinerRunId:result.verifierMetadata.attemptId,
    factorResults:independent});
  const index=new Map(independent.map((f:FactorProposal)=>[f.factorId,f]));
  const disagree=verified.factorResults.some(f=>{const other=index.get(f.factorId);
    return !other || other.criterionId!==f.criterionId ||
      scoreToUnits(other.proposedScore,context.rubric.scoreStep)!==scoreToUnits(f.proposedScore,context.rubric.scoreStep);});
  if(checked.status==='PASS'&&disagree)throw new AIContractError('AI_INDEPENDENT_DISAGREEMENT');
  return {verified,proposed,independent};
}
export function requireLiveAIApproval(env:NodeJS.ProcessEnv,scope:{examinerModel:string;verifierModel:string}):void {
  if(env.AI_RELEASE_GATE_APPROVED!=='true'||env.AI_CHILD_PROCESSING_APPROVED!=='true'||
    !env.OPENAI_EXAMINER_MODEL||!env.OPENAI_VERIFIER_MODEL||
    env.OPENAI_EXAMINER_MODEL!==scope.examinerModel||env.OPENAI_VERIFIER_MODEL!==scope.verifierModel||
    env.OPENAI_EXAMINER_MODEL===env.OPENAI_VERIFIER_MODEL||
    !env.AI_SERVICE_SHARED_TOKEN||env.AI_SERVICE_SHARED_TOKEN.length<32)
    throw new AIContractError('AI_EXTERNAL_PROCESSING_NOT_APPROVED');
}

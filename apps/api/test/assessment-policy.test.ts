/** No real AI provider, credentials, or child writing in these synthetic contract tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedText,hash,lockAssessmentContext,type PublishedRubric} from '../../../packages/domain/src/index.ts';
import {canonicalJson} from '../src/policies/submission-policy.ts';
import {understandingHash,validateHumanUnderstanding,checkedSnapshot,
  validatePersistedAIResult,requireLiveAIApproval,type HumanUnderstanding} from '../src/assessment/assessment-policy.ts';
import type {AIResult} from '../src/ai/ai-gateway-client.ts';
const rubric:PublishedRubric={id:'r',versionId:'v',status:'PUBLISHED',scoreStep:'1',totalMarks:'4',factors:[
  {id:'content',name:'Content',maxScore:'4',criteria:[{id:'c0',score:'0',description:'none'},
    {id:'c2',score:'2',description:'partial'},{id:'c4',score:'4',description:'complete'}]}]};
const verified=createVerifiedText('v','s','ENGLISH','I like books.');
const topic={id:'t',programId:'p',writingType:'PARAGRAPH',language:'ENGLISH' as const,
  title:'Books',instructions:'Write about books',clues:['Reading']};
const human:HumanUnderstanding={source:'HUMAN_REVIEWED',schemaVersion:'understanding-human-v1',
  language:'ENGLISH',verifiedTextId:verified.id,verifiedTextHash:verified.contentHash,
  topicHash:hash(canonicalJson(topic)),rubricHash:hash(canonicalJson(rubric)),observations:[{
    category:'IDEA',finding:'Student mentions books',
    evidence:{startOffset:7,endOffset:12,exactQuote:'books',claim:'The writer names books'}}]};
const context=lockAssessmentContext('a',verified,human.topicHash,understandingHash(human),rubric);
const factor={factorId:'content',criterionId:'c4',proposedScore:'4',rationale:'Synthetic only',evidence:[{startOffset:7,endOffset:12,exactQuote:'books',claim:'Student refers to books'}]};
const result=():AIResult=>({state:'PASS_NOT_FINALIZED',
  proposal:{examinerRunId:'e',assessmentId:'a',inputHash:context.inputHash,factorResults:[factor],totalScore:'4',totalMarks:'4'},
  examinerMetadata:{runId:'e',model:'syn-examiner',promptVersion:'ex-v1',providerRequestId:'syn-ex-request'},
  verifierMetadata:{attemptId:'v',model:'syn-verifier',promptVersion:'ver-v1',
    independentProviderRequestId:'syn-ind-request',challengeProviderRequestId:'syn-challenge-request'},
  verification:{status:'PASS',reviewedFactorIds:['content'],scoreChangingCorrection:false,findings:[],independentFactorResults:[factor]}});
const models={examinerModel:'syn-examiner',verifierModel:'syn-verifier'};
test('human-reviewed Understanding is evidence-bound and non-scoring',()=>{
  validateHumanUnderstanding(human,verified,human.topicHash,human.rubricHash);
  checkedSnapshot(context,topic,human);
  assert.equal(understandingHash(human).length,64);
});
test('placeholder Understanding hash cannot authorize grading',()=>assert.throws(()=>
  checkedSnapshot({...context,understandingSnapshotHash:hash('fabricated placeholder')},topic,human)));
test('wrong understanding verified-text hash is denied',()=>assert.throws(()=>
  validateHumanUnderstanding({...human,verifiedTextHash:hash('other')},verified,human.topicHash,human.rubricHash)));
test('human observation cannot contain unauthorized score field',()=>assert.throws(()=>
  validateHumanUnderstanding({...human,observations:[{...human.observations[0],score:'4'} as never]},verified,human.topicHash,human.rubricHash)));
test('invalid evidence offsets are denied',()=>assert.throws(()=>
  validateHumanUnderstanding({...human,observations:[{...human.observations[0],evidence:{...human.observations[0].evidence,endOffset:11}}]},verified,human.topicHash,human.rubricHash)));
test('backend revalidates a real-provider-shaped synthetic PASS',()=>{
  const checked=validatePersistedAIResult(context,result(),models);
  assert.equal(checked.verified.totalScore,'4');
});
test('untrusted verifier independent disagreement blocks a PASS',()=>{
  const r=result();r.verification.independentFactorResults[0]={...factor,criterionId:'c2',proposedScore:'2'};
  assert.throws(()=>validatePersistedAIResult(context,r,models));
});
test('wrong provider models cannot persist results',()=>assert.throws(()=>
  validatePersistedAIResult(context,result(),{...models,verifierModel:'unexpected'})));
test('external processing flags are fail-closed by default',()=>assert.throws(()=>requireLiveAIApproval({},models)));
test('approved settings must pin distinct model IDs and internal secret',()=>{
  const env={AI_RELEASE_GATE_APPROVED:'true',AI_CHILD_PROCESSING_APPROVED:'true',
    OPENAI_EXAMINER_MODEL:'syn-examiner',OPENAI_VERIFIER_MODEL:'syn-verifier',AI_SERVICE_SHARED_TOKEN:'x'.repeat(40)};
  assert.doesNotThrow(()=>requireLiveAIApproval(env,models));
  assert.throws(()=>requireLiveAIApproval({...env,AI_CHILD_PROCESSING_APPROVED:'false'},models));
  assert.throws(()=>requireLiveAIApproval({...env,AI_SERVICE_SHARED_TOKEN:'too-short'},models));
  assert.throws(()=>requireLiveAIApproval({...env,OPENAI_VERIFIER_MODEL:'syn-examiner'},models));
});

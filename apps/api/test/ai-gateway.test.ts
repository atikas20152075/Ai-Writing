/** Synthetic transport tests. No provider credentials, no real student data, no authoritative finalization. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,createVerifiedText,lockAssessmentContext,type PublishedRubric} from '../../../packages/domain/src/index.ts';
import {canonicalJson} from '../src/policies/submission-policy.ts';
import {AIGatewayClient,AIContractError} from '../src/ai/ai-gateway-client.ts';

const topic={id:'topic',programId:'p',writingType:'PARAGRAPH',language:'ENGLISH' as const,
  title:'Books',instructions:'Write about books',clues:['Why you read']};
const rubric:PublishedRubric={id:'r',versionId:'v1',status:'PUBLISHED',scoreStep:'1',totalMarks:'4',factors:[
  {id:'content',name:'Content',maxScore:'4',criteria:[
    {id:'c0',score:'0',description:'none'}, {id:'c2',score:'2',description:'partial'}, {id:'c4',score:'4',description:'good'}]}]};
const v=createVerifiedText('text','submission','ENGLISH','I like books.');
const context=lockAssessmentContext('assessment',v,hash(canonicalJson(topic)),hash('synthetic verified understanding'),rubric);
const factors=()=>[{factor_id:'content',criterion_id:'c4',proposed_score:'4',rationale:'Synthetic assessment',
  evidence:[{start_offset:7,end_offset:12,exact_quote:'books',claim:'Book topic mentioned'}]}];
const proposal=()=>({examiner_run_id:'examiner-run',assessment_id:context.assessmentId,
  verified_text_id:context.verifiedText.id,rubric_version_id:rubric.versionId,
  input_hash:context.inputHash,factor_results:factors(),total_score:'4',total_marks:'4',
  model:'syn-examiner',prompt_version:'ex-v1',provider_request_id:'syn-request-ex'});
const verification=()=>({verification_attempt_id:'verifier-run',accepted_examiner_run_id:'examiner-run',
  input_hash:context.inputHash,status:'PASS',reviewed_factor_ids:['content'],score_changing_correction:false,findings:[],
  independent_factor_results:factors(),model:'syn-verifier',prompt_version:'ver-v1',
  independent_provider_request_id:'syn-request-ind',challenge_provider_request_id:'syn-request-challenge'});
function client(exam=proposal(),ver=verification(),paths?:string[]){
  const fetchFn:typeof fetch=async(input,init)=>{
    assert.equal(init?.headers && (init.headers as any)['x-internal-token'],'x'.repeat(40));
    const url=String(input);paths?.push(url);
    return new Response(JSON.stringify(url.endsWith('/verify')?ver:exam),{status:200,headers:{'content-type':'application/json'}});
  };
  return new AIGatewayClient({origin:'http://127.0.0.1:8001',token:'x'.repeat(40),fetchFn});
}

test('pinned proposal and independent verifier remain non-authoritative',async()=>{
  const paths:string[]=[];
  const result=await client(proposal(),verification(),paths).runLocked(context,topic);
  assert.equal(result.state,'PASS_NOT_FINALIZED');
  assert.equal(result.proposal.totalScore,'4');
  assert.equal(result.verification.status,'PASS');
  assert.deepEqual(paths,['http://127.0.0.1:8001/v1/examine','http://127.0.0.1:8001/v1/verify']);
});
test('tampered evidence never advances to verifier',async()=>{
  const p=proposal();p.factor_results[0].evidence[0].exact_quote='not in original';const paths:string[]=[];
  await assert.rejects(client(p,verification(),paths).runLocked(context,topic));
  assert.equal(paths.length,1);
});
test('wrong pinned topic prevents any outbound AI transmission',async()=>{
  const paths:string[]=[];
  await assert.rejects(client(proposal(),verification(),paths).runLocked(context,{...topic,title:'Different'}),
    e=>e instanceof AIContractError&&e.code==='AI_TOPIC_SNAPSHOT_MISMATCH');
  assert.equal(paths.length,0);
});
test('bad examiner total prevents verifier invocation',async()=>{
  const p=proposal();p.total_score='2';const paths:string[]=[];
  await assert.rejects(client(p,verification(),paths).runLocked(context,topic));
  assert.equal(paths.length,1);
});
test('external verifier PASS cannot override independent disagreement',async()=>{
  const ver=verification();ver.independent_factor_results[0].criterion_id='c2';ver.independent_factor_results[0].proposed_score='2';
  await assert.rejects(client(proposal(),ver).runLocked(context,topic),
    e=>e instanceof AIContractError&&e.code==='AI_UNSUPPORTED_VERIFIER_PASS');
});
test('major review stays blocked from finalization',async()=>{
  const ver=verification();ver.status='MAJOR_REVIEW';ver.score_changing_correction=true;
  const result=await client(proposal(),ver).runLocked(context,topic);
  assert.equal(result.state,'HUMAN_REVIEW_REQUIRED');
});
test('missing internal transport token is rejected',()=>{
  assert.throws(()=>new AIGatewayClient({origin:'http://127.0.0.1:8001',token:'short'}),
    e=>e instanceof AIContractError&&e.code==='AI_INTERNAL_TOKEN_REQUIRED');
});

test('untrusted independent evidence cannot approve a score',async()=>{
  const ver=verification();ver.independent_factor_results[0].evidence[0].exact_quote='forged';
  await assert.rejects(client(proposal(),ver).runLocked(context,topic));
});

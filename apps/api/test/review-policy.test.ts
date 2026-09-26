import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedText,lockAssessmentContext,type PublishedRubric,type FactorProposal} from '../../../packages/domain/src/index.ts';
import {checkDecision,checkIndependentApproval,checkOpening,derivedTargets,reviewReason,validateHumanCorrection} from '../src/review/review-policy.ts';
const rubric:PublishedRubric={id:'r',versionId:'r1',status:'PUBLISHED',scoreStep:'1',totalMarks:'4',factors:[
  {id:'content',name:'Content',maxScore:'4',criteria:[{id:'c0',score:'0',description:'missing'},
    {id:'c2',score:'2',description:'partial'},{id:'c4',score:'4',description:'full'}]}
]};
const text=createVerifiedText('v1','s1','ENGLISH','I like books.');
const ctx=lockAssessmentContext('a1',text,'a'.repeat(64),'b'.repeat(64),rubric);
const factors:FactorProposal[]=[{factorId:'content',criterionId:'c2',proposedScore:'2',
  rationale:'This response is partially developed.',evidence:[{startOffset:7,endOffset:12,exactQuote:'books',claim:'Mentions books'}]}];
test('exact rubric points and Unicode anchored human evidence are mandatory',()=>{
  assert.equal(validateHumanCorrection(ctx,factors).totalScore,'2');
  assert.throws(()=>validateHumanCorrection(ctx,[{...factors[0],proposedScore:'3'}]));
  assert.throws(()=>validateHumanCorrection(ctx,[{...factors[0],evidence:[{...factors[0].evidence[0],exactQuote:'phones'}]}]));
});
test('review factor descriptions must be meaningful and shape is restricted',()=>{
  assert.throws(()=>validateHumanCorrection(ctx,[{...factors[0],rationale:'short'}]));
  assert.throws(()=>validateHumanCorrection(ctx,[{...factors[0],role:'ADMIN'} as any]));
});
test('opening review obeys prior revision and review status',()=>{
  assert.doesNotThrow(()=>checkOpening('STUDENT_APPEAL','FINALIZED',true));
  assert.doesNotThrow(()=>checkOpening('AI_ESCALATION','HUMAN_REVIEW',false));
  assert.throws(()=>checkOpening('STUDENT_APPEAL','HUMAN_REVIEW',false));
  assert.throws(()=>checkOpening('AI_ESCALATION','FINALIZED',true));
  assert.throws(()=>checkOpening('ACADEMIC_CORRECTION','AWAITING_UNDERSTANDING',false));
});
test('two-person review and optimistic revision matching',()=>{
  assert.doesNotThrow(()=>checkIndependentApproval('one','two',true,null,null));
  assert.throws(()=>checkIndependentApproval('one','one',true,null,null));
  assert.throws(()=>checkIndependentApproval('one','two',false,null,null));
  assert.throws(()=>checkIndependentApproval('one','two',true,'old','new'));
});
test('uphold is only available for unchanged finalized scores',()=>{
  assert.doesNotThrow(()=>checkDecision('OPEN','UPHOLD','revision',false));
  assert.throws(()=>checkDecision('OPEN','UPHOLD',null,false));
  assert.throws(()=>checkDecision('PROPOSED','UPHOLD','revision',true));
  assert.throws(()=>checkDecision('OPEN','APPROVE','revision',false));
  assert.doesNotThrow(()=>checkDecision('PROPOSED','APPROVE',null,true));
});
test('review requests reject unsafe reasons and downstream targets remain explicit',()=>{
  assert.equal(reviewReason('  Please review the content factor.  '),'Please review the content factor.');
  for(const s of ['', 'tiny', 'x'.repeat(2001), 3]) assert.throws(()=>reviewReason(s));
  assert.deepEqual(derivedTargets,['FEEDBACK','PRACTICE','PROGRESS','TEACHER','PARENT','REPORT']);
});

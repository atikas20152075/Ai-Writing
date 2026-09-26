import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRubricFeedback,buildRubricPractice,comparableSignature,buildComparableProgress,
  type ComparablePoint} from '../src/projections/learning-builders.ts';
import type {PublishedRubric,FactorProposal} from '../../../packages/domain/src/index.ts';
const rubric:PublishedRubric={id:'r',versionId:'r1',status:'PUBLISHED',scoreStep:'1',totalMarks:'4',
  factors:[{id:'content',name:'Content',maxScore:'4',criteria:[
    {id:'c0',score:'0',description:'No supporting ideas'},
    {id:'c2',score:'2',description:'Some supporting ideas'},
    {id:'c4',score:'4',description:'Clearly developed ideas'}]}]};
const factors:FactorProposal[]=[{factorId:'content',criterionId:'c2',proposedScore:'2',
  rationale:'A relevant idea is supported in the original response.',
  evidence:[{startOffset:7,endOffset:12,exactQuote:'books',claim:'Mentions books'}]}];
test('rubric feedback quotes only the approved criterion and original pinned rationale',()=>{
 const out=buildRubricFeedback('rev-a',rubric,factors);
 assert.equal(out.revisionId,'rev-a');
 assert.equal(out.factors[0].criterionDescription,'Some supporting ideas');
 assert.deepEqual(out.factors[0].evidence,factors[0].evidence);
 assert.match(out.disclaimer,/Not a complete teacher correction/);
});
test('practice objectives are rubric-derived and never fabricate exercises',()=>{
 const p=buildRubricPractice('rev-b',rubric,factors);
 assert.equal(p.targets.length,1);
 assert.equal(p.targets[0].missedPoints,'2');
 assert.equal(p.targets[0].selectedCriterion,'Some supporting ideas');
 assert.equal(p.targets[0].factorId,'content');
 assert.ok(!('newExercise' in p.targets[0]));
});
test('invalid or duplicated factor score cannot materialize a learning snapshot',()=>{
 assert.throws(()=>buildRubricFeedback('rev-a',rubric,[{...factors[0],proposedScore:'3'}]));
 assert.throws(()=>buildRubricPractice('rev-a',rubric,[factors[0],factors[0]]));
});
const point=(assessmentId:string,revisionId:string,createdAt:string,score:string):ComparablePoint=>
 ({assessmentId,revisionId,createdAt,score,totalMarks:'4'});
test('cohort signature is order-independent yet invalidates on any revised score',()=>{
 const a=point('a','r1','2026-01-01T00:00:00Z','2');
 const b=point('b','r2','2026-01-02T00:00:00Z','4');
 assert.equal(comparableSignature([a,b]),comparableSignature([b,a]));
 assert.notEqual(comparableSignature([a,b]),comparableSignature([a,{...b,revisionId:'r3'}]));
});
test('descriptive progress explicitly needs two comparable assessments',()=>{
 const a=point('a','r1','2026-01-01T00:00:00Z','2');
 const b=point('b','r2','2026-01-02T00:00:00Z','4');
 const insufficient=buildComparableProgress('r1',[a],'fingerprint');
 assert.equal(insufficient.status,'INSUFFICIENT_DATA');
 assert.equal(insufficient.scoreDelta,null);
 const snapshot=buildComparableProgress('r2',[b,a],'fingerprint');
 assert.equal(snapshot.scoreDelta,'2');
 assert.equal(snapshot.comparableCount,2);
 assert.match(snapshot.disclaimer,/not proof of improvement/);
});

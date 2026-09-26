import test from 'node:test';
import assert from 'node:assert/strict';
import {publicWritingOptions} from '../src/submission/writing-options-policy.ts';
const valid={programId:'p',programName:'Synthetic program',batchId:'b',batchName:'Synthetic cohort',
 topicVersionId:'t',title:'Synthetic topic',writingType:'GUIDED',language:'ENGLISH',
 instructions:'Write an original response.',clues:['One','Two']};
test('writing option mapper yields only bounded presentation fields',()=>{
 const result=publicWritingOptions([{...valid,internalSecret:'never'} as typeof valid,...Array.from({length:120},()=>valid)]);
 assert.equal(result.length,100);assert.deepEqual(Object.keys(result[0]),Object.keys(valid));
 assert.equal(JSON.stringify(result).includes('never'),false);
});
test('rejects malformed/unsupported options at presentation edge',()=>{
 const rows=publicWritingOptions([{...valid,language:'OTHER'},{...valid,title:''},{...valid,topicVersionId:''},valid]);
 assert.equal(rows.length,1);
});

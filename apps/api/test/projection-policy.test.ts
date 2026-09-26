import test from 'node:test';
import assert from 'node:assert/strict';
import {decideProjectionWork,projectionAvailability,projectionTargets} from '../src/projections/projection-policy.ts';
test('only PARENT can be rebuilt with a current effective revision',()=>{
  assert.equal(decideProjectionWork('PARENT','new','new',true),'PUBLISH_PARENT');
  assert.equal(decideProjectionWork('REPORT','new','new',true),'BLOCKED');
  assert.equal(decideProjectionWork('PARENT','old','new',true),'SUPERSEDED');
  assert.equal(decideProjectionWork('PARENT','new','new',false),'SUPERSEDED');
});
test('a parent summary built for an older revision becomes instantly stale',()=>{
  const old=[{target:'PARENT',scoreRevisionId:'old',status:'REBUILT'}];
  assert.equal(projectionAvailability('old',old,'old')[4].availability,'CURRENT');
  assert.equal(projectionAvailability('new',old,'old')[4].availability,'STALE');
});
test('pending or missing materialization never gives a false CURRENT label',()=>{
  assert.equal(projectionAvailability('r',[{target:'PARENT',scoreRevisionId:'r',status:'REBUILT'}],null)[4].availability,'STALE');
  assert.equal(projectionAvailability('r',[{target:'PARENT',scoreRevisionId:'r',status:'PENDING'}],'r')[4].availability,'STALE');
  assert.equal(projectionAvailability(null,[],null)[4].availability,'UNAVAILABLE');
});
test('unsupported modules remain UNAVAILABLE rather than pretending to rebuild',()=>{
  const records=projectionTargets.filter(x=>x!=='PARENT').map(target=>({target,scoreRevisionId:'r',status:'BLOCKED'}));
  const availability=projectionAvailability('r',records,null);
  assert.equal(availability.filter(x=>x.availability==='UNAVAILABLE').length,5);
  assert.equal(availability.find(x=>x.target==='PARENT')?.availability,'STALE');
});

test('Step91 only claims eligible implemented learning targets, never teacher or report',()=>{
 assert.equal(decideProjectionWork('FEEDBACK','r','r',true),'PUBLISH_FEEDBACK');
 assert.equal(decideProjectionWork('PRACTICE','r','r',true),'PUBLISH_PRACTICE');
 assert.equal(decideProjectionWork('PROGRESS','r','r',true),'PUBLISH_PROGRESS');
 assert.equal(decideProjectionWork('TEACHER','r','r',true),'BLOCKED');
 assert.equal(decideProjectionWork('REPORT','r','r',true),'BLOCKED');
 const receipts=[{target:'FEEDBACK',scoreRevisionId:'r',status:'REBUILT'}];
 assert.equal(projectionAvailability('r',receipts,null,{FEEDBACK:'r'})[0].availability,'CURRENT');
 assert.equal(projectionAvailability('r',receipts,null,{FEEDBACK:'old'})[0].availability,'STALE');
});

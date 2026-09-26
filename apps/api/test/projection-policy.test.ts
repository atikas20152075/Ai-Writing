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

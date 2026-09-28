import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSingleFlightRunner,ReportRenderBusyError} from '../src/reports/report-render-limiter.ts';

function deferred<T>(){
 let resolve!:(value:T)=>void,reject!:(reason?:unknown)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}

test('rejects overlapping work immediately and permits the next render after completion',async()=>{
 const current=deferred<string>();
 const run=createSingleFlightRunner(()=>current.promise);
 const first=run();
 await assert.rejects(run(),ReportRenderBusyError);
 current.resolve('ready');
 assert.equal(await first,'ready');
 assert.equal(await run(),'ready');
});

test('releases the render slot when work fails',async()=>{
 let calls=0;
 const run=createSingleFlightRunner(async()=>{
  calls++;
  if(calls===1)throw new Error('synthetic failure');
  return 'ready';
 });
 await assert.rejects(run(),/synthetic failure/);
 assert.equal(await run(),'ready');
});

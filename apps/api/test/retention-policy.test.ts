import test from 'node:test';
import assert from 'node:assert/strict';
import {submissionExpiry} from '../src/privacy/retention-policy.ts';

test('retention expires exactly six UTC calendar years after acceptance',()=>{
  const accepted=new Date('2026-09-29T12:34:56.789Z');
  assert.equal(submissionExpiry(accepted).toISOString(),'2032-09-29T12:34:56.789Z');
});

test('six-year retention clamps leap-day acceptance to the last day of February',()=>{
  const accepted=new Date('2024-02-29T03:04:05.000Z');
  assert.equal(submissionExpiry(accepted).toISOString(),'2030-02-28T03:04:05.000Z');
});

test('retention rejects an invalid acceptance timestamp',()=>{
  assert.throws(()=>submissionExpiry(new Date(Number.NaN)),RangeError);
});

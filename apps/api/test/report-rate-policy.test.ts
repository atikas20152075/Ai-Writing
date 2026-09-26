import test from 'node:test';
import assert from 'node:assert/strict';
import {REPORT_EXPORT_BUDGET,REPORT_EXPORT_WINDOW_SECONDS,reportExportBucket} from '../src/reports/report-rate-policy.ts';
const secret='synthetic-only-testing-key-with-at-least-forty-eight-characters';
const one='10000000-0000-4000-8000-000000000001';
const two='20000000-0000-4000-8000-000000000002';
test('pseudonymous export budgets are isolated across accounts',()=>{
 const a=reportExportBucket(one,secret),b=reportExportBucket(two,secret);
 assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,b);
 assert.equal(reportExportBucket(one.toUpperCase(),secret),a);
 assert.ok(!a.includes(one));assert.equal(REPORT_EXPORT_BUDGET,12);
 assert.equal(REPORT_EXPORT_WINDOW_SECONDS,600);
});
test('report key has domain separation and fail-closed configuration',()=>{
 const a=reportExportBucket(one,secret);
 assert.notEqual(a,reportExportBucket(one,secret+'rotated'));
 assert.throws(()=>reportExportBucket(one,'short'));
 assert.throws(()=>reportExportBucket('not-uuid',secret));
});

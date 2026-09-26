import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTH_RATE_RULES,buildAuthRateTargets} from '../src/auth/rate-limit-policy.ts';
const SECRET='SYNTHETIC_TEST_KEY_ONLY_-_CHANGE_FOR_REAL_DEPLOYMENTS_0123456789';

test('login uses independently keyed IP and account budgets',()=>{
  const x=buildAuthRateTargets('login','127.0.0.1',SECRET,' Mixed@Example.test ');
  assert.equal(x.length,2);
  assert.equal(x[0].limit,60);
  assert.equal(x[1].limit,12);
  assert.notEqual(x[0].bucketKey,x[1].bucketKey);
});
test('email case cannot evade identity limit',()=>{
 const x=buildAuthRateTargets('login','127.0.0.1',SECRET,'A@EXAMPLE.TEST');
 const y=buildAuthRateTargets('login','127.0.0.2',SECRET,'a@example.test');
 assert.equal(x[1].bucketKey,y[1].bucketKey);
 assert.notEqual(x[0].bucketKey,y[0].bucketKey);
});
test('register/login use separate keys and policies',()=>{
 const login=buildAuthRateTargets('login','127.0.0.1',SECRET,'a@example.test');
 const register=buildAuthRateTargets('register','127.0.0.1',SECRET,'a@example.test');
 assert.notEqual(login[0].bucketKey,register[0].bucketKey);
 assert.notEqual(login[1].bucketKey,register[1].bucketKey);
 assert.equal(register[0].limit,8);
 assert.equal(register[1].limit,3);
});
test('refresh requires only trusted request-IP budget',()=>{
 const x=buildAuthRateTargets('refresh','127.0.0.1',SECRET);
 assert.equal(x.length,1);
 assert.equal(x[0].limit,AUTH_RATE_RULES.refresh.ip.limit);
});
test('different secrets yield different irreversible bucket identifiers',()=>{
 const a=buildAuthRateTargets('login','127.0.0.1',SECRET,'a@example.test');
 const b=buildAuthRateTargets('login','127.0.0.1',SECRET+'another','a@example.test');
 assert.notEqual(a[0].bucketKey,b[0].bucketKey);
 assert.match(a[1].bucketKey,/^[0-9a-f]{64}$/);
 assert.ok(!a[1].bucketKey.includes('example.test'));
});
test('missing or undersized protection secret fails closed',()=>{
 assert.throws(()=>buildAuthRateTargets('login','127.0.0.1','short','a@example.test'),/AUTH_ABUSE_KEY/);
 assert.throws(()=>buildAuthRateTargets('login','127.0.0.1','', 'a@example.test'),/AUTH_ABUSE_KEY/);
});
test('client must not omit server-observed request IP',()=>{
 assert.throws(()=>buildAuthRateTargets('refresh','',SECRET),/request IP/);
 assert.throws(()=>buildAuthRateTargets('refresh','x'.repeat(129),SECRET),/request IP/);
});
test('validated email required for registration and login, not refresh',()=>{
 assert.throws(()=>buildAuthRateTargets('register','::1',SECRET),/email/);
 assert.equal(buildAuthRateTargets('refresh','::1',SECRET).length,1);
});

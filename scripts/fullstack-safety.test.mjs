import test from 'node:test';
import assert from 'node:assert/strict';
import {requireDisposableBrowserDatabase} from './fullstack-safety.mjs';
test('browser fixture cannot target production, an unnamed DB, or an unacknowledged database',()=>{
  const valid={NODE_ENV:'test',WRITING_FULLSTACK_ACK:'ONLY_SYNTHETIC_TEST_DATA',
    DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:5432/writing_browser_test?schema=public'};
  assert.doesNotThrow(()=>requireDisposableBrowserDatabase(valid));
  for(const patch of [{NODE_ENV:'production'},{WRITING_FULLSTACK_ACK:undefined},{DATABASE_URL:undefined},
    {DATABASE_URL:'postgresql://synthetic:synthetic@production.example/writing_browser_test'},
    {DATABASE_URL:'postgresql://synthetic:synthetic@localhost/real_data'},
    {DATABASE_URL:'https://localhost/writing_browser_test'}])
    assert.throws(()=>requireDisposableBrowserDatabase({...valid,...patch}));
});

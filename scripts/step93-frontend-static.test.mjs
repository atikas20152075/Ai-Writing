import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const app=readFileSync('apps/web/prototype/app.js','utf8');
const markup=readFileSync('apps/web/prototype/index.html','utf8');
const css=readFileSync('apps/web/prototype/styles.css','utf8');
test('portal preview has valid JavaScript syntax and access is server-scoped',()=>{
 const syntax=spawnSync(process.execPath,['--check','apps/web/prototype/app.js'],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
 for(const endpoint of ['/auth/login','/auth/refresh','/auth/logout','/submissions/mine',
   '/assessments/mine/','/academic/cohorts/','/reports/assessments/'])assert.ok(app.includes(endpoint));
 assert.ok(app.includes("credentials:'include'"));
});
test('preview never persists a bearer token or manufactures scores',()=>{
 assert.doesNotMatch(app,/localStorage|sessionStorage|document\.cookie|innerHTML|eval\s*\(/);
 assert.ok(app.includes("data.status!=='FINALIZED'"));
 assert.ok(markup.includes('aria-live="polite"'));
 assert.ok(markup.includes('autocomplete="current-password"'));
 assert.ok(css.includes('prefers-reduced-motion'));
});

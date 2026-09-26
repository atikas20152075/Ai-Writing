/** Executes the actual UI against a small DOM/fetch harness; no browser dependency. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {RequestScope,StaleRequestError} from '../apps/web/prototype/request-scope.js';
const source=readFileSync('apps/web/prototype/app.js','utf8').replace(/^import .*;\n/,'');
const id='12345678-1234-1234-1234-123456789012';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function response(body,status=200){return {ok:status>=200&&status<300,status,json:async()=>body,blob:async()=>body};}
class Element {
 children=[];hidden=false;disabled=false;value='';listeners={};ownText='';
 classList={toggle(){}};
 set textContent(text){this.ownText=String(text);this.children=[];}
 get textContent(){return this.ownText+this.children.map(x=>x.textContent).join('');}
 get options(){return this.children;}
 append(node){this.children.push(node);}
 replaceChildren(){this.children=[];this.ownText='';}
 addEventListener(name,fn){this.listeners[name]=fn;}
 trigger(name){return this.listeners[name]?.({preventDefault(){}});}
 click(){return this.trigger('click');}
}
function harness(handler){
 const nodes=new Map(),calls=[];
 const el=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const context=vm.createContext({RequestScope,StaleRequestError,AbortSignal,crypto:webcrypto,
  document:{getElementById:el,createElement:()=>new Element()},URL,setTimeout:()=>{},
  fetch:async(url,options)=>{const path=url.replace('http://localhost:3001/api/v1','');calls.push({path,options});return handler(path,options);}});
 vm.runInContext(source,context);
 return {el,calls,run:code=>vm.runInContext(code,context)};
}
const parentPage=(title='Synthetic topic',nextCursor=null)=>({assessments:[{assessmentId:id,studentId:id,programId:id,
 topicTitle:title,status:'FINALIZED',effectiveRevisionId:id,totalScore:'2',totalMarks:'4'}],nextCursor});
test('late family response after sign-out cannot repopulate cleared private DOM',async()=>{
 const late=deferred();
 const h=harness(path=>path==='/auth/refresh'?response({accessToken:'synthetic'}):
  path==='/auth/me'?response({role:'PARENT'}):path==='/auth/logout'?response({ok:true}):late.promise);
 await flush();assert.equal(h.el('workspace').hidden,false);
 await h.el('logout').click();assert.equal(h.el('workspace').hidden,true);
 late.resolve(response(parentPage('OLD PRIVATE TOPIC')));await flush();
 assert.equal(h.el('parentAssessments').textContent,'');assert.equal(h.el('workspace').hidden,true);
});
test('out-of-order family refresh keeps only the latest response',async()=>{
 const h=harness(path=>path==='/auth/refresh'?response({},401):response(parentPage()));await flush();
 // Replace fetch in the VM without replacing the application functions.
 h.run('globalThis.pending=[]');
 h.run('fetch=()=>new Promise(resolve=>pending.push(resolve))');
 const older=h.run('parentAssessments()'),newer=h.run('parentAssessments()');
 h.run('pending[1]') (response(parentPage('NEW')));await newer;
 h.run('pending[0]') (response(parentPage('OLD')));await older;
 assert.ok(h.el('parentAssessments').textContent.includes('NEW'));
 assert.ok(!h.el('parentAssessments').textContent.includes('OLD'));
});
test('old 401 cannot sign out a newer account; body parsing is fenced too',async()=>{
 const h=harness(()=>response({},401));await flush();
 h.run('globalThis.pending=[];fetch=()=>new Promise(resolve=>pending.push(resolve));token="old"');
 const old=h.run('api("/old")').catch(e=>e);
 h.run('requests.invalidate();token="new"');h.run('pending[0]')(response({},401));
 assert.equal((await old).name,'StaleRequestError');assert.equal(h.run('token'),'new');
 const body=deferred();const pending=h.run('api("/body")').catch(e=>e);
 h.run('pending[1]')({ok:true,json:()=>body.promise});await flush();h.run('lock()');body.resolve({private:'old'});
 assert.equal((await pending).name,'StaleRequestError');
});
test('late body parse errors never surface old response content',async()=>{
 const h=harness(()=>response({},401));await flush();
 let rejectBody;
 const body=new Promise((_,reject)=>{rejectBody=reject;});
 h.run('globalThis.pending=[];fetch=()=>new Promise(resolve=>pending.push(resolve))');
 const pending=h.run('api("/body")').catch(e=>e);
 h.run('pending[0]')({ok:true,json:()=>body});await flush();h.run('lock()');
 rejectBody(new Error('OLD PRIVATE RESPONSE CONTENT'));
 assert.equal((await pending).name,'StaleRequestError');
});
test('family pagination passes the server cursor and displays pending without invented marks',async()=>{
 const h=harness(path=>path==='/auth/refresh'?response({},401):response(parentPage('PAGE',id)));await flush();
 await h.run('parentAssessments()');assert.equal(h.el('parentNext').hidden,false);
 h.el('parentNext').click();await flush();
 assert.ok(h.calls.at(-1).path.endsWith('?cursor='+id));
 await h.run(`renderResult(document.getElementById('parentResult'),{assessmentId:'${id}',status:'AWAITING_UNDERSTANDING',result:null},'${id}')`);
 assert.ok(h.el('parentResult').textContent.includes('No finalized score'));
 assert.ok(!h.el('parentResult').textContent.includes('Approved score'));
});
test('startup refresh completes before login and late startup cleanup cannot unlock logout',async()=>{
 const refresh=deferred(),logout=deferred(),list=deferred();
 const h=harness(path=>path==='/auth/refresh'?refresh.promise:path==='/auth/me'?response({role:'PARENT'}):path==='/auth/logout'?logout.promise:list.promise);
 await h.el('loginForm').trigger('submit');assert.equal(h.calls.length,1);
 refresh.resolve(response({accessToken:'synthetic'}));await flush();
 h.el('logout').click();list.resolve(response(parentPage()));await flush();
 assert.equal(h.el('loginButton').disabled,true);
 logout.resolve(response({ok:true}));await flush();assert.equal(h.el('loginButton').disabled,false);
});
test('writing controls freeze while submitting and unchanged failed requests reuse their ID',async()=>{
 const submit=deferred();let call=0;
 const h=harness(path=>path==='/auth/refresh'?response({},401):path==='/submissions/typed'?(++call===1?submit.promise:response({},503)):response([]));await flush();
 h.run(`writingOptions=[{topicVersionId:'${id}',batchId:'${id}',programId:'${id}'}]`);
 h.el('writingOption').value=[id,id,id].join('|');h.el('writingText').value='My synthetic original writing.';
 const pending=h.el('writingForm').trigger('submit');assert.equal(h.el('writingText').disabled,true);
 submit.resolve(response({},503));await pending;
 assert.equal(h.el('writingText').disabled,false);assert.equal(h.el('writingText').value,'My synthetic original writing.');
 await h.el('writingForm').trigger('submit');
 const bodies=h.calls.filter(x=>x.path==='/submissions/typed').map(x=>JSON.parse(x.options.body));
 assert.equal(bodies[0].clientRequestId,bodies[1].clientRequestId);
});

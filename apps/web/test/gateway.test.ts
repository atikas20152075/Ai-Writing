import test from 'node:test';
import assert from 'node:assert/strict';
import {gateway} from '../lib/gateway.ts';
const env={NODE_ENV:'test',WEB_PUBLIC_ORIGIN:'http://localhost:3000',WRITING_API_URL:'http://127.0.0.1:3001/api/v1'};
const session='writing_access=synthetic.access; writing_refresh=synthetic-refresh';
function request(path:string,method='GET',body:unknown={},headers:Record<string,string>={}){
 return new Request('http://localhost:3000/api/portal/'+path,{method,headers:{Origin:env.WEB_PUBLIC_ORIGIN,'X-Writing-Client':'portal',Cookie:session,...(method==='POST'?{'Content-Type':'application/json'}:{}),...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
const noCall=(async()=>{assert.fail('Blocked request must never reach upstream');}) as typeof fetch;
const auth=()=>Response.json({accessToken:'next.access'},{headers:{'Set-Cookie':'writing_refresh=next-refresh; Path=/api/v1/auth; HttpOnly'}});
test('BFF denies unknown routes, path traversal, writes, client identity injection and malformed cursor',async()=>{
  for(const path of ['admin/programs','auth/refresh','auth/register','submissions/mine?guardianId=someone','parents/me/children/assessments?cursor=bad','parents/me/children/assessments?cursor=x&cursor=y'])
  assert.ok([400,404].includes((await gateway(request(path),env,noCall)).status));
 assert.equal((await gateway(request('auth/me','POST'),env,noCall)).status,404);
 assert.equal((await gateway(request('review-cases?batchId=bad'),env,noCall)).status,400);
 assert.equal((await gateway(request('review-cases?batchId=11111111-1111-4111-8111-111111111111&batchId=22222222-2222-4222-8222-222222222222'),env,noCall)).status,400);
 assert.equal((await gateway(request('review-cases/11111111-1111-4111-8111-111111111111/extra'),env,noCall)).status,404);
 const blocked=(async()=>Response.json({error:'blocked'},{status:401})) as typeof fetch;
 assert.equal((await gateway(request('review-cases/11111111-1111-4111-8111-111111111111/proposals','POST'),env,blocked)).status,401);
 assert.equal((await gateway(request('review-cases/11111111-1111-4111-8111-111111111111/decisions','POST'),env,blocked)).status,401);
 assert.equal((await gateway(request('review-cases/11111111-1111-4111-8111-111111111111/proposals/extra','POST'),env,noCall)).status,404);
 assert.equal((await gateway(request('academic/cohorts/11111111-1111-4111-8111-111111111111/analytics'),env,blocked)).status,401);
 assert.equal((await gateway(request('academic/cohorts/not-a-uuid/analytics'),env,noCall)).status,404);
 assert.equal((await gateway(request('auth/me','GET',{}, {'X-Writing-Client':''}),env,noCall)).status,403);
 assert.equal((await gateway(request('auth/login','POST',{}, {Origin:'https://attacker.example'}),env,noCall)).status,403);
 assert.equal((await gateway(request('auth/me','GET',{}, {'Sec-Fetch-Site':'same-site'}),env,noCall)).status,403);
});
test('login exchanges tokens for HttpOnly cookies and returns no bearer token',async()=>{
 const calls:string[]=[];
 const transport=(async(url,init)=>{calls.push(String(url));assert.equal(new Headers(init?.headers).get('origin'),env.WEB_PUBLIC_ORIGIN);return String(url).endsWith('logout')?Response.json({loggedOut:true}):auth();}) as typeof fetch;
 const result=await gateway(request('auth/login','POST',{email:'synthetic@example.test',password:'test'}),env,transport);
 assert.deepEqual(await result.json(),{authenticated:true});
 assert.match(result.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict/);
 assert.match(result.headers.get('set-cookie')!,/writing_refresh=next-refresh/);
 assert.equal(result.headers.get('cache-control'),'private, no-store, max-age=0');
 assert.equal(calls.length,2);
});
test('session avoids refresh while current access is valid; rotation returns only current identity',async()=>{
 let refreshes=0;
 const me={userId:'synthetic-user',role:'PARENT'};
 const transport=(async(url,init)=>{
  if(String(url).endsWith('/auth/refresh')){refreshes++;assert.equal(new Headers(init?.headers).get('cookie'),'writing_refresh=synthetic-refresh');return auth();}
  return Response.json(me);
 }) as typeof fetch;
 const result=await gateway(request('auth/session','POST'),env,transport);assert.deepEqual(await result.json(),me);assert.equal(refreshes,0);
 const restored=await gateway(request('auth/session','POST',{}, {Cookie:'writing_refresh=synthetic-refresh'}),env,transport);
 assert.deepEqual(await restored.json(),me);assert.equal(refreshes,1);assert.match(restored.headers.get('set-cookie')!,/next.access/);
});
test('proxy cannot forward browser bearer, arbitrary cookies, redirects or upstream diagnostics',async()=>{
 const transport=(async(_url,init)=>{
  const headers=new Headers(init?.headers);assert.equal(headers.get('authorization'),'Bearer synthetic.access');assert.equal(headers.get('cookie'),null);
  assert.equal(init?.redirect,'manual');return Response.json({privateStack:'never leak'},{status:500,headers:{'Set-Cookie':'secret=bad'}});
 }) as typeof fetch;
 const result=await gateway(request('submissions/mine','GET',{}, {Authorization:'Bearer forged'}),env,transport);
 assert.equal(result.status,502);assert.equal(result.headers.get('set-cookie'),null);assert.doesNotMatch(await result.text(),/privateStack|never leak/);
});
test('BFF validates CSRF on cookie-authenticated writes and body size before forwarding',async()=>{
 assert.equal((await gateway(request('submissions/typed','POST',{}, {Origin:''}),env,noCall)).status,403);
 assert.equal((await gateway(request('submissions/typed','POST',{}, {'Content-Type':'text/plain'}),env,noCall)).status,415);
 assert.equal((await gateway(request('submissions/typed','POST',{text:'a'.repeat(130*1024)}),env,noCall)).status,413);
 const result=await gateway(request('submissions/typed','POST',{text:'বাংলা'.repeat(100)}),env,(async()=>Response.json({status:'AWAITING_UNDERSTANDING'},{status:201})) as typeof fetch);
 assert.equal(result.status,201);
});
test('PDF is private attachment and upstream content type is verified',async()=>{
 const path='reports/assessments/12345678-1234-1234-1234-123456789012/pdf';
 const good=await gateway(request(path),env,(async()=>new Response('%PDF-test',{headers:{'Content-Type':'application/pdf','Content-Language':'bn-BD'}})) as typeof fetch);
 assert.equal(good.status,200);assert.equal(good.headers.get('content-language'),'bn-BD');
 assert.equal(good.headers.get('content-disposition'),'attachment; filename="writing-report-bn-12345678.pdf"');
 assert.equal(await good.text(),'%PDF-test');
 const english=await gateway(request(path),env,(async()=>new Response('%PDF-test',{headers:{'Content-Type':'application/pdf','Content-Language':'en'}})) as typeof fetch);
 assert.equal(english.headers.get('content-disposition'),'attachment; filename="writing-report-en-12345678.pdf"');
 assert.equal((await gateway(request(path),env,(async()=>new Response('%PDF-test',{headers:{'Content-Type':'application/pdf'}})) as typeof fetch)).status,502);
 assert.equal((await gateway(request(path),env,(async()=>new Response('%PDF-test',{headers:{'Content-Type':'application/pdf','Content-Language':'fr'}})) as typeof fetch)).status,502);
 assert.equal((await gateway(request(path),env,(async()=>new Response('<html>error</html>')) as typeof fetch)).status,502);
});
test('accessible report snapshot is private JSON with verified language metadata',async()=>{
 const path='reports/assessments/12345678-1234-1234-1234-123456789012/snapshot';
 const good=await gateway(request(path),env,(async()=>Response.json({schemaVersion:'rubric-report-v2'},
  {headers:{'Content-Language':'bn-BD'}})) as typeof fetch);
 assert.equal(good.status,200);assert.equal(good.headers.get('content-language'),'bn-BD');
 assert.equal(good.headers.get('cache-control'),'private, no-store, max-age=0');
 assert.equal(good.headers.get('content-type'),'application/json');
 assert.deepEqual(await good.json(),{schemaVersion:'rubric-report-v2'});
 assert.equal((await gateway(request(path),env,(async()=>Response.json({},
  {headers:{'Content-Language':'en'}})) as typeof fetch)).status,200);
 assert.equal((await gateway(request(path),env,(async()=>Response.json({},
  {headers:{'Content-Language':'fr'}})) as typeof fetch)).status,502);
 assert.equal((await gateway(request(path),env,(async()=>new Response('<html>bad</html>',
  {headers:{'Content-Type':'text/html','Content-Language':'en'}})) as typeof fetch)).status,502);
});
test('logout clears both cookies even when upstream fails; absent cookies require sign-in',async()=>{
 const failed=await gateway(request('auth/logout','POST'),env,(async()=>{throw Error('private network diagnostic');}) as typeof fetch);
 assert.equal(failed.status,503);assert.equal(failed.headers.getSetCookie().length,2);assert.ok(failed.headers.getSetCookie().every(x=>x.includes('Max-Age=0')));
 assert.equal((await gateway(request('submissions/mine','GET',{}, {Cookie:''}),env,noCall)).status,401);
});
test('production requires configured HTTPS public origin and sets host-only secure cookies',async()=>{
 assert.equal((await gateway(request('auth/me'),{NODE_ENV:'production'},noCall)).status,503);
 const prod={...env,NODE_ENV:'production',WEB_PUBLIC_ORIGIN:'https://writing.example.test'};
 const result=await gateway(request('auth/login','POST',{}, {Origin:prod.WEB_PUBLIC_ORIGIN,Cookie:''}),prod,(async()=>auth()) as typeof fetch);
 assert.equal(result.status,200);assert.ok(result.headers.getSetCookie().every(x=>x.startsWith('__Host-')&&x.includes('; Secure')&&!x.includes('Domain=')));
});

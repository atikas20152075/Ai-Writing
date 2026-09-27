/** Fixed-upstream BFF. NestJS remains the authority for sessions, roles and records. */
const uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const reads=[/^academic\/cohorts\/mine$/,/^auth\/me$/,/^submissions\/mine(?:\/writing-options)?$/,
 new RegExp(`^assessments/mine/${uuid}/(?:result|learning|projections)$`),
 /^parents\/me\/children\/assessments$/,
 new RegExp(`^parents/me/children/${uuid}/assessments/${uuid}/result$`),
 new RegExp(`^academic/cohorts/${uuid}/assessments$`),
 /^review-cases$/,
 new RegExp(`^review-cases/${uuid}$`),
 new RegExp(`^reports/assessments/${uuid}/pdf$`)];
const cursorRoutes=[/^parents\/me\/children\/assessments$/,new RegExp(`^academic/cohorts/${uuid}/assessments$`)];
const safeHeaders={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Vary':'Cookie'};
type Env=Record<string,string|undefined>;
class GatewayFailure extends Error {status:number;constructor(status:number){super('Gateway request failed');this.status=status;}}
function json(value:unknown,status=200){return Response.json(value,{status,headers:safeHeaders});}
function config(env:Env){
 const origin=new URL(env.WEB_PUBLIC_ORIGIN??'http://localhost:3000');
 const upstream=new URL(env.WRITING_API_URL??'http://127.0.0.1:3001/api/v1');
 if(origin.origin!==origin.href.replace(/\/$/,'')||origin.username||origin.password||upstream.username||upstream.password||upstream.search||upstream.hash)
  throw new GatewayFailure(503);
 if(!['http:','https:'].includes(upstream.protocol)||!['http:','https:'].includes(origin.protocol))throw new GatewayFailure(503);
 if(env.NODE_ENV==='production'&&(!env.WEB_PUBLIC_ORIGIN||!env.WRITING_API_URL||origin.protocol!=='https:'))throw new GatewayFailure(503);
 const secure=origin.protocol==='https:';
 return {origin:origin.origin,base:upstream.href.replace(/\/$/,''),secure,
  access:secure?'__Host-writing_access':'writing_access',refresh:secure?'__Host-writing_refresh':'writing_refresh'};
}
function cookie(request:Request,name:string){
 const pairs=(request.headers.get('cookie')??'').split(';').map(x=>x.trim());
 const values=pairs.filter(x=>x.startsWith(name+'=')).map(x=>x.slice(name.length+1));
 if(values.length!==1||!/^[-A-Za-z0-9_.]+$/.test(values[0]))return undefined;
 return values[0];
}
async function boundedBody(stream:ReadableStream<Uint8Array>|null,limit:number){
 if(!stream)return new Uint8Array();
 const reader=stream.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;
  size+=part.value.length;if(size>limit){await reader.cancel();throw new GatewayFailure(413);}chunks.push(part.value);
 }}finally{reader.releaseLock();}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
function setSession(response:Response,cfg:ReturnType<typeof config>,access:string,refresh:string){
 for(const [name,value,maxAge] of [[cfg.access,access,900],[cfg.refresh,refresh,2592000]] as const)
  response.headers.append('Set-Cookie',`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cfg.secure?'; Secure':''}`);
}
function clearSession(response:Response,cfg:ReturnType<typeof config>){
 for(const name of [cfg.access,cfg.refresh])response.headers.append('Set-Cookie',`${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cfg.secure?'; Secure':''}`);
 return response;
}
export async function gateway(request:Request,env:Env=process.env,transport:typeof fetch=fetch):Promise<Response>{
 let cfg:ReturnType<typeof config>|undefined;
 let path='';
 try{
  cfg=config(env);const url=new URL(request.url);
  path=url.pathname.replace(/^\/api\/portal\//,'');
  const method=request.method;
  if(!['GET','POST'].includes(method))return json({error:'Method unavailable'},405);
  const allowed=method==='GET'?reads.some(x=>x.test(path)):
   ['auth/login','auth/session','auth/logout','submissions/typed','submissions/rewrites'].includes(path)||
   new RegExp(`^review-cases/${uuid}/(?:proposals|decisions)$`).test(path);
  if(!allowed)return json({error:'Route unavailable'},404);
  // Custom header requires a CORS preflight cross-origin; no CORS permission is emitted.
  if(request.headers.get('x-writing-client')!=='portal'||
    (request.headers.has('origin')&&request.headers.get('origin')!==cfg.origin)||
    (request.headers.has('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin')||
    (method==='POST'&&request.headers.get('origin')!==cfg.origin))return json({error:'Origin rejected'},403);
  const query=[...url.searchParams];
  if(query.length){
   const validCursor=query.length===1&&query[0][0]==='cursor'&&cursorRoutes.some(x=>x.test(path))&&new RegExp(`^${uuid}$`).test(query[0][1]);
   const validQueue=query.length===1&&query[0][0]==='batchId'&&path==='review-cases'&&new RegExp(`^${uuid}$`).test(query[0][1]);
   if(!validCursor&&!validQueue)return json({error:'Invalid query'},400);
  }
  let body:string|undefined;
  if(method==='POST'){
   if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return json({error:'JSON required'},415);
   const bytes=await boundedBody(request.body,128*1024);
   try{const parsed=JSON.parse(new TextDecoder().decode(bytes));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();body=JSON.stringify(parsed);}catch{return json({error:'Invalid request'},400);}
  }
  let access=cookie(request,cfg.access);let refresh=cookie(request,cfg.refresh);
  const call=(target:string,verb='GET',payload?:string)=>transport(cfg!.base+'/'+target,{method:verb,
   headers:{Origin:cfg!.origin,...(access?{Authorization:'Bearer '+access}:{}),
    ...(target==='auth/refresh'&&refresh?{Cookie:'writing_refresh='+refresh}:{}),
    ...(payload!==undefined?{'Content-Type':'application/json'}:{})},
   body:payload,cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000)});
  const readJSON=async(response:Response)=>{
   const bytes=await boundedBody(response.body,2*1024*1024);
   try{return JSON.parse(new TextDecoder().decode(bytes)) as Record<string,unknown>;}catch{throw new GatewayFailure(502);}
  };
  const rotate=async(target:'auth/login'|'auth/refresh')=>{
   const response=await call(target,'POST',target==='auth/login'?body:'{}');
   if(!response.ok)throw new GatewayFailure(response.status===429?429:response.status>=500?503:401);
   const data=await readJSON(response);
   const raw=response.headers.get('set-cookie')??'';
   const nextRefresh=raw.match(/(?:^|,\s*)writing_refresh=([-A-Za-z0-9_]+)(?:;|$)/)?.[1];
   if(typeof data.accessToken!=='string'||!/^[-A-Za-z0-9_.]+$/.test(data.accessToken)||!nextRefresh)throw new GatewayFailure(502);
   access=data.accessToken;refresh=nextRefresh;
  };
  if(path==='auth/login'){
   // Avoid leaving the previous tab session live on an account switch.
   if(access)await call('auth/logout','POST','{}');
   await rotate('auth/login');
   const response=json({authenticated:true});setSession(response,cfg,access!,refresh!);return response;
  }
  if(path==='auth/session'){
   let me=access?await call('auth/me'):undefined;let rotated=false;
   if(!me||me.status===401){if(!refresh)throw new GatewayFailure(401);await rotate('auth/refresh');rotated=true;me=await call('auth/me');}
   if(!me.ok)throw new GatewayFailure(me.status===401?401:503);
   const data=await readJSON(me);
   if(typeof data.userId!=='string'||typeof data.role!=='string')throw new GatewayFailure(502);
   const response=json({userId:data.userId,role:data.role});
   if(rotated)setSession(response,cfg,access!,refresh!);return response;
  }
  if(path==='auth/logout'){
   if(!access&&refresh)await rotate('auth/refresh');
   let upstream=access?await call('auth/logout','POST','{}'):undefined;
   if(upstream?.status===401&&refresh){await rotate('auth/refresh');upstream=await call('auth/logout','POST','{}');}
   const confirmed=!upstream||upstream.ok||upstream.status===401;
   return clearSession(json({loggedOut:true,serverRevocationConfirmed:confirmed},confirmed?200:503),cfg);
  }
  if(!access)return json({error:'Sign in required'},401);
  const upstream=await call(path+url.search,method,body);
  if(!upstream.ok)return json({error:upstream.status===401?'Sign in required':'Record or operation unavailable'},[400,401,403,404,409,413,429].includes(upstream.status)?upstream.status:502);
  // Never forward upstream cookies, redirects, internal diagnostics, or arbitrary headers.
  const pdf=path.startsWith('reports/');
  const bytes=await boundedBody(upstream.body,pdf?5*1024*1024:2*1024*1024);
  if(pdf&&!upstream.headers.get('content-type')?.startsWith('application/pdf'))throw new GatewayFailure(502);
  return new Response(bytes,{status:upstream.status,headers:{...safeHeaders,'Content-Type':pdf?'application/pdf':'application/json',
   ...(pdf?{'Content-Disposition':`attachment; filename="writing-report-${path.split('/')[2].slice(0,8)}.pdf"`}:{})}});
 }catch(error){
  const status=error instanceof GatewayFailure?error.status:503;
  const response=json({error:status===401?'Sign in required':status===429?'Please try again later':'Service unavailable'},status);
  return cfg&&(path==='auth/logout'||(path==='auth/session'&&status===401))?clearSession(response,cfg):response;
 }
}

// Test-only upstream; never import this file into the application.
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
if(process.env.WRITING_SYNTHETIC_E2E!=='1')throw Error('Synthetic fixture acknowledgement required');
const sessions=new Map(),refreshes=new Map();
const id='11111111-1111-4111-8111-111111111111',pending='22222222-2222-4222-8222-222222222222';
const student='33333333-3333-4333-8333-333333333333',batch='44444444-4444-4444-8444-444444444444';
const program='55555555-5555-4555-8555-555555555555',topic='66666666-6666-4666-8666-666666666666';
const result={assessmentId:id,status:'FINALIZED',result:{revisionId:id,revisionNo:1,source:'HUMAN',totalScore:'6',totalMarks:'10',factorResults:[{factorId:'content',criterionId:'supported',proposedScore:'6',rationale:'Synthetic approved fixture: relevant ideas with room for development.',evidence:[{exactQuote:'I enjoy reading.',claim:'Synthetic evidence fixture.'}]}]}};
const approved={assessmentId:id,studentId:student,programId:program,topicTitle:'The joy of reading · synthetic fixture',status:'FINALIZED',effectiveRevisionId:id,revisionNo:1,resultSource:'HUMAN',totalScore:'6',totalMarks:'10'};
const awaiting={assessmentId:pending,studentId:student,programId:program,topicTitle:'A new attempt · synthetic fixture',status:'AWAITING_UNDERSTANDING',effectiveRevisionId:null,totalScore:null,totalMarks:null};
function issue(role){const access='access-'+randomUUID(),refresh='refresh-'+randomUUID();sessions.set(access,role);refreshes.set(refresh,{role,access});return {access,refresh};}
createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3011'),path=url.pathname.replace('/api/v1/','');
 const send=(data,status=200,headers={})=>{res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(data));};
 if(path==='health'){send({synthetic:true});return;}
 let body='';for await(const chunk of req)body+=chunk;let data;try{data=body?JSON.parse(body):{};}catch{send({},400);return;}
 const token=req.headers.authorization?.replace('Bearer ',''),role=sessions.get(token);
 if(path==='auth/login'){
  if(data.password!=='synthetic-pass'){send({},401);return;}
  const loginRole={'student@example.test':'STUDENT','parent@example.test':'PARENT','teacher@example.test':'TEACHER','admin@example.test':'SUPER_ADMIN'}[data.email];
  if(!loginRole){send({},401);return;}const next=issue(loginRole);send({accessToken:next.access},200,{'Set-Cookie':`writing_refresh=${next.refresh}; Path=/api/v1/auth; HttpOnly`});return;
 }
 if(path==='auth/refresh'){
  const refresh=req.headers.cookie?.replace('writing_refresh=','');const old=refreshes.get(refresh);
  if(!old){send({},401);return;}refreshes.delete(refresh);sessions.delete(old.access);const next=issue(old.role);send({accessToken:next.access},200,{'Set-Cookie':`writing_refresh=${next.refresh}; Path=/api/v1/auth; HttpOnly`});return;
 }
 if(!role){send({},401);return;}
 if(path==='auth/me'){send({userId:student,role});return;}
 if(path==='auth/logout'){sessions.delete(token);for(const [key,s] of refreshes)if(s.access===token)refreshes.delete(key);send({loggedOut:true});return;}
 if(path==='submissions/mine'&&role==='STUDENT'){send([{id:pending,programId:program,batchId:batch,topicVersionId:topic,topicTitle:'A new attempt · synthetic fixture',rewriteOfAssessmentId:null,rewriteOfRevisionId:null,createdAt:'2026-09-27T00:00:00Z',assessment:{id:pending,status:'AWAITING_UNDERSTANDING',effectiveResult:null}},{id,programId:program,batchId:batch,topicVersionId:topic,topicTitle:'The joy of reading · synthetic fixture',rewriteOfAssessmentId:null,rewriteOfRevisionId:null,createdAt:'2026-09-26T00:00:00Z',assessment:{id,status:'FINALIZED',effectiveResult:{revisionId:id,revisionNo:1,source:'HUMAN',totalScore:'6',totalMarks:'10'}}}]);return;}
 if(path==='submissions/mine/writing-options'&&role==='STUDENT'){send({options:[{programId:program,batchId:batch,topicVersionId:topic,title:'The joy of reading',language:'ENGLISH',programName:'Guided writing',batchName:'Cadet writers',instructions:'Describe a book you enjoy and explain what reading means to you.',clues:['Your favourite book','What you learn','Why you enjoy it']}],truncated:false});return;}
 if(path==='submissions/typed'&&role==='STUDENT'){if(data.text.length<10||!data.clientRequestId){send({},400);return;}send({submissionId:pending,assessmentId:pending,status:'AWAITING_UNDERSTANDING'},201);return;}
 if(path===`assessments/mine/${id}/result`&&role==='STUDENT'){send(result);return;}
 if(path===`assessments/mine/${id}/learning`&&role==='STUDENT'){send({assessmentId:id,assessmentStatus:'FINALIZED',effectiveRevisionId:id,
  projections:[{target:'FEEDBACK',availability:'CURRENT'},{target:'PRACTICE',availability:'CURRENT'},{target:'PROGRESS',availability:'CURRENT'}],
  learning:{feedback:{schemaVersion:'rubric-feedback-v1',revisionId:id,disclaimer:'Approved rubric-linked observations, synthetic only.',
    factors:[{factorId:'content',name:'Content',score:'6',maxScore:'10',criterionDescription:'Relevant reading ideas.',rationale:'Synthetic approved fixture: relevant ideas with room for development.',evidence:[{exactQuote:'I enjoy reading.',claim:'Synthetic evidence fixture.'}]}]},
    practice:{schemaVersion:'rubric-practice-targets-v1',revisionId:id,disclaimer:'Rubric-linked practice objective, synthetic only.',
      targets:[{factorId:'content',factorName:'Content',missedPoints:'4',objective:'Revise your writing with attention to Content.',selectedCriterion:'Relevant reading ideas.',originalEvidence:[]}]},
    progress:{schemaVersion:'comparable-progress-v1',revisionId:id,status:'INSUFFICIENT_DATA',comparableCount:1,scoreDelta:null,
      disclaimer:'Descriptive only.',displayedPoints:[]}}});return;}
 if(path===`assessments/mine/${pending}/result`&&role==='STUDENT'){send({assessmentId:pending,status:'AWAITING_UNDERSTANDING',result:null});return;}
 if(path==='parents/me/children/assessments'&&role==='PARENT'){send({assessments:[url.searchParams.has('cursor')?awaiting:approved],nextCursor:url.searchParams.has('cursor')?null:id});return;}
 if(path===`parents/me/children/${student}/assessments/${id}/result`&&role==='PARENT'){send(result);return;}
 if(path==='academic/cohorts/mine'&&role==='TEACHER'){send({cohorts:[{id:batch,name:'Cadet writers',programName:'Guided writing'}],truncated:false});return;}
 if(path===`academic/cohorts/${batch}/assessments`&&role==='TEACHER'){send({assessments:[approved],nextCursor:null});return;}
 if(path===`reports/assessments/${id}/pdf`&&role!=='SUPER_ADMIN'){res.writeHead(200,{'Content-Type':'application/pdf','Content-Language':'en'});res.end('%PDF-1.4\nSynthetic transport fixture, not an academic report.\n%%EOF');return;}
 send({},404);
}).listen(3011,'127.0.0.1');

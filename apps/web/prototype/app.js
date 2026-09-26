import {RequestScope,StaleRequestError} from './request-scope.js';
/* Dependency-free Step93 preview. Never store bearer credentials in browser storage. */
const API='http://localhost:3001/api/v1'; // Development only. Production requires same-origin reverse proxy.
let token=null, currentRole=null, writingOptions=[], pendingRequestId=null;
let parentCursor=null,cohortCursor=null,activeBatch=null;
const requests=new RequestScope();
let authBusy=true,authSequence=0;
function endAuth(sequence){if(sequence===authSequence){authBusy=false;el('loginButton').disabled=false;}}
function showError(error){if(!(error instanceof StaleRequestError))notice(error.message,true);}
const el=id=>document.getElementById(id);
function notice(message,error=false){const n=el('notice');n.hidden=!message;n.classList.toggle('error',error);n.textContent=message||'';}
function clear(node){node.replaceChildren();}
function item(parent,tag,value,className){const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;parent.append(node);return node;}
function checkUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);}
async function api(path,{method='GET',data=null,asBlob=false,allowAnonymous=false,channel}={}){
 const current=requests.capture(channel);
 const headers={};if(token&&!allowAnonymous)headers.Authorization='Bearer '+token;
 if(data!==null)headers['Content-Type']='application/json';
 let response;
 try{response=await fetch(API+path,{method,headers,credentials:'include',cache:'no-store',signal:AbortSignal.timeout(15000),body:data===null?undefined:JSON.stringify(data)});}
 catch{current();throw new Error('API unavailable. Start the authorized local backend first.');}
 current();
 if(!response.ok){if(response.status===401&&!allowAnonymous)lock();
   throw new Error(response.status===403||response.status===404?'This record is unavailable to your current account.':
    response.status===429?'Too many requests. Please try again later.':
    response.status===409&&asBlob?'This report cannot be exported yet. English printable reports only; your score remains available here.':'Request failed ('+response.status+').');}
 let body;
 try{body=await (asBlob?response.blob():response.json());}
 catch{current();throw new Error('The response could not be read. Please refresh.');}
 current();return body;
}
function lock(){
 requests.invalidate();token=null;currentRole=null;el('workspace').hidden=true;el('signin').hidden=false;
 for(const id of ['student','teacher','parent','admin'])el(id).hidden=true;
 clear(el('submissions'));clear(el('studentResult'));clear(el('cohort'));clear(el('parentAssessments'));clear(el('parentResult'));
 parentCursor=null;cohortCursor=null;activeBatch=null;el('parentNext').hidden=true;el('cohortNext').hidden=true;el('batchId').value='';
 el('writingText').disabled=false;el('writingOption').disabled=false;el('submitWriting').disabled=false;el('writingCount').textContent='0 characters';
 writingOptions=[];pendingRequestId=null;clear(el('writingOption'));el('writingText').value='';el('writingPrompt').textContent='Select a topic to view the instructions.';
}
async function openPortal(accessToken){
 token=accessToken;const me=await api('/auth/me');currentRole=me.role;
 el('signin').hidden=true;el('workspace').hidden=false;el('roleLabel').textContent=currentRole.replaceAll('_',' ');
 const area=currentRole==='STUDENT'?'student':currentRole==='TEACHER'||currentRole==='ACADEMIC_ADMIN'?'teacher':
  currentRole==='PARENT'?'parent':'admin';
 for(const id of ['student','teacher','parent','admin'])el(id).hidden=id!==area;
 if(area==='student'){await Promise.all([studentSubmissions(),loadWritingOptions()]);}
 if(area==='parent')await parentAssessments();
}
async function loadWritingOptions(){
 const select=el('writingOption');clear(select);writingOptions=[];
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a published topic';select.append(placeholder);
 try{
  const response=await api('/submissions/mine/writing-options',{channel:'topics'});
  writingOptions=Array.isArray(response.options)?response.options:[];
  for(const option of writingOptions){
   if(!checkUuid(option.programId)||!checkUuid(option.batchId)||!checkUuid(option.topicVersionId))continue;
   const element=document.createElement('option');
   element.value=option.topicVersionId+'|'+option.batchId+'|'+option.programId;
   element.textContent=option.programName+' / '+option.batchName+' — '+option.title+' ('+option.language+')';
   select.append(element);
  }
  if(select.options.length===1)placeholder.textContent='No currently authorized published topics';
  if(response.truncated)notice('Only the first 100 authorized options are shown.');
 }catch(error){if(!(error instanceof StaleRequestError)){placeholder.textContent='Topics unavailable';showError(error);}}
}
el('writingOption').addEventListener('change',()=>{
 pendingRequestId=null;
 const raw=el('writingOption').value;
 const option=writingOptions.find(o=>[o.topicVersionId,o.batchId,o.programId].join('|')===raw);
 const prompt=el('writingPrompt');clear(prompt);
 if(!option){prompt.textContent='Select a topic to view the instructions.';return;}
 item(prompt,'strong',option.title+' · '+option.language);
 item(prompt,'p',option.instructions);
 if(Array.isArray(option.clues)&&option.clues.length){
  const list=document.createElement('ul');
  for(const clue of option.clues.slice(0,30))item(list,'li',typeof clue==='string'?clue:'See your teacher for the detailed clue.');
  prompt.append(list);
 }
});
el('writingText').addEventListener('input',()=>{
 pendingRequestId=null;
 const text=el('writingText').value;
 el('writingCount').textContent=text.length+' characters · '+(text.trim()?text.trim().split(/\s+/u).length:0)+' whitespace-separated words';
});
el('writingForm').addEventListener('submit',async event=>{
 event.preventDefault();notice('');
 const option=writingOptions.find(o=>[o.topicVersionId,o.batchId,o.programId].join('|')===el('writingOption').value);
 const text=el('writingText').value;
 if(!option){notice('Select a currently available topic.',true);return;}
 if(text.trim().length<10||text.length>24000){notice('Writing must contain 10–24,000 characters.',true);return;}
 const button=el('submitWriting');button.disabled=true;
 el('writingText').disabled=true;el('writingOption').disabled=true;
 const current=requests.capture();
 try{
  const submitted=await api('/submissions/typed',{method:'POST',data:{
   programId:option.programId,batchId:option.batchId,topicVersionId:option.topicVersionId,
   clientRequestId:(pendingRequestId??=crypto.randomUUID()),text}});
  el('writingText').value='';pendingRequestId=null;el('writingCount').textContent='0 characters';
  await studentSubmissions();current();
  notice('Submission '+submitted.submissionId.slice(0,8)+' accepted. Assessment status: '+submitted.status+'. No score is assumed.');
 }catch(error){showError(error);}
 finally{try{current();button.disabled=false;el('writingText').disabled=false;el('writingOption').disabled=false;}catch{}}
});

async function studentSubmissions(){
 notice('');requests.capture('student-result');const target=el('submissions');clear(target);clear(el('studentResult'));
 try{const rows=await api('/submissions/mine',{channel:'submissions'});
   if(!Array.isArray(rows)||rows.length===0){item(target,'p','No submitted writing appears in this account.');return;}
   for(const row of rows){
    const card=item(target,'article','','record');
    item(card,'strong','Submission '+row.id.slice(0,8));
    item(card,'p','Assessment status: '+(row.assessment?.status??'UNAVAILABLE'),'meta');
    item(card,'p','Submitted: '+new Date(row.createdAt).toLocaleDateString(),'meta');
    if(row.assessment?.id){
     const btn=item(card,'button','View authorized result');btn.type='button';
     btn.addEventListener('click',()=>studentResult(row.assessment.id));
    }
   }
 }catch(error){showError(error);}
}
function renderResult(panel,data,id){
 const card=item(panel,'article','','record');
 item(card,'strong','Assessment '+data.assessmentId.slice(0,8));
 if(data.status!=='FINALIZED'||!data.result){item(card,'p','Current processing status: '+data.status+'. No finalized score is available.');return;}
 const r=data.result;
 item(card,'p','Approved score: '+r.totalScore+' / '+r.totalMarks);
 item(card,'p','Current revision: '+r.revisionNo+' ('+r.source+')','meta');
 if(Array.isArray(r.factorResults))for(const f of r.factorResults){
  item(card,'p',String(f.factorId??'Factor')+': '+String(f.proposedScore??'—')+' ('+String(f.criterionId??'criterion unavailable')+')');
 }
 const btn=item(card,'button','Download current English PDF','secondary');btn.type='button';
 btn.addEventListener('click',()=>downloadPdf(id));
}
async function studentResult(id){
 const panel=el('studentResult');clear(panel);
 if(!checkUuid(id)){notice('Invalid assessment ID.',true);return;}
 try{renderResult(panel,await api('/assessments/mine/'+encodeURIComponent(id)+'/result',{channel:'student-result'}),id);}
 catch(error){showError(error);}
}
async function parentResult(studentId,id){
 const panel=el('parentResult');clear(panel);
 if(!checkUuid(id)||!checkUuid(studentId)){notice('Invalid record ID.',true);return;}
 try{renderResult(panel,await api('/parents/me/children/'+encodeURIComponent(studentId)+'/assessments/'+encodeURIComponent(id)+'/result',{channel:'parent-result'}),id);}
 catch(error){showError(error);}
}
async function parentAssessments(cursor=null){
 const target=el('parentAssessments');clear(target);clear(el('parentResult'));notice('');
 requests.capture('parent-result');parentCursor=null;el('parentNext').hidden=true;
 try{
  const page=await api('/parents/me/children/assessments'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{channel:'parent-list'});
  if(!page.assessments?.length)item(target,'p','No assessments are available through your current verified family links.');
  for(const row of page.assessments??[]){
   const card=item(target,'article','','record');item(card,'strong',row.topicTitle||'Writing assessment');
   item(card,'p','Student '+row.studentId.slice(0,8)+' · Program '+row.programId.slice(0,8),'meta');
   item(card,'p','Status: '+row.status,'meta');
   item(card,'p',row.effectiveRevisionId?'Current approved score: '+row.totalScore+' / '+row.totalMarks:'No finalized score yet.');
   const button=item(card,'button','View current result','secondary');button.type='button';
   button.addEventListener('click',()=>parentResult(row.studentId,row.assessmentId));
  }
  parentCursor=page.nextCursor;el('parentNext').hidden=!parentCursor;
 }catch(error){showError(error);}
}
async function downloadPdf(id){
 if(!checkUuid(id)){notice('Invalid assessment ID.',true);return;}
 try{
  const blob=await api('/reports/assessments/'+encodeURIComponent(id)+'/pdf',{asBlob:true,channel:'pdf'});
  const url=URL.createObjectURL(blob);const anchor=document.createElement('a');
  anchor.href=url;anchor.download='writing-report-'+id.slice(0,8)+'.pdf';anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);notice('Current authorized report prepared. Historical PDFs cannot be revoked after download.');
 }catch(error){showError(error);}
}
el('loginForm').addEventListener('submit',async event=>{
 event.preventDefault();if(authBusy)return;authBusy=true;const sequence=++authSequence;requests.invalidate();
 const button=el('loginButton');button.disabled=true;notice('');
 try{const data=await api('/auth/login',{method:'POST',
   data:{email:el('email').value.trim(),password:el('password').value},allowAnonymous:true});
  el('password').value='';await openPortal(data.accessToken);
 }catch(error){if(!(error instanceof StaleRequestError)){lock();showError(error);}}
 finally{endAuth(sequence);}
});
el('logout').addEventListener('click',()=>{
 authBusy=true;const sequence=++authSequence;el('loginButton').disabled=true;
 // Send revocation with the old token, then hide and clear private data immediately.
 const revocation=token?api('/auth/logout',{method:'POST'}):Promise.resolve();
 lock();el('password').value='';notice('Signed out on this tab.');
 revocation.catch(()=>{}).finally(()=>endAuth(sequence));
});
el('refreshStudent').addEventListener('click',studentSubmissions);
el('refreshParent').addEventListener('click',()=>parentAssessments());
el('parentNext').addEventListener('click',()=>{if(parentCursor)parentAssessments(parentCursor);});
el('cohortNext').addEventListener('click',()=>{if(cohortCursor&&activeBatch)loadCohort(activeBatch,cohortCursor);});
el('cohortForm').addEventListener('submit',async event=>{
 event.preventDefault();notice('');const id=el('batchId').value.trim();
 if(!checkUuid(id)){notice('Enter a valid assigned batch UUID.',true);return;}
 await loadCohort(id);
});
async function loadCohort(id,cursor=null){
 const target=el('cohort');clear(target);cohortCursor=null;activeBatch=id;el('cohortNext').hidden=true;
 try{const page=await api('/academic/cohorts/'+encodeURIComponent(id)+'/assessments'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{channel:'cohort'});
  if(!page.assessments?.length){item(target,'p','No currently authorized assessments in this cohort.');return;}
  for(const row of page.assessments){
   const card=item(target,'article','','record');item(card,'strong',row.topicTitle||'Assigned writing');
   item(card,'p','Assessment: '+row.assessmentId.slice(0,8),'meta');
   item(card,'p','Status: '+row.status+(row.reviewPending?' · Human review pending':''),'meta');
   if(row.effectiveRevisionId){
    item(card,'p','Current approved score: '+row.totalScore+' / '+row.totalMarks);
    const btn=item(card,'button','Request current English report');btn.type='button';btn.className='secondary';
    btn.addEventListener('click',()=>downloadPdf(row.assessmentId));
   }else item(card,'p','No finalized score yet.');
  }
  cohortCursor=page.nextCursor;el('cohortNext').hidden=!cohortCursor;
 }catch(error){showError(error);}
}
// Refresh tokens stay in HttpOnly cookies and access tokens exist only in this tab memory.
el('loginButton').disabled=true;
const startupSequence=++authSequence;
api('/auth/refresh',{method:'POST',allowAnonymous:true}).then(x=>openPortal(x.accessToken))
 .catch(error=>{if(!(error instanceof StaleRequestError))lock();})
 .finally(()=>endAuth(startupSequence));

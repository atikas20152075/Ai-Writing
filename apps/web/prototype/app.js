/* Dependency-free Step93 preview. Never store bearer credentials in browser storage. */
const API='http://localhost:3001/api/v1'; // Development only. Production requires same-origin reverse proxy.
let token=null, currentRole=null;
const el=id=>document.getElementById(id);
function notice(message,error=false){const n=el('notice');n.hidden=!message;n.classList.toggle('error',error);n.textContent=message||'';}
function clear(node){node.replaceChildren();}
function item(parent,tag,value,className){const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;parent.append(node);return node;}
function checkUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);}
async function api(path,{method='GET',data=null,asBlob=false,allowAnonymous=false}={}){
 const headers={};if(token&&!allowAnonymous)headers.Authorization='Bearer '+token;
 if(data!==null)headers['Content-Type']='application/json';
 let response;
 try{response=await fetch(API+path,{method,headers,credentials:'include',cache:'no-store',body:data===null?undefined:JSON.stringify(data)});}
 catch{throw new Error('API unavailable. Start the authorized local backend first.');}
 if(!response.ok){if(response.status===401&&!allowAnonymous)lock();
   throw new Error(response.status===403||response.status===404?'This record is unavailable to your current account.':
    response.status===429?'Too many requests. Please try again later.':'Request failed ('+response.status+').');}
 return asBlob?response.blob():response.json();
}
function lock(){
 token=null;currentRole=null;el('workspace').hidden=true;el('signin').hidden=false;
 for(const id of ['student','teacher','parent','admin'])el(id).hidden=true;
 clear(el('submissions'));clear(el('studentResult'));clear(el('cohort'));
}
async function openPortal(accessToken){
 token=accessToken;const me=await api('/auth/me');currentRole=me.role;
 el('signin').hidden=true;el('workspace').hidden=false;el('roleLabel').textContent=currentRole.replaceAll('_',' ');
 const area=currentRole==='STUDENT'?'student':currentRole==='TEACHER'||currentRole==='ACADEMIC_ADMIN'?'teacher':
  currentRole==='PARENT'?'parent':'admin';
 for(const id of ['student','teacher','parent','admin'])el(id).hidden=id!==area;
 if(area==='student')await studentSubmissions();
}
async function studentSubmissions(){
 notice('');const target=el('submissions');clear(target);clear(el('studentResult'));
 try{const rows=await api('/submissions/mine');
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
 }catch(error){notice(error.message,true);}
}
async function studentResult(id){
 const panel=el('studentResult');clear(panel);
 if(!checkUuid(id)){notice('Invalid assessment ID.',true);return;}
 try{
  const data=await api('/assessments/mine/'+encodeURIComponent(id)+'/result');
  const card=item(panel,'article','','record');
  item(card,'strong','Assessment '+data.assessmentId.slice(0,8));
  if(data.status!=='FINALIZED'||!data.result){item(card,'p','Current processing status: '+data.status+'. No finalized score is available.');return;}
  const r=data.result;
  item(card,'p','Approved score: '+r.totalScore+' / '+r.totalMarks);
  item(card,'p','Current revision: '+r.revisionNo+' ('+r.source+')','meta');
  item(card,'p','Factor-wise results are available in this current authorized record.','meta');
  if(Array.isArray(r.factorResults))for(const f of r.factorResults){
   const row=item(card,'p','');
   row.textContent=String(f.factorId??'Factor')+': '+String(f.proposedScore??'—')+
     ' ('+String(f.criterionId??'criterion unavailable')+')';
  }
  const btn=item(card,'button','Download current English PDF');btn.type='button';btn.className='secondary';
  btn.addEventListener('click',()=>downloadPdf(id));
 }catch(error){notice(error.message,true);}
}
async function downloadPdf(id){
 if(!checkUuid(id)){notice('Invalid assessment ID.',true);return;}
 try{
  const blob=await api('/reports/assessments/'+encodeURIComponent(id)+'/pdf',{asBlob:true});
  const url=URL.createObjectURL(blob);const anchor=document.createElement('a');
  anchor.href=url;anchor.download='writing-report-'+id.slice(0,8)+'.pdf';anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);notice('Current authorized report prepared. Historical PDFs cannot be revoked after download.');
 }catch(error){notice(error.message,true);}
}
el('loginForm').addEventListener('submit',async event=>{
 event.preventDefault();const button=el('loginButton');button.disabled=true;notice('');
 try{const data=await api('/auth/login',{method:'POST',
   data:{email:el('email').value.trim(),password:el('password').value},allowAnonymous:true});
  el('password').value='';await openPortal(data.accessToken);
 }catch(error){lock();notice(error.message,true);}finally{button.disabled=false;}
});
el('logout').addEventListener('click',async()=>{
 try{if(token)await api('/auth/logout',{method:'POST'});}
 catch{}finally{lock();el('password').value='';notice('Signed out.');}
});
el('refreshStudent').addEventListener('click',studentSubmissions);
el('cohortForm').addEventListener('submit',async event=>{
 event.preventDefault();notice('');const id=el('batchId').value.trim();
 if(!checkUuid(id)){notice('Enter a valid assigned batch UUID.',true);return;}
 const target=el('cohort');clear(target);
 try{const page=await api('/academic/cohorts/'+encodeURIComponent(id)+'/assessments');
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
  if(page.nextCursor)item(target,'p','Additional pages are available through the server API; pagination UI is pending.','meta');
 }catch(error){notice(error.message,true);}
});
// Refresh tokens stay in HttpOnly cookies and access tokens exist only in this tab memory.
api('/auth/refresh',{method:'POST',allowAnonymous:true}).then(x=>openPortal(x.accessToken))
 .catch(()=>lock());

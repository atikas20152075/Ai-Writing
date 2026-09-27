'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {PortalClient,Superseded,APIError,authLock,type Me,type Option,type Row,type Result,type Cohort,type Learning} from '../lib/client';
import {StudentLearning} from './student-learning';
type View='overview'|'write'|'results';
const validId=(s:string)=>/^[0-9a-f-]{36}$/i.test(s);
export default function Portal(){
 const client=useRef(new PortalClient());const channel=useRef<BroadcastChannel|null>(null);
 const mounted=useRef(false),authSequence=useRef(0),pendingId=useRef<string|null>(null);
 const [me,setMe]=useState<Me|null>(null),[busy,setBusy]=useState(true),[view,setView]=useState<View>('overview');
 const [notice,setNotice]=useState(''),[error,setError]=useState(false),[loading,setLoading]=useState(false);
 const [rows,setRows]=useState<Row[]>([]),[options,setOptions]=useState<Option[]>([]),[cohorts,setCohorts]=useState<Cohort[]>([]);
 const [selection,setSelection]=useState(''),[batch,setBatch]=useState(''),[cursor,setCursor]=useState<string|null>(null);
 const [text,setText]=useState(''),[submitting,setSubmitting]=useState(false),[result,setResult]=useState<Result|null>(null);
 const [learning,setLearning]=useState<Learning|null>(null),[learningLoading,setLearningLoading]=useState(false);
 const [resultRow,setResultRow]=useState<Row|null>(null),[rewriteSource,setRewriteSource]=useState<{assessmentId:string;revisionId:string;programId:string;batchId:string;topicVersionId:string}|null>(null);
 const [correctionNote,setCorrectionNote]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 function message(value:string,isError=false){setNotice(value);setError(isError);}
 function clear(){client.current.clear();setMe(null);setRows([]);setOptions([]);setCohorts([]);setResult(null);setResultRow(null);setLearning(null);setLearningLoading(false);setRewriteSource(null);setCorrectionNote('');setText('');setPassword('');setSelection('');setBatch('');setCursor(null);setLoading(false);setSubmitting(false);pendingId.current=null;setView('overview');}
 function fail(e:unknown){if(e instanceof Superseded||!mounted.current)return;if(e instanceof APIError&&e.status===401)clear();message(e instanceof Error?e.message:'Please try again.',true);}
 async function listing(user:Me,batchId='',next:string|null=null){
  const current=client.current.capture('list-operation');client.current.capture('result-view');client.current.capture('result');client.current.capture('learning');
  setRows([]);setResult(null);setResultRow(null);setLearning(null);setLearningLoading(false);setCursor(null);setLoading(true);
  try{
   const suffix=next?'?cursor='+encodeURIComponent(next):'';
   if(user.role==='STUDENT'){
    const data=await client.current.request<{id:string;createdAt:string;assessment:{id:string;status:string}|null;
      programId:string;batchId:string;topicVersionId:string;rewriteOfAssessmentId:string|null;rewriteOfRevisionId:string|null}[]>('submissions/mine',{channel:'list'});
    current();setRows(data.filter(x=>x.assessment).map(x=>({assessmentId:x.assessment!.id,status:x.assessment!.status,
      programId:x.programId,batchId:x.batchId,topicVersionId:x.topicVersionId,
      rewriteOfAssessmentId:x.rewriteOfAssessmentId,rewriteOfRevisionId:x.rewriteOfRevisionId,
      topicTitle:(x.rewriteOfAssessmentId?'Rewrite':'Writing submission')+' · '+new Date(x.createdAt).toLocaleDateString()})));
   }else if(user.role==='PARENT'||batchId){
    const path=user.role==='PARENT'?'parents/me/children/assessments':'academic/cohorts/'+batchId+'/assessments';
    const data=await client.current.request<{assessments:Row[];nextCursor:string|null}>(path+suffix,{channel:'list'});
    current();setRows(data.assessments);setCursor(data.nextCursor);
   }
  }catch(e){fail(e);}finally{try{current();setLoading(false);}catch{}}
 }
 async function load(user:Me){
  setMe(user);
  if(user.role==='STUDENT'){
   await Promise.all([listing(user),client.current.request<{options:Option[];truncated:boolean}>('submissions/mine/writing-options',{channel:'topics'}).then(data=>{setOptions(data.options);if(data.truncated)message('Showing the first 100 available topics.');})]);
  }else if(user.role==='PARENT')await listing(user);
  else if(['TEACHER','ACADEMIC_ADMIN'].includes(user.role)){
   const data=await client.current.request<{cohorts:Cohort[];truncated:boolean}>('academic/cohorts/mine',{channel:'cohorts'});
   setCohorts(data.cohorts);if(data.truncated)message('Showing the first 100 assigned cohorts.');
   if(data.cohorts[0]){setBatch(data.cohorts[0].id);await listing(user,data.cohorts[0].id);}
  }
 }
 useEffect(()=>{
  mounted.current=true;
  channel.current=new BroadcastChannel('writing-portal-session');
  channel.current.onmessage=()=>{authSequence.current++;clear();setBusy(false);message('Your session changed in another tab. Please sign in again.');};
  const sequence=++authSequence.current;
  const current=client.current.capture();
  authLock(async()=>{current();return client.current.request<Me>('auth/session',{body:{}});})
   .then(user=>{current();return load(user);})
   .catch(e=>{if(e instanceof Superseded)return;if(e instanceof APIError&&e.status===401){clear();return;}fail(e);})
   .finally(()=>{if(mounted.current&&sequence===authSequence.current)setBusy(false);});
  return ()=>{mounted.current=false;client.current.clear();channel.current?.close();};
 // Initial restoration intentionally runs only once per mount; fences cover StrictMode replay.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function login(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);message('');client.current.clear();const current=client.current.capture();const sequence=++authSequence.current;
  try{
   const user=await authLock(async()=>{
    current();await client.current.request('auth/login',{body:{email:email.trim(),password}});
    channel.current?.postMessage('changed');setPassword('');
    return client.current.request<Me>('auth/session',{body:{}});
   });current();await load(user);
  }catch(e){fail(e);}finally{if(sequence===authSequence.current)setBusy(false);}
 }
 async function logout(){
  const sequence=++authSequence.current;
  clear();const current=client.current.capture();setBusy(true);message('Signing out…');channel.current?.postMessage('changed');
  try{await authLock(()=>{current();return client.current.request('auth/logout',{body:{}});});current();message('You have signed out.');}
  catch(e){if(!(e instanceof Superseded))message('This tab is cleared. Server sign-out could not be confirmed; please retry when connected.',true);}
  finally{if(sequence===authSequence.current)setBusy(false);}
 }
 const selected=options.find(o=>[o.topicVersionId,o.batchId,o.programId].join('|')===selection);
 function freshWriting(){setRewriteSource(null);setCorrectionNote('');setSelection('');setText('');pendingId.current=null;setView('write');}
 function startRewrite(){
  if(!result?.result||!resultRow?.programId||!resultRow.batchId||!resultRow.topicVersionId||
    result.assessmentId!==resultRow.assessmentId||!learning||learning.effectiveRevisionId!==result.result.revisionId)return;
  const key=[resultRow.topicVersionId,resultRow.batchId,resultRow.programId].join('|');
  if(!options.some(o=>[o.topicVersionId,o.batchId,o.programId].join('|')===key)){
   message('This topic is no longer available for a linked rewrite. Choose a current topic for a new writing.',true);return;
  }
  setRewriteSource({assessmentId:result.assessmentId,revisionId:result.result.revisionId,
   programId:resultRow.programId,batchId:resultRow.batchId,topicVersionId:resultRow.topicVersionId});
  setSelection(key);setCorrectionNote('');setText('');pendingId.current=null;setView('write');message('Plan your correction, then write a fresh answer in your own words.');
 }
 async function submit(event:FormEvent){
  event.preventDefault();if(!selected||!me||submitting)return;
  if(text.trim().length<10||text.length>24000){message('Please write between 10 and 24,000 characters.',true);return;}
  if(rewriteSource&&(correctionNote.trim().length<20||correctionNote.length>2000)){
   message('Describe what you will correct in 20 to 2,000 characters.',true);return;
  }
  const current=client.current.capture();setSubmitting(true);message('');
  try{
   const body=rewriteSource?{sourceAssessmentId:rewriteSource.assessmentId,expectedRevisionId:rewriteSource.revisionId,
    correctionNote:correctionNote.trim(),text,clientRequestId:(pendingId.current??=crypto.randomUUID())}:
    {programId:selected.programId,batchId:selected.batchId,topicVersionId:selected.topicVersionId,text,clientRequestId:(pendingId.current??=crypto.randomUUID())};
   await client.current.request(rewriteSource?'submissions/rewrites':'submissions/typed',{body});
   setText('');setCorrectionNote('');setRewriteSource(null);pendingId.current=null;setView('results');await listing(me);current();
   message('Your writing was submitted. Your score will appear after the assessment is finalized.');
  }catch(e){fail(e);}finally{try{current();setSubmitting(false);}catch{}}
 }
 async function showResult(row:Row){
  if(!me||!validId(row.assessmentId))return;
  const current=client.current.capture('result-view');setResult(null);setResultRow(null);setLearning(null);setLearningLoading(false);message('');
  const path=me.role==='PARENT'?`parents/me/children/${row.studentId}/assessments/${row.assessmentId}/result`:`assessments/mine/${row.assessmentId}/result`;
  try{
   const data=await client.current.request<Result>(path,{channel:'result'});current();setResult(data);setResultRow(row);
   if(me.role==='STUDENT'&&data.result){
    setLearningLoading(true);
    const next=await client.current.request<Learning>(`assessments/mine/${row.assessmentId}/learning`,{channel:'learning'});
    current();
    if(next.effectiveRevisionId===data.result.revisionId)setLearning(next);
    else {setResult(null);setResultRow(null);message('The approved score changed. Refresh your assessments to see the latest revision.',true);}
   }
  }catch(e){fail(e);}finally{try{current();setLearningLoading(false);}catch{}}
 }
 async function download(id:string){
  try{const blob=await client.current.request<Blob>(`reports/assessments/${id}/pdf`,{pdf:true,channel:'pdf'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='writing-report-'+id.slice(0,8)+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   message('Your report is ready. It records the approved score at the time of download.');
  }catch(e){fail(e);}
 }
 const student=me?.role==='STUDENT',academic=me&&['TEACHER','ACADEMIC_ADMIN'].includes(me.role);
 const allowed=student||me?.role==='PARENT'||academic;
 return <div className="app"><a href="#main" className="skip">Skip to content</a>
  <aside className="sidebar"><a className="brand" href="/" aria-label="Writing Studio home"><span className="brand-icon">w<span>.</span></span><span>Writing<br/><strong>Studio</strong></span></a>
   <div className="academy">IDEAL CADET ACADEMY</div>
   <nav aria-label="Workspace navigation"><span className="nav-label">YOUR WORKSPACE</span>
    <button className={view==='overview'?'active':''} onClick={()=>setView('overview')} disabled={!me}><span aria-hidden="true">◈</span> Overview</button>
    {student&&<button className={view==='write'?'active':''} onClick={freshWriting}><span aria-hidden="true">✎</span> New writing</button>}
    {allowed&&<button className={view==='results'?'active':''} onClick={()=>setView('results')}><span aria-hidden="true">▤</span> Assessments</button>}
   </nav>
   <div className="side-note"><span className="spark">✦</span><h3>Small practice.<br/>Lasting progress.</h3><p>Think it through. Write it down. Make it better.</p><span className="pfcr-mini">P → F → C → R</span></div>
   <div className="side-bottom"><span className="status-dot"/> Development workspace</div>
  </aside>
  <div className="surface"><header className="topbar"><span>Learning workspace <span className="crumb">/ {view==='write'?'New writing':view==='results'?'Assessments':'Overview'}</span></span><div className="account"><span className="avatar">{me?.role[0]??'W'}</span><span>{me?me.role.replaceAll('_',' '):'Welcome'}</span>{me&&<button className="text-button" onClick={logout}>Sign out</button>}</div></header>
  <main id="main"><div className="notice" role="status" aria-live="polite" data-error={error} hidden={!notice}>{notice}</div>
   {!me?<section className="welcome"><div><span className="eyebrow">YOUR WORDS. YOUR POSSIBILITIES.</span><h1>Great writing starts<br/>with <em>your ideas.</em></h1><p>A quiet place to practise, understand your feedback, and make your next draft stronger.</p><div className="welcome-steps"><span>01 <b>Practice</b></span><span>02 <b>Reflect</b></span><span>03 <b>Rewrite</b></span></div><p className="development-note">Development access · Use synthetic accounts only.</p></div><form className="card login" onSubmit={login}><span className="eyebrow">LET’S BEGIN</span><h2>Welcome back</h2><p>Sign in to your private workspace.</p><label>Email address<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Opening workspace…':'Sign in'} <span aria-hidden="true">→</span></button><small>Your records are available only with current authorized access.</small></form></section>:<>
    <div className="page-heading"><div><span className="eyebrow">{student?'A LITTLE BETTER, EVERY DRAFT':me.role==='PARENT'?'FOLLOW THEIR WRITING JOURNEY':'YOUR ACADEMIC WORKSPACE'}</span><h1>{view==='write'?'Let your ideas take shape.':view==='results'?'Every attempt matters.':student?'Your next chapter starts here.':me.role==='PARENT'?'A window into their progress.':'Room for every learner.'}</h1><p>{student?'Write thoughtfully. Learn from approved feedback. Keep growing.':me.role==='PARENT'?'Current assessments from your verified family links.':'Review writing within your current academic assignments.'}</p></div>{student&&view!=='write'&&<button className="primary" onClick={freshWriting}>Start writing <span aria-hidden="true">↗</span></button>}</div>
    {view==='overview'&&<section className="journey" aria-label="PFCR learning method"><div className="journey-intro"><span className="eyebrow">THE PFCR METHOD</span><h2>One draft.<br/>Four ways to grow.</h2><p>Make improvement a habit.</p></div>{[['01','Practice','Put your own ideas into words.'],['02','Feedback','Read your approved assessment carefully.'],['03','Correction','Think through what you can improve.'],['04','Rewrite','Use what you learn in your next attempt.']].map(([n,t,d])=><div className="journey-step" key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></div>)}</section>}
    {view==='write'&&student?<section className="writing-layout"><form className="card editor" onSubmit={submit}><div className="section-heading"><div><span className="eyebrow">{rewriteSource?'LINKED REWRITE · CORRECTION PLAN':'YOUR ORIGINAL WORK'}</span><h2>{rewriteSource?'A fresh answer, guided by your plan.':'A fresh page, a fresh idea.'}</h2></div><span className="pill">Guided writing</span></div><label>Choose your topic<select required disabled={submitting||!!rewriteSource} value={selection} onChange={e=>{setSelection(e.target.value);pendingId.current=null;}}><option value="">{options.length?'Select a published topic':'No topics available yet'}</option>{options.map(o=><option key={[o.topicVersionId,o.batchId,o.programId].join('|')} value={[o.topicVersionId,o.batchId,o.programId].join('|')}>{o.title} · {o.language} · {o.batchName}</option>)}</select></label>{selected&&<div className="prompt"><strong>{selected.title}</strong><p>{selected.instructions}</p>{selected.clues?.length>0&&<ul>{selected.clues.map((c,i)=><li key={i}>{c}</li>)}</ul>}</div>}{rewriteSource&&<div className="correction-plan"><p>Linked to approved assessment {rewriteSource.assessmentId.slice(0,8)} · keep your own ideas and revise with purpose.</p><label>What will you correct?<textarea rows={4} minLength={20} maxLength={2000} required disabled={submitting} value={correctionNote} placeholder="Explain the idea, structure or language you will improve based on your feedback." onChange={e=>{setCorrectionNote(e.target.value);pendingId.current=null;}}/></label><button type="button" className="text-button" onClick={freshWriting} disabled={submitting}>Start unrelated writing instead</button></div>}<label>Your writing<textarea rows={13} minLength={10} maxLength={24000} required disabled={submitting} value={text} placeholder="Start with an idea. Let the next sentence follow…" onChange={e=>{setText(e.target.value);pendingId.current=null;}}/></label><div className="editor-footer"><span>{text.trim()?text.trim().split(/\s+/u).length:0} words <span className="dot">·</span> {text.length.toLocaleString()} / 24,000 characters</span><button className="primary" disabled={submitting||!selected}>{submitting?'Submitting…':rewriteSource?'Submit linked rewrite':'Submit writing'} <span aria-hidden="true">→</span></button></div><small>Your original submission is preserved. A score appears only after approved finalization.</small></form><aside className="card writing-tip"><span className="spark">✧</span><h3>Start with what<br/>you want to say.</h3><ol><li>Read the topic and clues.</li><li>Arrange your main ideas.</li><li>Write in your own words.</li><li>Read it once before submitting.</li></ol><p>There’s no perfect first draft. There is a thoughtful next step.</p></aside></section>:allowed?<section className="card assessments"><div className="section-heading"><div><span className="eyebrow">{me.role==='PARENT'?'FAMILY ASSESSMENTS':academic?'ASSIGNED COHORT':'YOUR WRITING'}</span><h2>{academic?'Cohort assessments':me.role==='PARENT'?'Their work, thoughtfully reviewed':'Your writing journey'}</h2></div><button className="secondary" disabled={loading} onClick={()=>listing(me,batch)}>Refresh</button></div>
     {academic&&<label className="cohort-select">Choose a cohort<select value={batch} onChange={e=>{setBatch(e.target.value);void listing(me,e.target.value);}}><option value="">Choose your assigned cohort</option>{cohorts.map(c=><option key={c.id} value={c.id}>{c.programName} · {c.name}</option>)}</select></label>}
     {loading?<div className="empty" aria-live="polite">Loading your current assessments…</div>:rows.length?<div className="records">{rows.map(row=><article className="record" key={row.assessmentId}><div className="paper-icon" aria-hidden="true">▤</div><div className="record-main"><h3>{row.topicTitle??'Writing assessment'}</h3><p>{me.role==='PARENT'&&row.studentId?'Student '+row.studentId.slice(0,8)+' · ':''}Assessment {row.assessmentId.slice(0,8)}</p><span className={'pill '+(row.status==='FINALIZED'?'approved':'pending')}>{row.status==='FINALIZED'?'Approved result':row.status.replaceAll('_',' ').toLowerCase()}</span>{row.reviewPending&&<span className="pill pending">Review pending</span>}</div><div className="record-score">{row.effectiveRevisionId?<><strong>{row.totalScore}<small> / {row.totalMarks}</small></strong><span>Current approved score</span></>:<span>{row.status==='FINALIZED'?'Open to view approved score':'Awaiting finalized score'}</span>}</div>{academic?<button className="secondary" disabled={!row.effectiveRevisionId} onClick={()=>download(row.assessmentId)}>English PDF</button>:<button className="secondary" onClick={()=>showResult(row)}>View result <span aria-hidden="true">↗</span></button>}</article>)}</div>:<div className="empty"><span aria-hidden="true">✧</span><h3>{student?'Your story starts with a first attempt.':'No assessments to show yet.'}</h3><p>{student?'Choose a topic and submit your original writing.':academic?'Choose a currently assigned cohort to see available work.':'Assessments appear here when your verified family links and current access permit them.'}</p>{student&&<button className="secondary" onClick={freshWriting}>Explore writing topics</button>}</div>}
     {cursor&&<button className="secondary next" onClick={()=>listing(me,batch,cursor)}>Next page →</button>}
    </section>:<section className="card empty"><h2>Administrative account</h2><p>Platform administration does not automatically include access to private academic records.</p></section>}
    {view!=='write'&&result&&<section className="card result" aria-live="polite"><div className="section-heading"><div><span className="eyebrow">ASSESSMENT {result.assessmentId.slice(0,8)}</span><h2>Your approved result</h2></div><button className="text-button" onClick={()=>{client.current.capture('result-view');client.current.capture('learning');setResult(null);setResultRow(null);setLearning(null);}}>Close result</button></div>{result.status!=='FINALIZED'||!result.result?<div className="empty"><h3>Your writing is still being assessed.</h3><p>No finalized score is available yet.</p></div>:<><div className="result-summary"><strong>{result.result.totalScore}<span> / {result.result.totalMarks}</span></strong><div><b>Current approved score</b><p>Revision {result.result.revisionNo} · {result.result.source==='HUMAN'?'Human-reviewed':'AI assessment'}</p></div><button className="secondary" onClick={()=>download(result.assessmentId)}>Download English PDF ↓</button></div><div className="factors">{result.result.factorResults.map(f=><article key={f.factorId}><div><h3>{f.factorId}</h3><strong>{f.proposedScore}</strong></div><span className="pill">Criterion: {f.criterionId}</span>{f.rationale&&<p>{f.rationale}</p>}{f.evidence?.map((e,i)=><blockquote key={i}><q>{e.exactQuote}</q><p>{e.claim}</p></blockquote>)}</article>)}</div></>}</section>}
    {view!=='write'&&student&&result?.result&&<StudentLearning learning={learning} result={result} loading={learningLoading} onRewrite={startRewrite}/>}
   </>}
  <footer><span>Writing Studio <span className="dot">·</span> Ideal Cadet Academy</span><span>Practice. Feedback. Correction. Rewrite.</span></footer></main></div>
 </div>;
}

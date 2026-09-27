import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
function fixture(command:string,input:Record<string,string>={}){
  return JSON.parse(execFileSync(process.execPath,[root+'node_modules/tsx/dist/cli.mjs',
    '--tsconfig',root+'apps/api/tsconfig.json',root+'apps/api/test/browser/fixture.ts',command,JSON.stringify(input)],
    {cwd:root,encoding:'utf8',timeout:30000}));
}
async function login(page:Page,email:string,password:string){
  await page.goto('/');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
  await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
}
async function get(page:Page,path:string){
  return page.evaluate(async path=>{
    const r=await fetch('/api/portal/'+path,{headers:{'X-Writing-Client':'portal'}});
    return {status:r.status,body:await r.json()};
  },path);
}
async function logout(page:Page){
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
}

test('real submission, independent human approval, linked-family privacy and live scope revocation',async({page,context},info)=>{
  const f=fixture('create');
  await login(page,f.studentEmail,f.password);
  await page.getByRole('button',{name:'New writing',exact:true}).click();
  await page.getByLabel('Choose your topic').selectOption({label:'Books and new ideas · ENGLISH · Linked learner cohort'});
  const writing='I like books. Reading helps me discover new ideas.';
  await page.getByLabel('Your writing',{exact:true}).fill(writing);
  const submitted=page.waitForResponse(r=>r.url().endsWith('/api/portal/submissions/typed')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Submit writing'}).click();
  const response=await submitted;expect(response.status()).toBe(201);
  const record=await response.json();expect(record.status).toBe('AWAITING_UNDERSTANDING');
  expect(fixture('inspect',{userId:f.studentUserId,assessmentId:record.assessmentId})).toEqual({
    text:writing,status:'AWAITING_UNDERSTANDING',submissionCount:1,acceptedEvents:1});
  await page.getByRole('button',{name:'View result'}).click();
  await expect(page.getByText('No finalized score is available yet.')).toBeVisible();
  expect((await get(page,`assessments/mine/${f.otherAssessmentId}/result`)).status).toBe(404);
  fixture('finalize',{userId:f.studentUserId,assessmentId:record.assessmentId,teacherId:f.teacherId,reviewerId:f.reviewerId});
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByRole('button',{name:'View result'}).click();
  await expect(page.getByText('Revision 1 · Human-reviewed')).toBeVisible();
  await expect(page.getByText('Synthetic human-reviewed browser evidence:',{exact:false})).toBeVisible();
  await page.screenshot({path:info.outputPath('real-student-result.png'),fullPage:true});
  const studentCookies=await context.cookies();
  const access=studentCookies.find(c=>c.name==='writing_access')!;
  expect(access.httpOnly).toBe(true);expect(access.sameSite).toBe('Strict');
  expect(await page.evaluate(()=>document.cookie)).not.toContain('writing_');
  await logout(page);
  // Replay the actual old HttpOnly access cookie: logout must revoke its DB session.
  const replay=await context.request.get('/api/portal/auth/me',{headers:{'X-Writing-Client':'portal',Cookie:`writing_access=${access.value}`}});
  expect(replay.status()).toBe(401);
  await login(page,f.parentEmail,f.password);
  await expect(page.getByText('Books and new ideas',{exact:true})).toBeVisible();
  await expect(page.getByText('Unlinked child private topic')).toHaveCount(0);
  const catalog=await get(page,'parents/me/children/assessments');
  expect(catalog.status).toBe(200);expect(catalog.body.assessments.map((r:{assessmentId:string})=>r.assessmentId)).toEqual([record.assessmentId]);
  const detail=`parents/me/children/${f.studentId}/assessments/${record.assessmentId}/result`;
  const ownResult=await get(page,detail);expect(ownResult.status).toBe(200);
  expect(ownResult.body.result).toMatchObject({totalScore:'2',totalMarks:'4',source:'HUMAN',revisionNo:1});
  expect((await get(page,`parents/me/children/${f.otherStudentId}/assessments/${f.otherAssessmentId}/result`)).status).toBe(404);
  expect((await get(page,`parents/me/children/${f.otherStudentId}/assessments/${record.assessmentId}/result`)).status).toBe(404);
  await page.getByRole('button',{name:'View result'}).click();
  const downloadEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download English PDF'}).click();
  const download=await downloadEvent;expect(await download.failure()).toBeNull();
  const pdf=await readFile((await download.path())!);expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(500);
  fixture('revoke-parent',{userId:f.parentId,rootId:f.rootId,linkId:f.linkId});
  expect((await get(page,detail)).status).toBe(404);
  expect((await get(page,`reports/assessments/${record.assessmentId}/pdf`)).status).toBe(404);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByText('No assessments to show yet.')).toBeVisible();
  await expect(page.getByText('Synthetic human-reviewed browser evidence:',{exact:false})).toHaveCount(0);
  await logout(page);
  await login(page,f.teacherEmail,f.password);
  await expect(page.getByLabel('Choose a cohort')).toHaveValue(f.batchId);
  await expect(page.getByText('Books and new ideas',{exact:true})).toBeVisible();
  expect((await get(page,`academic/cohorts/${f.otherBatchId}/assessments`)).status).toBe(404);
  await expect(page.getByRole('button',{name:'English PDF',exact:true})).toBeEnabled();
  fixture('revoke-teacher',{userId:f.teacherId,assignmentId:f.assignmentId});
  expect((await get(page,`academic/cohorts/${f.batchId}/assessments`)).status).toBe(404);
  expect((await get(page,`reports/assessments/${record.assessmentId}/pdf`)).status).toBe(404);
  await page.reload();await expect(page.getByText('No assessments to show yet.')).toBeVisible();
  await expect(page.getByLabel('Choose a cohort').locator('option')).toHaveCount(1);
});

test('real refresh rotation restores a browser session and DB revocation clears both cookies',async({page,context})=>{
  const f=fixture('create');await login(page,f.studentEmail,f.password);
  const before=(await context.cookies()).find(c=>c.name==='writing_refresh')!;
  await context.clearCookies({name:'writing_access'});await page.reload();
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
  const after=(await context.cookies()).find(c=>c.name==='writing_refresh')!;
  expect(after.value).not.toBe(before.value);expect(after.httpOnly).toBe(true);
  fixture('revoke-session',{userId:f.studentUserId});await page.reload();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
  expect((await context.cookies()).filter(c=>c.name.startsWith('writing_'))).toEqual([]);
  expect((await get(page,'submissions/mine')).status).toBe(401);
});

test('approved feedback guides a durable linked rewrite; stale and cross-child sources are denied',async({page})=>{
  const f=fixture('create');await login(page,f.studentEmail,f.password);
  await page.getByRole('button',{name:'New writing',exact:true}).click();
  await page.getByLabel('Choose your topic').selectOption({label:'Books and new ideas · ENGLISH · Linked learner cohort'});
  await page.getByLabel('Your writing',{exact:true}).fill('I like books. Reading helps me discover new ideas.');
  const first=page.waitForResponse(r=>r.url().endsWith('/api/portal/submissions/typed')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Submit writing'}).click();
  const source=await (await first).json();
  fixture('finalize',{userId:f.studentUserId,assessmentId:source.assessmentId,teacherId:f.teacherId,reviewerId:f.reviewerId});
  fixture('build-learning',{userId:f.studentUserId,assessmentId:source.assessmentId});
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByRole('button',{name:'View result'}).click();
  await expect(page.getByRole('heading',{name:'Your next thoughtful draft'})).toBeVisible();
  await expect(page.getByText('Published criterion:')).toBeVisible();
  await expect(page.getByText('Revise your writing with attention to Content.')).toBeVisible();
  await expect(page.getByText('A second approved assessment using the same rubric is needed')).toBeVisible();
  await page.getByRole('button',{name:'Plan a linked rewrite'}).click();
  const note='I will organize my ideas around the book and add clearer examples.';
  const writing='I like books. This revision explains how reading supports new ideas and learning.';
  await page.getByLabel('What will you correct?').fill(note);
  await page.getByLabel('Your writing',{exact:true}).fill(writing);
  const rewriteResponse=page.waitForResponse(r=>r.url().endsWith('/api/portal/submissions/rewrites')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Submit linked rewrite'}).click();
  const response=await rewriteResponse;expect(response.status()).toBe(201);
  const payload=response.request().postDataJSON();
  const record=await response.json();expect(record).toMatchObject({status:'AWAITING_UNDERSTANDING',
    rewriteOfAssessmentId:source.assessmentId,rewriteOfRevisionId:payload.expectedRevisionId,replayed:false});
  expect(fixture('inspect-rewrite',{userId:f.studentUserId,assessmentId:record.assessmentId})).toEqual({
    text:writing,status:'AWAITING_UNDERSTANDING',sourceAssessmentId:source.assessmentId,
    sourceRevisionId:payload.expectedRevisionId,correctionNote:note,acceptedEvents:1});
  expect(fixture('assert-db-guards',{userId:f.studentUserId,assessmentId:record.assessmentId,
    otherStudentId:f.otherStudentId})).toEqual({blocked:true});
  const replay=await page.evaluate(async body=>{
    const r=await fetch('/api/portal/submissions/rewrites',{method:'POST',headers:{'X-Writing-Client':'portal','Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:r.status,result:await r.json()};
  },payload);
  expect(replay.status).toBe(201);expect(replay.result).toMatchObject({submissionId:record.submissionId,replayed:true});
  const changed=await page.evaluate(async body=>{
    const r=await fetch('/api/portal/submissions/rewrites',{method:'POST',headers:{'X-Writing-Client':'portal','Content-Type':'application/json'},
      body:JSON.stringify({...body,text:body.text+' Changed.'})});return r.status;
  },payload);expect(changed).toBe(409);
  const other=await page.evaluate(async body=>{
    const r=await fetch('/api/portal/submissions/rewrites',{method:'POST',headers:{'X-Writing-Client':'portal','Content-Type':'application/json'},body:JSON.stringify(body)});
    return r.status;
  },{...payload,clientRequestId:randomUUID(),sourceAssessmentId:f.otherAssessmentId,expectedRevisionId:randomUUID()});
  expect(other).toBe(404);
  // Start another correction against revision 1, then approve a newer revision before submit.
  await page.getByRole('button',{name:'View result'}).last().click();
  await page.getByRole('button',{name:'Plan a linked rewrite'}).click();
  await page.getByLabel('What will you correct?').fill(note);
  await page.getByLabel('Your writing',{exact:true}).fill(writing+' A fresh example.');
  fixture('revise',{userId:f.studentUserId,assessmentId:source.assessmentId,teacherId:f.teacherId,reviewerId:f.reviewerId});
  const stale=page.waitForResponse(r=>r.url().endsWith('/api/portal/submissions/rewrites')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Submit linked rewrite'}).click();
  expect((await stale).status()).toBe(409);
  await expect(page.getByRole('status')).toContainText('Your writing context may have changed');
});

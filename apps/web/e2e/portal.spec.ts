import {test,expect,type Page} from '@playwright/test';
async function login(page:Page,role='student'){
 await page.goto('/');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 await page.getByLabel('Email address').fill(role+'@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-pass');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
}
test('student signs in, submits original writing, sees pending and approved results, then signs out',async({page,context},info)=>{
 await login(page);await expect(page.getByRole('heading',{name:'Your recent writing'})).toBeVisible();
 await expect(page.getByText('LATEST APPROVED RESULT',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.cookie)).not.toMatch(/writing_access|writing_refresh/);
 const cookies=await context.cookies();expect(cookies.filter(c=>c.name.startsWith('writing_')).every(c=>c.httpOnly&&c.sameSite==='Strict')).toBeTruthy();
 await page.getByRole('button',{name:'View status'}).click();await expect(page.getByText('No finalized score is available yet.')).toBeVisible();
 await page.getByRole('button',{name:'Close result'}).click();
 await page.getByRole('button',{name:'Read feedback'}).click();await expect(page.getByText('Synthetic approved fixture:',{exact:false}).first()).toBeVisible();
 await page.screenshot({path:info.outputPath('student-result.png'),fullPage:true});
 await page.getByRole('button',{name:'Assessments',exact:true}).click();
 await page.getByRole('button',{name:'View result'}).first().click();await expect(page.getByText('No finalized score is available yet.')).toBeVisible();
 await page.getByRole('button',{name:'New writing',exact:true}).click();await expect(page.getByRole('heading',{name:'Your approved result'})).toHaveCount(0);await page.getByLabel('Choose your topic').selectOption({index:1});
 await expect(page.getByText('Your favourite book',{exact:true})).toBeVisible();await page.getByLabel('Your writing',{exact:true}).fill('I enjoy reading. Books help me discover new places and ideas.');
 await page.screenshot({path:info.outputPath('writing-editor.png'),fullPage:true});
 await page.getByRole('button',{name:'Submit writing'}).click();await expect(page.getByRole('status')).toContainText('Your writing was submitted.');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 await expect(page.getByText('Synthetic approved fixture:',{exact:false})).toHaveCount(0);
 await page.reload();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
});
test('parent sees linked assessments with pagination and current PDF download',async({page},info)=>{
 await login(page,'parent');await expect(page.getByText('The joy of reading · synthetic fixture')).toBeVisible();
 await page.getByRole('button',{name:'View result'}).click();await expect(page.getByText('Synthetic approved fixture:',{exact:false})).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download report'}).click();expect((await download).suggestedFilename()).toMatch(/writing-report-en-/);
 await page.screenshot({path:info.outputPath('parent-dashboard.png'),fullPage:true});
 await page.getByRole('button',{name:'Next page'}).click();await expect(page.getByText('A new attempt · synthetic fixture')).toBeVisible();
 await expect(page.getByText('The joy of reading · synthetic fixture')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'New writing',exact:true})).toHaveCount(0);
});
test('teacher discovers assigned cohorts without entering private identifiers',async({page},info)=>{
 await login(page,'teacher');await expect(page.getByLabel('Choose a cohort')).toHaveValue('44444444-4444-4444-8444-444444444444');
 await expect(page.getByText('The joy of reading · synthetic fixture')).toBeVisible();
 await expect(page.getByRole('button',{name:'Download report',exact:true})).toBeEnabled();
 await page.screenshot({path:info.outputPath('teacher-dashboard.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
test('cross-tab sign-out clears private views',async({page,context})=>{
 await login(page,'parent');const second=await context.newPage();await second.goto('/');await expect(second.getByText('The joy of reading · synthetic fixture')).toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(second.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();await expect(second.getByText('The joy of reading · synthetic fixture')).toHaveCount(0);
});
test('server denies cross-origin mutations and administrative routes',async({page})=>{
 await page.goto('/');
 const statuses=await page.evaluate(async()=>{
  const a=await fetch('/api/portal/admin/programs',{headers:{'X-Writing-Client':'portal'}});
  const b=await fetch('/api/portal/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  return [a.status,b.status];
 });expect(statuses).toEqual([404,403]);
});


test('late assessment response cannot repopulate the UI after sign-out',async({page})=>{
 await login(page,'parent');await expect(page.getByText('The joy of reading · synthetic fixture')).toBeVisible();
 let release!:()=>void,received!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});const started=new Promise<void>(resolve=>{received=resolve;});
 await page.route('**/api/portal/parents/me/children/assessments',async route=>{
  const response=await route.fetch();received();await gate;await route.fulfill({response});
 });
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await started;
 await page.getByRole('button',{name:'Sign out',exact:true}).click();release();
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 await expect(page.getByText('The joy of reading · synthetic fixture')).toHaveCount(0);
});

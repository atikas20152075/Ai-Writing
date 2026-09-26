/** Synthetic-only local/staging HTTP E2E. NEVER point this at production or use real child records. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

if(process.env.STEP85_SYNTHETIC_ACK!=='ONLY_SYNTHETIC_TEST_DATA')
  throw new Error('Refusing smoke E2E without STEP85_SYNTHETIC_ACK=ONLY_SYNTHETIC_TEST_DATA');
const base=process.env.API_URL??'http://127.0.0.1:3001/api/v1';
const url=new URL(base);
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.protocol!=='http:')
  throw new Error('HTTP smoke suite runs on loopback addresses ONLY');
const origin=process.env.WEB_ORIGIN??'http://localhost:3000';
const adminEmail=process.env.LOCAL_PROVISION_EMAIL;
const adminPassword=process.env.LOCAL_PROVISION_PASSWORD;
if(!adminEmail || !adminPassword) throw new Error('Local synthetic admin fixture credentials required');
const unique=randomUUID().slice(0,12);
const studentEmail=`synthetic-student-${unique}@example.test`;
const studentPassword=`TEST_ONLY_${randomUUID()}`;
let checked=0;

async function request(path,{method='GET',token,body,cookie}={}){
  const headers={Origin:origin};
  if(body!==undefined) headers['Content-Type']='application/json';
  if(token) headers.Authorization=`Bearer ${token}`;
  if(cookie) headers.Cookie=cookie;
  const response=await fetch(`${base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  const text=await response.text();
  let data;try{data=text?JSON.parse(text):null;}catch{data=text;}
  return {status:response.status,data,cookie:response.headers.get('set-cookie')};
}
async function expectStatus(path,options,status,why){
  const result=await request(path,options);
  assert.equal(result.status,status,`${why}: HTTP ${result.status} ${JSON.stringify(result.data)}`);
  checked++;
  return result;
}
function post(path,body,token){return {method:'POST',body,token};}

await expectStatus('/health',{},200,'API readiness');
const student=await expectStatus('/auth/register',post('/auth/register',{email:studentEmail,password:studentPassword}),201,'synthetic student registration');
assert.ok(student.data.accessToken);
const studentToken=student.data.accessToken;
const profile=await expectStatus('/students/me',{token:studentToken},200,'student profile');
assert.ok(profile.data.id);
const studentId=profile.data.id;
const admin=await expectStatus('/auth/login',post('/auth/login',{email:adminEmail,password:adminPassword}),200,'synthetic administrator login');
const adminToken=admin.data.accessToken;
assert.ok(adminToken);
await expectStatus('/admin/programs',post('/admin/programs',{code:`WT${unique.toUpperCase()}`,name:'Synthetic Step85 Writing Test'},studentToken),403,'student is not administrator');
const program=await expectStatus('/admin/programs',post('/admin/programs',{code:`WT${unique.toUpperCase()}`,name:'Synthetic Step85 Writing Test'},adminToken),201,'program creation');
const programId=program.data.id;
const batch=await expectStatus('/admin/batches',post('/admin/batches',{programId,name:'Synthetic Batch'},adminToken),201,'batch creation');
const batchId=batch.data.id;
await expectStatus('/admin/enrollments',post('/admin/enrollments',{studentId,programId,batchId},adminToken),201,'enrollment');
await expectStatus('/admin/processing-authorities',post('/admin/processing-authorities',{
  studentId,programId,purpose:'CORE_ASSESSMENT',legalBasis:'SYNTHETIC_LOCAL_TEST_ONLY',policyVersion:'synthetic-v1',reviewReference:'LOCAL_FIXTURE_REVIEW'
},adminToken),201,'record synthetic processing authority');
const topic=await expectStatus('/admin/topic-versions/publish',post('/admin/topic-versions/publish',{
  programId,writingType:'PARAGRAPH',language:'ENGLISH',title:'Synthetic Nature',instructions:'Write a paragraph about a beautiful place.',clues:['place','experience']
},adminToken),201,'publish synthetic topic');
const rubric=await expectStatus('/admin/rubric-versions/publish',post('/admin/rubric-versions/publish',{
  programId,writingType:'PARAGRAPH',language:'ENGLISH',version:1,scoreStep:'1',totalMarks:'2',
  factors:[{id:'content',name:'Content',maxScore:'2',criteria:[
    {id:'missing',score:'0',description:'No relevant content'},
    {id:'partial',score:'1',description:'Some relevant content'},
    {id:'complete',score:'2',description:'Relevant supported ideas'}]}]
},adminToken),201,'publish synthetic rubric');
await expectStatus('/admin/rubric-bindings',post('/admin/rubric-bindings',{rubricVersionId:rubric.data.id},adminToken),201,'bind synthetic rubric');

const clientRequestId=randomUUID();
const submissionBody={programId,batchId,topicVersionId:topic.data.id,clientRequestId,text:'I visited a beautiful hill with my friends. We saw green trees and a clear river.'};
const submitted=await expectStatus('/submissions/typed',post('/submissions/typed',submissionBody,studentToken),201,'durable typed submission');
assert.equal(submitted.data.status,'AWAITING_UNDERSTANDING','No simulated score or finalization may be returned');
assert.equal(submitted.data.replayed,false);
assert.ok(submitted.data.assessmentId);
const replay=await expectStatus('/submissions/typed',post('/submissions/typed',submissionBody,studentToken),201,'idempotent retry');
assert.equal(replay.data.submissionId,submitted.data.submissionId);
assert.equal(replay.data.replayed,true);
await expectStatus('/submissions/typed',post('/submissions/typed',{...submissionBody,text:'Different writing but same request ID is rejected.'},studentToken),409,'reject changed idempotency payload');
const mine=await expectStatus(`/submissions/mine/${submitted.data.submissionId}`,{token:studentToken},200,'retrieve own verified text');
assert.equal(mine.data.verifiedText.content,submissionBody.text);
await expectStatus(`/submissions/mine/${submitted.data.submissionId}`,{token:adminToken},403,'administrator cannot use student-only endpoint');

// A second self-registered student cannot see another student's submission.
const other=await expectStatus('/auth/register',post('/auth/register',{email:`synthetic-other-${unique}@example.test`,password:studentPassword}),201,'second synthetic student registration');
await expectStatus(`/submissions/mine/${submitted.data.submissionId}`,{token:other.data.accessToken},404,'cross-student access denied');
await expectStatus('/submissions/typed',post('/submissions/typed',{...submissionBody,clientRequestId:randomUUID()},other.data.accessToken),403,'unenrolled student is denied');

// Rotation and reuse tests are intentionally sequential here; parallel test belongs in DB-backed auth suite.
const originalRefresh=student.cookie?.split(';')[0];
assert.ok(originalRefresh?.startsWith('writing_refresh='));
const fresh=await expectStatus('/auth/refresh',{method:'POST',cookie:originalRefresh},200,'refresh rotation');
const repeated=await expectStatus('/auth/refresh',{method:'POST',cookie:originalRefresh},401,'reused refresh token refused');
assert.ok(repeated);
await expectStatus('/auth/me',{token:fresh.data.accessToken},401,'refresh reuse revokes session family');

// Race regression: both requests can read the token before either claims it.
const again=await expectStatus('/auth/login',post('/auth/login',{email:studentEmail,password:studentPassword}),200,'new synthetic session');
const raceCookie=again.cookie?.split(';')[0];
assert.ok(raceCookie);
const races=await Promise.all([
  request('/auth/refresh',{method:'POST',cookie:raceCookie}),
  request('/auth/refresh',{method:'POST',cookie:raceCookie})
]);
assert.deepEqual(races.map(r=>r.status).sort(),[200,401],`Concurrent refresh outcomes: ${JSON.stringify(races.map(r=>r.status))}`);
checked++;
const raceWinner=races.find(r=>r.status===200);
await expectStatus('/auth/me',{token:raceWinner.data.accessToken},401,'concurrent replay revokes newly rotated session too');
// Step 86: unknown accounts and existing accounts must receive the same generic throttle response.
// Fail after the shared identity budget even when the user does not exist.
const bruteEmail=`synthetic-nonexistent-${unique}@example.test`;
for(let i=0;i<12;i++) await expectStatus('/auth/login',post('/auth/login',{email:bruteEmail,password:studentPassword}),401,'invalid login denied');
await expectStatus('/auth/login',post('/auth/login',{email:bruteEmail.toUpperCase(),password:studentPassword}),429,'identity budget resists case-changing attempts');
// Other identities at this address may still attempt normal authentication.
await expectStatus('/auth/login',post('/auth/login',{email:adminEmail,password:adminPassword}),200,'other account not globally locked');
console.log(JSON.stringify({result:'HTTP_SMOKE_PASSED',checks:checked,scope:'synthetic loopback',assessmentStatus:'AWAITING_UNDERSTANDING',aiScoring:'NOT_CONFIGURED'},null,2));

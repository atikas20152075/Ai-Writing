/** Opt-in Step88 internal consumer. Do not run for real children before academic/privacy approvals. */
import {Worker} from 'bullmq';
import IORedis from 'ioredis';
import {PrismaService} from '../../api/src/prisma/prisma.service.ts';
import {AssessmentPersistenceService} from '../../api/src/assessment/assessment-persistence.service.ts';
import {AIGatewayClient} from '../../api/src/ai/ai-gateway-client.ts';
if(process.env.ENABLE_STEP88_AI_WORKER!=='1' || process.env.AI_RELEASE_GATE_APPROVED!=='true' ||
  process.env.AI_CHILD_PROCESSING_APPROVED!=='true')throw Error('Step88 consumer is disabled pending authorized release');
if(!process.env.DATABASE_URL||!process.env.REDIS_URL||!process.env.AI_SERVICE_ORIGIN||
  !process.env.AI_SERVICE_SHARED_TOKEN)throw Error('Trusted consumer configuration incomplete');
const url=new URL(process.env.AI_SERVICE_ORIGIN);
if(!(url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='ai-service'||
    (url.protocol==='https:'&&url.hostname.endsWith('.internal'))))
  throw Error('AI service must be an explicitly approved internal network endpoint');
const db=new PrismaService();
const redis=new IORedis(process.env.REDIS_URL,{maxRetriesPerRequest:null});
const gateway=new AIGatewayClient({origin:url.origin,token:process.env.AI_SERVICE_SHARED_TOKEN});
const processor=new AssessmentPersistenceService(db);
await db.$connect();
const worker=new Worker('assessment-jobs',async job=>{
  // SUBMISSION_ACCEPTED is intentionally NOT a model-call trigger; human-reviewed Understanding comes first.
  if(job.name==='SUBMISSION_ACCEPTED')return {state:'AWAITING_HUMAN_UNDERSTANDING'};
  if(job.name!=='ASSESSMENT_CONTEXT_APPROVED')throw Error('Unsupported outbox event; investigate without exposing payload');
  const assessmentId=job.data?.assessmentId;
  if(typeof assessmentId!=='string'||!/^[0-9a-f-]{36}$/.test(assessmentId))
    throw Error('Malformed assessment identifier');
  const result=await processor.process(assessmentId,gateway);
  return {state:result.state};
},{connection:redis,concurrency:2,lockDuration:6*60*1000});
worker.on('failed',job=>console.error('Assessment worker failed:',job?.id)); // No child data in logs.
let closing=false;
for(const signal of ['SIGINT','SIGTERM'] as const){process.on(signal,()=>{
  if(closing)return;closing=true;
  void worker.close().then(()=>redis.quit()).then(()=>db.$disconnect());
});}

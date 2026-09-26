/** Optional at-least-once PostgreSQL outbox dispatcher. No AI job consumer exists yet. */
import {PrismaClient} from '@prisma/client';
import {Queue} from 'bullmq';
import IORedis from 'ioredis';

// Fail closed: never silently remove a submission event without its D2 consumer.
if(process.env.ENABLE_OUTBOX_DISPATCHER!=='1' || process.env.AI_JOB_CONSUMER_READY!=='1')
  throw new Error('Dispatcher disabled until the real, tested AI job consumer is ready');
if(!process.env.DATABASE_URL || !process.env.REDIS_URL) throw new Error('Database and Redis required');
const db=new PrismaClient();
const redis=new IORedis(process.env.REDIS_URL,{maxRetriesPerRequest:null});
const queue=new Queue('assessment-jobs',{connection:redis});
let shuttingDown=false;
process.on('SIGINT',()=>{shuttingDown=true;});
process.on('SIGTERM',()=>{shuttingDown=true;});
type OutboxRow={id:string;eventType:string;dedupeKey:string;payload:unknown};
async function dispatchOnce():Promise<number>{
  const claimed=await db.$transaction(tx=>tx.$queryRaw<OutboxRow[]>`
    WITH claimed AS (
      SELECT id FROM "OutboxEvent"
      WHERE "status"='PENDING' OR ("status"='DISPATCHING' AND "lockedAt" < NOW()-INTERVAL '5 minutes')
      ORDER BY "createdAt" LIMIT 10 FOR UPDATE SKIP LOCKED
    )
    UPDATE "OutboxEvent" e SET "status"='DISPATCHING',"lockedAt"=NOW(),"attemptCount"="attemptCount"+1
    FROM claimed WHERE e."id"=claimed.id
    RETURNING e.id,e."eventType",e."dedupeKey",e.payload
  `);
  for(const event of claimed){
    try{
      // Queue delivery is at least once; consumers must dedupe by eventId in PostgreSQL.
      await queue.add(event.eventType,{eventId:event.id,...(event.payload as object)},{jobId:event.id,attempts:3,backoff:{type:'exponential',delay:1000}});
      await db.outboxEvent.updateMany({where:{id:event.id,status:'DISPATCHING'},data:{status:'DISPATCHED',dispatchedAt:new Date(),lockedAt:null}});
    }catch(e){
      // Leave claimed for stale-lock recovery; do not mark dispatched before Queue.add succeeds.
      console.error('Outbox dispatch failed:',event.id);
    }
  }
  return claimed.length;
}
try{
  while(!shuttingDown){
    const processed=await dispatchOnce();
    if(processed===0) await new Promise(resolve=>setTimeout(resolve,2000));
  }
}finally{
  await queue.close();await redis.quit();await db.$disconnect();
}

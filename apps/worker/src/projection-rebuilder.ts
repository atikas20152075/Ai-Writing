/** Dedicated opt-in PARENT revision-index rebuilder. No imaginary AI or PDF processing. */
import {PrismaClient} from '@prisma/client';
import {ProjectionService} from '../../api/src/projections/projection.service.ts';
if(process.env.ENABLE_PROJECTION_REBUILDER!=='1')
  throw new Error('Projection rebuilder disabled until explicitly enabled');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const db=new PrismaClient();
const svc=new ProjectionService(db as any);
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  while(!stopping){
    try{
      const result=await svc.processOne();
      if(result.status==='EMPTY')await sleep(3000);
    }catch(_error){
      // Never log untrusted essay/DB exception content; keep pending job for supervised retry.
      console.error('STEP90_PROJECTION_REBUILD_RETRY_REQUIRED');
      await sleep(5000);
    }
  }
}finally{await db.$disconnect();}

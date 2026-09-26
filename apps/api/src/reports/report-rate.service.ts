import {HttpException,HttpStatus,Inject,Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service.ts';
import {REPORT_EXPORT_BUDGET,REPORT_EXPORT_WINDOW_SECONDS,reportExportBucket} from './report-rate-policy.ts';
/** A separate committed transaction charges each authenticated export request,
 * even when the later scope-check or renderer rejects it. Shared PostgreSQL row
 * locks make the budget consistent across API instances. */
@Injectable()
export class ReportRateService{
 constructor(@Inject(PrismaService)private readonly db:PrismaService){}
 async charge(actorId:string):Promise<void>{
  const secret=process.env.AUTH_ABUSE_KEY;
  if(!secret)throw new Error('AUTH_ABUSE_KEY required for report export');
  const key=reportExportBucket(actorId,secret);
  const rows=await this.db.$queryRaw<Array<{attempts:number}>>`
   INSERT INTO "AuthRateWindow" ("bucketKey","attempts","windowStart","resetAt")
   VALUES (${key},1,NOW(),NOW() + (${REPORT_EXPORT_WINDOW_SECONDS}::int * INTERVAL '1 second'))
   ON CONFLICT ("bucketKey") DO UPDATE SET
    "attempts"=CASE WHEN "AuthRateWindow"."resetAt"<=NOW() THEN 1 ELSE "AuthRateWindow"."attempts"+1 END,
    "windowStart"=CASE WHEN "AuthRateWindow"."resetAt"<=NOW() THEN NOW() ELSE "AuthRateWindow"."windowStart" END,
    "resetAt"=CASE WHEN "AuthRateWindow"."resetAt"<=NOW() THEN NOW() + (${REPORT_EXPORT_WINDOW_SECONDS}::int * INTERVAL '1 second')
      ELSE "AuthRateWindow"."resetAt" END
   WHERE "AuthRateWindow"."resetAt"<=NOW() OR "AuthRateWindow"."attempts"<${REPORT_EXPORT_BUDGET}
   RETURNING "attempts"`;
  if(rows.length!==1)throw new HttpException('Report export rate limit exceeded',HttpStatus.TOO_MANY_REQUESTS);
 }
}

import {HttpException, HttpStatus, Inject, Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service.ts';
import {buildAuthRateTargets, type AuthAction} from './rate-limit-policy.ts';

/** Transactional fixed-window limit. A shared PostgreSQL key serializes increments across API replicas.
 * Return 429 without distinguishing whether the attempted account exists.
 */
@Injectable()
export class AuthRateLimitService {
  constructor(@Inject(PrismaService) private readonly db:PrismaService) {}
  async enforce(action:AuthAction, serverObservedIp:string, email?:string):Promise<void> {
    const secret=process.env.AUTH_ABUSE_KEY;
    if(!secret) throw new Error('AUTH_ABUSE_KEY missing: auth rate limiting cannot be disabled');
    const targets=buildAuthRateTargets(action,serverObservedIp,secret,email);
    await this.db.$transaction(async tx=>{
      for(const target of targets){
        // ON CONFLICT UPDATE holds a row lock. A rejected attempt produces no row;
        // the enclosing transaction rolls back so other dimensions are not partially consumed.
        const rows=await tx.$queryRaw<Array<{attempts:number}>>`
          INSERT INTO "AuthRateWindow" ("bucketKey","attempts","windowStart","resetAt")
          VALUES (${target.bucketKey},1,NOW(),NOW() + (${target.windowSeconds}::int * INTERVAL '1 second'))
          ON CONFLICT ("bucketKey") DO UPDATE SET
            "attempts"=CASE WHEN "AuthRateWindow"."resetAt"<=NOW() THEN 1 ELSE "AuthRateWindow"."attempts"+1 END,
            "windowStart"=CASE WHEN "AuthRateWindow"."resetAt"<=NOW() THEN NOW() ELSE "AuthRateWindow"."windowStart" END,
            "resetAt"=CASE WHEN "AuthRateWindow"."resetAt"<=NOW() THEN NOW() + (${target.windowSeconds}::int * INTERVAL '1 second') ELSE "AuthRateWindow"."resetAt" END
          WHERE "AuthRateWindow"."resetAt"<=NOW() OR "AuthRateWindow"."attempts"<${target.limit}
          RETURNING "attempts"`;
        if(rows.length!==1) throw new HttpException('Too many attempts; try again later',HttpStatus.TOO_MANY_REQUESTS);
      }
    },{maxWait:3000,timeout:6000});
  }
}

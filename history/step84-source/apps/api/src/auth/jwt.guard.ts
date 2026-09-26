import {CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {Request} from 'express';
import {PrismaService} from '../prisma/prisma.service.ts';

export type Actor={userId:string;role:string;sessionId:string};
export type AuthenticatedRequest=Request & {actor:Actor};

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt:JwtService,
              @Inject(PrismaService) private readonly db:PrismaService) {}
  async canActivate(context:ExecutionContext):Promise<boolean> {
    const req=context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization=req.headers.authorization;
    if(!authorization?.startsWith('Bearer ')) throw new UnauthorizedException();
    let token:{sub:string;sid:string};
    try {token=await this.jwt.verifyAsync(authorization.slice(7));}
    catch {throw new UnauthorizedException();}
    if(typeof token.sub!=='string' || typeof token.sid!=='string') throw new UnauthorizedException();
    const session=await this.db.authSession.findFirst({where:{id:token.sid,userId:token.sub,revokedAt:null,
      expiresAt:{gt:new Date()},user:{status:'ACTIVE'}},include:{user:true}});
    if(!session) throw new UnauthorizedException();
    // Effective role comes from current DB record, not a possibly stale JWT claim.
    req.actor={userId:session.userId,role:session.user.role,sessionId:session.id};
    return true;
  }
}

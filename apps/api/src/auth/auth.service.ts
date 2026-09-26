import {ConflictException, Inject, Injectable, UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {randomBytes, createHash} from 'node:crypto';
import * as argon2 from 'argon2';
import {PrismaService} from '../prisma/prisma.service.ts';
import type {CredentialsDto} from './auth.dto.ts';

const sha256 = (v:string) => createHash('sha256').update(v).digest('hex');
const thirtyDays = () => new Date(Date.now()+30*24*60*60*1000);
const refreshRaw = () => randomBytes(48).toString('base64url');
const normalizeEmail = (email:string) => email.trim().toLowerCase();

// A parallel refresh request can read the same unconsumed token before either
// transaction claims it. It must be handled as a replay, not a harmless 401.
class ConcurrentRefreshReplay extends Error {}

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
              @Inject(JwtService) private readonly jwt:JwtService) {}
  private access(user: {id:string;role:string}, sessionId:string) {
    return this.jwt.signAsync({sub:user.id,sid:sessionId,role:user.role});
  }
  private async issueSession(user:{id:string;role:string}) {
    const raw=refreshRaw();
    const session=await this.db.authSession.create({data:{userId:user.id,expiresAt:thirtyDays(),
      refreshTokens:{create:{tokenHash:sha256(raw),expiresAt:thirtyDays()}}}});
    return {accessToken:await this.access(user,session.id),refreshToken:raw};
  }
  async register(dto: CredentialsDto) {
    const email=normalizeEmail(dto.email);
    const passwordHash=await argon2.hash(dto.password,{type:argon2.argon2id});
    let user: {id:string;role:string};
    try {
      user=await this.db.$transaction(async tx => {
        const created=await tx.user.create({data:{email,passwordHash,role:'STUDENT'}});
        await tx.student.create({data:{userId:created.id}});
        await tx.auditEvent.create({data:{actorId:created.id,action:'SELF_REGISTER',resourceType:'User',resourceId:created.id}});
        return created;
      });
    } catch(e:any) {if(e?.code==='P2002') throw new ConflictException('Registration unavailable');throw e;}
    return this.issueSession(user);
  }
  async login(dto:CredentialsDto) {
    const user=await this.db.user.findUnique({where:{email:normalizeEmail(dto.email)}});
    // Do not reveal whether the email exists. Rate limiting is a separate pre-pilot requirement.
    if(!user || user.status!=='ACTIVE' || !await argon2.verify(user.passwordHash,dto.password))
      throw new UnauthorizedException('Invalid credentials');
    return this.issueSession(user);
  }
  private async revokeTokenFamily(sessionId:string,userId:string,reason:string,at:Date){
    await this.db.$transaction(async tx => {
      await tx.authSession.updateMany({where:{id:sessionId,revokedAt:null},data:{revokedAt:at}});
      await tx.authRefreshToken.updateMany({where:{sessionId,revokedAt:null},data:{revokedAt:at}});
      await tx.auditEvent.create({data:{actorId:userId,action:reason,resourceType:'AuthSession',resourceId:sessionId}});
    });
  }
  async refresh(token:string | undefined) {
    if(!token) throw new UnauthorizedException('Refresh token required');
    const tokenHash=sha256(token);
    const existing=await this.db.authRefreshToken.findUnique({where:{tokenHash},
      include:{session:{include:{user:true}}}});
    if(!existing) throw new UnauthorizedException('Invalid refresh token');
    const now=new Date();
    if(existing.consumedAt) {
      // Known consumed token replay. Revoke this entire session family; never create a new token.
      await this.revokeTokenFamily(existing.sessionId,existing.session.userId,'REFRESH_REPLAY_DETECTED',now);
      throw new UnauthorizedException('Session revoked');
    }
    if(existing.revokedAt || existing.expiresAt<=now || existing.session.revokedAt ||
       existing.session.expiresAt<=now || existing.session.user.status!=='ACTIVE')
      throw new UnauthorizedException('Session expired');
    const next=refreshRaw();
    const jwt=await this.access(existing.session.user,existing.sessionId);
    try {
    await this.db.$transaction(async tx => {
      const claimed=await tx.authRefreshToken.updateMany({where:{id:existing.id,consumedAt:null,revokedAt:null},data:{consumedAt:now}});
      if(claimed.count!==1) throw new ConcurrentRefreshReplay('Concurrent use of consumed refresh token');
      // Row lock on AuthSession serializes logout vs rotation, checked after acquisition.
      const rows=await tx.$queryRaw<Array<{id:string}>>`
        SELECT id FROM "AuthSession" WHERE id=${existing.sessionId}::uuid
          AND "revokedAt" IS NULL AND "expiresAt">NOW() FOR UPDATE`;
      if(rows.length!==1) throw new UnauthorizedException('Session revoked');
      await tx.authRefreshToken.create({data:{sessionId:existing.sessionId,tokenHash:sha256(next),expiresAt:thirtyDays()}});
    });
    } catch(e) {
      if(e instanceof ConcurrentRefreshReplay){
        // Compensating transaction: do not roll the revocation back with the lost claim.
        await this.revokeTokenFamily(existing.sessionId,existing.session.userId,'CONCURRENT_REFRESH_REPLAY_DETECTED',new Date());
        throw new UnauthorizedException('Session revoked after refresh replay');
      }
      throw e;
    }
    return {accessToken:jwt,refreshToken:next};
  }
  async logout(sessionId:string, userId:string) {
    const now=new Date();
    await this.db.$transaction(async tx=>{
      await tx.authSession.updateMany({where:{id:sessionId,userId,revokedAt:null},data:{revokedAt:now}});
      await tx.authRefreshToken.updateMany({where:{sessionId,revokedAt:null},data:{revokedAt:now}});
    });
    return {loggedOut:true};
  }
}

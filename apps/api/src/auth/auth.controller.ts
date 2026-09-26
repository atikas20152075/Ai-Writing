import {Body, Controller, Get, Headers, HttpCode, Inject, Post, Req, Res, UseGuards, ForbiddenException} from '@nestjs/common';
import type {Request,Response} from 'express';
import {AuthService} from './auth.service.ts';
import {AuthRateLimitService} from './auth-rate-limit.service.ts';
import {CredentialsDto} from './auth.dto.ts';
import {JwtGuard,type AuthenticatedRequest} from './jwt.guard.ts';

const refreshCookieOptions=()=>({httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,
  path:'/api/v1/auth',maxAge:30*24*60*60*1000});
function requireOrigin(origin:string|undefined) {
  if(!origin || origin !== process.env.WEB_ORIGIN) throw new ForbiddenException('Invalid origin');
}
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth:AuthService,
              @Inject(AuthRateLimitService) private readonly limiter:AuthRateLimitService){}
  @Post('register') async register(@Req() req:Request,@Body() dto:CredentialsDto,@Headers('origin') origin:string|undefined,@Res({passthrough:true}) res:Response){
    requireOrigin(origin);
    await this.limiter.enforce('register',req.ip??'',dto.email);
    const result=await this.auth.register(dto);
    res.cookie('writing_refresh',result.refreshToken,refreshCookieOptions());
    return {accessToken:result.accessToken,tokenType:'Bearer'};
  }
  @Post('login') @HttpCode(200) async login(@Req() req:Request,@Body() dto:CredentialsDto,@Headers('origin') origin:string|undefined,@Res({passthrough:true}) res:Response){
    requireOrigin(origin);
    await this.limiter.enforce('login',req.ip??'',dto.email);
    const result=await this.auth.login(dto);
    res.cookie('writing_refresh',result.refreshToken,refreshCookieOptions());
    return {accessToken:result.accessToken,tokenType:'Bearer'};
  }
  @Post('refresh') @HttpCode(200) async refresh(@Req() req:Request,@Headers('origin') origin:string|undefined,@Res({passthrough:true}) res:Response){
    requireOrigin(origin);
    await this.limiter.enforce('refresh',req.ip??'');
    const result=await this.auth.refresh(req.cookies?.writing_refresh);
    res.cookie('writing_refresh',result.refreshToken,refreshCookieOptions());
    return {accessToken:result.accessToken,tokenType:'Bearer'};
  }
  @Post('logout') @UseGuards(JwtGuard) @HttpCode(200)
  async logout(@Req() req:AuthenticatedRequest,@Res({passthrough:true}) res:Response){
    const result=await this.auth.logout(req.actor.sessionId,req.actor.userId);
    res.clearCookie('writing_refresh',{path:'/api/v1/auth',httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict'});
    return result;
  }
  @Get('me') @UseGuards(JwtGuard) me(@Req() req:AuthenticatedRequest){return {userId:req.actor.userId,role:req.actor.role};}
}

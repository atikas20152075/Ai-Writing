import {Module} from '@nestjs/common';
import {JwtModule} from '@nestjs/jwt';
import {PrismaModule} from '../prisma/prisma.module.ts';
import {AuthController} from './auth.controller.ts';
import {AuthService} from './auth.service.ts';
import {JwtGuard} from './jwt.guard.ts';
import {AuthRateLimitService} from './auth-rate-limit.service.ts';
@Module({
 imports:[PrismaModule,JwtModule.register({secret:process.env.JWT_SECRET,signOptions:{expiresIn:'15m',issuer:'writing-api',audience:'writing-web',algorithm:'HS256'},verifyOptions:{issuer:'writing-api',audience:'writing-web',algorithms:['HS256']}})],
 controllers:[AuthController],providers:[AuthService,AuthRateLimitService,JwtGuard],exports:[JwtModule,JwtGuard]
})
export class AuthModule {}

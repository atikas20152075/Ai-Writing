import {Module} from '@nestjs/common';
import {PrismaModule} from './prisma/prisma.module.ts';
import {AuthModule} from './auth/auth.module.ts';
import {AdminModule} from './admin/admin.module.ts';
import {SubmissionModule} from './submission/submission.module.ts';
import {AcademicModule} from './academic/academic.module.ts';
import {Controller,Get} from '@nestjs/common';
@Controller() class HealthController {
  @Get('health') health(){return {status:'UP',component:'writing-api',aiScoring:'NOT_CONFIGURED'};}
}
@Module({imports:[PrismaModule,AuthModule,AdminModule,SubmissionModule,AcademicModule],controllers:[HealthController]})
export class AppModule {}

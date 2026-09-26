import {Module} from '@nestjs/common';
import {AssessmentModule} from './assessment/assessment.module.ts';
import {PrismaModule} from './prisma/prisma.module.ts';
import {AuthModule} from './auth/auth.module.ts';
import {AdminModule} from './admin/admin.module.ts';
import {SubmissionModule} from './submission/submission.module.ts';
import {AcademicModule} from './academic/academic.module.ts';
import {Controller,Get} from '@nestjs/common';
@Controller() class HealthController {
  @Get('health') health(){return {status:'UP',component:'writing-api',aiScoring:process.env.AI_RELEASE_GATE_APPROVED==='true' && process.env.AI_CHILD_PROCESSING_APPROVED==='true'?'RELEASE_GATED':'NOT_CONFIGURED'};}
}
@Module({imports:[PrismaModule,AuthModule,AdminModule,SubmissionModule,AcademicModule,AssessmentModule],controllers:[HealthController]})
export class AppModule {}

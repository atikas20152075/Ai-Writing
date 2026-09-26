import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.ts';
import {PrismaModule} from '../prisma/prisma.module.ts';
import {AssessmentPersistenceService} from './assessment-persistence.service.ts';
import {AssessmentReadController} from './assessment.controller.ts';
@Module({imports:[AuthModule,PrismaModule],providers:[AssessmentPersistenceService],controllers:[AssessmentReadController],
  exports:[AssessmentPersistenceService]})
export class AssessmentModule {}

import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.ts';
import {PrismaModule} from '../prisma/prisma.module.ts';
import {AssessmentPersistenceService} from './assessment-persistence.service.ts';
import {AssessmentReadController} from './assessment.controller.ts';
import {ProjectionService} from '../projections/projection.service.ts';
import {ProjectionStatusController} from '../projections/projection.controller.ts';
@Module({imports:[AuthModule,PrismaModule],providers:[AssessmentPersistenceService,ProjectionService],controllers:[AssessmentReadController,ProjectionStatusController],
  exports:[AssessmentPersistenceService,ProjectionService]})
export class AssessmentModule {}

import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.ts';
import {PrismaModule} from '../prisma/prisma.module.ts';
import {HumanReviewService} from './review.service.ts';
import {OpenAssessmentReviewController,ReviewCasesController} from './review.controller.ts';
@Module({imports:[AuthModule,PrismaModule],providers:[HumanReviewService],controllers:[OpenAssessmentReviewController,ReviewCasesController]})
export class HumanReviewModule {}

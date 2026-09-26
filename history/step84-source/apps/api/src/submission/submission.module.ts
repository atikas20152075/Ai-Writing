import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.ts';
import {SubmissionService} from './submission.service.ts';
import {SubmissionController} from './submission.controller.ts';
@Module({imports:[AuthModule],controllers:[SubmissionController],providers:[SubmissionService]})
export class SubmissionModule {}

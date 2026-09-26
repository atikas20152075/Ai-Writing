import {Module} from '@nestjs/common';
import {PrismaModule} from '../prisma/prisma.module.ts';
import {AuthModule} from '../auth/auth.module.ts';
import {ReportController} from './report.controller.ts';
import {ReportService} from './report.service.ts';
import {ReportRateService} from './report-rate.service.ts';
@Module({imports:[PrismaModule,AuthModule],providers:[ReportService,ReportRateService],
 controllers:[ReportController],exports:[ReportService]})
export class ReportModule{}

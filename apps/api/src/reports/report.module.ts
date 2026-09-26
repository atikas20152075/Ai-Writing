import {Module} from '@nestjs/common';
import {PrismaModule} from '../prisma/prisma.module.ts';
import {AuthModule} from '../auth/auth.module.ts';
import {ReportController} from './report.controller.ts';
import {ReportService} from './report.service.ts';
@Module({imports:[PrismaModule,AuthModule],providers:[ReportService],
 controllers:[ReportController],exports:[ReportService]})
export class ReportModule{}

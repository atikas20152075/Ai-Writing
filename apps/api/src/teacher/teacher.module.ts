import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.ts';
import {PrismaModule} from '../prisma/prisma.module.ts';
import {TeacherDashboardController} from './teacher.controller.ts';
import {TeacherDashboardService} from './teacher.service.ts';
@Module({imports:[AuthModule,PrismaModule],controllers:[TeacherDashboardController],
 providers:[TeacherDashboardService],exports:[TeacherDashboardService]})
export class TeacherDashboardModule{}

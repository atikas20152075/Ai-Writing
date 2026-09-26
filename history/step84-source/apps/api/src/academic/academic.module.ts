import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.ts';
import {AcademicReadController} from './academic-read.controller.ts';
import {AcademicReadService} from './academic-read.service.ts';
@Module({imports:[AuthModule],controllers:[AcademicReadController],providers:[AcademicReadService]})
export class AcademicModule {}

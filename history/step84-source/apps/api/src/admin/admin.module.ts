import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.ts';
import {AdminController} from './admin.controller.ts';
import {AdminService} from './admin.service.ts';
@Module({imports:[AuthModule],controllers:[AdminController],providers:[AdminService]})
export class AdminModule {}

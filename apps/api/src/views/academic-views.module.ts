import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.ts';
import {PrismaModule} from '../prisma/prisma.module.ts';
import {AcademicViewsService} from './academic-views.service.ts';
import {AcademicViewsController} from './academic-views.controller.ts';
@Module({imports:[PrismaModule,AuthModule],providers:[AcademicViewsService],
 controllers:[AcademicViewsController]})
export class AcademicViewsModule {}

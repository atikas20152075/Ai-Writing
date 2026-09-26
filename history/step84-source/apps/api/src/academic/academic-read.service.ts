import {ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service.ts';
import {guardianCanRead,teacherCanRead} from '../policies/access-policy.ts';
import type {Actor} from '../auth/jwt.guard.ts';

@Injectable()
export class AcademicReadService {
  constructor(@Inject(PrismaService) private readonly db:PrismaService){}
  async myStudentProfile(actor:Actor){
    if(actor.role!=='STUDENT') throw new ForbiddenException();
    const student=await this.db.student.findUnique({where:{userId:actor.userId},select:{id:true,userId:true,createdAt:true}});
    if(!student) throw new NotFoundException();
    return student;
  }
  async guardianSubmissions(actor:Actor,studentId:string,programId:string) {
    if(actor.role!=='PARENT') throw new ForbiddenException();
    // Current, program-scoped link AND currently active enrollment. Historical access needs its own policy.
    const [link,enrollment]=await Promise.all([
      this.db.parentStudentLink.findUnique({where:{guardianId_studentId_programId:{guardianId:actor.userId,studentId,programId}}}),
      this.db.enrollment.findFirst({where:{studentId,programId,status:'ACTIVE',startedAt:{lte:new Date()},endedAt:null}})
    ]);
    if(!enrollment || !guardianCanRead(actor.role,actor.userId,studentId,programId,link)) throw new NotFoundException();
    // The relation predicate is re-applied INSIDE the records query; do not rely on a prior UI check.
    return this.db.submission.findMany({where:{studentId,programId,
      student:{guardianLinks:{some:{guardianId:actor.userId,programId,status:'ACTIVE',verifiedAt:{lte:new Date()},activatedAt:{lte:new Date()},revokedAt:null}},
        enrollments:{some:{programId,status:'ACTIVE',startedAt:{lte:new Date()},endedAt:null}}}},
      select:{id:true,programId:true,createdAt:true,status:true,assessment:{select:{id:true,status:true}}},
      orderBy:{createdAt:'desc'},take:50});
  }
  async teacherSubmissions(actor:Actor,studentId:string,batchId:string){
    if(actor.role!=='TEACHER') throw new ForbiddenException();
    const [assignment,enrollment]=await Promise.all([
      this.db.teacherBatch.findFirst({where:{teacherId:actor.userId,batchId,endedAt:null},include:{batch:true}}),
      this.db.enrollment.findFirst({where:{studentId,batchId,status:'ACTIVE',startedAt:{lte:new Date()},endedAt:null}})
    ]);
    if(!assignment || !enrollment || !teacherCanRead(actor.role,actor.userId,studentId,assignment.batch.programId,batchId,
      {...assignment,programId:assignment.batch.programId},enrollment)) throw new NotFoundException();
    return this.db.submission.findMany({where:{studentId,batchId,programId:assignment.batch.programId,
      batch:{teachers:{some:{teacherId:actor.userId,assignedAt:{lte:new Date()},endedAt:null}}},
      student:{enrollments:{some:{batchId,programId:assignment.batch.programId,status:'ACTIVE',startedAt:{lte:new Date()},endedAt:null}}}},
      select:{id:true,programId:true,createdAt:true,status:true,assessment:{select:{id:true,status:true}}},
      orderBy:{createdAt:'desc'},take:50});
  }
}

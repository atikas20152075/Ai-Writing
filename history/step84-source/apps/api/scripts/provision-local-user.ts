/** Development fixtures ONLY. Never deploy this CLI or use it to administer production accounts. */
import {PrismaClient,UserRole} from '@prisma/client';
import * as argon2 from 'argon2';
async function run(){
  if(process.env.NODE_ENV==='production') throw new Error('Production provisioning is disabled');
  if(process.env.LOCAL_PROVISION_ACK!=='ONLY_SYNTHETIC_TEST_DATA') throw new Error('Local provision acknowledgement required');
  const email=process.env.LOCAL_PROVISION_EMAIL?.trim().toLowerCase();
  const password=process.env.LOCAL_PROVISION_PASSWORD;
  const role=process.env.LOCAL_PROVISION_ROLE;
  if(!email || !email.includes('@') || !password || password.length<12 ||
     !role || !['SUPER_ADMIN','PARENT','TEACHER'].includes(role)) throw new Error('Invalid local fixture credentials/role');
  const db=new PrismaClient();
  try {
    const existing=await db.user.findUnique({where:{email}});
    if(existing) throw new Error('Fixture account already exists; refusing to overwrite');
    const passwordHash=await argon2.hash(password,{type:argon2.argon2id});
    const created=await db.$transaction(async tx=>{
      const user=await tx.user.create({data:{email,passwordHash,role:role as UserRole}});
      await tx.auditEvent.create({data:{actorId:user.id,action:'LOCAL_FIXTURE_PROVISION',resourceType:'User',resourceId:user.id}});
      return user;
    });
    console.log('Created synthetic fixture user:',{id:created.id,role:created.role});
  }finally{await db.$disconnect();}
}
run().catch(e=>{console.error(e.message);process.exit(1);});

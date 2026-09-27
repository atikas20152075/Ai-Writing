/** CLI-only synthetic fixture. No HTTP test-control endpoint or AI provider is enabled. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {hash} from 'argon2';
import type {User,UserRole} from '@prisma/client';
import {requireDisposableBrowserDatabase} from '../../../../scripts/fullstack-safety.mjs';
import {PrismaService} from '../../src/prisma/prisma.service.ts';
import {AdminService} from '../../src/admin/admin.service.ts';
import {SubmissionService} from '../../src/submission/submission.service.ts';
import {AssessmentPersistenceService} from '../../src/assessment/assessment-persistence.service.ts';
import {HumanReviewService} from '../../src/review/review.service.ts';
import {ProjectionService} from '../../src/projections/projection.service.ts';

requireDisposableBrowserDatabase();
const db=new PrismaService();
const admin=new AdminService(db);
const actor=(user:Pick<User,'id'|'role'>)=>({userId:user.id,role:user.role,sessionId:randomUUID()});
const reason='Synthetic browser fixture review; not an academic quality benchmark.';
async function create(){
  const suffix=randomUUID();
  const password='SYNTHETIC_'+randomUUID();
  const passwordHash=await hash(password);
  async function user(label:string,role:UserRole){
    return db.user.create({data:{email:`browser-${label}-${suffix}@example.test`,role,passwordHash}});
  }
  const root=await user('admin','SUPER_ADMIN');
  const studentUser=await user('student','STUDENT');
  const otherUser=await user('other','STUDENT');
  const parent=await user('parent','PARENT');
  const teacher=await user('teacher','TEACHER');
  const reviewer=await user('reviewer','ACADEMIC_ADMIN');
  const student=await db.student.create({data:{userId:studentUser.id}});
  const otherStudent=await db.student.create({data:{userId:otherUser.id}});
  const rootActor=actor(root);
  const program=await admin.createProgram(rootActor,{code:'B'+suffix.slice(0,12),name:'Synthetic browser program'});
  const batch=await admin.createBatch(rootActor,{programId:program.id,name:'Linked learner cohort'});
  const otherBatch=await admin.createBatch(rootActor,{programId:program.id,name:'Unassigned cohort'});
  for(const [s,b] of [[student,batch],[otherStudent,otherBatch]] as const){
    await admin.enroll(rootActor,{studentId:s.id,programId:program.id,batchId:b.id});
    await admin.authorizeProcessing(rootActor,{studentId:s.id,programId:program.id,purpose:'CORE_ASSESSMENT',
      legalBasis:'SYNTHETIC_ONLY',policyVersion:'browser-v1',reviewReference:'SYNTHETIC_BROWSER_FIXTURE'});
  }
  const link=await admin.verifyGuardian(rootActor,{guardianId:parent.id,studentId:student.id,programId:program.id,
    verificationReference:'SYNTHETIC_BROWSER_FIXTURE_NOT_REAL_VERIFICATION'});
  const assignment=await admin.assignTeacher(rootActor,{teacherId:teacher.id,batchId:batch.id});
  await db.academicAdminProgram.create({data:{userId:reviewer.id,programId:program.id}});
  const topic=await admin.publishTopic(rootActor,{programId:program.id,writingType:'PARAGRAPH',language:'ENGLISH',
    title:'Books and new ideas',instructions:'Write about books in your own words.',clues:['books','ideas']});
  const otherTopic=await admin.publishTopic(rootActor,{programId:program.id,writingType:'PARAGRAPH',language:'ENGLISH',
    title:'Unlinked child private topic',instructions:'Write about a garden.',clues:['garden']});
  const rubric=await admin.publishRubric(rootActor,{programId:program.id,writingType:'PARAGRAPH',language:'ENGLISH',
    version:1,scoreStep:'1',totalMarks:'4',factors:[{id:'content',name:'Content',maxScore:'4',criteria:[
      {id:'c0',score:'0',description:'Absent'}, {id:'c2',score:'2',description:'Partial'},
      {id:'c4',score:'4',description:'Clear supported ideas'}]}]});
  await admin.bindRubric(rootActor,rubric.id);
  const other=await new SubmissionService(db).createTyped(actor(otherUser),{programId:program.id,batchId:otherBatch.id,
    topicVersionId:otherTopic.id,clientRequestId:randomUUID(),text:'A garden has many trees and flowers.'});
  return {password,studentEmail:studentUser.email,parentEmail:parent.email,teacherEmail:teacher.email,reviewerEmail:reviewer.email,
    studentUserId:studentUser.id,studentId:student.id,parentId:parent.id,teacherId:teacher.id,reviewerId:reviewer.id,
    rootId:root.id,linkId:link.id,assignmentId:assignment.id,batchId:batch.id,otherBatchId:otherBatch.id,
    topicId:topic.id,otherStudentId:otherStudent.id,otherAssessmentId:other.assessmentId};
}
async function syntheticUser(id:string){
  const user=await db.user.findUniqueOrThrow({where:{id}});
  assert.match(user.email,/^browser-.+@example\.test$/);
  return user;
}
async function action(command:string,input:Record<string,string>){
  if(command==='create')return create();
  const user=await syntheticUser(input.userId);
  if(command==='revoke-session'){
    await db.authSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
    return {revoked:true};
  }
  if(command==='revoke-parent'){
    const link=await db.parentStudentLink.findUniqueOrThrow({where:{id:input.linkId}});
    assert.equal(link.guardianId,user.id);
    const root=await syntheticUser(input.rootId);
    return admin.revokeGuardian(actor(root),link.id);
  }
  if(command==='revoke-teacher'){
    const assignment=await db.teacherBatch.findUniqueOrThrow({where:{id:input.assignmentId}});
    assert.equal(assignment.teacherId,user.id);
    await db.teacherBatch.update({where:{id:assignment.id},data:{endedAt:new Date()}});
    return {revoked:true};
  }
  const assessment=await db.assessment.findUniqueOrThrow({where:{id:input.assessmentId},
    include:{submission:{include:{student:true,verifiedText:true}}}});
  assert.equal(assessment.submission.student.userId,user.id);
  if(command==='inspect')return {text:assessment.submission.verifiedText?.content,status:assessment.status,
    submissionCount:await db.submission.count({where:{studentId:assessment.submission.studentId}}),
    acceptedEvents:await db.outboxEvent.count({where:{dedupeKey:'submission-'+assessment.submissionId}})};
  if(command==='inspect-rewrite')return {text:assessment.submission.verifiedText?.content,status:assessment.status,
    sourceAssessmentId:assessment.submission.rewriteOfAssessmentId,
    sourceRevisionId:assessment.submission.rewriteOfRevisionId,
    correctionNote:assessment.submission.correctionNote,
    acceptedEvents:await db.outboxEvent.count({where:{dedupeKey:'submission-'+assessment.submissionId}})};
  if(command==='build-learning'){
    const service=new ProjectionService(db);
    const results=[];
    for(let i=0;i<4;i++)results.push(await service.processOne(assessment.id));
    assert.deepEqual(results.map(x=>x.status),['REBUILT','REBUILT','REBUILT','REBUILT']);
    return {built:true};
  }
  if(command==='revise'){
    const teacher=await syntheticUser(input.teacherId),reviewer=await syntheticUser(input.reviewerId);
    const reviews=new HumanReviewService(db);
    const review=await reviews.open(actor(teacher),assessment.id,reason);
    await reviews.propose(actor(teacher),review.caseId,[{factorId:'content',criterionId:'c4',proposedScore:'4',
      rationale:'Synthetic revised evidence supports the published full content criterion.',
      evidence:[{startOffset:7,endOffset:12,exactQuote:'books',claim:'The writing mentions books.'}]}],reason);
    await reviews.decide(actor(reviewer),review.caseId,'APPROVE',reason);
    return {revised:true};
  }
  if(command==='open-review'){
    const teacher=await syntheticUser(input.teacherId);
    await new AssessmentPersistenceService(db).publishHumanUnderstanding({assessmentId:assessment.id,reviewerId:teacher.id,
      observations:[{category:'IDEA',finding:'Synthetic observation for a pending review.',evidence:{startOffset:7,endOffset:12,
        exactQuote:'books',claim:'The writing mentions books.'}}]});
    await db.assessment.update({where:{id:assessment.id},data:{status:'HUMAN_REVIEW'}});
    return new HumanReviewService(db).open(actor(teacher),assessment.id,reason);
  }
  if(command==='propose-review'){
    const teacher=await syntheticUser(input.teacherId);
    const reviews=new HumanReviewService(db);
    const review=await reviews.open(actor(teacher),assessment.id,reason);
    await reviews.propose(actor(teacher),review.caseId,[{factorId:'content',criterionId:'c4',proposedScore:'4',
      rationale:'Synthetic proposal supported by the original verified writing evidence.',
      evidence:[{startOffset:7,endOffset:12,exactQuote:'books',claim:'The verified text mentions books.'}]}],reason);
    return {caseId:review.caseId};
  }
  if(command==='assert-db-guards'){
    const link=assessment.submission;
    assert.ok(link.rewriteOfAssessmentId&&link.rewriteOfRevisionId&&link.correctionNote);
    const wrong=await db.student.findUniqueOrThrow({where:{id:input.otherStudentId}});
    assert.notEqual(wrong.userId,user.id);
    await assert.rejects(db.submission.create({data:{studentId:wrong.id,
      programId:link.programId,batchId:link.batchId,topicVersionId:link.topicVersionId,
      rubricVersionId:link.rubricVersionId,clientRequestId:randomUUID(),
      rewriteOfAssessmentId:link.rewriteOfAssessmentId,rewriteOfRevisionId:link.rewriteOfRevisionId,
      correctionNote:link.correctionNote,topicSnapshot:link.topicSnapshot as any,rubricSnapshot:link.rubricSnapshot as any,
      topicHash:link.topicHash,rubricHash:link.rubricHash}}),/REWRITE_SOURCE_NOT_CURRENT_OR_SCOPED/);
    await assert.rejects(db.submission.update({where:{id:link.id},data:{correctionNote:'Silently replacing the immutable student plan is not permitted.'}}),
      /REWRITE_LINK_IMMUTABLE/);
    return {blocked:true};
  }
  if(command==='finalize'){
    const teacher=await syntheticUser(input.teacherId),reviewer=await syntheticUser(input.reviewerId);
    await new AssessmentPersistenceService(db).publishHumanUnderstanding({assessmentId:assessment.id,reviewerId:teacher.id,
      observations:[{category:'IDEA',finding:'Synthetic observation about books.',evidence:{startOffset:7,endOffset:12,
        exactQuote:'books',claim:'The writing mentions books.'}}]});
    // Simulate arrival at the human-review queue, without invoking a live AI worker.
    await db.assessment.update({where:{id:assessment.id},data:{status:'HUMAN_REVIEW'}});
    const reviews=new HumanReviewService(db);
    const review=await reviews.open(actor(teacher),assessment.id,reason);
    await reviews.propose(actor(teacher),review.caseId,[{factorId:'content',criterionId:'c2',proposedScore:'2',
      rationale:'Synthetic human-reviewed browser evidence: the writing mentions books.',
      evidence:[{startOffset:7,endOffset:12,exactQuote:'books',claim:'The writing mentions books.'}]}],reason);
    await reviews.decide(actor(reviewer),review.caseId,'APPROVE',reason);
    return {finalized:true};
  }
  throw new Error('Unknown synthetic fixture command');
}
try{process.stdout.write(JSON.stringify(await action(process.argv[2],JSON.parse(process.argv[3]??'{}'))));}
finally{await db.$disconnect();}

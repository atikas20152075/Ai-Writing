import {createVerifiedText, hash, lockAssessmentContext, type PublishedRubric,
  type ExaminerProposal, type VerificationApproval} from '../src/index.ts';

// Demonstration fixture: these are human-authored sample scores, NOT model output.
export const rubric: PublishedRubric = Object.freeze({
  id:'guided-demo',versionId:'guided-demo-v1',status:'PUBLISHED' as const,
  scoreStep:'0.5',totalMarks:'10',
  factors:[
    {id:'content', name:'Content',maxScore:'6',criteria:[
      {id:'c6',score:'6',description:'Fully developed and relevant'},
      {id:'c4',score:'4',description:'Relevant but partly developed'},
      {id:'c0',score:'0',description:'Insufficient assessable content'}]},
    {id:'grammar',name:'Grammar',maxScore:'4',criteria:[
      {id:'g4',score:'4',description:'Grammar generally accurate'},
      {id:'g3',score:'3',description:'Minor grammar issues'},
      {id:'g0',score:'0',description:'Insufficient assessable grammar'}]}
  ]
});
export const verifiedText = createVerifiedText(
  'verified-demo-1','submission-demo-1','ENGLISH',
  'I like reading because books teach me new ideas. I read every day.'
);
export const context = lockAssessmentContext('assessment-demo-1', verifiedText,
  hash('original-topic-snapshot-with-clues'),hash('versioned-understanding-snapshot'),rubric);
function evidence(needle:string, claim:string) {
  const start=Array.from(verifiedText.text.slice(0,verifiedText.text.indexOf(needle))).length;
  const length=Array.from(needle).length;
  return {startOffset:start,endOffset:start+length,exactQuote:needle,claim};
}
export const proposal: ExaminerProposal = {
  examinerRunId:'manual-fixture-not-ai',assessmentId:context.assessmentId,
  verifiedTextId:verifiedText.id,rubricVersionId:rubric.versionId,inputHash:context.inputHash,
  factorResults:[
    {factorId:'content',criterionId:'c4',proposedScore:'4',
      rationale:'Manually authored example; not an AI grading judgment.',
      evidence:[evidence('books teach me new ideas','Example of relevant supporting idea')]},
    {factorId:'grammar',criterionId:'g4',proposedScore:'4',
      rationale:'Manually authored example; not an AI grading judgment.',
      evidence:[evidence('I read every day','Representative grammatical sentence')]}
  ]
};
// Trusted-service-shaped fixture only; NOT proof of actual independent verification.
export const simulatedApproval:VerificationApproval = {
  verificationAttemptId:'manual-approval-fixture',acceptedExaminerRunId:proposal.examinerRunId,
  inputHash:context.inputHash,status:'PASS',reviewedFactorIds:['content','grammar'],
  scoreChangingCorrection:false
};

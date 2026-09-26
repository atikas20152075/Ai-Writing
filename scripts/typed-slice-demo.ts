import {validateExaminerProposal,finalizeApprovedAssessment} from '../packages/domain/src/index.ts';
import {context,proposal,simulatedApproval} from '../packages/domain/fixtures/typed-case.ts';
const validated=validateExaminerProposal(context,proposal);
const result=finalizeApprovedAssessment(validated,simulatedApproval);
console.log(JSON.stringify({
  warning:'DEMO ONLY: scores were manually authored; verifier approval simulated. NOT AI-graded.',
  assessmentId:result.assessmentId,status:result.status,
  total:`${result.totalScore}/${result.totalMarks}`,
  factorScores:result.factorResults.map(f=>({factorId:f.factorId,score:f.proposedScore})),
  inputHash:result.inputHash,
},null,2));

import {DomainValidationError, type PublishedRubric, validatePublishedRubric} from '../../../../packages/domain/src/index.ts';
import {activeEnrollment, coreAssessmentAuthorized, type EnrollmentForPolicy, type AuthorityForPolicy} from './access-policy.ts';

export interface SubmissionEligibility {
  studentId: string; programId: string; batchId: string;
  enrollment: EnrollmentForPolicy | null;
  authority: AuthorityForPolicy | null;
  programActive: boolean; batchActive: boolean;
  topic: {programId: string; language: string; writingType: string; status: string};
  rubric: {programId: string; language: string; writingType: string; status: string; snapshot: PublishedRubric};
  boundRubricVersionId: string; selectedRubricVersionId: string;
  text: string; now?: Date;
}
const deny = (code: string, message: string): never => {throw new DomainValidationError(code, message);};
export function assertTypedSubmissionEligible(input: SubmissionEligibility): void {
  const now = input.now ?? new Date();
  if (!input.programActive || !input.batchActive ||
      !activeEnrollment(input.enrollment,input.studentId,input.programId,input.batchId,now)) {
    deny('NO_ACTIVE_ENROLLMENT','Student is not actively enrolled in this program and batch');
  }
  if (!coreAssessmentAuthorized(input.authority,input.studentId,input.programId,now)) {
    deny('NO_PROCESSING_AUTHORITY','Active reviewed processing authority for this purpose is required');
  }
  if (input.topic.status !== 'PUBLISHED' || input.topic.programId !== input.programId ||
      input.rubric.status !== 'PUBLISHED' || input.rubric.programId !== input.programId ||
      input.rubric.language !== input.topic.language || input.rubric.writingType !== input.topic.writingType ||
      input.boundRubricVersionId !== input.selectedRubricVersionId ||
      input.rubric.snapshot.versionId !== input.selectedRubricVersionId) {
    deny('ACADEMIC_SCOPE_MISMATCH','Topic and bound published rubric must share program/type/language');
  }
  validatePublishedRubric(input.rubric.snapshot);
  if (typeof input.text !== 'string' || input.text.trim().length < 10 ||
      Array.from(input.text).length > 12_000 || input.text.includes('\u0000')) {
    deny('INVALID_WRITING','Typed writing must contain 10–12,000 code points of accepted text');
  }
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string,unknown>;
    return `{${Object.keys(record).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

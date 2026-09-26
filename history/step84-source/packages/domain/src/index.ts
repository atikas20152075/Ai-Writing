/** Step 83 domain core. No AI model; validates externally supplied proposals. */
import { createHash } from 'node:crypto';

export type DecimalString = string;
export interface Criterion {
  id: string;
  score: DecimalString;
  description: string;
}
export interface Factor {
  id: string;
  name: string;
  maxScore: DecimalString;
  criteria: Criterion[];
}
export interface PublishedRubric {
  id: string;
  versionId: string;
  status: 'PUBLISHED';
  scoreStep: DecimalString;
  totalMarks: DecimalString;
  factors: Factor[];
}
export interface VerifiedText {
  id: string;
  submissionId: string;
  language: 'BANGLA' | 'ENGLISH';
  text: string;
  contentHash: string;
}
export interface LockedContext {
  assessmentId: string;
  verifiedText: VerifiedText;
  topicSnapshotHash: string;
  understandingSnapshotHash: string;
  rubric: PublishedRubric;
  inputHash: string;
}
export interface EvidenceSpan {
  startOffset: number; // Unicode code points, exclusive end offset
  endOffset: number;
  exactQuote: string;
  claim: string;
}
export interface FactorProposal {
  factorId: string;
  criterionId: string;
  proposedScore: DecimalString;
  rationale: string;
  evidence: EvidenceSpan[];
}
export interface ExaminerProposal {
  examinerRunId: string;
  assessmentId: string;
  verifiedTextId: string;
  rubricVersionId: string;
  inputHash: string;
  factorResults: FactorProposal[];
}
export interface VerifiedProposal {
  examinerRunId: string;
  assessmentId: string;
  inputHash: string;
  factorResults: ReadonlyArray<FactorProposal>;
  totalScore: string;
  totalMarks: string;
}
export interface VerificationApproval {
  // Must be built by the trusted backend verifier service in production.
  verificationAttemptId: string;
  acceptedExaminerRunId: string;
  inputHash: string;
  status: 'PASS' | 'MINOR_CORRECTION' | 'MAJOR_REVIEW' | 'FAILED';
  reviewedFactorIds: string[];
  scoreChangingCorrection: boolean;
}
export interface FinalizedResult {
  assessmentId: string;
  examinerRunId: string;
  verificationAttemptId: string;
  inputHash: string;
  status: 'FINALIZED';
  totalScore: string;
  totalMarks: string;
  factorResults: ReadonlyArray<FactorProposal>;
  finalScoreSource: 'AI';
}

export class DomainValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainValidationError';
    this.code = code;
  }
}
function ensure(ok: unknown, code: string, message: string): asserts ok {
  if (!ok) throw new DomainValidationError(code, message);
}
export const hash = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

// Exact base-10 rational arithmetic; no JS floating-point mark summation.
const DECIMAL_RE = /^(0|[1-9]\d*)(\.\d{1,4})?$/;
const factor10 = (n: number): bigint => 10n ** BigInt(n);
function decimalParts(value: string): {numerator: bigint; scale: number} {
  ensure(typeof value === 'string' && DECIMAL_RE.test(value),
    'INVALID_DECIMAL', `Invalid decimal representation: ${String(value)}`);
  const [integer, fraction = ''] = value.split('.');
  return {numerator: BigInt(integer + fraction), scale: fraction.length};
}
function commonScale(a: string, b: string): {a: bigint; b: bigint; scale: number} {
  const x = decimalParts(a);
  const y = decimalParts(b);
  const scale = Math.max(x.scale, y.scale);
  return {
    a: x.numerator * factor10(scale - x.scale),
    b: y.numerator * factor10(scale - y.scale),
    scale
  };
}
export function scoreToUnits(score: string, step: string): bigint {
  const {a, b} = commonScale(score, step);
  ensure(b > 0n, 'INVALID_SCORE_STEP', 'Score step must be positive');
  ensure(a % b === 0n, 'INVALID_SCORE_INCREMENT', `Score ${score} is not a multiple of ${step}`);
  return a / b;
}
export function unitsToScore(units: bigint, step: string): string {
  ensure(units >= 0n, 'NEGATIVE_SCORE', 'Negative units');
  const x = decimalParts(step);
  const result = units * x.numerator;
  const base = factor10(x.scale);
  const integer = result / base;
  const remainder = result % base;
  if (remainder === 0n) return integer.toString();
  return `${integer}.${remainder.toString().padStart(x.scale, '0').replace(/0+$/, '')}`;
}
function unique(values: string[]): boolean {
  return values.length === new Set(values).size;
}
export function validatePublishedRubric(rubric: PublishedRubric): void {
  ensure(rubric.status === 'PUBLISHED', 'RUBRIC_NOT_PUBLISHED', 'Draft rubrics cannot grade');
  ensure(rubric.id.length > 0 && rubric.versionId.length > 0, 'INVALID_RUBRIC_ID', 'Rubric IDs required');
  ensure(rubric.factors.length > 0 && unique(rubric.factors.map(f => f.id)),
    'INVALID_RUBRIC_FACTORS', 'Factors missing or duplicated');
  const totalUnits = scoreToUnits(rubric.totalMarks, rubric.scoreStep);
  let sum = 0n;
  for (const factor of rubric.factors) {
    ensure(factor.id.length > 0 && factor.name.length > 0 && factor.criteria.length > 0,
      'INVALID_FACTOR', 'Factor must have ID, name and criteria');
    const max = scoreToUnits(factor.maxScore, rubric.scoreStep);
    ensure(max > 0n, 'INVALID_FACTOR_MAX', 'Factor maximum must be positive');
    ensure(unique(factor.criteria.map(c => c.id)), 'DUPLICATE_CRITERION', 'Repeated criterion ID');
    ensure(factor.criteria.some(c => scoreToUnits(c.score, rubric.scoreStep) === max),
      'MISSING_MAX_CRITERION', 'Each factor needs its published max-score criterion');
    for (const criterion of factor.criteria) {
      ensure(criterion.id.length > 0 && criterion.description.trim().length > 0,
        'INVALID_CRITERION', 'Criterion needs ID and description');
      ensure(scoreToUnits(criterion.score, rubric.scoreStep) <= max,
        'CRITERION_OUT_OF_RANGE', 'Criterion exceeds factor maximum');
    }
    sum += max;
  }
  ensure(sum === totalUnits, 'RUBRIC_TOTAL_MISMATCH', 'Factor maxima must sum to rubric total');
}
export function createVerifiedText(
  id: string, submissionId: string, language: VerifiedText['language'], text: string
): VerifiedText {
  ensure(id.length > 0 && submissionId.length > 0, 'INVALID_TEXT_ID', 'IDs required');
  ensure(language === 'BANGLA' || language === 'ENGLISH', 'UNSUPPORTED_LANGUAGE', 'Language not supported');
  ensure(text.trim().length > 0, 'EMPTY_WRITING', 'Cannot assess empty writing');
  return Object.freeze({id, submissionId, language, text, contentHash: hash(text)});
}
export function lockAssessmentContext(
  assessmentId: string,
  verifiedText: VerifiedText,
  topicSnapshotHash: string,
  understandingSnapshotHash: string,
  rubric: PublishedRubric
): LockedContext {
  ensure(assessmentId.length > 0, 'INVALID_ASSESSMENT_ID', 'Assessment ID is required');
  ensure(verifiedText.contentHash === hash(verifiedText.text),
    'VERIFIED_TEXT_HASH_MISMATCH', 'Verified text changed after confirmation');
  ensure(/^[0-9a-f]{64}$/.test(topicSnapshotHash) && /^[0-9a-f]{64}$/.test(understandingSnapshotHash),
    'INVALID_CONTEXT_HASH', 'Context hashes must be SHA-256 hex');
  validatePublishedRubric(rubric);
  const inputHash = hash(JSON.stringify({
    assessmentId,
    verifiedTextId: verifiedText.id,
    contentHash: verifiedText.contentHash,
    topicSnapshotHash,
    understandingSnapshotHash,
    rubric
  }));
  return Object.freeze({assessmentId, verifiedText, topicSnapshotHash,
    understandingSnapshotHash, rubric, inputHash});
}
export function validateEvidence(text: string, span: EvidenceSpan): void {
  const points = Array.from(text);
  ensure(Number.isInteger(span.startOffset) && Number.isInteger(span.endOffset) &&
    span.startOffset >= 0 && span.endOffset > span.startOffset && span.endOffset <= points.length,
    'INVALID_EVIDENCE_OFFSETS', 'Offsets must be valid Unicode code-point positions');
  ensure(points.slice(span.startOffset, span.endOffset).join('') === span.exactQuote,
    'EVIDENCE_QUOTE_MISMATCH', 'Evidence quote is not present at the claimed offsets');
  ensure(span.claim.trim().length > 0, 'EVIDENCE_CLAIM_MISSING', 'Evidence requires a claim');
  // Unicode code-point offsets are canonical, but highlighting must not split a grapheme.
  const boundaries = new Set<number>([0]);
  const segmenter = new Intl.Segmenter('und', {granularity: 'grapheme'});
  for (const segment of segmenter.segment(text)) {
    boundaries.add(Array.from(text.slice(0, segment.index)).length);
    boundaries.add(Array.from(text.slice(0, segment.index + segment.segment.length)).length);
  }
  ensure(boundaries.has(span.startOffset) && boundaries.has(span.endOffset),
    'SPLIT_GRAPHEME', 'Evidence span cannot split a visible grapheme');
  // Semantic support cannot be established by string matching alone. Independent AI/human review follows.
}
export function validateExaminerProposal(
  context: LockedContext, proposal: ExaminerProposal
): VerifiedProposal {
  ensure(proposal.examinerRunId.length > 0, 'INVALID_EXAMINER_RUN', 'Examiner run ID required');
  ensure(proposal.assessmentId === context.assessmentId && proposal.verifiedTextId === context.verifiedText.id &&
    proposal.rubricVersionId === context.rubric.versionId && proposal.inputHash === context.inputHash,
    'ASSESSMENT_CONTEXT_MISMATCH', 'Proposal does not match locked context');
  const rubric = context.rubric;
  ensure(proposal.factorResults.length === rubric.factors.length &&
    unique(proposal.factorResults.map(f => f.factorId)),
    'FACTOR_SET_MISMATCH', 'Exactly one result is required for every published factor');
  const byId = new Map(rubric.factors.map(f => [f.id, f]));
  let sum = 0n;
  for (const proposed of proposal.factorResults) {
    const factor = byId.get(proposed.factorId);
    ensure(factor, 'UNKNOWN_FACTOR', 'Factor is not part of the published rubric');
    const criterion = factor.criteria.find(c => c.id === proposed.criterionId);
    ensure(criterion, 'UNKNOWN_CRITERION', 'Selected criterion is not in this factor');
    const score = scoreToUnits(proposed.proposedScore, rubric.scoreStep);
    ensure(score <= scoreToUnits(factor.maxScore, rubric.scoreStep) &&
      score === scoreToUnits(criterion.score, rubric.scoreStep),
      'CRITERION_SCORE_MISMATCH', 'Score must equal the published criterion score');
    ensure(typeof proposed.rationale === 'string' && proposed.rationale.trim().length > 0,
      'RATIONALE_MISSING', 'Each factor requires concise rationale');
    ensure(proposed.evidence.length > 0, 'EVIDENCE_MISSING', 'Each factor requires supporting evidence');
    for (const span of proposed.evidence) validateEvidence(context.verifiedText.text, span);
    sum += score;
  }
  ensure(sum <= scoreToUnits(rubric.totalMarks, rubric.scoreStep),
    'SCORE_OUT_OF_RANGE', 'Total score exceeds the published rubric');
  return Object.freeze({examinerRunId: proposal.examinerRunId,
    assessmentId: context.assessmentId, inputHash: context.inputHash,
    factorResults: Object.freeze([...proposal.factorResults]),
    totalScore: unitsToScore(sum, rubric.scoreStep), totalMarks: rubric.totalMarks});
}
export function finalizeApprovedAssessment(
  result: VerifiedProposal,
  approval: VerificationApproval,
  previous?: FinalizedResult
): FinalizedResult {
  ensure(approval.status === 'PASS' && !approval.scoreChangingCorrection,
    'VERIFICATION_NOT_APPROVED', 'Disputed or failed verification cannot finalize');
  ensure(approval.verificationAttemptId.length > 0 &&
    approval.acceptedExaminerRunId === result.examinerRunId && approval.inputHash === result.inputHash,
    'VERIFICATION_CONTEXT_MISMATCH', 'Verifier must approve this exact examiner run and input');
  ensure(unique(approval.reviewedFactorIds) &&
    approval.reviewedFactorIds.length === result.factorResults.length &&
    approval.reviewedFactorIds.every(id => result.factorResults.some(f => f.factorId === id)),
    'VERIFICATION_FACTOR_MISMATCH', 'Approval must explicitly cover every factor');
  if (previous) {
    ensure(previous.examinerRunId === result.examinerRunId && previous.inputHash === result.inputHash &&
      previous.verificationAttemptId === approval.verificationAttemptId,
      'ALREADY_FINALIZED', 'Conflicting attempt cannot overwrite finalized assessment');
    return previous; // idempotent same accepted attempt
  }
  return Object.freeze({assessmentId: result.assessmentId,
    examinerRunId: result.examinerRunId,
    verificationAttemptId: approval.verificationAttemptId,
    inputHash: result.inputHash, status: 'FINALIZED' as const,
    totalScore: result.totalScore, totalMarks: result.totalMarks,
    factorResults: result.factorResults, finalScoreSource: 'AI' as const});
}

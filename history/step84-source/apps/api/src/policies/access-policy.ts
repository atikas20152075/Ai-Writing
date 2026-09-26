/** Pure policy decisions. Query service MUST fetch current records scoped from PostgreSQL. */
export interface EnrollmentForPolicy {
  studentId: string; programId: string; batchId: string;
  status: 'ACTIVE' | 'ENDED'; startedAt: Date; endedAt: Date | null;
}
export interface GuardianLinkForPolicy {
  guardianId: string; studentId: string; programId: string;
  status: string; verifiedAt: Date | null; activatedAt: Date | null; revokedAt: Date | null;
}
export interface AssignmentForPolicy {
  teacherId: string; batchId: string; programId: string; assignedAt: Date; endedAt: Date | null;
}
export interface AuthorityForPolicy {
  studentId: string; programId: string; purpose: string; status: string;
  approvedAt: Date; endedAt: Date | null;
}
const current = (starts: Date, ends: Date | null, now: Date): boolean =>
  starts <= now && (ends === null || ends > now);

export function activeEnrollment(
  enrollment: EnrollmentForPolicy | null | undefined,
  studentId: string, programId: string, batchId: string, now: Date = new Date()
): boolean {
  return !!enrollment && enrollment.studentId === studentId && enrollment.programId === programId &&
    enrollment.batchId === batchId && enrollment.status === 'ACTIVE' &&
    current(enrollment.startedAt, enrollment.endedAt, now);
}
export function guardianCanRead(
  role: string, guardianId: string, studentId: string, programId: string,
  link: GuardianLinkForPolicy | null | undefined, now: Date = new Date()
): boolean {
  return role === 'PARENT' && !!link && link.guardianId === guardianId &&
    link.studentId === studentId && link.programId === programId && link.status === 'ACTIVE' &&
    !!link.verifiedAt && !!link.activatedAt && link.verifiedAt <= now &&
    current(link.activatedAt, link.revokedAt, now);
}
export function teacherCanRead(
  role: string, teacherId: string, studentId: string, programId: string, batchId: string,
  assignment: AssignmentForPolicy | null | undefined,
  enrollment: EnrollmentForPolicy | null | undefined, now: Date = new Date()
): boolean {
  return role === 'TEACHER' && !!assignment && assignment.teacherId === teacherId &&
    assignment.batchId === batchId && assignment.programId === programId &&
    current(assignment.assignedAt, assignment.endedAt, now) &&
    activeEnrollment(enrollment, studentId, programId, batchId, now);
}
export function coreAssessmentAuthorized(
  authority: AuthorityForPolicy | null | undefined,
  studentId: string, programId: string, now: Date = new Date()
): boolean {
  return !!authority && authority.studentId === studentId &&
    authority.programId === programId && authority.purpose === 'CORE_ASSESSMENT' &&
    authority.status === 'ACTIVE' && current(authority.approvedAt, authority.endedAt, now);
}

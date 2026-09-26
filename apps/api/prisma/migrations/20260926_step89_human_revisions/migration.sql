-- Step89: additive two-person human scoring, scope-bound reviews and revision-aware projections.
-- Apply only after Step88 on a disposable PostgreSQL instance; review all triggers before production.
CREATE TYPE "ReviewCaseKind" AS ENUM ('STUDENT_APPEAL','GUARDIAN_APPEAL','ACADEMIC_CORRECTION','AI_ESCALATION');
CREATE TYPE "ReviewCaseStatus" AS ENUM ('OPEN','PROPOSED','RESOLVED_CORRECTED','RESOLVED_UPHELD','RESOLVED_REJECTED');
CREATE TYPE "ReviewDecisionKind" AS ENUM ('APPROVE','REJECT','UPHOLD');

-- Program-specific academic administration. SUPER_ADMIN does not inherit student-writing access.
CREATE TABLE "AcademicAdminProgram" (
  "id" UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "programId" UUID NOT NULL REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT,
  "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "endedAt" TIMESTAMPTZ,
  CONSTRAINT "AdminProgram_effective_time" CHECK ("endedAt" IS NULL OR "endedAt">="assignedAt")
);
CREATE UNIQUE INDEX "AcademicAdminProgram_one_active" ON "AcademicAdminProgram"("userId","programId") WHERE "endedAt" IS NULL;
CREATE INDEX "AcademicAdminProgram_scope_idx" ON "AcademicAdminProgram"("userId","programId","endedAt");

CREATE TABLE "HumanReviewCase" (
  "id" UUID PRIMARY KEY,
  "assessmentId" UUID NOT NULL REFERENCES "Assessment"("id") ON DELETE RESTRICT,
  "openedById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "kind" "ReviewCaseKind" NOT NULL,
  "status" "ReviewCaseStatus" NOT NULL DEFAULT 'OPEN',
  "priorRevisionId" UUID REFERENCES "AssessmentScoreRevision"("id") ON DELETE RESTRICT,
  "understandingHash" VARCHAR(64) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "resolvedAt" TIMESTAMPTZ,
  CONSTRAINT "HumanReviewCase_reason" CHECK (char_length(trim("reason")) BETWEEN 20 AND 2000),
  CONSTRAINT "HumanReviewCase_lifecycle" CHECK (("status" IN ('OPEN','PROPOSED') AND "resolvedAt" IS NULL) OR
    ("status" NOT IN ('OPEN','PROPOSED') AND "resolvedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "HumanReviewCase_one_active_per_assessment" ON "HumanReviewCase"("assessmentId")
  WHERE "status" IN ('OPEN','PROPOSED');
CREATE INDEX "HumanReviewCase_scope_idx" ON "HumanReviewCase"("assessmentId","status","createdAt");

CREATE TABLE "HumanReviewProposal" (
  "id" UUID PRIMARY KEY,
  "reviewCaseId" UUID NOT NULL UNIQUE REFERENCES "HumanReviewCase"("id") ON DELETE RESTRICT,
  "proposedById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "inputHash" VARCHAR(64) NOT NULL,
  "rubricHash" VARCHAR(64) NOT NULL,
  "factorResults" JSONB NOT NULL,
  "totalScore" NUMERIC(12,4) NOT NULL,
  "totalMarks" NUMERIC(12,4) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "HumanReviewProposal_bounds" CHECK ("totalScore">=0 AND "totalMarks">0 AND "totalScore"<="totalMarks"),
  CONSTRAINT "HumanReviewProposal_factors" CHECK (jsonb_typeof("factorResults")='array'),
  CONSTRAINT "HumanReviewProposal_reason" CHECK (char_length(trim("reason")) BETWEEN 20 AND 2000)
);

CREATE TABLE "HumanReviewDecision" (
  "id" UUID PRIMARY KEY,
  "reviewCaseId" UUID NOT NULL UNIQUE REFERENCES "HumanReviewCase"("id") ON DELETE RESTRICT,
  "proposalId" UUID UNIQUE REFERENCES "HumanReviewProposal"("id") ON DELETE RESTRICT,
  "decidedById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "decision" "ReviewDecisionKind" NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "HumanReviewDecision_requires_proposal" CHECK (
    ("decision"='UPHOLD' AND "proposalId" IS NULL) OR
    ("decision" IN ('APPROVE','REJECT') AND "proposalId" IS NOT NULL)),
  CONSTRAINT "HumanReviewDecision_reason" CHECK (char_length(trim("reason")) BETWEEN 20 AND 2000)
);

ALTER TABLE "AssessmentScoreRevision" ALTER COLUMN "examinerRunId" DROP NOT NULL;
ALTER TABLE "AssessmentScoreRevision" ALTER COLUMN "verificationId" DROP NOT NULL;
ALTER TABLE "AssessmentScoreRevision" DROP CONSTRAINT "ScoreRevision_no_unreviewed_overrides";
ALTER TABLE "AssessmentScoreRevision" ADD COLUMN "reviewDecisionId" UUID UNIQUE REFERENCES "HumanReviewDecision"("id") ON DELETE RESTRICT;
ALTER TABLE "AssessmentScoreRevision" ADD CONSTRAINT "ScoreRevision_source_provenance" CHECK (
  ("source"='AI' AND "revisionNo"=1 AND "examinerRunId" IS NOT NULL AND "verificationId" IS NOT NULL AND "reviewDecisionId" IS NULL) OR
  ("source"='HUMAN' AND "revisionNo">=1 AND "examinerRunId" IS NULL AND "verificationId" IS NULL AND "reviewDecisionId" IS NOT NULL)
);

-- No downstream projections are CURRENT by assumption. These rows are pending work for future consumers.
CREATE TABLE "DerivedProjectionInvalidation" (
  "id" UUID PRIMARY KEY,
  "assessmentId" UUID NOT NULL REFERENCES "Assessment"("id") ON DELETE RESTRICT,
  "scoreRevisionId" UUID NOT NULL REFERENCES "AssessmentScoreRevision"("id") ON DELETE RESTRICT,
  "target" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "processedAt" TIMESTAMPTZ,
  CONSTRAINT "DerivedProjectionInvalidation_target" CHECK ("target" IN ('FEEDBACK','PRACTICE','PROGRESS','TEACHER','PARENT','REPORT')),
  CONSTRAINT "DerivedProjectionInvalidation_status" CHECK ("status" IN ('PENDING','PROCESSING','REBUILT','FAILED')),
  CONSTRAINT "DerivedProjectionInvalidation_scope_unique" UNIQUE ("assessmentId","scoreRevisionId","target")
);
CREATE INDEX "DerivedProjectionInvalidation_pending" ON "DerivedProjectionInvalidation"("status","createdAt");

-- Authorization at application level and additional SQL backstop for reviewers. Current assignment must be live.
CREATE FUNCTION step89_academic_reviewer_authorized(actor UUID, assessment UUID) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Assessment" a JOIN "Submission" s ON s.id=a."submissionId"
      JOIN "User" u ON u.id=actor
    WHERE a.id=assessment AND u.status='ACTIVE' AND EXISTS (
      SELECT 1 FROM "ProcessingAuthority" pa WHERE pa."studentId"=s."studentId"
        AND pa."programId"=s."programId" AND pa.purpose='CORE_ASSESSMENT'
        AND pa.status='ACTIVE' AND pa."endedAt" IS NULL) AND (
      (u.role='ACADEMIC_ADMIN' AND EXISTS (
        SELECT 1 FROM "AcademicAdminProgram" p WHERE p."userId"=actor AND p."programId"=s."programId"
          AND p."assignedAt"<=now() AND p."endedAt" IS NULL)) OR
      (u.role='TEACHER' AND EXISTS (
        SELECT 1 FROM "TeacherBatch" t JOIN "Enrollment" e ON e."batchId"=t."batchId"
        WHERE t."teacherId"=actor AND t."batchId"=s."batchId" AND t."assignedAt"<=now()
          AND t."endedAt" IS NULL AND e."studentId"=s."studentId" AND e."programId"=s."programId"
          AND e.status='ACTIVE' AND e."startedAt"<=now() AND e."endedAt" IS NULL))
    )
  )
$$;

CREATE FUNCTION step89_guard_review_case() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a_status "AssessmentStatus"; prior UUID; student_id UUID; program_id UUID; batch_id UUID; uhash VARCHAR(64); role_ "UserRole";
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT a.status,a."effectiveScoreRevisionId",s."studentId",s."programId",s."batchId",u."snapshotHash"
    INTO a_status,prior,student_id,program_id,batch_id,uhash
    FROM "Assessment" a JOIN "Submission" s ON s.id=a."submissionId"
      JOIN "UnderstandingSnapshot" u ON u."assessmentId"=a.id WHERE a.id=NEW."assessmentId";
  SELECT role INTO role_ FROM "User" WHERE id=NEW."openedById" AND status='ACTIVE';
  IF uhash IS NULL OR uhash<>NEW."understandingHash" OR
    (a_status='FINALIZED' AND (prior IS NULL OR prior IS DISTINCT FROM NEW."priorRevisionId" OR NEW.kind NOT IN ('STUDENT_APPEAL','GUARDIAN_APPEAL','ACADEMIC_CORRECTION'))) OR
    (a_status='HUMAN_REVIEW' AND (prior IS NOT NULL OR NEW."priorRevisionId" IS NOT NULL OR NEW.kind<>'AI_ESCALATION')) OR
    a_status NOT IN ('FINALIZED','HUMAN_REVIEW')
  THEN RAISE EXCEPTION 'STEP89_REVIEW_SOURCE_MISMATCH'; END IF;
  IF NOT (
    (role_='STUDENT' AND NEW.kind='STUDENT_APPEAL' AND EXISTS (SELECT 1 FROM "Student" st JOIN "ProcessingAuthority" pa ON pa."studentId"=st.id
      WHERE st.id=student_id AND st."userId"=NEW."openedById" AND pa."programId"=program_id AND pa.purpose='CORE_ASSESSMENT'
        AND pa.status='ACTIVE' AND pa."endedAt" IS NULL)) OR
    (role_='PARENT' AND NEW.kind='GUARDIAN_APPEAL' AND EXISTS (
      SELECT 1 FROM "ParentStudentLink" l JOIN "Enrollment" e ON e."studentId"=l."studentId" AND e."programId"=l."programId"
      WHERE l."guardianId"=NEW."openedById" AND l."studentId"=student_id AND l."programId"=program_id
        AND l.status='ACTIVE' AND EXISTS (SELECT 1 FROM "ProcessingAuthority" pa WHERE pa."studentId"=student_id
          AND pa."programId"=program_id AND pa.purpose='CORE_ASSESSMENT' AND pa.status='ACTIVE' AND pa."endedAt" IS NULL)
        AND l."verifiedAt" IS NOT NULL AND l."activatedAt" IS NOT NULL AND l."revokedAt" IS NULL
        AND e.status='ACTIVE' AND e."startedAt"<=now() AND e."endedAt" IS NULL)) OR
    (role_ IN ('TEACHER','ACADEMIC_ADMIN') AND NEW.kind IN ('ACADEMIC_CORRECTION','AI_ESCALATION')
      AND step89_academic_reviewer_authorized(NEW."openedById",NEW."assessmentId"))
  ) THEN RAISE EXCEPTION 'STEP89_REVIEW_REQUESTER_SCOPE'; END IF;
  RETURN NEW;
 ELSIF TG_OP='UPDATE' THEN
  IF ROW(OLD."assessmentId",OLD."openedById",OLD.kind,OLD."priorRevisionId",OLD."understandingHash",OLD.reason,OLD."createdAt")
    IS DISTINCT FROM ROW(NEW."assessmentId",NEW."openedById",NEW.kind,NEW."priorRevisionId",NEW."understandingHash",NEW.reason,NEW."createdAt")
  THEN RAISE EXCEPTION 'STEP89_REVIEW_CASE_IDENTITY_IMMUTABLE'; END IF;
  IF NOT (
    (OLD.status='OPEN' AND NEW.status='PROPOSED' AND EXISTS(SELECT 1 FROM "HumanReviewProposal" p WHERE p."reviewCaseId"=OLD.id)) OR
    (OLD.status='OPEN' AND NEW.status='RESOLVED_UPHELD' AND EXISTS(SELECT 1 FROM "HumanReviewDecision" d WHERE d."reviewCaseId"=OLD.id AND d.decision='UPHOLD')) OR
    (OLD.status='PROPOSED' AND NEW.status='RESOLVED_CORRECTED' AND EXISTS(
      SELECT 1 FROM "HumanReviewDecision" d JOIN "AssessmentScoreRevision" r ON r."reviewDecisionId"=d.id
      WHERE d."reviewCaseId"=OLD.id AND d.decision='APPROVE' AND r."assessmentId"=OLD."assessmentId")) OR
    (OLD.status='PROPOSED' AND NEW.status='RESOLVED_REJECTED' AND EXISTS(SELECT 1 FROM "HumanReviewDecision" d
      WHERE d."reviewCaseId"=OLD.id AND d.decision='REJECT'))
  ) OR (NEW.status IN ('OPEN','PROPOSED') AND NEW."resolvedAt" IS NOT NULL) OR
      (NEW.status NOT IN ('OPEN','PROPOSED') AND NEW."resolvedAt" IS NULL)
  THEN RAISE EXCEPTION 'STEP89_INVALID_REVIEW_CASE_TRANSITION'; END IF;
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'STEP89_REVIEW_CASE_DELETE_FORBIDDEN';
END $$;
CREATE TRIGGER "HumanReviewCase_guard" BEFORE INSERT OR UPDATE OR DELETE ON "HumanReviewCase"
 FOR EACH ROW EXECUTE FUNCTION step89_guard_review_case();

CREATE FUNCTION step89_guard_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "HumanReviewCase" c JOIN "Assessment" a ON a.id=c."assessmentId"
   JOIN "Submission" s ON s.id=a."submissionId" JOIN "UnderstandingSnapshot" u ON u."assessmentId"=a.id
   WHERE c.id=NEW."reviewCaseId" AND c.status='OPEN'
     AND a."effectiveScoreRevisionId" IS NOT DISTINCT FROM c."priorRevisionId"
     AND u."snapshotHash"=c."understandingHash" AND s."rubricHash"=NEW."rubricHash"
     AND step89_academic_reviewer_authorized(NEW."proposedById",a.id)
     AND jsonb_typeof(NEW."factorResults")='array')
 THEN RAISE EXCEPTION 'STEP89_INVALID_REVIEW_PROPOSAL'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "HumanReviewProposal_guard" BEFORE INSERT ON "HumanReviewProposal" FOR EACH ROW EXECUTE FUNCTION step89_guard_proposal();

CREATE FUNCTION step89_guard_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM "HumanReviewCase" c LEFT JOIN "HumanReviewProposal" p ON p.id=NEW."proposalId"
  WHERE c.id=NEW."reviewCaseId" AND step89_academic_reviewer_authorized(NEW."decidedById",c."assessmentId")
    AND (
      (NEW.decision='UPHOLD' AND c.status='OPEN' AND c."priorRevisionId" IS NOT NULL
        AND NEW."decidedById"<>c."openedById" AND NEW."proposalId" IS NULL) OR
      (NEW.decision IN ('APPROVE','REJECT') AND c.status='PROPOSED' AND p."reviewCaseId"=c.id
        AND NEW."decidedById"<>p."proposedById")
    )
 ) THEN RAISE EXCEPTION 'STEP89_INVALID_REVIEW_DECISION'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "HumanReviewDecision_guard" BEFORE INSERT ON "HumanReviewDecision"
 FOR EACH ROW EXECUTE FUNCTION step89_guard_decision();

-- Keep exact historical AI checks from Step88; allow HUMAN only with independently approved provenance.
CREATE OR REPLACE FUNCTION step88_guard_score_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source='AI' THEN
  IF NOT EXISTS (
    SELECT 1 FROM "AIExaminerRun" e
      JOIN "AIVerificationAttempt" v ON v."examinerRunId"=e.id
      JOIN "AIProcessingAttempt" p ON p.id=e."processingAttemptId"
      JOIN "AIReleaseGate" g ON g.id=e."gateId"
      JOIN "Assessment" a ON a.id=e."assessmentId"
      JOIN "Submission" s ON s.id=a."submissionId"
      JOIN "VerifiedWritingText" t ON t."submissionId"=s.id
      JOIN "UnderstandingSnapshot" u ON u."assessmentId"=a.id
    WHERE e.id=NEW."examinerRunId" AND v.id=NEW."verificationId"
      AND e."assessmentId"=NEW."assessmentId" AND v.status='PASS'
      AND NOT v."scoreChangingCorrection" AND p."assessmentId"=a.id
      AND NEW."inputHash"=e."inputHash" AND NEW."inputHash"=v."inputHash"
      AND NEW."totalScore"=e."totalScore" AND NEW."totalMarks"=e."totalMarks"
      AND NEW."factorResults"=e.proposal->'factorResults'
      AND u."verifiedTextId"=t.id AND u."verifiedTextHash"=t."contentHash"
      AND u."topicHash"=s."topicHash" AND u."rubricHash"=s."rubricHash"
      AND g.id=e."gateId" AND g."programId"=s."programId"
      AND g."rubricVersionId"=s."rubricVersionId" AND g.language=t.language
      AND g."revokedAt" IS NULL AND g."expiresAt">now()
      AND a."effectiveScoreRevisionId" IS NULL AND NEW."revisionNo"=1
  ) THEN RAISE EXCEPTION 'STEP88_UNVERIFIED_SCORE_REVISION'; END IF;
 ELSIF NEW.source='HUMAN' THEN
  IF NOT EXISTS (
    SELECT 1 FROM "HumanReviewDecision" d JOIN "HumanReviewProposal" p ON p.id=d."proposalId"
      JOIN "HumanReviewCase" c ON c.id=d."reviewCaseId" AND c.id=p."reviewCaseId"
      JOIN "Assessment" a ON a.id=c."assessmentId"
      JOIN "Submission" s ON s.id=a."submissionId"
      JOIN "VerifiedWritingText" t ON t."submissionId"=s.id
      JOIN "UnderstandingSnapshot" u ON u."assessmentId"=a.id
    WHERE d.id=NEW."reviewDecisionId" AND d.decision='APPROVE' AND c.status='PROPOSED'
      AND c."assessmentId"=NEW."assessmentId" AND c."priorRevisionId" IS NOT DISTINCT FROM a."effectiveScoreRevisionId"
      AND p."proposedById"<>d."decidedById"
      AND step89_academic_reviewer_authorized(p."proposedById",a.id)
      AND step89_academic_reviewer_authorized(d."decidedById",a.id)
      AND c."understandingHash"=u."snapshotHash" AND u."verifiedTextId"=t.id
      AND u."verifiedTextHash"=t."contentHash" AND u."topicHash"=s."topicHash"
      AND u."rubricHash"=s."rubricHash" AND p."rubricHash"=s."rubricHash"
      AND NEW."inputHash"=p."inputHash" AND NEW."factorResults"=p."factorResults"
      AND NEW."totalScore"=p."totalScore" AND NEW."totalMarks"=p."totalMarks"
      AND NEW."totalMarks"=(s."rubricSnapshot"->>'totalMarks')::NUMERIC
      AND jsonb_typeof(NEW."factorResults")='array'
      AND jsonb_array_length(NEW."factorResults")=jsonb_array_length(s."rubricSnapshot"->'factors')
      AND NEW."totalScore"=(SELECT sum((f->>'proposedScore')::NUMERIC)
         FROM jsonb_array_elements(NEW."factorResults") f)
      AND (SELECT count(DISTINCT f->>'factorId') FROM jsonb_array_elements(NEW."factorResults") f)=
         jsonb_array_length(NEW."factorResults")
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW."factorResults") f
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(s."rubricSnapshot"->'factors') rf,
            jsonb_array_elements(rf->'criteria') cr
          WHERE rf->>'id'=f->>'factorId' AND cr->>'id'=f->>'criterionId'
            AND (cr->>'score')::NUMERIC=(f->>'proposedScore')::NUMERIC
        )
      )
      AND (
        (c."priorRevisionId" IS NULL AND NEW."revisionNo"=1 AND a.status='HUMAN_REVIEW' AND
          NOT EXISTS(SELECT 1 FROM "AssessmentScoreRevision" existing WHERE existing."assessmentId"=a.id)) OR
        (c."priorRevisionId" IS NOT NULL AND a.status='FINALIZED' AND EXISTS(
          SELECT 1 FROM "AssessmentScoreRevision" prev WHERE prev.id=c."priorRevisionId"
            AND prev."assessmentId"=a.id AND NEW."revisionNo"=prev."revisionNo"+1))
      )
  ) THEN RAISE EXCEPTION 'STEP89_UNAPPROVED_HUMAN_REVISION'; END IF;
 ELSE RAISE EXCEPTION 'STEP89_UNKNOWN_REVISION_SOURCE'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION step88_guard_finalization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_ TEXT;
BEGIN
  IF TG_OP='INSERT' AND NEW.status='FINALIZED' THEN RAISE EXCEPTION 'STEP89_PREMATURE_FINALIZATION'; END IF;
  IF TG_OP='UPDATE' AND OLD.status='FINALIZED' AND NEW.status<>'FINALIZED' THEN
    RAISE EXCEPTION 'STEP89_FINAL_SCORE_CANNOT_BE_UNPUBLISHED';
  END IF;
  IF NEW.status='FINALIZED' AND (TG_OP='INSERT' OR OLD.status<>'FINALIZED' OR
       NEW."effectiveScoreRevisionId" IS DISTINCT FROM OLD."effectiveScoreRevisionId") THEN
    SELECT source INTO source_ FROM "AssessmentScoreRevision" WHERE id=NEW."effectiveScoreRevisionId" AND "assessmentId"=NEW.id;
    IF source_='AI' THEN
      IF TG_OP<>'UPDATE' OR OLD.status<>'VERIFIER_PENDING' OR OLD."effectiveScoreRevisionId" IS NOT NULL OR NOT EXISTS(
        SELECT 1 FROM "AssessmentScoreRevision" r
          JOIN "AIExaminerRun" e ON e.id=r."examinerRunId"
          JOIN "AIVerificationAttempt" v ON v.id=r."verificationId"
          JOIN "AIReleaseGate" g ON g.id=e."gateId"
        WHERE r.id=NEW."effectiveScoreRevisionId" AND r."assessmentId"=NEW.id AND r."revisionNo"=1
          AND e."assessmentId"=NEW.id AND v."examinerRunId"=e.id AND v.status='PASS'
          AND NOT v."scoreChangingCorrection" AND v."inputHash"=r."inputHash" AND e."inputHash"=r."inputHash"
          AND g."revokedAt" IS NULL AND g."expiresAt">now()
      ) THEN RAISE EXCEPTION 'STEP88_INVALID_EFFECTIVE_SCORE'; END IF;
    ELSIF source_='HUMAN' THEN
      IF TG_OP<>'UPDATE' OR NOT EXISTS(
        SELECT 1 FROM "AssessmentScoreRevision" r
          JOIN "HumanReviewDecision" d ON d.id=r."reviewDecisionId"
          JOIN "HumanReviewCase" c ON c.id=d."reviewCaseId"
        WHERE r.id=NEW."effectiveScoreRevisionId" AND r."assessmentId"=NEW.id
          AND d.decision='APPROVE' AND c.status='PROPOSED' AND c."assessmentId"=NEW.id
          AND c."priorRevisionId" IS NOT DISTINCT FROM OLD."effectiveScoreRevisionId"
          AND (
            (OLD.status='HUMAN_REVIEW' AND OLD."effectiveScoreRevisionId" IS NULL AND r."revisionNo"=1) OR
            (OLD.status='FINALIZED' AND OLD."effectiveScoreRevisionId" IS NOT NULL AND r."revisionNo"=(
              SELECT prev."revisionNo"+1 FROM "AssessmentScoreRevision" prev WHERE prev.id=OLD."effectiveScoreRevisionId"))
          )
      ) THEN RAISE EXCEPTION 'STEP89_INVALID_HUMAN_FINALIZATION'; END IF;
    ELSE RAISE EXCEPTION 'STEP89_INVALID_EFFECTIVE_SCORE_SOURCE'; END IF;
  END IF;
  RETURN NEW;
END $$;

-- Only frozen proposal/decision/revisions can produce an approved revision; reject silent history edits.
CREATE TRIGGER "HumanReviewProposal_immutable" BEFORE UPDATE OR DELETE ON "HumanReviewProposal"
 FOR EACH ROW EXECUTE FUNCTION step88_immutable();
CREATE TRIGGER "HumanReviewDecision_immutable" BEFORE UPDATE OR DELETE ON "HumanReviewDecision"
 FOR EACH ROW EXECUTE FUNCTION step88_immutable();

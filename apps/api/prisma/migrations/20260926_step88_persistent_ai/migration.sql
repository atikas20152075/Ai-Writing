-- Step88: run ONLY against migrated disposable PostgreSQL first. Expand additive records,
-- then replace the old blanket FINALIZED denial with a stricter relational trigger.
CREATE TYPE "AIAttemptStatus" AS ENUM ('CLAIMED','RETRYABLE','COMPLETED','HUMAN_REVIEW','FAILED');
CREATE TYPE "AIVerifierDecision" AS ENUM ('PASS','MAJOR_REVIEW','FAILED');

CREATE TABLE "UnderstandingSnapshot" (
  "id" UUID PRIMARY KEY,
  "assessmentId" UUID NOT NULL UNIQUE REFERENCES "Assessment"("id") ON DELETE RESTRICT,
  "verifiedTextId" UUID NOT NULL REFERENCES "VerifiedWritingText"("id") ON DELETE RESTRICT,
  "verifiedTextHash" VARCHAR(64) NOT NULL,
  "topicHash" VARCHAR(64) NOT NULL,
  "rubricHash" VARCHAR(64) NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "reviewedById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Understanding_human_review_required" CHECK (
    "schemaVersion"='understanding-human-v1' AND "snapshot"->>'source'='HUMAN_REVIEWED'
    AND jsonb_typeof("snapshot"->'observations')='array'
    AND jsonb_array_length("snapshot"->'observations')>0
  )
);

CREATE TABLE "AIReleaseGate" (
  "id" UUID PRIMARY KEY,
  "programId" UUID NOT NULL REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT,
  "rubricVersionId" UUID NOT NULL REFERENCES "RubricVersion"("id") ON DELETE RESTRICT,
  "language" "Language" NOT NULL,
  "examinerModel" TEXT NOT NULL,
  "verifierModel" TEXT NOT NULL,
  "academicBenchmarkRef" TEXT NOT NULL,
  "privacyReviewRef" TEXT NOT NULL,
  "approvedById" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "approvedAt" TIMESTAMPTZ NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ,
  CONSTRAINT "AIReleaseGate_two_models" CHECK ("examinerModel" <> "verifierModel"),
  CONSTRAINT "AIReleaseGate_provenance" CHECK (length("academicBenchmarkRef")>2 AND length("privacyReviewRef")>2),
  CONSTRAINT "AIReleaseGate_duration" CHECK ("expiresAt">"approvedAt")
);
CREATE INDEX "AIReleaseGate_scope_idx" ON "AIReleaseGate"("programId","rubricVersionId","language","revokedAt");

CREATE TABLE "AIProcessingAttempt" (
  "id" UUID PRIMARY KEY,
  "assessmentId" UUID NOT NULL REFERENCES "Assessment"("id") ON DELETE RESTRICT,
  "gateId" UUID NOT NULL REFERENCES "AIReleaseGate"("id") ON DELETE RESTRICT,
  "runKey" VARCHAR(64) NOT NULL UNIQUE,
  "inputHash" VARCHAR(64) NOT NULL,
  "leaseToken" UUID NOT NULL,
  "leaseUntil" TIMESTAMPTZ NOT NULL,
  "attemptCount" INT NOT NULL DEFAULT 1,
  "status" "AIAttemptStatus" NOT NULL DEFAULT 'CLAIMED',
  "errorCode" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "AIProcessing_attempt_positive" CHECK ("attemptCount">0)
);
CREATE INDEX "AIProcessingAttempt_assessment_status_idx" ON "AIProcessingAttempt"("assessmentId","status");
CREATE INDEX "AIProcessingAttempt_status_lease_idx" ON "AIProcessingAttempt"("status","leaseUntil");

CREATE TABLE "AIExaminerRun" (
  "id" UUID PRIMARY KEY,
  "assessmentId" UUID NOT NULL REFERENCES "Assessment"("id") ON DELETE RESTRICT,
  "processingAttemptId" UUID NOT NULL UNIQUE REFERENCES "AIProcessingAttempt"("id") ON DELETE RESTRICT,
  "gateId" UUID NOT NULL REFERENCES "AIReleaseGate"("id") ON DELETE RESTRICT,
  "externalRunId" TEXT NOT NULL,
  "inputHash" VARCHAR(64) NOT NULL,
  "proposal" JSONB NOT NULL,
  "proposalHash" VARCHAR(64) NOT NULL,
  "totalScore" DECIMAL(12,4) NOT NULL,
  "totalMarks" DECIMAL(12,4) NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "providerRequestId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "AIExaminerRun_unique_external" UNIQUE ("assessmentId","externalRunId"),
  CONSTRAINT "AIExaminerRun_score_bounds" CHECK ("totalScore">=0 AND "totalMarks">0 AND "totalScore"<="totalMarks")
);
CREATE INDEX "AIExaminerRun_assessment_input_idx" ON "AIExaminerRun"("assessmentId","inputHash");

CREATE TABLE "AIVerificationAttempt" (
  "id" UUID PRIMARY KEY,
  "examinerRunId" UUID NOT NULL REFERENCES "AIExaminerRun"("id") ON DELETE RESTRICT,
  "externalAttemptId" TEXT NOT NULL,
  "inputHash" VARCHAR(64) NOT NULL,
  "status" "AIVerifierDecision" NOT NULL,
  "scoreChangingCorrection" BOOLEAN NOT NULL,
  "reviewedFactorIds" JSONB NOT NULL,
  "independentFactorResults" JSONB NOT NULL,
  "findings" JSONB NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "independentProviderRequestId" TEXT NOT NULL,
  "challengeProviderRequestId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "AIVerificationAttempt_external_unique" UNIQUE ("examinerRunId","externalAttemptId"),
  CONSTRAINT "AIVerificationAttempt_no_changed_pass" CHECK ("status"<>'PASS' OR NOT "scoreChangingCorrection")
);

CREATE TABLE "AssessmentScoreRevision" (
  "id" UUID PRIMARY KEY,
  "assessmentId" UUID NOT NULL REFERENCES "Assessment"("id") ON DELETE RESTRICT,
  "revisionNo" INT NOT NULL,
  "examinerRunId" UUID NOT NULL UNIQUE REFERENCES "AIExaminerRun"("id") ON DELETE RESTRICT,
  "verificationId" UUID NOT NULL UNIQUE REFERENCES "AIVerificationAttempt"("id") ON DELETE RESTRICT,
  "inputHash" VARCHAR(64) NOT NULL,
  "totalScore" DECIMAL(12,4) NOT NULL,
  "totalMarks" DECIMAL(12,4) NOT NULL,
  "factorResults" JSONB NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ScoreRevision_no_unreviewed_overrides" CHECK ("revisionNo"=1 AND "source"='AI'),
  CONSTRAINT "ScoreRevision_score_bounds" CHECK ("totalScore">=0 AND "totalMarks">0 AND "totalScore"<="totalMarks"),
  CONSTRAINT "AssessmentScoreRevision_scope_rev_unique" UNIQUE ("assessmentId","revisionNo")
);
ALTER TABLE "Assessment" ADD COLUMN "effectiveScoreRevisionId" UUID UNIQUE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_effective_revision_fk"
  FOREIGN KEY ("effectiveScoreRevisionId") REFERENCES "AssessmentScoreRevision"("id") ON DELETE RESTRICT;
ALTER TABLE "Assessment" DROP CONSTRAINT "Assessment_no_finalization_without_verifier";
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_no_finalization_without_verifier"
  CHECK ("status" <> 'FINALIZED' OR "effectiveScoreRevisionId" IS NOT NULL);

-- Refuse SQL-level examiner spoofing of an unrelated gate/context.
CREATE FUNCTION step88_guard_examiner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AIProcessingAttempt" p JOIN "AIReleaseGate" g ON g.id=p."gateId"
    WHERE p.id=NEW."processingAttemptId" AND p."assessmentId"=NEW."assessmentId"
      AND p."inputHash"=NEW."inputHash" AND p."gateId"=NEW."gateId"
      AND g."examinerModel"=NEW.model
      AND NEW."proposal"->>'assessmentId'=NEW."assessmentId"::text
      AND NEW."proposal"->>'inputHash'=NEW."inputHash"
      AND jsonb_typeof(NEW."proposal"->'factorResults')='array'
  ) THEN RAISE EXCEPTION 'STEP88_EXAMINER_CONTEXT_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AIExaminerRun_guard" BEFORE INSERT ON "AIExaminerRun"
  FOR EACH ROW EXECUTE FUNCTION step88_guard_examiner();

CREATE FUNCTION step88_guard_verifier() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AIExaminerRun" e JOIN "AIReleaseGate" g ON g.id=e."gateId"
    WHERE e.id=NEW."examinerRunId" AND e."inputHash"=NEW."inputHash"
      AND NEW.model=g."verifierModel" AND NEW.model<>e.model
      AND jsonb_typeof(NEW."reviewedFactorIds")='array'
      AND jsonb_typeof(NEW."independentFactorResults")='array'
      AND jsonb_typeof(NEW.findings)='array'
  ) THEN RAISE EXCEPTION 'STEP88_VERIFIER_CONTEXT_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AIVerificationAttempt_guard" BEFORE INSERT ON "AIVerificationAttempt"
  FOR EACH ROW EXECUTE FUNCTION step88_guard_verifier();

CREATE FUNCTION step88_guard_score_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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
      AND NEW."factorResults"=e."proposal"->'factorResults'
      AND u."verifiedTextId"=t.id AND u."verifiedTextHash"=t."contentHash"
      AND u."topicHash"=s."topicHash" AND u."rubricHash"=s."rubricHash"
      AND g.id=e."gateId" AND g."programId"=s."programId"
      AND g."rubricVersionId"=s."rubricVersionId" AND g.language=t.language
      AND g."revokedAt" IS NULL AND g."expiresAt">now()
  ) THEN RAISE EXCEPTION 'STEP88_UNVERIFIED_SCORE_REVISION'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AssessmentScoreRevision_guard" BEFORE INSERT ON "AssessmentScoreRevision"
  FOR EACH ROW EXECUTE FUNCTION step88_guard_score_revision();

CREATE FUNCTION step88_guard_finalization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='FINALIZED' AND (TG_OP='INSERT' OR OLD.status<>'FINALIZED' OR
      NEW."effectiveScoreRevisionId" IS DISTINCT FROM OLD."effectiveScoreRevisionId") THEN
    IF TG_OP='UPDATE' AND OLD.status<>'VERIFIER_PENDING' THEN
      RAISE EXCEPTION 'STEP88_INVALID_FINALIZATION_TRANSITION';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "AssessmentScoreRevision" r
      JOIN "AIExaminerRun" e ON e.id=r."examinerRunId"
      JOIN "AIVerificationAttempt" v ON v.id=r."verificationId"
      JOIN "AIReleaseGate" g ON g.id=e."gateId"
      WHERE r.id=NEW."effectiveScoreRevisionId" AND r."assessmentId"=NEW.id
        AND e."assessmentId"=NEW.id AND v."examinerRunId"=e.id
        AND v.status='PASS' AND NOT v."scoreChangingCorrection"
        AND v."inputHash"=r."inputHash" AND e."inputHash"=r."inputHash"
        AND g."revokedAt" IS NULL AND g."expiresAt">now()
    ) THEN RAISE EXCEPTION 'STEP88_INVALID_EFFECTIVE_SCORE'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='FINALIZED' AND
     (NEW.status<>'FINALIZED' OR NEW."effectiveScoreRevisionId" IS DISTINCT FROM OLD."effectiveScoreRevisionId") THEN
    RAISE EXCEPTION 'STEP88_FINAL_SCORE_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Assessment_guard_verified_finalization" BEFORE INSERT OR UPDATE ON "Assessment"
  FOR EACH ROW EXECUTE FUNCTION step88_guard_finalization();

-- Immutable evidence is protected even from accidental service-layer update/delete.
CREATE FUNCTION step88_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'STEP88_IMMUTABLE_ACADEMIC_EVIDENCE'; END $$;
CREATE TRIGGER "UnderstandingSnapshot_immutable" BEFORE UPDATE OR DELETE ON "UnderstandingSnapshot"
  FOR EACH ROW EXECUTE FUNCTION step88_immutable();
CREATE TRIGGER "AIExaminerRun_immutable" BEFORE UPDATE OR DELETE ON "AIExaminerRun"
  FOR EACH ROW EXECUTE FUNCTION step88_immutable();
CREATE TRIGGER "AIVerificationAttempt_immutable" BEFORE UPDATE OR DELETE ON "AIVerificationAttempt"
  FOR EACH ROW EXECUTE FUNCTION step88_immutable();
CREATE TRIGGER "AssessmentScoreRevision_immutable" BEFORE UPDATE OR DELETE ON "AssessmentScoreRevision"
  FOR EACH ROW EXECUTE FUNCTION step88_immutable();

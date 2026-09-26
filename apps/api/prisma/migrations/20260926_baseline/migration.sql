-- Step 84 baseline. Review and TEST on an isolated PostgreSQL database before deployment.
-- Prisma application-side uuid() generates UUIDs; these columns intentionally have no DB UUID default.
CREATE TYPE "UserRole" AS ENUM ('STUDENT','PARENT','TEACHER','ACADEMIC_ADMIN','SUPER_ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE','DISABLED');
CREATE TYPE "ProgramStatus" AS ENUM ('ACTIVE','ARCHIVED');
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE','ENDED');
CREATE TYPE "GuardianLinkStatus" AS ENUM ('PENDING','VERIFICATION_REQUIRED','VERIFIED','ACTIVE','SUSPENDED','REVOKED');
CREATE TYPE "AuthorityStatus" AS ENUM ('ACTIVE','WITHDRAWN','EXPIRED');
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT','PUBLISHED');
CREATE TYPE "Language" AS ENUM ('BANGLA','ENGLISH');
CREATE TYPE "SubmissionStatus" AS ENUM ('ACCEPTED','CANCELLED');
CREATE TYPE "AssessmentStatus" AS ENUM ('AWAITING_UNDERSTANDING','UNDERSTANDING_READY','EXAMINER_PENDING','VERIFIER_PENDING','HUMAN_REVIEW','FINALIZED','FAILED');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING','DISPATCHING','DISPATCHED');

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL, "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE TABLE "AuthSession" (
  "id" UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "revokedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId","revokedAt");
CREATE TABLE "AuthRefreshToken" (
  "id" UUID PRIMARY KEY, "sessionId" UUID NOT NULL REFERENCES "AuthSession"("id") ON DELETE RESTRICT,
  "tokenHash" VARCHAR(64) NOT NULL UNIQUE, "issuedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "consumedAt" TIMESTAMPTZ, "revokedAt" TIMESTAMPTZ, "expiresAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "AuthRefreshToken_sessionId_consumedAt_idx" ON "AuthRefreshToken"("sessionId","consumedAt");
CREATE TABLE "Student" (
  "id" UUID PRIMARY KEY, "userId" UUID NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE "AcademicProgram" (
  "id" UUID PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "status" "ProgramStatus" NOT NULL DEFAULT 'ACTIVE'
);
CREATE TABLE "Batch" (
  "id" UUID PRIMARY KEY, "programId" UUID NOT NULL REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT,
  "name" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "Batch_program_name_unique" UNIQUE ("programId", "name"),
  CONSTRAINT "Batch_id_program_unique" UNIQUE ("id", "programId")
);
CREATE TABLE "Enrollment" (
  "id" UUID PRIMARY KEY, "studentId" UUID NOT NULL REFERENCES "Student"("id") ON DELETE RESTRICT,
  "programId" UUID NOT NULL REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT,
  "batchId" UUID NOT NULL, "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "endedAt" TIMESTAMPTZ,
  CONSTRAINT "Enrollment_batch_program_fk" FOREIGN KEY ("batchId", "programId") REFERENCES "Batch"("id", "programId") ON DELETE RESTRICT,
  CONSTRAINT "Enrollment_end_after_start" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt")
);
CREATE UNIQUE INDEX "Enrollment_one_active_student_program" ON "Enrollment"("studentId", "programId") WHERE "status" = 'ACTIVE';
CREATE INDEX "Enrollment_studentId_programId_status_idx" ON "Enrollment"("studentId","programId","status");
CREATE INDEX "Enrollment_batchId_status_idx" ON "Enrollment"("batchId","status");
CREATE TABLE "TeacherBatch" (
  "id" UUID PRIMARY KEY, "teacherId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "batchId" UUID NOT NULL REFERENCES "Batch"("id") ON DELETE RESTRICT,
  "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "endedAt" TIMESTAMPTZ,
  CONSTRAINT "TeacherBatch_end_after_start" CHECK ("endedAt" IS NULL OR "endedAt" >= "assignedAt")
);
CREATE UNIQUE INDEX "TeacherBatch_one_active_assignment" ON "TeacherBatch"("teacherId","batchId") WHERE "endedAt" IS NULL;
CREATE INDEX "TeacherBatch_teacherId_endedAt_idx" ON "TeacherBatch"("teacherId","endedAt");
CREATE TABLE "ParentStudentLink" (
  "id" UUID PRIMARY KEY, "guardianId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "studentId" UUID NOT NULL REFERENCES "Student"("id") ON DELETE RESTRICT,
  "programId" UUID NOT NULL REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT,
  "status" "GuardianLinkStatus" NOT NULL DEFAULT 'PENDING',
  "verifiedAt" TIMESTAMPTZ, "activatedAt" TIMESTAMPTZ, "revokedAt" TIMESTAMPTZ, "approvedById" UUID,
  CONSTRAINT "ParentStudentLink_unique" UNIQUE ("guardianId","studentId","programId"),
  CONSTRAINT "ParentStudentLink_active_requires_proof" CHECK (
    "status" <> 'ACTIVE' OR ("verifiedAt" IS NOT NULL AND "activatedAt" IS NOT NULL AND "revokedAt" IS NULL)
  )
);
CREATE INDEX "ParentStudentLink_studentId_programId_status_idx" ON "ParentStudentLink"("studentId","programId","status");
CREATE TABLE "ProcessingAuthority" (
  "id" UUID PRIMARY KEY, "studentId" UUID NOT NULL REFERENCES "Student"("id") ON DELETE RESTRICT,
  "programId" UUID NOT NULL REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT,
  "purpose" TEXT NOT NULL, "legalBasis" TEXT NOT NULL, "policyVersion" TEXT NOT NULL,
  "status" "AuthorityStatus" NOT NULL DEFAULT 'ACTIVE',
  "approvedById" UUID NOT NULL, "approvedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "endedAt" TIMESTAMPTZ
);
CREATE UNIQUE INDEX "ProcessingAuthority_one_active_purpose" ON "ProcessingAuthority"("studentId","programId","purpose") WHERE "status" = 'ACTIVE';
CREATE INDEX "ProcessingAuthority_studentId_programId_purpose_status_idx" ON "ProcessingAuthority"("studentId","programId","purpose","status");
CREATE TABLE "WritingTopicVersion" (
  "id" UUID PRIMARY KEY, "programId" UUID NOT NULL REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT,
  "writingType" TEXT NOT NULL, "language" "Language" NOT NULL,
  "title" TEXT NOT NULL, "instructions" TEXT NOT NULL, "clues" JSONB NOT NULL,
  "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "WritingTopicVersion_programId_language_writingType_status_idx"
  ON "WritingTopicVersion"("programId","language","writingType","status");
CREATE TABLE "RubricVersion" (
  "id" UUID PRIMARY KEY, "programId" UUID NOT NULL REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT,
  "writingType" TEXT NOT NULL, "language" "Language" NOT NULL, "version" INTEGER NOT NULL,
  "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT', "snapshot" JSONB NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "publishedAt" TIMESTAMPTZ,
  CONSTRAINT "RubricVersion_scope_version_unique" UNIQUE("programId","writingType","language","version"),
  CONSTRAINT "RubricVersion_published_at" CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL)
);
CREATE TABLE "RubricBinding" (
  "id" UUID PRIMARY KEY, "programId" UUID NOT NULL REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT,
  "writingType" TEXT NOT NULL, "language" "Language" NOT NULL,
  "rubricVersionId" UUID NOT NULL REFERENCES "RubricVersion"("id") ON DELETE RESTRICT,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "RubricBinding_scope_unique" UNIQUE("programId","writingType","language")
);
CREATE TABLE "Submission" (
  "id" UUID PRIMARY KEY, "studentId" UUID NOT NULL REFERENCES "Student"("id") ON DELETE RESTRICT,
  "programId" UUID NOT NULL REFERENCES "AcademicProgram"("id") ON DELETE RESTRICT,
  "batchId" UUID NOT NULL, "topicVersionId" UUID NOT NULL REFERENCES "WritingTopicVersion"("id") ON DELETE RESTRICT,
  "rubricVersionId" UUID NOT NULL REFERENCES "RubricVersion"("id") ON DELETE RESTRICT,
  "clientRequestId" UUID NOT NULL, "topicSnapshot" JSONB NOT NULL, "rubricSnapshot" JSONB NOT NULL,
  "topicHash" VARCHAR(64) NOT NULL, "rubricHash" VARCHAR(64) NOT NULL,
  "status" "SubmissionStatus" NOT NULL DEFAULT 'ACCEPTED', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Submission_batch_program_fk" FOREIGN KEY("batchId","programId") REFERENCES "Batch"("id","programId") ON DELETE RESTRICT,
  CONSTRAINT "Submission_student_request_unique" UNIQUE("studentId","clientRequestId")
);
CREATE INDEX "Submission_studentId_programId_createdAt_idx" ON "Submission"("studentId","programId","createdAt");
CREATE TABLE "VerifiedWritingText" (
  "id" UUID PRIMARY KEY, "submissionId" UUID NOT NULL UNIQUE REFERENCES "Submission"("id") ON DELETE RESTRICT,
  "language" "Language" NOT NULL, "content" TEXT NOT NULL, "contentHash" VARCHAR(64) NOT NULL,
  "verifiedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "verifiedById" UUID NOT NULL,
  CONSTRAINT "VerifiedWritingText_nonempty" CHECK (LENGTH(TRIM("content")) > 0)
);
CREATE TABLE "Assessment" (
  "id" UUID PRIMARY KEY, "submissionId" UUID NOT NULL UNIQUE REFERENCES "Submission"("id") ON DELETE RESTRICT,
  "status" "AssessmentStatus" NOT NULL DEFAULT 'AWAITING_UNDERSTANDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Assessment_no_finalization_without_verifier" CHECK ("status" <> 'FINALIZED')
);
CREATE TABLE "OutboxEvent" (
  "id" UUID PRIMARY KEY, "eventType" TEXT NOT NULL, "dedupeKey" TEXT NOT NULL UNIQUE,
  "payload" JSONB NOT NULL, "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0, "lockedAt" TIMESTAMPTZ,
  "dispatchedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status","createdAt");
CREATE TABLE "AuditEvent" (
  "id" UUID PRIMARY KEY, "actorId" UUID, "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL, "resourceId" TEXT NOT NULL,
  "details" JSONB, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "AuditEvent_resourceType_resourceId_createdAt_idx" ON "AuditEvent"("resourceType","resourceId","createdAt");

-- Database-level immutability (Prisma service also enforces publication and snapshots).
CREATE OR REPLACE FUNCTION writing_protect_published_content() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD."status" = 'PUBLISHED') THEN
    RAISE EXCEPTION 'Published academic content is immutable; create a new version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RubricVersion_protect_published" BEFORE UPDATE OR DELETE ON "RubricVersion"
  FOR EACH ROW EXECUTE FUNCTION writing_protect_published_content();
CREATE TRIGGER "WritingTopicVersion_protect_published" BEFORE UPDATE OR DELETE ON "WritingTopicVersion"
  FOR EACH ROW EXECUTE FUNCTION writing_protect_published_content();

CREATE OR REPLACE FUNCTION writing_protect_verified_text() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Verified writing is immutable; use explicit new version or privacy lifecycle';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "VerifiedWritingText_immutable" BEFORE UPDATE OR DELETE ON "VerifiedWritingText"
  FOR EACH ROW EXECUTE FUNCTION writing_protect_verified_text();

CREATE OR REPLACE FUNCTION writing_protect_submission_snapshot() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."studentId" IS DISTINCT FROM NEW."studentId"
    OR OLD."programId" IS DISTINCT FROM NEW."programId"
    OR OLD."batchId" IS DISTINCT FROM NEW."batchId"
    OR OLD."topicVersionId" IS DISTINCT FROM NEW."topicVersionId"
    OR OLD."rubricVersionId" IS DISTINCT FROM NEW."rubricVersionId"
    OR OLD."topicSnapshot" IS DISTINCT FROM NEW."topicSnapshot"
    OR OLD."rubricSnapshot" IS DISTINCT FROM NEW."rubricSnapshot"
    OR OLD."topicHash" IS DISTINCT FROM NEW."topicHash"
    OR OLD."rubricHash" IS DISTINCT FROM NEW."rubricHash"
    OR OLD."clientRequestId" IS DISTINCT FROM NEW."clientRequestId"
  THEN
    RAISE EXCEPTION 'Submission source and academic snapshots cannot change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Submission_protect_snapshot" BEFORE UPDATE ON "Submission"
  FOR EACH ROW EXECUTE FUNCTION writing_protect_submission_snapshot();

CREATE OR REPLACE FUNCTION writing_validate_rubric_binding() RETURNS TRIGGER AS $$
DECLARE selected "RubricVersion"%ROWTYPE;
BEGIN
  SELECT * INTO selected FROM "RubricVersion" WHERE "id" = NEW."rubricVersionId";
  IF NOT FOUND OR selected."status" <> 'PUBLISHED' OR selected."programId" <> NEW."programId"
    OR selected."writingType" <> NEW."writingType" OR selected."language" <> NEW."language" THEN
    RAISE EXCEPTION 'Rubric binding must target a published rubric in the exact program/type/language';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RubricBinding_validate_scope" BEFORE INSERT OR UPDATE ON "RubricBinding"
  FOR EACH ROW EXECUTE FUNCTION writing_validate_rubric_binding();

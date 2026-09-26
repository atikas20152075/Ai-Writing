-- Step92: version-pinned teacher summary and immutable, private JSON report snapshots.
CREATE TABLE "TeacherScoreProjection"(
  "assessmentId" UUID PRIMARY KEY REFERENCES "Assessment"("id") ON DELETE RESTRICT,
  "scoreRevisionId" UUID NOT NULL REFERENCES "AssessmentScoreRevision"("id") ON DELETE RESTRICT,
  "revisionNo" INTEGER NOT NULL CHECK ("revisionNo">0),
  "source" TEXT NOT NULL CHECK ("source" IN ('AI','HUMAN')),
  "totalScore" NUMERIC(12,4) NOT NULL,
  "totalMarks" NUMERIC(12,4) NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "AcademicReportSnapshot"(
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "assessmentId" UUID NOT NULL REFERENCES "Assessment"("id") ON DELETE RESTRICT,
  "scoreRevisionId" UUID NOT NULL REFERENCES "AssessmentScoreRevision"("id") ON DELETE RESTRICT,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "AcademicReportSnapshot_unique" UNIQUE("assessmentId","scoreRevisionId"),
  CONSTRAINT "AcademicReportSnapshot_shape" CHECK(
    "snapshot"->>'schemaVersion'='academic-report-v1'
    AND "snapshot"->>'revisionId'="scoreRevisionId"::text
    AND jsonb_typeof("snapshot"->'factors')='array')
);
CREATE INDEX "AcademicReportSnapshot_revision_idx" ON "AcademicReportSnapshot"("scoreRevisionId");
CREATE FUNCTION step92_guard_teacher_score() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
 SELECT rev.id,rev."revisionNo",rev.source,rev."totalScore",rev."totalMarks" INTO r
 FROM "Assessment" a JOIN "AssessmentScoreRevision" rev ON rev.id=a."effectiveScoreRevisionId"
 WHERE a.id=NEW."assessmentId" AND a.status='FINALIZED'
  AND rev."assessmentId"=a.id AND rev.id=NEW."scoreRevisionId" FOR UPDATE OF a;
 IF NOT FOUND OR r."revisionNo" IS DISTINCT FROM NEW."revisionNo" OR
  r.source IS DISTINCT FROM NEW.source OR r."totalScore" IS DISTINCT FROM NEW."totalScore" OR
  r."totalMarks" IS DISTINCT FROM NEW."totalMarks"
 THEN RAISE EXCEPTION 'STEP92_TEACHER_SCORE_NOT_CANONICAL'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "TeacherScoreProjection_guard" BEFORE INSERT OR UPDATE ON "TeacherScoreProjection"
 FOR EACH ROW EXECUTE FUNCTION step92_guard_teacher_score();

CREATE FUNCTION step92_guard_report() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
 IF TG_OP='UPDATE' OR TG_OP='DELETE' THEN
   RAISE EXCEPTION 'STEP92_REPORT_SNAPSHOT_IMMUTABLE';
 END IF;
 SELECT rev.id,rev."revisionNo",rev.source,rev."totalScore",rev."totalMarks" INTO r
 FROM "Assessment" a JOIN "AssessmentScoreRevision" rev ON rev.id=a."effectiveScoreRevisionId"
 WHERE a.id=NEW."assessmentId" AND a.status='FINALIZED'
  AND rev."assessmentId"=a.id AND rev.id=NEW."scoreRevisionId" FOR UPDATE OF a;
 IF NOT FOUND OR
   NEW.snapshot->>'revisionId' IS DISTINCT FROM NEW."scoreRevisionId"::text OR
   NEW.snapshot->>'assessmentId' IS DISTINCT FROM NEW."assessmentId"::text OR
   NEW.snapshot->>'revisionNo' IS DISTINCT FROM r."revisionNo"::text OR
   NEW.snapshot->>'source' IS DISTINCT FROM r.source OR
   NEW.snapshot->>'totalScore' IS DISTINCT FROM r."totalScore"::text OR
   NEW.snapshot->>'totalMarks' IS DISTINCT FROM r."totalMarks"::text
 THEN RAISE EXCEPTION 'STEP92_REPORT_NOT_CANONICAL'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "AcademicReportSnapshot_guard" BEFORE INSERT OR UPDATE OR DELETE ON "AcademicReportSnapshot"
 FOR EACH ROW EXECUTE FUNCTION step92_guard_report();

-- Only a matching real current artifact allows an invalidation to claim REBUILT.
CREATE OR REPLACE FUNCTION step90_guard_invalidation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_rev UUID;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'STEP90_INVALIDATION_DELETE_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "AssessmentScoreRevision" r WHERE r.id=NEW."scoreRevisionId"
   AND r."assessmentId"=NEW."assessmentId")
 THEN RAISE EXCEPTION 'STEP90_INVALIDATION_REVISION_SCOPE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(OLD.id,OLD."assessmentId",OLD."scoreRevisionId",OLD.target,OLD."createdAt")
   IS DISTINCT FROM ROW(NEW.id,NEW."assessmentId",NEW."scoreRevisionId",NEW.target,NEW."createdAt")
  THEN RAISE EXCEPTION 'STEP90_INVALIDATION_IDENTITY_IMMUTABLE'; END IF;
  IF OLD.status='BLOCKED' AND NEW.status='PENDING' AND NEW.target IN ('TEACHER','REPORT') THEN
    IF NEW."processedAt" IS NOT NULL OR NEW."errorCode" IS NOT NULL
    THEN RAISE EXCEPTION 'STEP92_REQUEUE_MUST_CLEAR_RESULT'; END IF;
    RETURN NEW;
  END IF;
  IF NOT (OLD.status='PENDING' AND NEW.status IN ('SUPERSEDED','BLOCKED','REBUILT','FAILED'))
  THEN RAISE EXCEPTION 'STEP90_INVALIDATION_BAD_TRANSITION'; END IF;
  SELECT "effectiveScoreRevisionId" INTO current_rev FROM "Assessment"
  WHERE id=NEW."assessmentId" FOR UPDATE;
  IF NEW.status='REBUILT' THEN
   IF current_rev IS DISTINCT FROM NEW."scoreRevisionId" OR NOT (
     (NEW.target='PARENT' AND EXISTS(SELECT 1 FROM "ParentScoreProjection" p WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"))
     OR (NEW.target='FEEDBACK' AND EXISTS(SELECT 1 FROM "FeedbackProjection" p WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"))
     OR (NEW.target='PRACTICE' AND EXISTS(SELECT 1 FROM "PracticeProjection" p WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"))
     OR (NEW.target='PROGRESS' AND EXISTS(SELECT 1 FROM "ProgressProjection" p WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"))
     OR (NEW.target='TEACHER' AND EXISTS(SELECT 1 FROM "TeacherScoreProjection" p WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"))
     OR (NEW.target='REPORT' AND EXISTS(SELECT 1 FROM "AcademicReportSnapshot" p WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"))
   ) THEN RAISE EXCEPTION 'STEP90_REBUILD_UNSUPPORTED_OR_STALE'; END IF;
  ELSIF NEW.status='SUPERSEDED' THEN
    IF current_rev IS NOT DISTINCT FROM NEW."scoreRevisionId"
    THEN RAISE EXCEPTION 'STEP90_CURRENT_REVISION_CANNOT_SUPERSEDE'; END IF;
  ELSIF NEW.status='BLOCKED' THEN
    RAISE EXCEPTION 'STEP92_ALL_SIX_TARGETS_IMPLEMENTED';
  END IF;
  IF NEW."processedAt" IS NULL
  THEN RAISE EXCEPTION 'STEP90_PROCESSED_AT_REQUIRED'; END IF;
 ELSE
  IF NEW.status<>'PENDING' OR NEW."processedAt" IS NOT NULL OR NEW."errorCode" IS NOT NULL
  THEN RAISE EXCEPTION 'STEP90_NEW_INVALIDATION_MUST_BE_PENDING'; END IF;
 END IF;
 RETURN NEW;
END $$;
UPDATE "DerivedProjectionInvalidation" SET status='PENDING',"processedAt"=NULL,"errorCode"=NULL
 WHERE status='BLOCKED' AND target IN ('TEACHER','REPORT');

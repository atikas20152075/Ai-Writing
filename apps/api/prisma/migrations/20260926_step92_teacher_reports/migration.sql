-- Step92: immutable source-bound printable English reports. A TEACHER dashboard reads
-- canonical data directly; its derived TEACHER projection is still intentionally blocked.
CREATE TABLE "ReportSnapshot" (
  id UUID PRIMARY KEY,
  "assessmentId" UUID NOT NULL REFERENCES "Assessment"(id) ON DELETE RESTRICT,
  "scoreRevisionId" UUID NOT NULL REFERENCES "AssessmentScoreRevision"(id) ON DELETE RESTRICT,
  "formatVersion" TEXT NOT NULL CHECK ("formatVersion"='english-rubric-report-v1'),
  snapshot JSONB NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL CHECK ("snapshotHash" ~ '^[0-9a-f]{64}$'),
  "createdById" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ReportSnapshot_unique" UNIQUE ("assessmentId","scoreRevisionId","formatVersion"),
  CONSTRAINT "ReportSnapshot_json" CHECK (jsonb_typeof(snapshot)='object'
    AND snapshot->>'schemaVersion'='english-rubric-report-v1'
    AND snapshot->>'language'='ENGLISH'
    AND jsonb_typeof(snapshot->'factorResults')='array')
);
CREATE INDEX "ReportSnapshot_revision_idx" ON "ReportSnapshot"("scoreRevisionId");

-- A forged report cannot claim another score, a different rubric, or unsupported
-- writing. The original approval and academic content remain authoritative.
CREATE FUNCTION step92_guard_report() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE score RECORD;
BEGIN
 SELECT r.id,r."revisionNo",r.source,r."totalScore",r."totalMarks",r."factorResults",
   s."rubricVersionId",s."topicSnapshot",v.language::text AS language
 INTO score FROM "Assessment" a
 JOIN "Submission" s ON s.id=a."submissionId"
 JOIN "VerifiedWritingText" v ON v."submissionId"=s.id
 JOIN "AssessmentScoreRevision" r ON r.id=a."effectiveScoreRevisionId" AND r."assessmentId"=a.id
 WHERE a.id=NEW."assessmentId" AND a.status='FINALIZED' AND r.id=NEW."scoreRevisionId"
 FOR UPDATE OF a;
 IF NOT FOUND OR score.language<>'ENGLISH' OR
   NEW.snapshot->>'assessmentId' IS DISTINCT FROM NEW."assessmentId"::text OR
   NEW.snapshot->>'scoreRevisionId' IS DISTINCT FROM NEW."scoreRevisionId"::text OR
   NEW.snapshot->>'rubricVersionId' IS DISTINCT FROM score."rubricVersionId"::text OR
   NEW.snapshot->>'revisionNo' IS DISTINCT FROM score."revisionNo"::text OR
   NEW.snapshot->>'source' IS DISTINCT FROM score.source OR
   NEW.snapshot->>'topicTitle' IS DISTINCT FROM score."topicSnapshot"->>'title' OR
   (NEW.snapshot->>'totalScore')::numeric IS DISTINCT FROM score."totalScore" OR
   (NEW.snapshot->>'totalMarks')::numeric IS DISTINCT FROM score."totalMarks" OR
   jsonb_array_length(NEW.snapshot->'factorResults') IS DISTINCT FROM jsonb_array_length(score."factorResults") OR
   NOT(score."factorResults" @> NEW.snapshot->'factorResults')
 THEN RAISE EXCEPTION 'STEP92_REPORT_NOT_CANONICAL'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ReportSnapshot_guard" BEFORE INSERT ON "ReportSnapshot"
  FOR EACH ROW EXECUTE FUNCTION step92_guard_report();
CREATE TRIGGER "ReportSnapshot_immutable" BEFORE UPDATE OR DELETE ON "ReportSnapshot"
  FOR EACH ROW EXECUTE FUNCTION step88_immutable();

-- A report receipt is REBUILT only once the matching REAL immutable report exists.
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
    IF OLD.status='BLOCKED' AND NEW.status='PENDING' AND
      NEW.target IN ('FEEDBACK','PRACTICE','PROGRESS','REPORT') THEN
      IF NEW."processedAt" IS NOT NULL OR NEW."errorCode" IS NOT NULL
      THEN RAISE EXCEPTION 'STEP91_REQUEUE_MUST_CLEAR_RESULT'; END IF;
      RETURN NEW;
    END IF;
    IF NOT (OLD.status='PENDING' AND NEW.status IN ('SUPERSEDED','BLOCKED','REBUILT','FAILED'))
    THEN RAISE EXCEPTION 'STEP90_INVALIDATION_BAD_TRANSITION'; END IF;
    SELECT "effectiveScoreRevisionId" INTO current_rev FROM "Assessment"
      WHERE id=NEW."assessmentId" FOR UPDATE;
    IF NEW.status='REBUILT' THEN
      IF current_rev IS DISTINCT FROM NEW."scoreRevisionId" OR NOT (
        (NEW.target='PARENT' AND EXISTS(SELECT 1 FROM "ParentScoreProjection" p
          WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"))
        OR (NEW.target='FEEDBACK' AND EXISTS(SELECT 1 FROM "FeedbackProjection" p
          WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"))
        OR (NEW.target='PRACTICE' AND EXISTS(SELECT 1 FROM "PracticeProjection" p
          WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"))
        OR (NEW.target='PROGRESS' AND EXISTS(SELECT 1 FROM "ProgressProjection" p
          WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"))
        OR (NEW.target='REPORT' AND EXISTS(SELECT 1 FROM "ReportSnapshot" p
          WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"
            AND p."formatVersion"='english-rubric-report-v1'))
      ) THEN RAISE EXCEPTION 'STEP90_REBUILD_UNSUPPORTED_OR_STALE'; END IF;
    ELSIF NEW.status='SUPERSEDED' THEN
      IF current_rev IS NOT DISTINCT FROM NEW."scoreRevisionId"
      THEN RAISE EXCEPTION 'STEP90_CURRENT_REVISION_CANNOT_SUPERSEDE'; END IF;
    ELSIF NEW.status='BLOCKED' THEN
      IF NEW.target NOT IN ('TEACHER','REPORT') OR NEW."errorCode" IS DISTINCT FROM 'TARGET_NOT_IMPLEMENTED'
      THEN RAISE EXCEPTION 'STEP90_BLOCKED_REASON_INVALID'; END IF;
    END IF;
    IF NEW."processedAt" IS NULL
    THEN RAISE EXCEPTION 'STEP90_PROCESSED_AT_REQUIRED'; END IF;
  ELSE
    IF NEW.status<>'PENDING' OR NEW."processedAt" IS NOT NULL OR NEW."errorCode" IS NOT NULL
    THEN RAISE EXCEPTION 'STEP90_NEW_INVALIDATION_MUST_BE_PENDING'; END IF;
  END IF;
  RETURN NEW;
END $$;



-- Step91 additive migration: genuine deterministic rubric-linked learning snapshots.
-- No AI-generated corrections or exercise generation is enabled here.
CREATE TABLE "FeedbackProjection" (
 "assessmentId" UUID PRIMARY KEY REFERENCES "Assessment"("id") ON DELETE RESTRICT,
 "scoreRevisionId" UUID NOT NULL REFERENCES "AssessmentScoreRevision"("id") ON DELETE RESTRICT,
 "snapshot" JSONB NOT NULL,
 "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT "Step91_feedback_schema" CHECK (
   "snapshot"->>'schemaVersion'='rubric-feedback-v1'
   AND jsonb_typeof("snapshot"->'factors')='array')
);
CREATE TABLE "PracticeProjection" (
 "assessmentId" UUID PRIMARY KEY REFERENCES "Assessment"("id") ON DELETE RESTRICT,
 "scoreRevisionId" UUID NOT NULL REFERENCES "AssessmentScoreRevision"("id") ON DELETE RESTRICT,
 "snapshot" JSONB NOT NULL,
 "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT "Step91_practice_schema" CHECK (
   "snapshot"->>'schemaVersion'='rubric-practice-targets-v1'
   AND jsonb_typeof("snapshot"->'targets')='array')
);
CREATE TABLE "ProgressProjection" (
 "assessmentId" UUID PRIMARY KEY REFERENCES "Assessment"("id") ON DELETE RESTRICT,
 "scoreRevisionId" UUID NOT NULL REFERENCES "AssessmentScoreRevision"("id") ON DELETE RESTRICT,
 "cohortSignature" VARCHAR(64) NOT NULL,
 "snapshot" JSONB NOT NULL,
 "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT "Step91_progress_schema" CHECK (
   "snapshot"->>'schemaVersion'='comparable-progress-v1'
   AND "cohortSignature" ~ '^[a-f0-9]{64}$'
   AND "snapshot"->>'cohortSignature'="cohortSignature"
   AND "snapshot"->>'status' IN ('DESCRIPTIVE_DELTA','INSUFFICIENT_DATA')
   AND jsonb_typeof("snapshot"->'displayedPoints')='array')
);
CREATE INDEX "FeedbackProjection_revision_idx" ON "FeedbackProjection"("scoreRevisionId");
CREATE INDEX "PracticeProjection_revision_idx" ON "PracticeProjection"("scoreRevisionId");
CREATE INDEX "ProgressProjection_revision_idx" ON "ProgressProjection"("scoreRevisionId");

-- A direct write for the wrong assessment/revision cannot manufacture a published snapshot.
CREATE FUNCTION step91_guard_learning_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE found_revision UUID; required_schema TEXT;
BEGIN
  SELECT a."effectiveScoreRevisionId" INTO found_revision
  FROM "Assessment" a JOIN "AssessmentScoreRevision" rev ON rev.id=a."effectiveScoreRevisionId"
  WHERE a.id=NEW."assessmentId" AND a.status='FINALIZED'
    AND rev."assessmentId"=a.id AND rev.id=NEW."scoreRevisionId"
  FOR UPDATE OF a;
  IF NOT FOUND OR found_revision IS DISTINCT FROM NEW."scoreRevisionId"
    OR NEW.snapshot->>'revisionId' IS DISTINCT FROM NEW."scoreRevisionId"::text
  THEN RAISE EXCEPTION 'STEP91_LEARNING_PROJECTION_NOT_CANONICAL'; END IF;
  IF TG_TABLE_NAME='FeedbackProjection' THEN required_schema:='rubric-feedback-v1';
  ELSIF TG_TABLE_NAME='PracticeProjection' THEN required_schema:='rubric-practice-targets-v1';
  ELSIF TG_TABLE_NAME='ProgressProjection' THEN required_schema:='comparable-progress-v1';
  ELSE RAISE EXCEPTION 'STEP91_UNKNOWN_PROJECTION'; END IF;
  IF NEW.snapshot->>'schemaVersion' IS DISTINCT FROM required_schema
  THEN RAISE EXCEPTION 'STEP91_LEARNING_PROJECTION_SCHEMA'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "FeedbackProjection_guard" BEFORE INSERT OR UPDATE ON "FeedbackProjection"
 FOR EACH ROW EXECUTE FUNCTION step91_guard_learning_projection();
CREATE TRIGGER "PracticeProjection_guard" BEFORE INSERT OR UPDATE ON "PracticeProjection"
 FOR EACH ROW EXECUTE FUNCTION step91_guard_learning_projection();
CREATE TRIGGER "ProgressProjection_guard" BEFORE INSERT OR UPDATE ON "ProgressProjection"
 FOR EACH ROW EXECUTE FUNCTION step91_guard_learning_projection();

-- Extend Step90 trigger only for three newly implemented sources. Existing PARENT protections remain.
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
      NEW.target IN ('FEEDBACK','PRACTICE','PROGRESS') THEN
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

-- Historical blocked receipts can be retried only after the actual implementations above exist.
UPDATE "DerivedProjectionInvalidation"
 SET status='PENDING',"processedAt"=NULL,"errorCode"=NULL
 WHERE status='BLOCKED' AND target IN ('FEEDBACK','PRACTICE','PROGRESS');

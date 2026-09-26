-- Step 90: version-bound downstream propagation. Additive migration after Step89.
-- Only PARENT has a concrete rebuilt materialization in this milestone.
ALTER TABLE "DerivedProjectionInvalidation"
  DROP CONSTRAINT "DerivedProjectionInvalidation_status";
ALTER TABLE "DerivedProjectionInvalidation"
  ADD COLUMN "errorCode" TEXT,
  ADD CONSTRAINT "DerivedProjectionInvalidation_status" CHECK
    ("status" IN ('PENDING','PROCESSING','REBUILT','FAILED','BLOCKED','SUPERSEDED'));
CREATE INDEX "DerivedProjectionInvalidation_assessment_revision"
  ON "DerivedProjectionInvalidation"("assessmentId","scoreRevisionId","target","status");

CREATE TABLE "ParentScoreProjection" (
  "assessmentId" UUID PRIMARY KEY REFERENCES "Assessment"("id") ON DELETE RESTRICT,
  "scoreRevisionId" UUID NOT NULL REFERENCES "AssessmentScoreRevision"("id") ON DELETE RESTRICT,
  "revisionNo" INTEGER NOT NULL CHECK ("revisionNo">0),
  "source" TEXT NOT NULL CHECK ("source" IN ('AI','HUMAN')),
  "totalScore" NUMERIC(12,4) NOT NULL,
  "totalMarks" NUMERIC(12,4) NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ParentScoreProjection_bounds" CHECK
    ("totalScore">=0 AND "totalMarks">0 AND "totalScore"<="totalMarks")
);
CREATE INDEX "ParentScoreProjection_revision_idx" ON "ParentScoreProjection"("scoreRevisionId");

-- A direct DB write cannot manufacture a CURRENT parent read model: values must
-- equal the real, already-effective score under a lock of its academic parent.
CREATE FUNCTION step90_guard_parent_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  SELECT rev."revisionNo",rev.source,rev."totalScore",rev."totalMarks"
    INTO r FROM "Assessment" a JOIN "AssessmentScoreRevision" rev
      ON rev.id=a."effectiveScoreRevisionId" AND rev."assessmentId"=a.id
    WHERE a.id=NEW."assessmentId" AND a.status='FINALIZED'
      AND rev.id=NEW."scoreRevisionId"
    FOR UPDATE OF a;
  IF NOT FOUND OR r."revisionNo" IS DISTINCT FROM NEW."revisionNo"
    OR r.source IS DISTINCT FROM NEW.source
    OR r."totalScore" IS DISTINCT FROM NEW."totalScore"
    OR r."totalMarks" IS DISTINCT FROM NEW."totalMarks"
  THEN RAISE EXCEPTION 'STEP90_PARENT_PROJECTION_NOT_CANONICAL'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ParentScoreProjection_guard" BEFORE INSERT OR UPDATE
  ON "ParentScoreProjection" FOR EACH ROW EXECUTE FUNCTION step90_guard_parent_projection();

-- Immutable invalidation identity; a row is REBUILT only if an actual current
-- parent summary has already been materialized in the same transaction.
CREATE FUNCTION step90_guard_invalidation() RETURNS trigger LANGUAGE plpgsql AS $$
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
    IF NOT (OLD.status='PENDING' AND NEW.status IN ('SUPERSEDED','BLOCKED','REBUILT','FAILED'))
    THEN RAISE EXCEPTION 'STEP90_INVALIDATION_BAD_TRANSITION'; END IF;
    SELECT "effectiveScoreRevisionId" INTO current_rev FROM "Assessment"
      WHERE id=NEW."assessmentId" FOR UPDATE;
    IF NEW.status='REBUILT' THEN
      IF NEW.target<>'PARENT' OR current_rev IS DISTINCT FROM NEW."scoreRevisionId"
        OR NOT EXISTS(SELECT 1 FROM "ParentScoreProjection" p
           WHERE p."assessmentId"=NEW."assessmentId"
             AND p."scoreRevisionId"=NEW."scoreRevisionId")
      THEN RAISE EXCEPTION 'STEP90_REBUILD_UNSUPPORTED_OR_STALE'; END IF;
    ELSIF NEW.status='SUPERSEDED' THEN
      IF current_rev IS NOT DISTINCT FROM NEW."scoreRevisionId"
      THEN RAISE EXCEPTION 'STEP90_CURRENT_REVISION_CANNOT_SUPERSEDE'; END IF;
    ELSIF NEW.status='BLOCKED' THEN
      IF NEW.target='PARENT' OR NEW."errorCode" IS DISTINCT FROM 'TARGET_NOT_IMPLEMENTED'
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
CREATE TRIGGER "DerivedProjectionInvalidation_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "DerivedProjectionInvalidation"
  FOR EACH ROW EXECUTE FUNCTION step90_guard_invalidation();

-- Before this migration Step88 initial AI finalization did not emit invalidations.
-- Backfill all existing finalized effective revisions without inventing derived data.
INSERT INTO "DerivedProjectionInvalidation"
  ("id","assessmentId","scoreRevisionId","target","status","createdAt")
SELECT gen_random_uuid(),a.id,a."effectiveScoreRevisionId",t.target,'PENDING',now()
FROM "Assessment" a CROSS JOIN (VALUES ('FEEDBACK'),('PRACTICE'),('PROGRESS'),
  ('TEACHER'),('PARENT'),('REPORT')) AS t(target)
WHERE a.status='FINALIZED' AND a."effectiveScoreRevisionId" IS NOT NULL
ON CONFLICT ("assessmentId","scoreRevisionId","target") DO NOTHING;

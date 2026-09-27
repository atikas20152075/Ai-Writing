-- Step103 adds Bangla and tagged v2 report snapshots while preserving immutable v1 rows.
ALTER TABLE "ReportSnapshot" DROP CONSTRAINT "ReportSnapshot_formatVersion_check";
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_formatVersion_check"
  CHECK ("formatVersion" IN ('english-rubric-report-v1','rubric-report-v2-en','rubric-report-v2-bn'));
ALTER TABLE "ReportSnapshot" DROP CONSTRAINT "ReportSnapshot_json";
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_json" CHECK (
  jsonb_typeof(snapshot)='object' AND jsonb_typeof(snapshot->'factorResults')='array' AND
  (("formatVersion"='english-rubric-report-v1' AND snapshot->>'schemaVersion'='english-rubric-report-v1'
    AND snapshot->>'language'='ENGLISH') OR
   ("formatVersion"='rubric-report-v2-en' AND snapshot->>'schemaVersion'='rubric-report-v2'
    AND snapshot->>'language'='ENGLISH') OR
   ("formatVersion"='rubric-report-v2-bn' AND snapshot->>'schemaVersion'='rubric-report-v2'
    AND snapshot->>'language'='BANGLA'))
);
CREATE OR REPLACE FUNCTION step92_guard_report() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE score RECORD; expected_schema TEXT; expected_language TEXT;
BEGIN
 SELECT r.id,r."revisionNo",r.source,r."totalScore",r."totalMarks",r."factorResults",
   s."rubricVersionId",s."topicSnapshot",v.language::text AS language
 INTO score FROM "Assessment" a
 JOIN "Submission" s ON s.id=a."submissionId"
 JOIN "VerifiedWritingText" v ON v."submissionId"=s.id
 JOIN "AssessmentScoreRevision" r ON r.id=a."effectiveScoreRevisionId" AND r."assessmentId"=a.id
 WHERE a.id=NEW."assessmentId" AND a.status='FINALIZED' AND r.id=NEW."scoreRevisionId"
 FOR UPDATE OF a;
 IF NEW."formatVersion"='english-rubric-report-v1' THEN
   expected_schema:='english-rubric-report-v1'; expected_language:='ENGLISH';
 ELSIF NEW."formatVersion"='rubric-report-v2-en' THEN
   expected_schema:='rubric-report-v2'; expected_language:='ENGLISH';
 ELSIF NEW."formatVersion"='rubric-report-v2-bn' THEN
   expected_schema:='rubric-report-v2'; expected_language:='BANGLA';
 ELSE RAISE EXCEPTION 'STEP103_REPORT_FORMAT_UNSUPPORTED'; END IF;
 IF NOT FOUND OR score.language<>expected_language OR
   NEW.snapshot->>'schemaVersion' IS DISTINCT FROM expected_schema OR
   NEW.snapshot->>'language' IS DISTINCT FROM expected_language OR
   NEW.snapshot->>'assessmentId' IS DISTINCT FROM NEW."assessmentId"::text OR
   NEW.snapshot->>'scoreRevisionId' IS DISTINCT FROM NEW."scoreRevisionId"::text OR
   NEW.snapshot->>'rubricVersionId' IS DISTINCT FROM score."rubricVersionId"::text OR
   NEW.snapshot->>'revisionNo' IS DISTINCT FROM score."revisionNo"::text OR
   NEW.snapshot->>'source' IS DISTINCT FROM score.source OR
   (NEW.snapshot->>'topicTitle') IS DISTINCT FROM (score."topicSnapshot"->>'title') OR
   (NEW.snapshot->>'totalScore')::numeric IS DISTINCT FROM score."totalScore" OR
   (NEW.snapshot->>'totalMarks')::numeric IS DISTINCT FROM score."totalMarks" OR
   jsonb_array_length(NEW.snapshot->'factorResults') IS DISTINCT FROM jsonb_array_length(score."factorResults") OR
   EXISTS(
     SELECT 1 FROM jsonb_array_elements(NEW.snapshot->'factorResults') AS rf(value)
     WHERE NOT EXISTS(
       SELECT 1 FROM jsonb_array_elements(score."factorResults") AS af(value)
       WHERE af.value->>'factorId'=rf.value->>'factorId'
         AND af.value->>'criterionId'=rf.value->>'criterionId'
         AND af.value->>'proposedScore'=rf.value->>'proposedScore'
         AND af.value->>'rationale'=rf.value->>'rationale'
         AND (SELECT array_agg(ev.value->>'exactQuote' ORDER BY ev.ordinality)
              FROM jsonb_array_elements(af.value->'evidence') WITH ORDINALITY AS ev(value,ordinality))
             IS NOT DISTINCT FROM
             (SELECT array_agg(ev.value->>'exactQuote' ORDER BY ev.ordinality)
              FROM jsonb_array_elements(rf.value->'evidence') WITH ORDINALITY AS ev(value,ordinality))
     )
   )
 THEN RAISE EXCEPTION 'STEP92_REPORT_NOT_CANONICAL found=% language=% schema=% snapshot_language=% assessment=% revision=% rubric=% revision_no=% source=% topic=% total_score=% total_marks=% factor_count=% factors=%',
   FOUND,score.language IS NOT DISTINCT FROM expected_language,
   NEW.snapshot->>'schemaVersion' IS NOT DISTINCT FROM expected_schema,
   NEW.snapshot->>'language' IS NOT DISTINCT FROM expected_language,
   NEW.snapshot->>'assessmentId' IS NOT DISTINCT FROM NEW."assessmentId"::text,
   NEW.snapshot->>'scoreRevisionId' IS NOT DISTINCT FROM NEW."scoreRevisionId"::text,
   NEW.snapshot->>'rubricVersionId' IS NOT DISTINCT FROM score."rubricVersionId"::text,
   NEW.snapshot->>'revisionNo' IS NOT DISTINCT FROM score."revisionNo"::text,
   NEW.snapshot->>'source' IS NOT DISTINCT FROM score.source,
   NEW.snapshot->>'topicTitle' IS NOT DISTINCT FROM score."topicSnapshot"->>'title',
   (NEW.snapshot->>'totalScore')::numeric IS NOT DISTINCT FROM score."totalScore",
   (NEW.snapshot->>'totalMarks')::numeric IS NOT DISTINCT FROM score."totalMarks",
   jsonb_array_length(NEW.snapshot->'factorResults')=jsonb_array_length(score."factorResults"),
   NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(NEW.snapshot->'factorResults') AS rf(value)
     WHERE NOT EXISTS(
       SELECT 1 FROM jsonb_array_elements(score."factorResults") AS af(value)
       WHERE af.value->>'factorId'=rf.value->>'factorId'
         AND af.value->>'criterionId'=rf.value->>'criterionId'
         AND af.value->>'proposedScore'=rf.value->>'proposedScore'
         AND af.value->>'rationale'=rf.value->>'rationale'
         AND (SELECT array_agg(ev.value->>'exactQuote' ORDER BY ev.ordinality)
              FROM jsonb_array_elements(af.value->'evidence') WITH ORDINALITY AS ev(value,ordinality))
             IS NOT DISTINCT FROM
             (SELECT array_agg(ev.value->>'exactQuote' ORDER BY ev.ordinality)
              FROM jsonb_array_elements(rf.value->'evidence') WITH ORDINALITY AS ev(value,ordinality))
     )
   ); END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION step90_guard_invalidation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_rev UUID;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'STEP90_INVALIDATION_DELETE_FORBIDDEN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "AssessmentScoreRevision" r WHERE r.id=NEW."scoreRevisionId"
    AND r."assessmentId"=NEW."assessmentId") THEN RAISE EXCEPTION 'STEP90_INVALIDATION_REVISION_SCOPE'; END IF;
  IF TG_OP='UPDATE' THEN
    IF ROW(OLD.id,OLD."assessmentId",OLD."scoreRevisionId",OLD.target,OLD."createdAt")
      IS DISTINCT FROM ROW(NEW.id,NEW."assessmentId",NEW."scoreRevisionId",NEW.target,NEW."createdAt")
    THEN RAISE EXCEPTION 'STEP90_INVALIDATION_IDENTITY_IMMUTABLE'; END IF;
    IF OLD.status='BLOCKED' AND NEW.status='PENDING' AND NEW.target IN ('FEEDBACK','PRACTICE','PROGRESS','REPORT') THEN
      IF NEW."processedAt" IS NOT NULL OR NEW."errorCode" IS NOT NULL THEN RAISE EXCEPTION 'STEP91_REQUEUE_MUST_CLEAR_RESULT'; END IF;
      RETURN NEW;
    END IF;
    IF NOT (OLD.status='PENDING' AND NEW.status IN ('SUPERSEDED','BLOCKED','REBUILT','FAILED'))
    THEN RAISE EXCEPTION 'STEP90_INVALIDATION_BAD_TRANSITION'; END IF;
    SELECT "effectiveScoreRevisionId" INTO current_rev FROM "Assessment" WHERE id=NEW."assessmentId" FOR UPDATE;
    IF NEW.status='REBUILT' THEN
      IF current_rev IS DISTINCT FROM NEW."scoreRevisionId" OR NOT (
        (NEW.target='PARENT' AND EXISTS(SELECT 1 FROM "ParentScoreProjection" p WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId")) OR
        (NEW.target='FEEDBACK' AND EXISTS(SELECT 1 FROM "FeedbackProjection" p WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId")) OR
        (NEW.target='PRACTICE' AND EXISTS(SELECT 1 FROM "PracticeProjection" p WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId")) OR
        (NEW.target='PROGRESS' AND EXISTS(SELECT 1 FROM "ProgressProjection" p WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId")) OR
        (NEW.target='REPORT' AND EXISTS(SELECT 1 FROM "ReportSnapshot" p WHERE p."assessmentId"=NEW."assessmentId" AND p."scoreRevisionId"=NEW."scoreRevisionId"))
      ) THEN RAISE EXCEPTION 'STEP90_REBUILD_UNSUPPORTED_OR_STALE'; END IF;
    ELSIF NEW.status='SUPERSEDED' THEN
      IF current_rev IS NOT DISTINCT FROM NEW."scoreRevisionId" THEN RAISE EXCEPTION 'STEP90_CURRENT_REVISION_CANNOT_SUPERSEDE'; END IF;
    ELSIF NEW.status='BLOCKED' THEN
      IF NEW.target NOT IN ('TEACHER','REPORT') OR NEW."errorCode" IS DISTINCT FROM 'TARGET_NOT_IMPLEMENTED' THEN RAISE EXCEPTION 'STEP90_BLOCKED_REASON_INVALID'; END IF;
    END IF;
    IF NEW."processedAt" IS NULL THEN RAISE EXCEPTION 'STEP90_PROCESSED_AT_REQUIRED'; END IF;
  ELSE
    IF NEW.status<>'PENDING' OR NEW."processedAt" IS NOT NULL OR NEW."errorCode" IS NOT NULL THEN RAISE EXCEPTION 'STEP90_NEW_INVALIDATION_MUST_BE_PENDING'; END IF;
  END IF;
  RETURN NEW;
END $$;

-- Language and snapshot fields are already checked by the format constraint and
-- step92_guard_report above; do not add a redundant weaker content trigger.

-- A rewrite is a new original student submission, pinned to the source's approved score at creation.
ALTER TABLE "Submission" ADD COLUMN "rewriteOfAssessmentId" UUID,
  ADD COLUMN "rewriteOfRevisionId" UUID, ADD COLUMN "correctionNote" VARCHAR(2000);
ALTER TABLE "AssessmentScoreRevision" ADD CONSTRAINT "AssessmentScoreRevision_rewrite_reference_unique"
  UNIQUE (id, "assessmentId");
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_rewrite_pair_check"
  CHECK (("rewriteOfAssessmentId" IS NULL) = ("rewriteOfRevisionId" IS NULL) AND
    ("rewriteOfAssessmentId" IS NULL) = ("correctionNote" IS NULL) AND
    ("correctionNote" IS NULL OR length(trim("correctionNote")) >= 20));
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_rewrite_revision_fkey"
  FOREIGN KEY ("rewriteOfRevisionId", "rewriteOfAssessmentId")
  REFERENCES "AssessmentScoreRevision"(id, "assessmentId") ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX "Submission_rewriteOfAssessmentId_rewriteOfRevisionId_idx"
  ON "Submission"("rewriteOfAssessmentId", "rewriteOfRevisionId");

CREATE FUNCTION writing_guard_rewrite_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND
    (NEW."rewriteOfAssessmentId" IS DISTINCT FROM OLD."rewriteOfAssessmentId" OR
     NEW."rewriteOfRevisionId" IS DISTINCT FROM OLD."rewriteOfRevisionId" OR
     NEW."correctionNote" IS DISTINCT FROM OLD."correctionNote") THEN
    RAISE EXCEPTION 'REWRITE_LINK_IMMUTABLE';
  END IF;
  IF NEW."rewriteOfAssessmentId" IS NULL THEN RETURN NEW; END IF;
  SELECT s."studentId",s."programId",s."batchId",s."topicVersionId",s."rubricVersionId",
    s.status AS submission_status,a.status AS assessment_status,a."effectiveScoreRevisionId" AS current_revision
  INTO source FROM "Assessment" a JOIN "Submission" s ON s.id=a."submissionId"
  WHERE a.id=NEW."rewriteOfAssessmentId" FOR SHARE OF a,s;
  IF NOT FOUND OR source.submission_status <> 'ACCEPTED' OR
    source.assessment_status <> 'FINALIZED' OR
    source.current_revision IS DISTINCT FROM NEW."rewriteOfRevisionId" OR
    source."studentId" <> NEW."studentId" OR
    source."programId" <> NEW."programId" OR source."batchId" <> NEW."batchId" OR
    source."topicVersionId" <> NEW."topicVersionId" OR
    source."rubricVersionId" <> NEW."rubricVersionId" THEN
    RAISE EXCEPTION 'REWRITE_SOURCE_NOT_CURRENT_OR_SCOPED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Submission_rewrite_scope_guard"
  BEFORE INSERT OR UPDATE OF "rewriteOfAssessmentId","rewriteOfRevisionId","correctionNote" ON "Submission"
  FOR EACH ROW EXECUTE FUNCTION writing_guard_rewrite_link();

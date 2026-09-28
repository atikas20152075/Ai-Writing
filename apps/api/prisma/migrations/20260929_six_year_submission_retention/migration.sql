-- Record the expiry boundary for every accepted writing from its acceptance time.
ALTER TABLE "Submission" ADD COLUMN "dataExpiresAt" TIMESTAMP(3);
UPDATE "Submission" SET "dataExpiresAt" = date_trunc('milliseconds', "createdAt" + INTERVAL '6 years');
ALTER TABLE "Submission" ALTER COLUMN "dataExpiresAt" SET NOT NULL;
ALTER TABLE "Submission" ALTER COLUMN "dataExpiresAt"
  SET DEFAULT date_trunc('milliseconds', CURRENT_TIMESTAMP + INTERVAL '6 years');
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_six_year_expiry_check"
  CHECK ("dataExpiresAt" = date_trunc('milliseconds', "createdAt" + INTERVAL '6 years'));
CREATE INDEX "Submission_retention_due_idx" ON "Submission"("dataExpiresAt", id);

CREATE FUNCTION writing_set_submission_expiry() RETURNS TRIGGER AS $$
BEGIN
  NEW."dataExpiresAt" := date_trunc('milliseconds', NEW."createdAt" + INTERVAL '6 years');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Submission_set_expiry" BEFORE INSERT ON "Submission"
  FOR EACH ROW EXECUTE FUNCTION writing_set_submission_expiry();

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
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
    OR OLD."dataExpiresAt" IS DISTINCT FROM NEW."dataExpiresAt"
  THEN
    RAISE EXCEPTION 'Submission source, retention boundary and academic snapshots cannot change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

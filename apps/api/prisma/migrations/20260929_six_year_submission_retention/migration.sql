-- Record the expiry boundary for every accepted writing from its acceptance time.
ALTER TABLE "Submission" ADD COLUMN "dataExpiresAt" TIMESTAMPTZ;
UPDATE "Submission" SET "dataExpiresAt" = "createdAt" + INTERVAL '6 years';
ALTER TABLE "Submission" ALTER COLUMN "dataExpiresAt" SET NOT NULL;
ALTER TABLE "Submission" ALTER COLUMN "dataExpiresAt"
  SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '6 years');
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_six_year_expiry_check"
  CHECK ("dataExpiresAt" = "createdAt" + INTERVAL '6 years');
CREATE INDEX "Submission_retention_due_idx" ON "Submission"("dataExpiresAt", id);

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

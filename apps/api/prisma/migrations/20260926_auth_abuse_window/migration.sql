-- Authentication abuse protection: shared atomic PostgreSQL budget, pseudonymous HMAC keys.
CREATE TABLE "AuthRateWindow" (
  "bucketKey" VARCHAR(64) PRIMARY KEY,
  "attempts" INTEGER NOT NULL CHECK ("attempts" >= 0),
  "windowStart" TIMESTAMPTZ NOT NULL,
  "resetAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "AuthRateWindow_valid_window" CHECK ("resetAt" > "windowStart")
);
CREATE INDEX "AuthRateWindow_resetAt_idx" ON "AuthRateWindow"("resetAt");

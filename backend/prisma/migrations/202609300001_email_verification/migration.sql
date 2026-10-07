BEGIN;

-- Existing accounts already completed the previous registration flow. Preserve
-- their access; new accounts default to unverified.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ALTER COLUMN "email_verified" SET DEFAULT false;

ALTER TABLE "OtpVerification"
  ADD COLUMN IF NOT EXISTS "user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "otp_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'EMAIL_VERIFICATION',
  ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invalidated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_sent_at" TIMESTAMP(3);
ALTER TABLE "OtpVerification" ALTER COLUMN "otp" DROP NOT NULL;
ALTER TABLE "OtpVerification" ALTER COLUMN "pending_data" DROP NOT NULL;
-- Retire only legacy plaintext challenges. No user, clinic or patient is deleted.
UPDATE "OtpVerification" SET "otp" = NULL, "invalidated_at" = CURRENT_TIMESTAMP
WHERE "otp" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "AuthRateLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "resets_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "AuthRateLimit_resets_at_idx" ON "AuthRateLimit"("resets_at");
COMMIT;

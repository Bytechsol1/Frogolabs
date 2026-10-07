BEGIN;
ALTER TABLE "Clinic" ALTER COLUMN "status" SET DEFAULT 'Active';
-- Clinic availability is independent of the user's email verification state.
-- Preserve clinics explicitly disabled by an administrator.
UPDATE "Clinic" SET "status" = 'Active', "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'Pending' OR "status" IS NULL OR "status" = '';
COMMIT;

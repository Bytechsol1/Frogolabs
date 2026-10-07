BEGIN;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "is_demo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "is_demo" BOOLEAN NOT NULL DEFAULT false;
-- Every existing order was created against the previously hardcoded sandbox URL.
ALTER TABLE "TerraOrder" ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'SANDBOX';

-- Identify fixtures from this repository's seed script, without deleting data.
UPDATE "Clinic" SET "is_demo" = true WHERE
  (email = 'emily@austinfamily.com' AND name = 'Austin Family Clinic') OR
  (email = 'mark@greenvalley.com' AND name = 'Green Valley Clinic') OR
  (email = 'sarah@westside.com' AND name = 'Westside Health Center');
UPDATE "Patient" SET "is_demo" = true WHERE
  "validic_user_id" LIKE 'validic_demo_%' OR
  lower(concat(first_name, ' ', last_name)) LIKE 'sandbox auto %';
COMMIT;

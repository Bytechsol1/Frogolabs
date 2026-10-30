BEGIN;
CREATE TABLE IF NOT EXISTS "ClinicLogo" (
  "clinic_id" TEXT NOT NULL PRIMARY KEY,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicLogo_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "ClinicLogo" ENABLE ROW LEVEL SECURITY;
-- Logos are served through the existing validated backend image endpoint.
-- The app's server database connection owns writes; browser API roles get no access.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "ClinicLogo" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "ClinicLogo" FROM authenticated;
  END IF;
END $$;
COMMIT;

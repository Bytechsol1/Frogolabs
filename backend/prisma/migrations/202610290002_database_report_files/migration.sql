BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
CREATE TABLE IF NOT EXISTS public."LabResultFile" (
  "lab_result_id" TEXT PRIMARY KEY,
  "mime_type" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  CONSTRAINT "LabResultFile_lab_result_id_fkey" FOREIGN KEY ("lab_result_id")
    REFERENCES public."LabResult"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE public."LabResultFile" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public."LabResultFile" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public."LabResultFile" FROM authenticated;
  END IF;
END $$;
COMMIT;

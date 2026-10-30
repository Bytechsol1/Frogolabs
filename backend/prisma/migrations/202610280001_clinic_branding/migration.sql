BEGIN;

ALTER TABLE "Clinic"
  ADD COLUMN IF NOT EXISTS "branding_logo" TEXT,
  ADD COLUMN IF NOT EXISTS "primary_color" TEXT NOT NULL DEFAULT '#0F766E',
  ADD COLUMN IF NOT EXISTS "secondary_color" TEXT NOT NULL DEFAULT '#14B8A6',
  ADD COLUMN IF NOT EXISTS "information" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "services" JSONB NOT NULL DEFAULT '[]';

-- Existing staff permissions and existing record ownership remain unchanged.
-- A platform administrator must explicitly grant the new management permission.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "is_clinic_admin" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Patient_clinic_id_idx" ON "Patient" ("clinic_id");
CREATE INDEX IF NOT EXISTS "Workflow_clinic_id_idx" ON "Workflow" ("clinic_id");
CREATE INDEX IF NOT EXISTS "LabResult_patient_id_idx" ON "LabResult" ("patient_id");

-- Reject new cross-clinic links without changing or guessing legacy ownership.
CREATE OR REPLACE FUNCTION frigo_check_tenant_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id TEXT; linked_patient TEXT;
BEGIN
  IF TG_TABLE_NAME = 'Patient' THEN
    IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id THEN
      RAISE EXCEPTION 'Patient clinic ownership cannot be reassigned' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
      RAISE EXCEPTION 'Patient ownership cannot be reassigned' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME IN ('Workflow', 'LabResult') THEN
    SELECT clinic_id INTO owner_id FROM "Patient" WHERE id = NEW.patient_id;
    IF owner_id IS NULL OR (NEW.clinic_id IS NOT NULL AND NEW.clinic_id <> owner_id) THEN
      RAISE EXCEPTION 'Patient and clinic ownership must match' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'LabResult' THEN
      IF NEW.workflow_id IS NOT NULL THEN
        SELECT patient_id INTO linked_patient FROM "Workflow" WHERE id = NEW.workflow_id;
        IF linked_patient IS DISTINCT FROM NEW.patient_id THEN
          RAISE EXCEPTION 'Result workflow ownership must match' USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'TerraOrder' THEN
    IF NEW.workflow_id IS NOT NULL THEN
      SELECT patient_id INTO linked_patient FROM "Workflow" WHERE id = NEW.workflow_id;
      IF linked_patient IS DISTINCT FROM NEW.patient_id THEN
        RAISE EXCEPTION 'Order workflow ownership must match' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'SandboxReportJob' THEN
    IF NEW.order_id IS NOT NULL THEN
      SELECT patient_id INTO linked_patient FROM "TerraOrder" WHERE id = NEW.order_id;
      IF linked_patient IS DISTINCT FROM NEW.patient_id THEN
        RAISE EXCEPTION 'Job order ownership must match' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'TerraOrder' THEN
    IF NEW.lab_result_id IS NOT NULL THEN
      SELECT patient_id INTO linked_patient FROM "LabResult" WHERE id = NEW.lab_result_id;
      IF linked_patient IS DISTINCT FROM NEW.patient_id THEN
        RAISE EXCEPTION 'Order result ownership must match' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "Patient_tenant_links" ON "Patient";
CREATE TRIGGER "Patient_tenant_links" BEFORE UPDATE OF clinic_id ON "Patient"
  FOR EACH ROW EXECUTE FUNCTION frigo_check_tenant_links();
DROP TRIGGER IF EXISTS "Workflow_tenant_links" ON "Workflow";
CREATE TRIGGER "Workflow_tenant_links" BEFORE INSERT OR UPDATE OF patient_id, clinic_id ON "Workflow"
  FOR EACH ROW EXECUTE FUNCTION frigo_check_tenant_links();
DROP TRIGGER IF EXISTS "LabResult_tenant_links" ON "LabResult";
CREATE TRIGGER "LabResult_tenant_links" BEFORE INSERT OR UPDATE OF patient_id, clinic_id, workflow_id ON "LabResult"
  FOR EACH ROW EXECUTE FUNCTION frigo_check_tenant_links();
DROP TRIGGER IF EXISTS "TerraOrder_tenant_links" ON "TerraOrder";
CREATE TRIGGER "TerraOrder_tenant_links" BEFORE INSERT OR UPDATE OF patient_id, workflow_id, lab_result_id ON "TerraOrder"
  FOR EACH ROW EXECUTE FUNCTION frigo_check_tenant_links();
DROP TRIGGER IF EXISTS "SandboxReportJob_tenant_links" ON "SandboxReportJob";
CREATE TRIGGER "SandboxReportJob_tenant_links" BEFORE INSERT OR UPDATE OF patient_id, order_id ON "SandboxReportJob"
  FOR EACH ROW EXECUTE FUNCTION frigo_check_tenant_links();
COMMIT;

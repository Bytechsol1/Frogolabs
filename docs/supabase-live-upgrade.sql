-- Compatibility upgrade from the inspected legacy Supabase schema.
-- Additive schema changes; existing records and identifiers are preserved.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
-- DropForeignKey
ALTER TABLE "LabResult" DROP CONSTRAINT "LabResult_uploaded_by_fkey";

-- DropForeignKey
ALTER TABLE "WorkflowHistory" DROP CONSTRAINT "WorkflowHistory_updated_by_fkey";

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "branding_logo" TEXT,
ADD COLUMN     "information" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "primary_color" TEXT NOT NULL DEFAULT '#0F766E',
ADD COLUMN     "secondary_color" TEXT NOT NULL DEFAULT '#14B8A6',
ADD COLUMN     "services" JSONB NOT NULL DEFAULT '[]',
ALTER COLUMN "status" SET DEFAULT 'Active';

-- AlterTable
ALTER TABLE "LabResult" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "structured_report" JSONB,
ALTER COLUMN "uploaded_by" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OtpVerification" ADD COLUMN     "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "invalidated_at" TIMESTAMP(3),
ADD COLUMN     "last_sent_at" TIMESTAMP(3),
ADD COLUMN     "otp_hash" TEXT,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'EMAIL_VERIFICATION',
ADD COLUMN     "user_id" TEXT,
ADD COLUMN     "verified_at" TIMESTAMP(3),
ALTER COLUMN "otp" DROP NOT NULL,
ALTER COLUMN "pending_data" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_clinic_admin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkflowHistory" ALTER COLUMN "updated_by" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ClinicLogo" (
    "clinic_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicLogo_pkey" PRIMARY KEY ("clinic_id")
);

-- CreateTable
CREATE TABLE "LabResultAccess" (
    "id" TEXT NOT NULL,
    "lab_result_id" TEXT NOT NULL,
    "result_code" TEXT NOT NULL,
    "access_code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabResultAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerraOrder" (
    "environment" TEXT NOT NULL DEFAULT 'SANDBOX',
    "id" TEXT NOT NULL,
    "workflow_id" TEXT,
    "collection_type" TEXT,
    "patient_id" TEXT NOT NULL,
    "terra_order_id" TEXT NOT NULL,
    "client_reference_id" TEXT,
    "terra_product_id" TEXT NOT NULL,
    "terra_order_status" TEXT NOT NULL,
    "terra_order_item_id" TEXT,
    "terra_test_taker_id" TEXT,
    "results_status" TEXT,
    "tracking_number" TEXT,
    "escalation_level" TEXT,
    "lab_result_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerraOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxReportJob" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "order_id" TEXT,
    "variant_id" TEXT NOT NULL,
    "test_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "due_at" TIMESTAMP(3) NOT NULL,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxReportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerraWebhookEvent" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerraWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthRateLimit" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "resets_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabResultAccess_lab_result_id_key" ON "LabResultAccess"("lab_result_id");

-- CreateIndex
CREATE UNIQUE INDEX "LabResultAccess_result_code_key" ON "LabResultAccess"("result_code");

-- CreateIndex
CREATE UNIQUE INDEX "TerraOrder_workflow_id_key" ON "TerraOrder"("workflow_id");

-- CreateIndex
CREATE UNIQUE INDEX "TerraOrder_terra_order_id_key" ON "TerraOrder"("terra_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "TerraOrder_client_reference_id_key" ON "TerraOrder"("client_reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxReportJob_order_id_key" ON "SandboxReportJob"("order_id");

-- CreateIndex
CREATE INDEX "SandboxReportJob_status_next_attempt_at_idx" ON "SandboxReportJob"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "TerraWebhookEvent_event_id_key" ON "TerraWebhookEvent"("event_id");

-- CreateIndex
CREATE INDEX "AuthRateLimit_resets_at_idx" ON "AuthRateLimit"("resets_at");

-- CreateIndex
CREATE INDEX "LabResult_patient_id_idx" ON "LabResult"("patient_id");

-- CreateIndex
CREATE INDEX "Patient_clinic_id_idx" ON "Patient"("clinic_id");

-- CreateIndex
CREATE INDEX "Workflow_clinic_id_idx" ON "Workflow"("clinic_id");

-- AddForeignKey
ALTER TABLE "ClinicLogo" ADD CONSTRAINT "ClinicLogo_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowHistory" ADD CONSTRAINT "WorkflowHistory_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResultAccess" ADD CONSTRAINT "LabResultAccess_lab_result_id_fkey" FOREIGN KEY ("lab_result_id") REFERENCES "LabResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerraOrder" ADD CONSTRAINT "TerraOrder_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerraOrder" ADD CONSTRAINT "TerraOrder_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerraOrder" ADD CONSTRAINT "TerraOrder_lab_result_id_fkey" FOREIGN KEY ("lab_result_id") REFERENCES "LabResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxReportJob" ADD CONSTRAINT "SandboxReportJob_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxReportJob" ADD CONSTRAINT "SandboxReportJob_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "TerraOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "User" ALTER COLUMN "email_verified" SET DEFAULT false;
ALTER TABLE "ClinicLogo" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "ClinicLogo" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "ClinicLogo" FROM authenticated; END IF;
END $$;
ALTER TABLE "LabResultAccess" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "LabResultAccess" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "LabResultAccess" FROM authenticated; END IF;
END $$;
ALTER TABLE "TerraOrder" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "TerraOrder" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "TerraOrder" FROM authenticated; END IF;
END $$;
ALTER TABLE "SandboxReportJob" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "SandboxReportJob" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "SandboxReportJob" FROM authenticated; END IF;
END $$;
ALTER TABLE "TerraWebhookEvent" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "TerraWebhookEvent" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "TerraWebhookEvent" FROM authenticated; END IF;
END $$;
ALTER TABLE "AuthRateLimit" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "AuthRateLimit" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "AuthRateLimit" FROM authenticated; END IF;
END $$;
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

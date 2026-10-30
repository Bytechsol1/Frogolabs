-- Frigo Flow - complete application database schema (PostgreSQL / AWS)
-- Import into a fresh database: psql -X -v ON_ERROR_STOP=1 -W -f frigo-flow-schema.sql
-- Source: read-only inspection of the active Supabase public schema, 2026-10-29.
-- 16 tables; 3 enums; 20 foreign keys; 31 indexes; 5 tenant triggers.
-- FRESH EMPTY DATABASE ONLY. This creates schema, not existing business records.
-- No credentials, passwords, user rows, patient rows or image/report bytes are included.
-- Target: PostgreSQL 16+ on RDS, Lightsail, EC2 or another PostgreSQL host.
-- Import as the database/application owner; the backend must use that owner role.
-- All existing application RLS flags are preserved. Source has no public RLS policies.
-- Supabase-managed auth/storage/realtime/vault schemas, extension installation,
-- provider roles/grants, and provider rls_auto_enable event-trigger automation are
-- intentionally excluded. The application uses its own User/JWT/OTP authentication
-- and private ClinicLogo/LabResultFile tables, not Supabase Auth or Storage here.
-- IDs using Prisma uuid() and @updatedAt values are supplied by the application.
-- After import, regenerate the Prisma client and configure private DATABASE_URL
-- and DIRECT_URL for the target database. Never run demo seeds on live data.

-- DDL exported with the installed PostgreSQL 17.6 pg_dump, then adapted
-- for PostgreSQL 16+ without provider-owned event triggers or psql metacommands.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET LOCAL search_path = public, pg_catalog;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: NotificationChannel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationChannel" AS ENUM (
    'EMAIL',
    'SMS'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'CLINIC_USER'
);


--
-- Name: WorkflowStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WorkflowStatus" AS ENUM (
    'PATIENT_CREATED',
    'TEST_PACKAGE_SELECTED',
    'TASSO_INSTRUCTIONS_SENT',
    'KIT_SHIPPED',
    'SAMPLE_COLLECTED',
    'LAB_PROCESSING',
    'RESULTS_READY',
    'COMPLETED'
);


--
-- Name: frigo_check_tenant_links(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.frigo_check_tenant_links() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


-- Supabase provider event-trigger helper omitted for AWS portability.


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AuthRateLimit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuthRateLimit" (
    key text NOT NULL,
    attempts integer DEFAULT 1 NOT NULL,
    resets_at timestamp(3) without time zone NOT NULL
);


--
-- Name: Clinic; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Clinic" (
    id text NOT NULL,
    name text NOT NULL,
    contact_name text NOT NULL,
    email text,
    phone text,
    status text DEFAULT 'Active'::text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    branding_logo text,
    information text DEFAULT ''::text NOT NULL,
    is_demo boolean DEFAULT false NOT NULL,
    primary_color text DEFAULT '#0F766E'::text NOT NULL,
    secondary_color text DEFAULT '#14B8A6'::text NOT NULL,
    services jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: ClinicLogo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ClinicLogo" (
    clinic_id text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    data bytea NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: HealthMetric; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."HealthMetric" (
    id text NOT NULL,
    patient_id text NOT NULL,
    metric_type text NOT NULL,
    value text NOT NULL,
    numeric_value double precision,
    unit text,
    source text,
    recorded_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: LabResult; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LabResult" (
    id text NOT NULL,
    workflow_id text,
    patient_id text NOT NULL,
    file_url text NOT NULL,
    uploaded_by text,
    uploaded_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    clinic_id text,
    file_name text,
    notes text,
    result_date timestamp(3) without time zone,
    status text DEFAULT 'Available'::text NOT NULL,
    test_name text,
    source text DEFAULT 'MANUAL'::text NOT NULL,
    structured_report jsonb
);


--
-- Name: LabResultAccess; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LabResultAccess" (
    id text NOT NULL,
    lab_result_id text NOT NULL,
    result_code text NOT NULL,
    access_code_hash text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    access_count integer DEFAULT 0 NOT NULL,
    last_accessed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: LabResultFile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LabResultFile" (
    lab_result_id text NOT NULL,
    mime_type text NOT NULL,
    data bytea NOT NULL
);


--
-- Name: Notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    workflow_id text NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    recipient text NOT NULL,
    message text NOT NULL,
    status text NOT NULL,
    sent_at timestamp(3) without time zone
);


--
-- Name: OtpVerification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OtpVerification" (
    id text NOT NULL,
    email text NOT NULL,
    otp text,
    pending_data jsonb,
    expires_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    invalidated_at timestamp(3) without time zone,
    last_sent_at timestamp(3) without time zone,
    otp_hash text,
    purpose text DEFAULT 'EMAIL_VERIFICATION'::text NOT NULL,
    user_id text,
    verified_at timestamp(3) without time zone
);


--
-- Name: Patient; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Patient" (
    id text NOT NULL,
    clinic_id text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    dob timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    postal_code text DEFAULT ''::text NOT NULL,
    secondary_phone text,
    validic_marketplace_url text,
    validic_user_id text,
    age integer,
    gender text,
    is_demo boolean DEFAULT false NOT NULL
);


--
-- Name: SandboxReportJob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SandboxReportJob" (
    id text NOT NULL,
    patient_id text NOT NULL,
    order_id text,
    variant_id text NOT NULL,
    test_name text NOT NULL,
    country_code text NOT NULL,
    status text DEFAULT 'QUEUED'::text NOT NULL,
    due_at timestamp(3) without time zone NOT NULL,
    next_attempt_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: TerraOrder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TerraOrder" (
    environment text DEFAULT 'SANDBOX'::text NOT NULL,
    id text NOT NULL,
    workflow_id text,
    collection_type text,
    patient_id text NOT NULL,
    terra_order_id text NOT NULL,
    client_reference_id text,
    terra_product_id text NOT NULL,
    terra_order_status text NOT NULL,
    terra_order_item_id text,
    terra_test_taker_id text,
    results_status text,
    tracking_number text,
    escalation_level text,
    lab_result_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: TerraWebhookEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TerraWebhookEvent" (
    id text NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    received_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    clinic_id text,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role public."Role" DEFAULT 'CLINIC_USER'::public."Role" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    is_clinic_admin boolean DEFAULT false NOT NULL
);


--
-- Name: Workflow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Workflow" (
    id text NOT NULL,
    patient_id text NOT NULL,
    clinic_id text NOT NULL,
    test_type text NOT NULL,
    status public."WorkflowStatus" DEFAULT 'PATIENT_CREATED'::public."WorkflowStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: WorkflowHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WorkflowHistory" (
    id text NOT NULL,
    workflow_id text NOT NULL,
    status text NOT NULL,
    notes text,
    updated_by text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: AuthRateLimit AuthRateLimit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuthRateLimit"
    ADD CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY (key);


--
-- Name: ClinicLogo ClinicLogo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClinicLogo"
    ADD CONSTRAINT "ClinicLogo_pkey" PRIMARY KEY (clinic_id);


--
-- Name: Clinic Clinic_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Clinic"
    ADD CONSTRAINT "Clinic_pkey" PRIMARY KEY (id);


--
-- Name: HealthMetric HealthMetric_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HealthMetric"
    ADD CONSTRAINT "HealthMetric_pkey" PRIMARY KEY (id);


--
-- Name: LabResultAccess LabResultAccess_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LabResultAccess"
    ADD CONSTRAINT "LabResultAccess_pkey" PRIMARY KEY (id);


--
-- Name: LabResultFile LabResultFile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LabResultFile"
    ADD CONSTRAINT "LabResultFile_pkey" PRIMARY KEY (lab_result_id);


--
-- Name: LabResult LabResult_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LabResult"
    ADD CONSTRAINT "LabResult_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: OtpVerification OtpVerification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OtpVerification"
    ADD CONSTRAINT "OtpVerification_pkey" PRIMARY KEY (id);


--
-- Name: Patient Patient_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Patient"
    ADD CONSTRAINT "Patient_pkey" PRIMARY KEY (id);


--
-- Name: SandboxReportJob SandboxReportJob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SandboxReportJob"
    ADD CONSTRAINT "SandboxReportJob_pkey" PRIMARY KEY (id);


--
-- Name: TerraOrder TerraOrder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TerraOrder"
    ADD CONSTRAINT "TerraOrder_pkey" PRIMARY KEY (id);


--
-- Name: TerraWebhookEvent TerraWebhookEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TerraWebhookEvent"
    ADD CONSTRAINT "TerraWebhookEvent_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: WorkflowHistory WorkflowHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkflowHistory"
    ADD CONSTRAINT "WorkflowHistory_pkey" PRIMARY KEY (id);


--
-- Name: Workflow Workflow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Workflow"
    ADD CONSTRAINT "Workflow_pkey" PRIMARY KEY (id);


--
-- Name: AuthRateLimit_resets_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuthRateLimit_resets_at_idx" ON public."AuthRateLimit" USING btree (resets_at);


--
-- Name: Clinic_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Clinic_email_key" ON public."Clinic" USING btree (email);


--
-- Name: LabResultAccess_lab_result_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "LabResultAccess_lab_result_id_key" ON public."LabResultAccess" USING btree (lab_result_id);


--
-- Name: LabResultAccess_result_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "LabResultAccess_result_code_key" ON public."LabResultAccess" USING btree (result_code);


--
-- Name: LabResult_patient_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LabResult_patient_id_idx" ON public."LabResult" USING btree (patient_id);


--
-- Name: OtpVerification_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "OtpVerification_email_key" ON public."OtpVerification" USING btree (email);


--
-- Name: Patient_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Patient_clinic_id_idx" ON public."Patient" USING btree (clinic_id);


--
-- Name: SandboxReportJob_order_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SandboxReportJob_order_id_key" ON public."SandboxReportJob" USING btree (order_id);


--
-- Name: SandboxReportJob_status_next_attempt_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SandboxReportJob_status_next_attempt_at_idx" ON public."SandboxReportJob" USING btree (status, next_attempt_at);


--
-- Name: TerraOrder_client_reference_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TerraOrder_client_reference_id_key" ON public."TerraOrder" USING btree (client_reference_id);


--
-- Name: TerraOrder_terra_order_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TerraOrder_terra_order_id_key" ON public."TerraOrder" USING btree (terra_order_id);


--
-- Name: TerraOrder_workflow_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TerraOrder_workflow_id_key" ON public."TerraOrder" USING btree (workflow_id);


--
-- Name: TerraWebhookEvent_event_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TerraWebhookEvent_event_id_key" ON public."TerraWebhookEvent" USING btree (event_id);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: Workflow_clinic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Workflow_clinic_id_idx" ON public."Workflow" USING btree (clinic_id);


--
-- Name: LabResult LabResult_tenant_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "LabResult_tenant_links" BEFORE INSERT OR UPDATE OF patient_id, clinic_id, workflow_id ON public."LabResult" FOR EACH ROW EXECUTE FUNCTION public.frigo_check_tenant_links();


--
-- Name: Patient Patient_tenant_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Patient_tenant_links" BEFORE UPDATE OF clinic_id ON public."Patient" FOR EACH ROW EXECUTE FUNCTION public.frigo_check_tenant_links();


--
-- Name: SandboxReportJob SandboxReportJob_tenant_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "SandboxReportJob_tenant_links" BEFORE INSERT OR UPDATE OF patient_id, order_id ON public."SandboxReportJob" FOR EACH ROW EXECUTE FUNCTION public.frigo_check_tenant_links();


--
-- Name: TerraOrder TerraOrder_tenant_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "TerraOrder_tenant_links" BEFORE INSERT OR UPDATE OF patient_id, workflow_id, lab_result_id ON public."TerraOrder" FOR EACH ROW EXECUTE FUNCTION public.frigo_check_tenant_links();


--
-- Name: Workflow Workflow_tenant_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Workflow_tenant_links" BEFORE INSERT OR UPDATE OF patient_id, clinic_id ON public."Workflow" FOR EACH ROW EXECUTE FUNCTION public.frigo_check_tenant_links();


--
-- Name: ClinicLogo ClinicLogo_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClinicLogo"
    ADD CONSTRAINT "ClinicLogo_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public."Clinic"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: HealthMetric HealthMetric_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HealthMetric"
    ADD CONSTRAINT "HealthMetric_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public."Patient"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LabResultAccess LabResultAccess_lab_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LabResultAccess"
    ADD CONSTRAINT "LabResultAccess_lab_result_id_fkey" FOREIGN KEY (lab_result_id) REFERENCES public."LabResult"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LabResultFile LabResultFile_lab_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LabResultFile"
    ADD CONSTRAINT "LabResultFile_lab_result_id_fkey" FOREIGN KEY (lab_result_id) REFERENCES public."LabResult"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LabResult LabResult_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LabResult"
    ADD CONSTRAINT "LabResult_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public."Clinic"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: LabResult LabResult_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LabResult"
    ADD CONSTRAINT "LabResult_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public."Patient"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LabResult LabResult_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LabResult"
    ADD CONSTRAINT "LabResult_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: LabResult LabResult_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LabResult"
    ADD CONSTRAINT "LabResult_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES public."Workflow"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Notification Notification_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES public."Workflow"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Patient Patient_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Patient"
    ADD CONSTRAINT "Patient_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public."Clinic"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SandboxReportJob SandboxReportJob_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SandboxReportJob"
    ADD CONSTRAINT "SandboxReportJob_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public."TerraOrder"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SandboxReportJob SandboxReportJob_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SandboxReportJob"
    ADD CONSTRAINT "SandboxReportJob_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public."Patient"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TerraOrder TerraOrder_lab_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TerraOrder"
    ADD CONSTRAINT "TerraOrder_lab_result_id_fkey" FOREIGN KEY (lab_result_id) REFERENCES public."LabResult"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: TerraOrder TerraOrder_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TerraOrder"
    ADD CONSTRAINT "TerraOrder_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public."Patient"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TerraOrder TerraOrder_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TerraOrder"
    ADD CONSTRAINT "TerraOrder_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES public."Workflow"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: User User_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public."Clinic"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkflowHistory WorkflowHistory_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkflowHistory"
    ADD CONSTRAINT "WorkflowHistory_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkflowHistory WorkflowHistory_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkflowHistory"
    ADD CONSTRAINT "WorkflowHistory_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES public."Workflow"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Workflow Workflow_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Workflow"
    ADD CONSTRAINT "Workflow_clinic_id_fkey" FOREIGN KEY (clinic_id) REFERENCES public."Clinic"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Workflow Workflow_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Workflow"
    ADD CONSTRAINT "Workflow_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES public."Patient"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AuthRateLimit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AuthRateLimit" ENABLE ROW LEVEL SECURITY;

--
-- Name: Clinic; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Clinic" ENABLE ROW LEVEL SECURITY;

--
-- Name: ClinicLogo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ClinicLogo" ENABLE ROW LEVEL SECURITY;

--
-- Name: HealthMetric; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."HealthMetric" ENABLE ROW LEVEL SECURITY;

--
-- Name: LabResult; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."LabResult" ENABLE ROW LEVEL SECURITY;

--
-- Name: LabResultAccess; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."LabResultAccess" ENABLE ROW LEVEL SECURITY;

--
-- Name: LabResultFile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."LabResultFile" ENABLE ROW LEVEL SECURITY;

--
-- Name: Notification; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;

--
-- Name: OtpVerification; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OtpVerification" ENABLE ROW LEVEL SECURITY;

--
-- Name: Patient; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Patient" ENABLE ROW LEVEL SECURITY;

--
-- Name: SandboxReportJob; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SandboxReportJob" ENABLE ROW LEVEL SECURITY;

--
-- Name: TerraOrder; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TerraOrder" ENABLE ROW LEVEL SECURITY;

--
-- Name: TerraWebhookEvent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TerraWebhookEvent" ENABLE ROW LEVEL SECURITY;

--
-- Name: User; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

--
-- Name: Workflow; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Workflow" ENABLE ROW LEVEL SECURITY;

--
-- Name: WorkflowHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WorkflowHistory" ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

-- No anonymous database privileges. Application access uses the importing owner.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.frigo_check_tenant_links() FROM PUBLIC;

COMMIT;

-- ============================================================
-- Stage 08 / 08 — RAG Documents, Foreign Keys, Functions, Views, Triggers, RLS, Grants & Cron
-- Depends    : Stage 01–07
-- Rerun      : NOT idempotent — fresh installs only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."documents" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "entity_type" text NOT NULL,
    "entity_id" text NOT NULL,
    "doc_type" text NOT NULL,
    "title" text NOT NULL,
    "storage_bucket" text NOT NULL,
    "storage_path" text NOT NULL,
    "file_name" text NOT NULL,
    "file_size" bigint DEFAULT 0 NOT NULL,
    "mime_type" text DEFAULT 'application/pdf'::text NOT NULL,
    "owner_id" uuid NOT NULL,
    "division_code" text,
    "access_tier" text DEFAULT 'institute'::text NOT NULL,
    "ingest_status" text DEFAULT 'pending'::text NOT NULL,
    "ingest_error" text,
    "ingest_attempts" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "content_hash" text,
    "processing_started_at" timestamp with time zone,
    CONSTRAINT "documents_access_tier_check" CHECK (access_tier = ANY (ARRAY['institute'::text, 'division'::text, 'owner'::text, 'confidential'::text])),
    CONSTRAINT "documents_ingest_status_check" CHECK (ingest_status = ANY (ARRAY['pending'::text, 'processing'::text, 'indexed'::text, 'failed'::text, 'skipped'::text])),
    CONSTRAINT "documents_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX documents_bucket_path_idx ON public.documents USING btree (storage_bucket, storage_path);
CREATE UNIQUE INDEX documents_content_hash_idx ON public.documents USING btree (content_hash) WHERE (content_hash IS NOT NULL);
CREATE INDEX documents_created_at_idx ON public.documents USING btree (created_at DESC);
CREATE INDEX documents_division_code_idx ON public.documents USING btree (division_code) WHERE (division_code IS NOT NULL);
CREATE INDEX documents_entity_created_idx ON public.documents USING btree (entity_type, entity_id, created_at DESC);
CREATE INDEX documents_entity_idx ON public.documents USING btree (entity_type, entity_id);
CREATE INDEX documents_failed_retry_idx ON public.documents USING btree (created_at) WHERE ((ingest_status = 'failed'::text) AND (ingest_attempts < 3));
CREATE INDEX documents_harvested_tier_created_idx ON public.documents USING btree (access_tier, created_at) WHERE (entity_type = 'harvested'::text);
CREATE INDEX documents_ingest_pending_idx ON public.documents USING btree (created_at) WHERE (ingest_status = 'pending'::text);
CREATE INDEX documents_ingest_processing_idx ON public.documents USING btree (processing_started_at) WHERE (ingest_status = 'processing'::text);
CREATE INDEX documents_owner_id_fk_idx ON public.documents USING btree (owner_id);
CREATE INDEX documents_status_tier_idx ON public.documents USING btree (ingest_status, access_tier);

CREATE TABLE IF NOT EXISTS public."doc_pages" (
    "document_id" uuid NOT NULL,
    "page" integer NOT NULL,
    "text" text DEFAULT ''::text NOT NULL,
    CONSTRAINT "doc_pages_pkey" PRIMARY KEY (document_id, page)
);

CREATE TABLE IF NOT EXISTS public."doc_indexes" (
    "document_id" uuid NOT NULL,
    "tree" jsonb NOT NULL,
    "model" text NOT NULL,
    "page_count" integer DEFAULT 0 NOT NULL,
    "built_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "doc_indexes_pkey" PRIMARY KEY (document_id)
);
CREATE INDEX doc_indexes_model_idx ON public.doc_indexes USING btree (model);

CREATE TABLE IF NOT EXISTS public."collection_indexes" (
    "collection_key" text NOT NULL,
    "title" text NOT NULL,
    "summary" text NOT NULL,
    "document_count" integer DEFAULT 0 NOT NULL,
    "model" text NOT NULL,
    "built_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "collection_indexes_pkey" PRIMARY KEY (collection_key)
);

CREATE TABLE IF NOT EXISTS public."query_log" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid DEFAULT auth.uid() NOT NULL,
    "question" text NOT NULL,
    "mode" text NOT NULL,
    "answer" text NOT NULL,
    "citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "feedback" smallint,
    "latency_ms" integer,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "route" text,
    "function_name" text,
    "function_params" jsonb,
    "refusal_reason" text,
    "catalog_version" text,
    CONSTRAINT "query_log_feedback_check" CHECK (feedback = ANY (ARRAY['-1'::integer, 1])),
    CONSTRAINT "query_log_pkey" PRIMARY KEY (id)
);
CREATE INDEX query_log_created_idx ON public.query_log USING btree (created_at DESC);
CREATE INDEX query_log_feedback_created_idx ON public.query_log USING btree (feedback, created_at DESC) WHERE (feedback IS NOT NULL);
CREATE INDEX query_log_user_idx ON public.query_log USING btree (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public."route_labels" (
    "query_id" uuid NOT NULL,
    "question" text NOT NULL,
    "correct_route" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "route_labels_correct_route_check" CHECK (correct_route = ANY (ARRAY['structured'::text, 'document'::text, 'hybrid'::text])),
    CONSTRAINT "route_labels_pkey" PRIMARY KEY (query_id)
);
CREATE INDEX route_labels_created_at_idx ON public.route_labels USING btree (created_at DESC);

CREATE TABLE IF NOT EXISTS public."scheduled_queries" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "owner" uuid NOT NULL,
    "question" text NOT NULL,
    "cadence" text DEFAULT 'weekly'::text NOT NULL,
    "last_run_at" timestamp with time zone,
    "last_error" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "scheduled_queries_cadence_check" CHECK (cadence = ANY (ARRAY['daily'::text, 'weekly'::text])),
    CONSTRAINT "scheduled_queries_question_check" CHECK (char_length(btrim(question)) >= 3 AND char_length(btrim(question)) <= 1000),
    CONSTRAINT "scheduled_queries_pkey" PRIMARY KEY (id)
);
CREATE INDEX scheduled_queries_owner_idx ON public.scheduled_queries USING btree (owner);

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;


-- Guarded trigram index for document title search (skipped automatically where pg_trgm is unavailable)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS documents_title_trgm_idx
        ON public.documents USING gin (title gin_trgm_ops);
EXCEPTION
    WHEN undefined_file OR feature_not_supported OR insufficient_privilege THEN NULL;
END $$;

-- ── Cross-table foreign keys ────────────────────────────────────────────────
ALTER TABLE public."access_requests" ADD CONSTRAINT "access_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public."access_requests" ADD CONSTRAINT "access_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."acting_assignments" ADD CONSTRAINT "acting_assignments_acting_user_id_fkey" FOREIGN KEY (acting_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."acting_assignments" ADD CONSTRAINT "acting_assignments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."acting_assignments" ADD CONSTRAINT "acting_assignments_division_code_fkey" FOREIGN KEY (division_code) REFERENCES divisions("divCode") ON DELETE SET NULL;
ALTER TABLE public."acting_assignments" ADD CONSTRAINT "acting_assignments_principal_user_id_fkey" FOREIGN KEY (principal_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."action_items" ADD CONSTRAINT "action_items_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL;
ALTER TABLE public."agenda_items" ADD CONSTRAINT "agenda_items_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE public."ai_action_log" ADD CONSTRAINT "ai_action_log_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL;
ALTER TABLE public."ai_action_log" ADD CONSTRAINT "ai_action_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."calendar_events" ADD CONSTRAINT "calendar_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."coi_declarations" ADD CONSTRAINT "coi_declarations_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."coi_declarations" ADD CONSTRAINT "coi_declarations_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE public."coi_declarations" ADD CONSTRAINT "coi_declarations_member_user_id_fkey" FOREIGN KEY (member_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."committee_members" ADD CONSTRAINT "committee_members_committee_id_fkey" FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE;
ALTER TABLE public."contribution_request_events" ADD CONSTRAINT "contribution_request_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."contribution_request_events" ADD CONSTRAINT "contribution_request_events_request_id_fkey" FOREIGN KEY (request_id) REFERENCES contribution_requests(id) ON DELETE CASCADE;
ALTER TABLE public."contribution_requests" ADD CONSTRAINT "contribution_requests_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."contribution_requests" ADD CONSTRAINT "contribution_requests_delegate_id_fkey" FOREIGN KEY (delegate_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."contribution_requests" ADD CONSTRAINT "contribution_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."csir_rules" ADD CONSTRAINT "csir_rules_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."data_stewards" ADD CONSTRAINT "data_stewards_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."doc_indexes" ADD CONSTRAINT "doc_indexes_document_id_fkey" FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE public."doc_pages" ADD CONSTRAINT "doc_pages_document_id_fkey" FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE public."documents" ADD CONSTRAINT "documents_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id);
ALTER TABLE public."equipment" ADD CONSTRAINT "equipment_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES labs(id);
ALTER TABLE public."equipment" ADD CONSTRAINT "equipment_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);
ALTER TABLE public."equipment" ADD CONSTRAINT "equipment_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public."equipment_usage_log" ADD CONSTRAINT "equipment_usage_log_equipment_id_fkey" FOREIGN KEY (equipment_id) REFERENCES equipment("UInsID") ON DELETE CASCADE;
ALTER TABLE public."equipment_usage_log" ADD CONSTRAINT "equipment_usage_log_logged_by_fkey" FOREIGN KEY (logged_by) REFERENCES auth.users(id);
ALTER TABLE public."equipment_usage_log" ADD CONSTRAINT "equipment_usage_log_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public."equipment_usage_log" ADD CONSTRAINT "equipment_usage_log_user_staff_id_fkey" FOREIGN KEY (user_staff_id) REFERENCES staff("ID") ON DELETE SET NULL;
ALTER TABLE public."expertise_terms" ADD CONSTRAINT "expertise_terms_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."expertise_terms" ADD CONSTRAINT "expertise_terms_merged_into_fkey" FOREIGN KEY (merged_into) REFERENCES expertise_terms(id) ON DELETE SET NULL;
ALTER TABLE public."expertise_terms" ADD CONSTRAINT "expertise_terms_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES expertise_terms(id) ON DELETE SET NULL;
ALTER TABLE public."feature_controls" ADD CONSTRAINT "feature_controls_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public."feature_grants" ADD CONSTRAINT "feature_grants_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES auth.users(id);
ALTER TABLE public."feature_grants" ADD CONSTRAINT "feature_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."harvested_imports" ADD CONSTRAINT "harvested_imports_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public."holidays" ADD CONSTRAINT "holidays_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."import_events" ADD CONSTRAINT "import_events_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE public."import_field_mappings" ADD CONSTRAINT "import_field_mappings_confirmed_by_fkey" FOREIGN KEY (confirmed_by) REFERENCES auth.users(id);
ALTER TABLE public."ip_intelligence" ADD CONSTRAINT "ip_intelligence_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public."ip_inventors" ADD CONSTRAINT "ip_inventors_confirmed_by_fkey" FOREIGN KEY (confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."ip_inventors" ADD CONSTRAINT "ip_inventors_ip_id_fkey" FOREIGN KEY (ip_id) REFERENCES ip_intelligence(id) ON DELETE CASCADE;
ALTER TABLE public."ip_inventors" ADD CONSTRAINT "ip_inventors_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES staff("ID") ON DELETE SET NULL;
ALTER TABLE public."labs" ADD CONSTRAINT "labs_div_code_fkey" FOREIGN KEY (div_code) REFERENCES divisions("divCode");
ALTER TABLE public."meeting_documents" ADD CONSTRAINT "meeting_documents_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE public."meetings" ADD CONSTRAINT "meetings_committee_id_fkey" FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE;
ALTER TABLE public."metric_snapshots" ADD CONSTRAINT "metric_snapshots_metric_key_fkey" FOREIGN KEY (metric_key) REFERENCES metrics(key) ON DELETE CASCADE;
ALTER TABLE public."mous" ADD CONSTRAINT "mous_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."output_authors" ADD CONSTRAINT "output_authors_confirmed_by_fkey" FOREIGN KEY (confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."output_authors" ADD CONSTRAINT "output_authors_output_id_fkey" FOREIGN KEY (output_id) REFERENCES scientific_outputs(id) ON DELETE CASCADE;
ALTER TABLE public."output_authors" ADD CONSTRAINT "output_authors_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES staff("ID") ON DELETE SET NULL;
ALTER TABLE public."phd_students" ADD CONSTRAINT "phd_students_cosupervisor_staff_id_fkey" FOREIGN KEY (cosupervisor_staff_id) REFERENCES staff("ID") ON DELETE SET NULL;
ALTER TABLE public."phd_students" ADD CONSTRAINT "phd_students_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public."phd_students" ADD CONSTRAINT "phd_students_supervisor_staff_id_fkey" FOREIGN KEY (supervisor_staff_id) REFERENCES staff("ID") ON DELETE SET NULL;
ALTER TABLE public."pms_annexures" ADD CONSTRAINT "pms_annexures_report_id_fkey" FOREIGN KEY (report_id) REFERENCES pms_reports(id) ON DELETE CASCADE;
ALTER TABLE public."pms_awp_activities" ADD CONSTRAINT "pms_awp_activities_report_id_fkey" FOREIGN KEY (report_id) REFERENCES pms_reports(id) ON DELETE CASCADE;
ALTER TABLE public."pms_awp_revisions" ADD CONSTRAINT "pms_awp_revisions_awp_id_fkey" FOREIGN KEY (awp_id) REFERENCES pms_awps(id) ON DELETE CASCADE;
ALTER TABLE public."pms_awp_revisions" ADD CONSTRAINT "pms_awp_revisions_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."pms_awp_revisions" ADD CONSTRAINT "pms_awp_revisions_initiated_by_fkey" FOREIGN KEY (initiated_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_awps" ADD CONSTRAINT "pms_awps_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."pms_awps" ADD CONSTRAINT "pms_awps_reporting_officer_id_fkey" FOREIGN KEY (reporting_officer_id) REFERENCES staff("ID") ON DELETE SET NULL;
ALTER TABLE public."pms_awps" ADD CONSTRAINT "pms_awps_reviewing_officer_id_fkey" FOREIGN KEY (reviewing_officer_id) REFERENCES staff("ID") ON DELETE SET NULL;
ALTER TABLE public."pms_awps" ADD CONSTRAINT "pms_awps_scientist_user_id_fkey" FOREIGN KEY (scientist_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."pms_awps" ADD CONSTRAINT "pms_awps_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES staff("ID") ON DELETE RESTRICT;
ALTER TABLE public."pms_committee_decisions" ADD CONSTRAINT "pms_committee_decisions_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_committee_decisions" ADD CONSTRAINT "pms_committee_decisions_report_id_fkey" FOREIGN KEY (report_id) REFERENCES pms_reports(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_condonations" ADD CONSTRAINT "pms_condonations_condoned_by_fkey" FOREIGN KEY (condoned_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_condonations" ADD CONSTRAINT "pms_condonations_report_id_fkey" FOREIGN KEY (report_id) REFERENCES pms_reports(id) ON DELETE CASCADE;
ALTER TABLE public."pms_empowered_committee_members" ADD CONSTRAINT "pms_empowered_committee_members_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES appraisal_cycles(id) ON DELETE CASCADE;
ALTER TABLE public."pms_empowered_committee_members" ADD CONSTRAINT "pms_empowered_committee_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_evaluation_committee_members" ADD CONSTRAINT "pms_evaluation_committee_members_committee_id_fkey" FOREIGN KEY (committee_id) REFERENCES pms_evaluation_committees(id) ON DELETE CASCADE;
ALTER TABLE public."pms_evaluation_committee_members" ADD CONSTRAINT "pms_evaluation_committee_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_evaluation_committees" ADD CONSTRAINT "pms_evaluation_committees_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES appraisal_cycles(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_evaluations" ADD CONSTRAINT "pms_evaluations_evaluator_id_fkey" FOREIGN KEY (evaluator_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_evaluations" ADD CONSTRAINT "pms_evaluations_report_id_fkey" FOREIGN KEY (report_id) REFERENCES pms_reports(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_grievance_members" ADD CONSTRAINT "pms_grievance_members_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES appraisal_cycles(id) ON DELETE CASCADE;
ALTER TABLE public."pms_grievance_members" ADD CONSTRAINT "pms_grievance_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_notifications" ADD CONSTRAINT "pms_notifications_report_id_fkey" FOREIGN KEY (report_id) REFERENCES pms_reports(id) ON DELETE CASCADE;
ALTER TABLE public."pms_notifications" ADD CONSTRAINT "pms_notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."pms_panel_scores" ADD CONSTRAINT "pms_panel_scores_committee_id_fkey" FOREIGN KEY (committee_id) REFERENCES pms_evaluation_committees(id);
ALTER TABLE public."pms_panel_scores" ADD CONSTRAINT "pms_panel_scores_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
ALTER TABLE public."pms_panel_scores" ADD CONSTRAINT "pms_panel_scores_report_id_fkey" FOREIGN KEY (report_id) REFERENCES pms_reports(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_part1" ADD CONSTRAINT "pms_part1_prefilled_by_fkey" FOREIGN KEY (prefilled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."pms_part1" ADD CONSTRAINT "pms_part1_report_id_fkey" FOREIGN KEY (report_id) REFERENCES pms_reports(id) ON DELETE CASCADE;
ALTER TABLE public."pms_part1" ADD CONSTRAINT "pms_part1_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."pms_report_items" ADD CONSTRAINT "pms_report_items_report_id_fkey" FOREIGN KEY (report_id) REFERENCES pms_reports(id) ON DELETE CASCADE;
ALTER TABLE public."pms_report_sections" ADD CONSTRAINT "pms_report_sections_report_id_fkey" FOREIGN KEY (report_id) REFERENCES pms_reports(id) ON DELETE CASCADE;
ALTER TABLE public."pms_reports" ADD CONSTRAINT "pms_reports_committee_id_fkey" FOREIGN KEY (committee_id) REFERENCES pms_evaluation_committees(id) ON DELETE SET NULL;
ALTER TABLE public."pms_reports" ADD CONSTRAINT "pms_reports_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES appraisal_cycles(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_reports" ADD CONSTRAINT "pms_reports_scientist_id_fkey" FOREIGN KEY (scientist_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."pms_representations" ADD CONSTRAINT "pms_representations_report_id_fkey" FOREIGN KEY (report_id) REFERENCES pms_reports(id) ON DELETE CASCADE;
ALTER TABLE public."pms_representations" ADD CONSTRAINT "pms_representations_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."pms_representations" ADD CONSTRAINT "pms_representations_scientist_id_fkey" FOREIGN KEY (scientist_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."project_budget_lines" ADD CONSTRAINT "project_budget_lines_change_request_id_fkey" FOREIGN KEY (change_request_id) REFERENCES project_change_requests(id);
ALTER TABLE public."project_budget_lines" ADD CONSTRAINT "project_budget_lines_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_change_requests" ADD CONSTRAINT "project_change_requests_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_change_requests" ADD CONSTRAINT "project_change_requests_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_change_requests" ADD CONSTRAINT "project_change_requests_request_document_id_fkey" FOREIGN KEY (request_document_id) REFERENCES project_documents(id) ON DELETE SET NULL;
ALTER TABLE public."project_change_steps" ADD CONSTRAINT "project_change_steps_change_id_fkey" FOREIGN KEY (change_id) REFERENCES project_change_requests(id) ON DELETE CASCADE;
ALTER TABLE public."project_change_steps" ADD CONSTRAINT "project_change_steps_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id);
ALTER TABLE public."project_change_steps" ADD CONSTRAINT "project_change_steps_document_id_fkey" FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE SET NULL;
ALTER TABLE public."project_change_steps" ADD CONSTRAINT "project_change_steps_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL;
ALTER TABLE public."project_completion_reports" ADD CONSTRAINT "project_completion_reports_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_completion_reports" ADD CONSTRAINT "project_completion_reports_document_id_fkey" FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE SET NULL;
ALTER TABLE public."project_completion_reports" ADD CONSTRAINT "project_completion_reports_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_completion_reports" ADD CONSTRAINT "project_completion_reports_published_document_id_fkey" FOREIGN KEY (published_document_id) REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE public."project_completion_steps" ADD CONSTRAINT "project_completion_steps_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id);
ALTER TABLE public."project_completion_steps" ADD CONSTRAINT "project_completion_steps_document_id_fkey" FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE SET NULL;
ALTER TABLE public."project_completion_steps" ADD CONSTRAINT "project_completion_steps_report_id_fkey" FOREIGN KEY (report_id) REFERENCES project_completion_reports(id) ON DELETE CASCADE;
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_documents" ADD CONSTRAINT "project_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE public."project_engagements" ADD CONSTRAINT "project_engagements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_engagements" ADD CONSTRAINT "project_engagements_person_id_fkey" FOREIGN KEY (person_id) REFERENCES project_staff_persons(id) ON DELETE CASCADE;
ALTER TABLE public."project_engagements" ADD CONSTRAINT "project_engagements_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_engagements" ADD CONSTRAINT "project_engagements_selection_id_fkey" FOREIGN KEY (selection_id) REFERENCES project_selections(id) ON DELETE SET NULL;
ALTER TABLE public."project_events" ADD CONSTRAINT "project_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_expenditure" ADD CONSTRAINT "project_expenditure_document_id_fkey" FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE SET NULL;
ALTER TABLE public."project_expenditure" ADD CONSTRAINT "project_expenditure_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_expenditure" ADD CONSTRAINT "project_expenditure_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
ALTER TABLE public."project_expenditure" ADD CONSTRAINT "project_expenditure_reverses_id_fkey" FOREIGN KEY (reverses_id) REFERENCES project_expenditure(id);
ALTER TABLE public."project_fund_receipts" ADD CONSTRAINT "project_fund_receipts_document_id_fkey" FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE SET NULL;
ALTER TABLE public."project_fund_receipts" ADD CONSTRAINT "project_fund_receipts_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_fund_receipts" ADD CONSTRAINT "project_fund_receipts_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
ALTER TABLE public."project_fund_receipts" ADD CONSTRAINT "project_fund_receipts_reverses_id_fkey" FOREIGN KEY (reverses_id) REFERENCES project_fund_receipts(id);
ALTER TABLE public."project_ip_agreements" ADD CONSTRAINT "project_ip_agreements_document_id_fkey" FOREIGN KEY (document_id) REFERENCES project_documents(id);
ALTER TABLE public."project_ip_agreements" ADD CONSTRAINT "project_ip_agreements_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_ip_agreements" ADD CONSTRAINT "project_ip_agreements_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_labs" ADD CONSTRAINT "project_labs_added_by_fkey" FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_labs" ADD CONSTRAINT "project_labs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_labs" ADD CONSTRAINT "project_labs_rc_approval_document_id_fkey" FOREIGN KEY (rc_approval_document_id) REFERENCES project_documents(id) ON DELETE SET NULL;
ALTER TABLE public."project_milestones" ADD CONSTRAINT "project_milestones_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."project_milestones" ADD CONSTRAINT "project_milestones_document_id_fkey" FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE SET NULL;
ALTER TABLE public."project_milestones" ADD CONSTRAINT "project_milestones_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_report_history" ADD CONSTRAINT "project_report_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id);
ALTER TABLE public."project_report_history" ADD CONSTRAINT "project_report_history_report_id_fkey" FOREIGN KEY (report_id) REFERENCES project_reports(id) ON DELETE CASCADE;
ALTER TABLE public."project_reports" ADD CONSTRAINT "project_reports_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public."project_reports" ADD CONSTRAINT "project_reports_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public."project_reports" ADD CONSTRAINT "project_reports_slot_id_fkey" FOREIGN KEY (slot_id) REFERENCES project_review_slots(id) ON DELETE SET NULL;
ALTER TABLE public."project_reports" ADD CONSTRAINT "project_reports_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES auth.users(id);
ALTER TABLE public."project_review_slots" ADD CONSTRAINT "project_review_slots_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL;
ALTER TABLE public."project_review_slots" ADD CONSTRAINT "project_review_slots_minutes_document_id_fkey" FOREIGN KEY (minutes_document_id) REFERENCES project_documents(id) ON DELETE SET NULL;
ALTER TABLE public."project_review_slots" ADD CONSTRAINT "project_review_slots_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_review_slots" ADD CONSTRAINT "project_review_slots_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
ALTER TABLE public."project_review_slots" ADD CONSTRAINT "project_review_slots_report_id_fkey" FOREIGN KEY (report_id) REFERENCES project_reports(id) ON DELETE SET NULL;
ALTER TABLE public."project_schemes" ADD CONSTRAINT "project_schemes_leader_user_id_fkey" FOREIGN KEY (leader_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_schemes" ADD CONSTRAINT "project_schemes_review_committee_id_fkey" FOREIGN KEY (review_committee_id) REFERENCES committees(id) ON DELETE SET NULL;
ALTER TABLE public."project_selections" ADD CONSTRAINT "project_selections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_selections" ADD CONSTRAINT "project_selections_minutes_document_id_fkey" FOREIGN KEY (minutes_document_id) REFERENCES project_documents(id) ON DELETE SET NULL;
ALTER TABLE public."project_selections" ADD CONSTRAINT "project_selections_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."project_staff" ADD CONSTRAINT "project_staff_person_id_fkey" FOREIGN KEY (person_id) REFERENCES project_staff_persons(id) ON DELETE SET NULL;
ALTER TABLE public."project_staff" ADD CONSTRAINT "project_staff_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public."project_staff" ADD CONSTRAINT "project_staff_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES staff("ID") ON DELETE SET NULL;
ALTER TABLE public."project_staff_leave" ADD CONSTRAINT "project_staff_leave_engagement_id_fkey" FOREIGN KEY (engagement_id) REFERENCES project_engagements(id) ON DELETE CASCADE;
ALTER TABLE public."project_staff_leave" ADD CONSTRAINT "project_staff_leave_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_stage_deliverables" ADD CONSTRAINT "project_stage_deliverables_document_id_fkey" FOREIGN KEY (document_id) REFERENCES project_documents(id);
ALTER TABLE public."project_stage_deliverables" ADD CONSTRAINT "project_stage_deliverables_done_by_fkey" FOREIGN KEY (done_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."project_stage_deliverables" ADD CONSTRAINT "project_stage_deliverables_item_key_fkey" FOREIGN KEY (item_key) REFERENCES project_stage_items(item_key);
ALTER TABLE public."project_stage_deliverables" ADD CONSTRAINT "project_stage_deliverables_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE CASCADE;
ALTER TABLE public."projects" ADD CONSTRAINT "projects_legacy_completed_by_fkey" FOREIGN KEY (legacy_completed_by) REFERENCES auth.users(id);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_pi_staff_id_fkey" FOREIGN KEY (pi_staff_id) REFERENCES staff("ID") ON DELETE SET NULL;
ALTER TABLE public."projects" ADD CONSTRAINT "projects_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE SET NULL;
ALTER TABLE public."projects" ADD CONSTRAINT "projects_track_fkey" FOREIGN KEY (track) REFERENCES project_schemes(code);
ALTER TABLE public."proposal_budget_lines" ADD CONSTRAINT "proposal_budget_lines_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
ALTER TABLE public."proposal_copis" ADD CONSTRAINT "proposal_copis_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
ALTER TABLE public."proposal_documents" ADD CONSTRAINT "proposal_documents_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
ALTER TABLE public."proposal_documents" ADD CONSTRAINT "proposal_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE public."proposal_notes" ADD CONSTRAINT "proposal_notes_author_id_fkey" FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."proposal_notes" ADD CONSTRAINT "proposal_notes_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
ALTER TABLE public."proposal_review_comments" ADD CONSTRAINT "proposal_review_comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES auth.users(id);
ALTER TABLE public."proposal_review_comments" ADD CONSTRAINT "proposal_review_comments_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
ALTER TABLE public."proposal_review_steps" ADD CONSTRAINT "proposal_review_steps_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id);
ALTER TABLE public."proposal_review_steps" ADD CONSTRAINT "proposal_review_steps_document_id_fkey" FOREIGN KEY (document_id) REFERENCES proposal_documents(id) ON DELETE SET NULL;
ALTER TABLE public."proposal_review_steps" ADD CONSTRAINT "proposal_review_steps_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL;
ALTER TABLE public."proposal_review_steps" ADD CONSTRAINT "proposal_review_steps_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
ALTER TABLE public."proposal_status_history" ADD CONSTRAINT "proposal_status_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id);
ALTER TABLE public."proposal_status_history" ADD CONSTRAINT "proposal_status_history_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
ALTER TABLE public."proposal_versions" ADD CONSTRAINT "proposal_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."proposal_versions" ADD CONSTRAINT "proposal_versions_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
ALTER TABLE public."proposals" ADD CONSTRAINT "proposals_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."proposals" ADD CONSTRAINT "proposals_last_status_change_by_fkey" FOREIGN KEY (last_status_change_by) REFERENCES auth.users(id);
ALTER TABLE public."proposals" ADD CONSTRAINT "proposals_parent_project_id_fkey" FOREIGN KEY (parent_project_id) REFERENCES projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public."proposals" ADD CONSTRAINT "proposals_pi_user_id_fkey" FOREIGN KEY (pi_user_id) REFERENCES auth.users(id);
ALTER TABLE public."proposals" ADD CONSTRAINT "proposals_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public."proposals" ADD CONSTRAINT "proposals_submitted_version_id_fkey" FOREIGN KEY (submitted_version_id) REFERENCES proposal_versions(id) ON DELETE SET NULL;
ALTER TABLE public."proposals" ADD CONSTRAINT "proposals_track_fkey" FOREIGN KEY (track) REFERENCES project_schemes(code);
ALTER TABLE public."publication_author_consents" ADD CONSTRAINT "publication_author_consents_file_id_fkey" FOREIGN KEY (file_id) REFERENCES publication_files(id) ON DELETE CASCADE;
ALTER TABLE public."publication_author_consents" ADD CONSTRAINT "publication_author_consents_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES staff("ID") ON DELETE SET NULL;
ALTER TABLE public."publication_files" ADD CONSTRAINT "publication_files_cleared_by_fkey" FOREIGN KEY (cleared_by) REFERENCES auth.users(id);
ALTER TABLE public."publication_files" ADD CONSTRAINT "publication_files_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."publication_files" ADD CONSTRAINT "publication_files_output_id_fkey" FOREIGN KEY (output_id) REFERENCES scientific_outputs(id) ON DELETE SET NULL;
ALTER TABLE public."publication_files" ADD CONSTRAINT "publication_files_similarity_report_document_id_fkey" FOREIGN KEY (similarity_report_document_id) REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE public."query_log" ADD CONSTRAINT "query_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public."recruitment_events" ADD CONSTRAINT "recruitment_events_actor_fkey" FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."recruitment_events" ADD CONSTRAINT "recruitment_events_advt_id_fkey" FOREIGN KEY (advt_id) REFERENCES vacancy_advertisements(id) ON DELETE CASCADE;
ALTER TABLE public."recruitment_events" ADD CONSTRAINT "recruitment_events_document_id_fkey" FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE public."route_labels" ADD CONSTRAINT "route_labels_query_id_fkey" FOREIGN KEY (query_id) REFERENCES query_log(id) ON DELETE CASCADE;
ALTER TABLE public."sanctioned_post_events" ADD CONSTRAINT "sanctioned_post_events_actor_fkey" FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."sanctioned_post_events" ADD CONSTRAINT "sanctioned_post_events_post_id_fkey" FOREIGN KEY (post_id) REFERENCES sanctioned_posts(id) ON DELETE CASCADE;
ALTER TABLE public."sanctioned_posts" ADD CONSTRAINT "sanctioned_posts_division_code_fkey" FOREIGN KEY (division_code) REFERENCES divisions("divCode") ON DELETE SET NULL;
ALTER TABLE public."sanctioned_posts" ADD CONSTRAINT "sanctioned_posts_holder_staff_id_fkey" FOREIGN KEY (holder_staff_id) REFERENCES staff("ID") ON DELETE SET NULL;
ALTER TABLE public."scheduled_queries" ADD CONSTRAINT "scheduled_queries_owner_fkey" FOREIGN KEY (owner) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."scientific_outputs" ADD CONSTRAINT "scientific_outputs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public."staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."staff_career_events" ADD CONSTRAINT "staff_career_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."staff_career_events" ADD CONSTRAINT "staff_career_events_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES staff("ID") ON DELETE CASCADE;
ALTER TABLE public."staff_expertise" ADD CONSTRAINT "staff_expertise_added_by_fkey" FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."staff_expertise" ADD CONSTRAINT "staff_expertise_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES staff("ID") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public."staff_expertise" ADD CONSTRAINT "staff_expertise_term_id_fkey" FOREIGN KEY (term_id) REFERENCES expertise_terms(id) ON DELETE CASCADE;
ALTER TABLE public."staff_profile_changes" ADD CONSTRAINT "staff_profile_changes_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES staff("ID") ON DELETE CASCADE;
ALTER TABLE public."staff_profile_changes" ADD CONSTRAINT "staff_profile_changes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."tech_transfers" ADD CONSTRAINT "tech_transfers_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public."ticket_events" ADD CONSTRAINT "ticket_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE public."ticket_responses" ADD CONSTRAINT "ticket_responses_author_id_fkey" FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."ticket_responses" ADD CONSTRAINT "ticket_responses_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE public."tickets" ADD CONSTRAINT "tickets_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."tickets" ADD CONSTRAINT "tickets_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."vacancy_advertisements" ADD CONSTRAINT "vacancy_advertisements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."vacancy_advertisements" ADD CONSTRAINT "vacancy_advertisements_division_code_fkey" FOREIGN KEY (division_code) REFERENCES divisions("divCode");
ALTER TABLE public."vacancy_applications" ADD CONSTRAINT "vacancy_applications_advertisement_id_fkey" FOREIGN KEY (advertisement_id) REFERENCES vacancy_advertisements(id) ON DELETE CASCADE;
ALTER TABLE public."vacancy_applications" ADD CONSTRAINT "vacancy_applications_post_id_fkey" FOREIGN KEY (post_id) REFERENCES vacancy_posts(id) ON DELETE SET NULL;
ALTER TABLE public."vacancy_posts" ADD CONSTRAINT "vacancy_posts_advertisement_id_fkey" FOREIGN KEY (advertisement_id) REFERENCES vacancy_advertisements(id) ON DELETE CASCADE;
ALTER TABLE public."vacancy_posts" ADD CONSTRAINT "vacancy_posts_sanctioned_post_id_fkey" FOREIGN KEY (sanctioned_post_id) REFERENCES sanctioned_posts(id) ON DELETE SET NULL;

-- ── Functions & RPCs ────────────────────────────────────────────────────────
SET check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.acting_assign(p_role text, p_division text, p_principal uuid, p_acting uuid, p_from date, p_to date, p_order_ref text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT coalesce(public.proposals_caller_has_role('Director') OR public.caller_has_role('HRAdmin')
                    OR public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only the Director or HR records an acting charge';
    END IF;
    IF p_role = 'Director' AND NOT coalesce(public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'An acting Director is recorded by HR from the DG''s order';
    END IF;
    IF p_acting IS NULL OR p_acting = p_principal THEN RAISE EXCEPTION 'Name the acting officer'; END IF;
    IF p_acting = auth.uid() THEN RAISE EXCEPTION 'No one records their own acting charge'; END IF;
    INSERT INTO public.acting_assignments (role, division_code, principal_user_id, acting_user_id, from_on, to_on, order_ref, created_by)
    VALUES (p_role, CASE WHEN p_role = 'Director' THEN NULL ELSE nullif(btrim(p_division), '') END, p_principal, p_acting,
            p_from, p_to, btrim(p_order_ref), auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    VALUES (p_acting, 'acting-charge', 'info', 'Acting charge: ' || p_role || coalesce(' of ' || nullif(btrim(p_division), ''), ''),
            'From ' || to_char(p_from, 'DD Mon YYYY') || ' to ' || to_char(p_to, 'DD Mon YYYY') || ' (' || btrim(p_order_ref) || ')',
            '/', 'rule', 'acting:' || v_id);
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.acting_capacity(p_user uuid, p_on date)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 'Acting ' || a.role || coalesce(' of ' || a.division_code, '') || ' (' || a.order_ref || ')'
    FROM public.acting_assignments a
   WHERE a.acting_user_id = p_user AND p_on BETWEEN a.from_on AND a.to_on
   ORDER BY a.from_on DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.acting_end(p_id uuid, p_last_day date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT coalesce(public.proposals_caller_has_role('Director') OR public.caller_has_role('HRAdmin')
                    OR public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only the Director or HR ends an acting charge';
    END IF;
    UPDATE public.acting_assignments SET to_on = greatest(from_on, least(to_on, p_last_day)) WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_force_password_reset(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    UPDATE public.user_profiles up
       SET must_change_password = true,
           password_fingerprint = encode(extensions.digest(u.encrypted_password, 'sha256'), 'hex')
      FROM auth.users u
     WHERE u.id = up.user_id
       AND up.user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'user not found';
    END IF;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'PASSWORD_RESET_FLAGGED', 'user_profiles', p_user_id, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(user_id uuid, email text, active_role text, roles text[], division_code text, must_change_password boolean, last_seen_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    RETURN QUERY
    SELECT
        up.user_id,
        up.email,
        up.active_role,
        COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::text[]) AS roles,
        (array_agg(ur.division_code) FILTER (WHERE ur.division_code IS NOT NULL))[1] AS division_code,
        up.must_change_password,
        up.last_seen_at
    FROM public.user_profiles up
    LEFT JOIN public.user_roles ur ON ur.user_id = up.user_id
    GROUP BY up.user_id, up.email, up.active_role, up.must_change_password, up.last_seen_at
    ORDER BY up.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_roles(p_user_id uuid, p_roles text[], p_active_role text, p_division text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_allowed     text[] := ARRAY[
        'Director','DivisionHead','HOD','Scientist','Technician',
        'HRAdmin','FinanceAdmin','SystemAdmin','MasterAdmin','Student',
        'ProjectStaff','Guest','DefaultUser','EmpoweredCommittee','PME'
    ];
    v_role        text;
    v_current     text[];
    v_added       text[];
    v_removed     text[];
    v_caller      uuid := auth.uid();
    v_target_had_admin  boolean;
    v_target_keeps_admin boolean;
    v_other_admins int;
BEGIN
    -- 1. Authz
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    -- 2. Validation
    IF array_length(p_roles, 1) IS NULL THEN
        RAISE EXCEPTION 'no roles selected';
    END IF;
    FOREACH v_role IN ARRAY p_roles LOOP
        IF NOT (v_role = ANY(v_allowed)) THEN
            RAISE EXCEPTION 'invalid role: %', v_role;
        END IF;
    END LOOP;
    IF NOT (p_active_role = ANY(p_roles)) THEN
        RAISE EXCEPTION 'active role must be one of the assigned roles';
    END IF;

    -- Current roles for the target user.
    SELECT COALESCE(array_agg(role), ARRAY[]::text[]) INTO v_current
        FROM public.user_roles WHERE user_id = p_user_id;

    v_target_had_admin   := v_current && ARRAY['SystemAdmin','MasterAdmin'];
    v_target_keeps_admin := p_roles   && ARRAY['SystemAdmin','MasterAdmin'];

    -- 3. Lockout guards
    -- 3a. Caller cannot strip their own last admin role.
    IF p_user_id = v_caller AND v_target_had_admin AND NOT v_target_keeps_admin THEN
        RAISE EXCEPTION 'cannot remove your own last admin role';
    END IF;

    -- 3b. System must retain at least one admin.
    IF v_target_had_admin AND NOT v_target_keeps_admin THEN
        SELECT count(DISTINCT user_id) INTO v_other_admins
            FROM public.user_roles
            WHERE role IN ('SystemAdmin','MasterAdmin')
              AND user_id <> p_user_id;
        IF v_other_admins < 1 THEN
            RAISE EXCEPTION 'cannot remove the last administrator';
        END IF;
    END IF;

    -- 4. Diff
    SELECT COALESCE(array_agg(r), ARRAY[]::text[]) INTO v_added
        FROM unnest(p_roles) r WHERE NOT (r = ANY(v_current));
    SELECT COALESCE(array_agg(r), ARRAY[]::text[]) INTO v_removed
        FROM unnest(v_current) r WHERE NOT (r = ANY(p_roles));

    -- 5. Apply
    DELETE FROM public.user_roles
        WHERE user_id = p_user_id AND NOT (role = ANY(p_roles));
    FOREACH v_role IN ARRAY p_roles LOOP
        INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
        VALUES (p_user_id, v_role, p_division, false)
        ON CONFLICT (user_id, role) DO UPDATE SET division_code = EXCLUDED.division_code;
    END LOOP;

    -- 6. Active role
    UPDATE public.user_profiles SET active_role = p_active_role WHERE user_id = p_user_id;

    -- 7. Audit
    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller, 'ROLES_UPDATED', 'user_roles', p_user_id,
        jsonb_build_object(
            'added', to_jsonb(v_added),
            'removed', to_jsonb(v_removed),
            'active_role', p_active_role,
            'division', p_division
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_staff_link_gaps()
 RETURNS TABLE(table_name text, row_key text, name_column text, unresolved_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT (public.caller_is_admin() OR public.caller_has_role('Director')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN QUERY SELECT * FROM public.staff_link_gaps ORDER BY 1, 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_suggest_sweep()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_n integer;
    v_m integer;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT coalesce(public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only MasterAdmin runs the suggestion sweep';
    END IF;

    -- "Is this yours?" — unlinked author / inventor names that match a staff member with a login.
    WITH gaps AS (
        SELECT 'OUTPUT' AS record_kind, a.output_id AS record_id, a.pos, a.author_name AS name, o.title
          FROM public.output_authors a JOIN public.scientific_outputs o ON o.id = a.output_id
         WHERE a.staff_id IS NULL
        UNION ALL
        SELECT 'IP', i.ip_id, i.pos, i.author_name, ip.title
          FROM public.ip_inventors i JOIN public.ip_intelligence ip ON ip.id = i.ip_id
         WHERE i.staff_id IS NULL
    )
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key, proposed_action)
    SELECT s.user_id, 'suggest-identity-link', 'info',
           CASE g.record_kind WHEN 'OUTPUT' THEN 'Is this paper yours?' ELSE 'Is this patent yours?' END,
           '"' || g.name || '" on ' || g.title || '. Accept to add it to your profile.',
           '/me', 'agent', 'suggest-link:' || g.record_kind || ':' || g.record_id || ':' || g.pos,
           jsonb_build_object('kind', 'identity_link', 'label', 'Yes, it is mine',
               'args', jsonb_build_object('record_kind', g.record_kind, 'record_id', g.record_id, 'pos', g.pos, 'staff_id', s."ID"))
      FROM gaps g
      JOIN public.staff s ON s.user_id IS NOT NULL AND public.person_name_key(s."Name") = public.person_name_key(g.name)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;

    -- "Confirm this expertise" — a term found in two or more of the person's records.
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key, proposed_action)
    SELECT s.user_id, 'suggest-expertise', 'info', 'Confirm expertise: ' || x.label,
           '"' || x.label || '" appears in ' || x.evidence_count || ' of your records. Accept to list it on your profile.',
           '/me', 'agent', 'suggest-expertise:' || s."ID" || ':' || x.term_id,
           jsonb_build_object('kind', 'expertise_confirm', 'label', 'Confirm',
               'args', jsonb_build_object('staff_id', s."ID", 'term_id', x.term_id))
      FROM public.staff s
     CROSS JOIN LATERAL public.expertise_suggest(s."ID") x
     WHERE s.user_id IS NOT NULL AND x.evidence_count >= 2
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_m = ROW_COUNT;
    RETURN v_n + v_m;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_access_request(p_request_id uuid, p_roles text[], p_division text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_user uuid;
    v_role text;
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    IF array_length(p_roles, 1) IS NULL THEN
        RAISE EXCEPTION 'no roles selected';
    END IF;
    SELECT user_id INTO v_user FROM public.access_requests
        WHERE id = p_request_id AND status = 'PENDING';
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'request not found or not pending';
    END IF;

    FOREACH v_role IN ARRAY p_roles LOOP
        INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
        VALUES (v_user, v_role, p_division, false)
        ON CONFLICT (user_id, role) DO UPDATE SET division_code = EXCLUDED.division_code;
    END LOOP;

    DELETE FROM public.user_roles WHERE user_id = v_user AND role = 'DefaultUser';
    UPDATE public.user_profiles SET active_role = p_roles[1] WHERE user_id = v_user;

    UPDATE public.access_requests
        SET status = 'APPROVED', review_note = NULL, reviewed_by = auth.uid(), reviewed_at = now()
        WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_actor      text;
    v_action     text;
    v_entity_id  uuid;
    v_changes    jsonb;
BEGIN
    v_actor := COALESCE(auth.uid()::text, 'system');

    IF TG_OP = 'INSERT' THEN
        v_action    := 'created';
        v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
        v_changes   := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
        -- Detect status_changed when a 'status' column exists and changed
        IF (to_jsonb(NEW) ? 'status')
           AND (to_jsonb(NEW) ->> 'status') IS DISTINCT FROM (to_jsonb(OLD) ->> 'status') THEN
            v_action := 'status_changed';
        ELSE
            v_action := 'updated';
        END IF;
        v_changes := jsonb_build_object(
            'old', to_jsonb(OLD),
            'new', to_jsonb(NEW)
        );
    ELSE  -- DELETE
        v_action    := 'deleted';
        v_entity_id := (to_jsonb(OLD) ->> 'id')::uuid;
        v_changes   := to_jsonb(OLD);
    END IF;

    INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id, changes)
    VALUES (TG_ARGV[0], v_entity_id, v_action, v_actor, v_changes);

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.budget_head_is_capital(p_head text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT p_head IN ('EQUIPMENT', 'WORKS');
$$;

CREATE OR REPLACE FUNCTION public.calendar_events_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.caller_acting_as(p_role text, p_division text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.acting_assignments a
     WHERE a.acting_user_id = (SELECT auth.uid())
       AND a.role = p_role
       AND public.ist_today() BETWEEN a.from_on AND a.to_on
       AND (p_division IS NULL OR a.division_code = p_division));
$$;

CREATE OR REPLACE FUNCTION public.caller_active_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT active_role FROM public.user_profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.caller_division()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.proposals_caller_division();
$$;

CREATE OR REPLACE FUNCTION public.caller_email()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT lower(auth.jwt() ->> 'email');
$$;

CREATE OR REPLACE FUNCTION public.caller_has_role(p_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.proposals_caller_has_role(p_role)
      OR (p_role IN ('HOD', 'DivisionHead', 'Director') AND public.caller_acting_as(p_role));
$$;

CREATE OR REPLACE FUNCTION public.caller_in_division(p_div text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT (public.caller_is_div_manager()
          AND public.caller_division() IS NOT NULL
          AND p_div = public.caller_division())
      OR (p_div IS NOT NULL AND (public.caller_acting_as('HOD', p_div) OR public.caller_acting_as('DivisionHead', p_div)));
$$;

CREATE OR REPLACE FUNCTION public.caller_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.proposals_caller_is_admin();
$$;

CREATE OR REPLACE FUNCTION public.caller_is_director()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.caller_has_role('Director');
$$;

CREATE OR REPLACE FUNCTION public.caller_is_div_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.caller_active_role() IN ('DivisionHead', 'HOD');
$$;

CREATE OR REPLACE FUNCTION public.caller_is_expertise_curator()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')
        OR EXISTS (SELECT 1 FROM public.data_stewards ds WHERE ds.user_id = auth.uid() AND ds.domain = 'staff');
$$;

CREATE OR REPLACE FUNCTION public.caller_is_finance()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.caller_has_role('FinanceAdmin');
$$;

CREATE OR REPLACE FUNCTION public.caller_is_pme()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.caller_has_role('PME');
$$;

CREATE OR REPLACE FUNCTION public.caller_is_publication_clearer(p_division text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT public.caller_has_role('Director') OR public.caller_has_role('MasterAdmin')
        OR ((public.caller_has_role('HOD') OR public.caller_has_role('DivisionHead')) AND public.caller_in_division(p_division));
$$;

CREATE OR REPLACE FUNCTION public.caller_is_verified()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    -- Mirrors VERIFIED in src/constants/access.ts: any role held (not only
    -- the active one) other than the two un-provisioned ones.
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
         WHERE user_id = (SELECT auth.uid())
           AND role NOT IN ('Guest', 'DefaultUser')
    );
$$;

CREATE OR REPLACE FUNCTION public.caller_sees_all_personnel()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.caller_is_admin() OR public.caller_is_director();
$$;

CREATE OR REPLACE FUNCTION public.caller_sees_directory()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT public.caller_is_admin()
        OR public.caller_has_role('Director')
        OR EXISTS (SELECT 1 FROM public.pms_evaluation_committee_members WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members  WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.pms_grievance_members            WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.pms_evaluations                  WHERE evaluator_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.caller_staff_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT "ID" FROM public.staff
     WHERE user_id = auth.uid()
        OR (user_id IS NULL AND lower("Email") = public.caller_email())
     ORDER BY (user_id = auth.uid()) DESC NULLS LAST
     LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.caller_staff_name()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT "Name" FROM public.staff
     WHERE user_id = auth.uid()
        OR (user_id IS NULL AND lower("Email") = public.caller_email())
     ORDER BY (user_id = auth.uid()) DESC NULLS LAST
     LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_use_ask_surya()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    -- Role gate, then the global kill switch. Per-role blocks stay a UI
    -- concern: the API must not lock a user out over the role they happen
    -- to be acting as in the browser.
    SELECT public.caller_is_verified()
       AND coalesce(
             (SELECT c.enabled FROM public.feature_controls c WHERE c.feature_key = '/ask'),
             true);
$$;

CREATE OR REPLACE FUNCTION public.career_events_import(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_n   integer;
    v_bad text;
BEGIN
    IF NOT coalesce(public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only HR loads career events';
    END IF;
    IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Send a list of events'; END IF;
    SELECT string_agg(DISTINCT coalesce(x.staff_id, '(blank)'), ', ') INTO v_bad
      FROM jsonb_to_recordset(p_rows) AS x(staff_id text)
     WHERE NOT EXISTS (SELECT 1 FROM public.staff s WHERE s."ID" = x.staff_id);
    IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Unknown staff IDs: %', v_bad; END IF;

    INSERT INTO public.staff_career_events (staff_id, kind, effective_on, detail, order_ref, source, created_by)
    SELECT x.staff_id, upper(btrim(x.kind)), x.effective_on, coalesce(x.detail, '{}'), nullif(btrim(x.order_ref), ''), 'IMPORT', auth.uid()
      FROM jsonb_to_recordset(p_rows) AS x(staff_id text, kind text, effective_on date, detail jsonb, order_ref text)
    ON CONFLICT (staff_id, kind, effective_on) DO UPDATE
       SET detail = EXCLUDED.detail, order_ref = EXCLUDED.order_ref;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_must_change_password()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_current text;
    v_stored  text;
    v_flag    boolean;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

    SELECT encode(extensions.digest(u.encrypted_password, 'sha256'), 'hex')
      INTO v_current FROM auth.users u WHERE u.id = auth.uid();

    SELECT must_change_password, password_fingerprint
      INTO v_flag, v_stored
      FROM public.user_profiles WHERE user_id = auth.uid();

    -- Not awaiting rotation: nothing to do, and no reason to complain.
    IF v_flag IS NOT TRUE THEN
        RETURN;
    END IF;

    -- Unchanged hash ⇒ supabase.auth.updateUser() never succeeded ⇒ the
    -- caller is trying to skip the rotation, not report finishing it.
    --
    -- IS NOT DISTINCT FROM, and no `v_stored IS NOT NULL` guard: an account
    -- with no encrypted_password (OAuth/magic-link only) digests to NULL on
    -- both sides, and the earlier version treated that as "cannot verify, so
    -- allow" — fail-open on exactly the accounts that cannot prove anything.
    -- Both-NULL now compares equal and is refused. A passwordless account
    -- that is genuinely flagged has to set a password first, which is the
    -- point of the flag.
    IF v_current IS NOT DISTINCT FROM v_stored THEN
        RAISE EXCEPTION 'password has not been changed yet';
    END IF;

    UPDATE public.user_profiles
       SET must_change_password = false,
           password_fingerprint = NULL
     WHERE user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.coi_caller_chairs(p_meeting_id uuid, p_convener_too boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings m JOIN public.committees c ON c.id = m.committee_id
     WHERE m.id = p_meeting_id
       AND public.caller_staff_id() IS NOT NULL
       AND (c.chairperson_id = public.caller_staff_id()
            OR (p_convener_too AND c.secretary_id = public.caller_staff_id())));
$$;

CREATE OR REPLACE FUNCTION public.coi_chair_decide(p_id uuid, p_decision text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_d public.coi_declarations%ROWTYPE;
BEGIN
    SELECT * INTO v_d FROM public.coi_declarations WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(public.coi_caller_chairs(v_d.meeting_id, false), false) THEN
        RAISE EXCEPTION 'Only the chair of this committee decides on a declaration';
    END IF;
    IF v_d.member_user_id = auth.uid() THEN
        RAISE EXCEPTION 'The chair does not decide on their own declaration';
    END IF;
    IF v_d.format <> 'F2' THEN RAISE EXCEPTION 'Only a Format 2 declaration needs a decision'; END IF;
    IF p_decision NOT IN ('CONTINUE', 'RECUSE') THEN RAISE EXCEPTION 'Decide CONTINUE or RECUSE'; END IF;
    UPDATE public.coi_declarations
       SET chair_decision = p_decision, decided_by = auth.uid(), decided_at = now()
     WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.coi_declare(p_meeting_id uuid, p_format text, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_me  text := public.caller_staff_id();
    v_id  uuid;
BEGIN
    IF auth.uid() IS NULL OR v_me IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.meetings m JOIN public.committees c ON c.id = m.committee_id
         WHERE m.id = p_meeting_id
           AND (v_me IN (c.chairperson_id, c.secretary_id)
                OR EXISTS (SELECT 1 FROM public.committee_members cm WHERE cm.committee_id = c.id AND cm.staff_id = v_me)))
    THEN
        RAISE EXCEPTION 'Only a member of this committee can declare for its meeting';
    END IF;
    IF p_format NOT IN ('F1', 'F2') THEN RAISE EXCEPTION 'Choose Format 1 (no conflict) or Format 2 (a conflict)'; END IF;
    IF p_format = 'F2' AND coalesce(btrim(p_note), '') = '' THEN
        RAISE EXCEPTION 'Describe the conflict for Format 2';
    END IF;
    IF EXISTS (SELECT 1 FROM public.coi_declarations
                WHERE meeting_id = p_meeting_id AND member_user_id = auth.uid() AND chair_decision IS NOT NULL) THEN
        RAISE EXCEPTION 'The chair has already decided on your declaration';
    END IF;

    INSERT INTO public.coi_declarations (meeting_id, member_user_id, format, conflict_note)
    VALUES (p_meeting_id, auth.uid(), p_format, CASE WHEN p_format = 'F2' THEN btrim(p_note) END)
    ON CONFLICT (meeting_id, member_user_id) DO UPDATE
       SET format = EXCLUDED.format, conflict_note = EXCLUDED.conflict_note, declared_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.committee_minutes_days(p_body text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v jsonb;
BEGIN
    -- No caller input reaches a write: reads one registry value, same for everyone.
    IF p_body NOT IN ('TFM', 'LSG') THEN RAISE EXCEPTION 'Unknown committee: %', p_body; END IF;
    v := public.csir_rules_value_or_null('committee.minutes_due_days', public.ist_today()) -> p_body;
    IF v IS NULL THEN RETURN CASE p_body WHEN 'TFM' THEN 7 ELSE 2 END; END IF;
    IF jsonb_typeof(v) <> 'number' OR (v::text)::numeric <> trunc((v::text)::numeric)
       OR (v::text)::numeric NOT BETWEEN 1 AND 90 THEN
        RAISE EXCEPTION 'CSIR rule committee.minutes_due_days.% must be whole days from 1 to 90, not %', p_body, v;
    END IF;
    RETURN (v::text)::int;
END;
$$;

CREATE OR REPLACE FUNCTION public.contribution_is_reviewer(r contribution_requests)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT coalesce(r.requested_by = auth.uid(), false)
        OR public.caller_is_admin()
        OR EXISTS (
            SELECT 1 FROM public.data_stewards ds
             WHERE ds.user_id = auth.uid()
               AND ds.domain = r.domain
               AND (ds.division_code IS NULL OR ds.division_code = r.division_code)
        );
$$;

CREATE OR REPLACE FUNCTION public.contribution_request_act(p_id uuid, p_action text, p_note text, p_target uuid, p_response jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_uid      uuid := auth.uid();
    r          contribution_requests;
    v_from     text;
    v_to       text;
    v_note     text := nullif(btrim(p_note), '');
    v_assignee boolean;
    v_delegate boolean;
    v_reviewer boolean;
    v_steward  boolean;
    v_notify   uuid;
    v_title    text;
    v_event    uuid;
    v_payload  jsonb := coalesce(p_response, '{}');
BEGIN
    SELECT * INTO r FROM contribution_requests WHERE id = p_id FOR UPDATE;

    -- Authorization block. Every operand is COALESCEd: on an unowned request
    -- assignee_id = auth.uid() is NULL, and NULL must deny, not allow.
    v_assignee := COALESCE(r.assignee_id = v_uid, false);
    v_delegate := COALESCE(r.delegate_id = v_uid, false);
    v_steward  := COALESCE(public.caller_is_admin() OR EXISTS (
                      SELECT 1 FROM data_stewards ds
                       WHERE ds.user_id = v_uid AND ds.domain = r.domain
                         AND (ds.division_code IS NULL OR ds.division_code = r.division_code)), false);
    v_reviewer := COALESCE(public.contribution_is_reviewer(r), false);
    IF v_uid IS NULL OR r.id IS NULL
       OR NOT (v_assignee OR v_delegate OR v_reviewer) THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    v_from := r.status;

    -- A named target must be a real login, not a bare FK error later.
    IF p_action IN ('delegate','claim') AND p_target IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target) THEN
        RAISE EXCEPTION 'invalid_target';
    END IF;

    CASE p_action
    WHEN 'delegate' THEN
        IF NOT v_assignee THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'open' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        IF p_target IS NULL OR p_target = r.assignee_id THEN RAISE EXCEPTION 'invalid_target'; END IF;
        r.delegate_id := p_target;
        v_to := 'open';
        v_notify := p_target; v_title := 'Data update delegated to you';

    WHEN 'submit' THEN
        IF NOT (v_assignee OR v_delegate) THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from NOT IN ('open','needs_clarification') THEN
            RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
        END IF;
        IF p_response IS NULL OR jsonb_typeof(p_response) <> 'object' THEN
            RAISE EXCEPTION 'response_required';
        END IF;
        r.response := p_response;
        IF v_assignee THEN
            v_to := 'submitted';
            v_notify := coalesce(r.requested_by, contribution_steward_for(r.domain, r.division_code));
            v_title := 'Data update submitted for review';
        ELSE
            v_to := 'prepared';
            v_notify := r.assignee_id; v_title := 'Delegate prepared an update';
        END IF;

    WHEN 'confirm' THEN
        IF NOT v_assignee THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'prepared' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        v_to := 'submitted';
        v_notify := coalesce(r.requested_by, contribution_steward_for(r.domain, r.division_code));
        v_title := 'Data update submitted for review';

    WHEN 'confirm_unchanged' THEN
        IF NOT v_assignee THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'open' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        r.response := '{}';
        r.resolved_at := now();
        v_to := 'done';

    WHEN 'clarify' THEN
        IF NOT (v_assignee OR v_delegate) THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from NOT IN ('open','prepared') THEN
            RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
        END IF;
        IF v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;
        v_to := 'needs_clarification';
        v_notify := r.requested_by; v_title := 'Question on your data request';

    WHEN 'answer' THEN
        IF NOT v_reviewer THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'needs_clarification' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        IF v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;
        v_to := 'open';
        v_notify := r.assignee_id; v_title := 'Your question was answered';

    WHEN 'not_mine' THEN
        IF NOT v_assignee THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from NOT IN ('open','needs_clarification') THEN
            RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
        END IF;
        r.assignee_id := contribution_steward_for(r.domain, r.division_code);
        -- The domain's only steward saying "not mine" leaves it unowned
        -- (Unowned tab) rather than bouncing it back to them.
        IF r.assignee_id = v_uid THEN r.assignee_id := NULL; END IF;
        r.delegate_id := NULL;
        v_to := 'open';
        v_notify := r.assignee_id; v_title := 'Data update routed to you';

    WHEN 'cannot_provide' THEN
        IF NOT v_assignee THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from NOT IN ('open','needs_clarification') THEN
            RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
        END IF;
        IF v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;
        v_to := 'blocked';
        v_notify := r.requested_by; v_title := 'Data request cannot be provided';

    WHEN 'accept' THEN
        IF NOT v_reviewer THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'submitted' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        r.resolved_at := now();
        v_to := 'done';
        v_notify := r.assignee_id; v_title := 'Your update was accepted';
        -- Self-review is allowed (a steward closing their own sweep request)
        -- but recorded, so the audit trail shows nobody else looked.
        IF v_assignee THEN v_payload := v_payload || '{"self_review": true}'; END IF;

    WHEN 'return' THEN
        IF NOT v_reviewer THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'submitted' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        IF v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;
        v_to := 'open';
        v_notify := r.assignee_id; v_title := 'Your update was returned';

    WHEN 'withdraw' THEN
        IF NOT v_reviewer THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from IN ('done','declined') THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        IF v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;
        r.resolved_at := now();
        v_to := 'declined';

    WHEN 'claim' THEN
        IF NOT v_steward THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'open' OR r.assignee_id IS NOT NULL THEN
            RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
        END IF;
        r.assignee_id := coalesce(p_target, v_uid);
        v_to := 'open';
        v_notify := r.assignee_id; v_title := 'Data update assigned to you';

    ELSE
        RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
    END CASE;

    UPDATE contribution_requests
       SET status      = v_to,
           assignee_id = r.assignee_id,
           delegate_id = r.delegate_id,
           response    = r.response,
           resolved_at = r.resolved_at
     WHERE id = p_id;

    INSERT INTO contribution_request_events (request_id, actor_id, action, from_status, to_status, note, payload)
    VALUES (p_id, v_uid, p_action, v_from, v_to, v_note, v_payload)
    RETURNING id INTO v_event;

    -- Never notify the actor about their own action.
    IF v_notify IS NOT NULL AND v_notify <> v_uid THEN
        INSERT INTO notifications (user_id, kind, title, body, link, dedupe_key)
        VALUES (v_notify, 'contribution', v_title, r.title,
                '/work?r=' || p_id, 'contribution:' || p_id || ':' || v_event)
        ON CONFLICT (user_id, dedupe_key) DO NOTHING;
    END IF;

    RETURN v_to;
END;
$$;

CREATE OR REPLACE FUNCTION public.contribution_request_create(p_domain text, p_record_ref text, p_division text, p_title text, p_reason text, p_link text, p_due date, p_prefill jsonb, p_assignee uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_id    uuid;
    v_to    uuid;
    v_event uuid;
BEGIN
    -- Authorization: admin, Director, the division's manager, or a steward
    -- covering this domain/division.
    IF NOT COALESCE(
           public.caller_is_admin()
        OR public.caller_is_director()
        OR (public.caller_is_div_manager() AND public.caller_in_division(p_division))
        OR EXISTS (SELECT 1 FROM data_stewards ds
                    WHERE ds.user_id = v_uid AND ds.domain = p_domain
                      AND (ds.division_code IS NULL OR ds.division_code = p_division)),
        false) OR v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    IF p_domain IS NULL OR p_domain NOT IN
       ('divisions','staff','projects','projectStaff','phd','equipment','contractStaff') THEN
        RAISE EXCEPTION 'invalid_domain: %', p_domain;
    END IF;
    IF btrim(coalesce(p_title, '')) = '' THEN
        RAISE EXCEPTION 'title_required';
    END IF;
    IF p_link IS NOT NULL AND (p_link !~ '^/([^/\\]|$)' OR p_link ~ '[[:cntrl:]]') THEN
        RAISE EXCEPTION 'invalid_link';
    END IF;
    IF p_prefill IS NOT NULL AND jsonb_typeof(p_prefill) <> 'object' THEN
        RAISE EXCEPTION 'invalid_prefill';
    END IF;

    IF p_assignee IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_assignee) THEN
        RAISE EXCEPTION 'invalid_target';
    END IF;

    v_to := coalesce(p_assignee, contribution_steward_for(p_domain, p_division));

    INSERT INTO contribution_requests
        (domain, record_ref, division_code, title, reason, link, requested_by,
         assignee_id, due_date, prefill)
    VALUES (p_domain, p_record_ref, p_division, btrim(p_title), coalesce(p_reason, ''),
            p_link, v_uid, v_to, p_due, coalesce(p_prefill, '{}'))
    RETURNING id INTO v_id;

    INSERT INTO contribution_request_events (request_id, actor_id, action, from_status, to_status, payload)
    VALUES (v_id, v_uid, 'created', NULL, 'open', coalesce(p_prefill, '{}'))
    RETURNING id INTO v_event;

    IF v_to IS NOT NULL THEN
        INSERT INTO notifications (user_id, kind, title, body, link, dedupe_key)
        VALUES (v_to, 'contribution', 'Data update requested', btrim(p_title),
                '/work?r=' || v_id, 'contribution:' || v_id || ':' || v_event)
        ON CONFLICT (user_id, dedupe_key) DO NOTHING;
    END IF;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.contribution_requests_sweep()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    s       record;
    v_n     integer := 0;
    v_id    uuid;
    v_to    uuid;
    v_event uuid;
BEGIN
    FOR s IN
        SELECT g.domain, g.division_code, li.id AS import_id
          FROM (SELECT domain, division_code, min(cadence_days) AS cadence_days,
                       'stale:' || domain || ':' || coalesce(division_code, '*') || ':' AS prefix
                  FROM data_stewards
                 WHERE kind = 'steward'
                 GROUP BY domain, division_code) g
          LEFT JOIN LATERAL (
                SELECT ie.id, ie.uploaded_at
                  FROM import_events ie
                 WHERE ie.file_type = g.domain
                 ORDER BY ie.uploaded_at DESC
                 LIMIT 1) li ON true
         WHERE (li.id IS NULL
                OR li.uploaded_at < now() - make_interval(days => g.cadence_days))
           -- One live refresh request per (domain, division): a newer stale
           -- period waits until the previous one is done or declined.
           AND NOT EXISTS (
                SELECT 1 FROM contribution_requests c
                 WHERE left(c.dedupe_key, length(g.prefix)) = g.prefix
                   AND c.status NOT IN ('done','declined'))
    LOOP
        v_id := NULL;
        v_to := contribution_steward_for(s.domain, s.division_code);

        INSERT INTO contribution_requests
            (domain, division_code, title, reason, link, requested_by, assignee_id, dedupe_key)
        VALUES (s.domain, s.division_code,
                'Refresh ' || s.domain || ' data',
                CASE WHEN s.import_id IS NULL THEN 'No import has been recorded for this domain'
                     ELSE 'The latest import is older than the agreed refresh cadence' END,
                '/data', NULL, v_to,
                'stale:' || s.domain || ':' || coalesce(s.division_code, '*') || ':'
                    || coalesce(s.import_id::text, 'none'))
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id INTO v_id;

        IF v_id IS NOT NULL THEN
            v_n := v_n + 1;
            INSERT INTO contribution_request_events (request_id, actor_id, action, from_status, to_status)
            VALUES (v_id, NULL, 'created', NULL, 'open')
            RETURNING id INTO v_event;

            IF v_to IS NOT NULL THEN
                INSERT INTO notifications (user_id, kind, severity, title, body, link, dedupe_key)
                VALUES (v_to, 'contribution', 'warning', 'Data refresh due',
                        'Refresh ' || s.domain || ' data',
                        '/work?r=' || v_id, 'contribution:' || v_id || ':' || v_event)
                ON CONFLICT (user_id, dedupe_key) DO NOTHING;
            END IF;
        END IF;
    END LOOP;

    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.contribution_requests_target_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.assignee_id IS NOT NULL
       AND NEW.assignee_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.assignee_id END)
       AND NOT COALESCE(contribution_target_can_see(NEW.assignee_id, NEW.domain, NEW.division_code, NEW.record_ref), false)
    THEN
        RAISE EXCEPTION 'target_out_of_scope';
    END IF;
    IF NEW.delegate_id IS NOT NULL
       AND NEW.delegate_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.delegate_id END)
       AND NOT COALESCE(contribution_target_can_see(NEW.delegate_id, NEW.domain, NEW.division_code, NEW.record_ref), false)
    THEN
        RAISE EXCEPTION 'target_out_of_scope';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.contribution_steward_for(p_domain text, p_division text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT ds.user_id
      FROM data_stewards ds
     WHERE ds.domain = p_domain
       AND (ds.division_code IS NULL OR ds.division_code = p_division)
     ORDER BY (ds.division_code IS NULL), (ds.kind <> 'steward'), ds.created_at
     LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.contribution_target_can_see(p_user uuid, p_domain text, p_division text, p_ref text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT
        EXISTS (SELECT 1 FROM user_roles
                 WHERE user_id = p_user
                   AND role IN ('HRAdmin','SystemAdmin','MasterAdmin','Director'))
     OR EXISTS (SELECT 1 FROM data_stewards s
                 WHERE s.user_id = p_user AND s.domain = p_domain
                   AND (s.division_code IS NULL OR s.division_code = p_division))
     OR (p_division IS NOT NULL AND EXISTS (
            SELECT 1 FROM user_roles
             WHERE user_id = p_user AND role IN ('HOD','DivisionHead')
               AND division_code = p_division))
     OR (p_domain = 'staff' AND EXISTS (
            SELECT 1 FROM staff st WHERE st."ID" = p_ref AND st.user_id = p_user))
     OR (p_domain = 'projects' AND (
            EXISTS (SELECT 1 FROM user_roles WHERE user_id = p_user AND role = 'FinanceAdmin')
         OR EXISTS (SELECT 1 FROM projects p JOIN staff st ON st."ID" = p.pi_staff_id
                     WHERE p."ProjectID" = p_ref AND st.user_id = p_user)
         OR EXISTS (SELECT 1 FROM projects p
                      JOIN project_staff ps ON ps."ProjectNo" = p."ProjectNo"
                      JOIN staff st ON st."ID" = ps.staff_id
                     WHERE p."ProjectID" = p_ref AND st.user_id = p_user)))
     OR (p_domain = 'equipment' AND (
            (p_division IS NOT NULL AND EXISTS (
                SELECT 1 FROM user_roles
                 WHERE user_id = p_user AND role = 'Technician'
                   AND division_code = p_division))
         OR EXISTS (SELECT 1 FROM equipment e
                     WHERE e."UInsID" = p_ref AND e.owner_user_id = p_user)));
$$;

CREATE OR REPLACE FUNCTION public.csir_rule(p_key text, p_on date DEFAULT ist_today())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
DECLARE
    v jsonb;
BEGIN
    SELECT r.value INTO v
      FROM public.csir_rules r
     WHERE r.rule_key = p_key
       AND r.effective_from <= p_on
       AND (r.effective_to IS NULL OR r.effective_to >= p_on)
     ORDER BY r.effective_from DESC
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no CSIR rule % on %', p_key, p_on;
    END IF;
    RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.csir_rule_set(p_key text, p_value jsonb, p_unit text, p_effective_from date, p_source_ref text, p_verified boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT coalesce(public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only MasterAdmin can change a CSIR rule';
    END IF;
    IF coalesce(btrim(p_key), '') = '' OR p_value IS NULL OR p_effective_from IS NULL THEN
        RAISE EXCEPTION 'Give the rule, its value and the date it takes effect';
    END IF;
    IF coalesce(btrim(p_source_ref), '') = '' THEN
        RAISE EXCEPTION 'Name the OM paragraph the value comes from';
    END IF;
    IF EXISTS (SELECT 1 FROM public.csir_rules WHERE rule_key = p_key AND effective_from >= p_effective_from) THEN
        RAISE EXCEPTION 'Rule % already has a value from % or later', p_key, p_effective_from;
    END IF;

    UPDATE public.csir_rules
       SET effective_to = p_effective_from - 1
     WHERE rule_key = p_key AND (effective_to IS NULL OR effective_to >= p_effective_from);

    INSERT INTO public.csir_rules (rule_key, value, unit, effective_from, source_ref, verified, created_by)
    VALUES (btrim(p_key), p_value, nullif(btrim(p_unit), ''), p_effective_from, btrim(p_source_ref),
            coalesce(p_verified, false), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.csir_rules_value_or_null(p_key text, p_on date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT r.value FROM public.csir_rules r
   WHERE r.rule_key = p_key AND r.effective_from <= p_on AND (r.effective_to IS NULL OR r.effective_to >= p_on)
   ORDER BY r.effective_from DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.data_steward_remove(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT COALESCE(public.caller_is_admin(), false) THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;
    DELETE FROM data_stewards WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.data_steward_set(p_domain text, p_division text, p_user uuid, p_kind text, p_cadence integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT COALESCE(public.caller_is_admin(), false) THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    INSERT INTO data_stewards (domain, division_code, user_id, kind, cadence_days)
    VALUES (p_domain, p_division, p_user, coalesce(p_kind, 'steward'), coalesce(p_cadence, 90))
    ON CONFLICT (domain, division_code, user_id) DO UPDATE
        SET kind = EXCLUDED.kind, cadence_days = EXCLUDED.cadence_days
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.documents_can_read(d documents)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT
    d.owner_id = (SELECT auth.uid())
    OR public.proposals_caller_has_role('HRAdmin')
    OR public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
    OR public.proposals_caller_has_role('Director')
    OR (d.access_tier = 'institute' AND public.caller_is_verified())
    OR (d.access_tier = 'division'
        AND d.division_code IS NOT NULL
        AND d.division_code = public.proposals_caller_division());
$$;

CREATE OR REPLACE FUNCTION public.documents_set_access_tier(p_document_id uuid, p_tier text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT (public.caller_is_admin() OR public.caller_has_role('Director')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    IF p_tier NOT IN ('owner', 'confidential', 'division', 'institute') THEN
        RAISE EXCEPTION 'invalid access tier: %', p_tier;
    END IF;

    UPDATE public.documents SET access_tier = p_tier WHERE id = p_document_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'document not found';
    END IF;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'DOCUMENT_TIER_CHANGED', 'documents', p_document_id,
            jsonb_build_object('access_tier', p_tier));
END;
$$;

CREATE OR REPLACE FUNCTION public.equipment_log_usage(p_equipment_id text, p_used_on date, p_hours numeric, p_user_staff_id text, p_purpose text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_e  public.equipment%ROWTYPE;
    v_id uuid;
BEGIN
    SELECT * INTO v_e FROM public.equipment WHERE "UInsID" = p_equipment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;
    IF NOT coalesce(v_e.owner_user_id = auth.uid()
                    OR public.caller_is_pme()
                    OR (v_e.project_id IS NOT NULL AND public.project_caller_is_pi(v_e.project_id)), false) THEN
        RAISE EXCEPTION 'Only the scientist-in-charge, the project''s PI or PME keeps this logbook';
    END IF;
    IF p_used_on IS NULL OR p_used_on > public.ist_today() THEN RAISE EXCEPTION 'Give the date it was used, today or earlier'; END IF;
    IF p_hours IS NULL OR p_hours <= 0 OR p_hours > 24 THEN RAISE EXCEPTION 'Hours must be above 0 and at most 24'; END IF;
    IF coalesce(btrim(p_purpose), '') = '' THEN RAISE EXCEPTION 'Say what it was used for'; END IF;
    INSERT INTO public.equipment_usage_log (equipment_id, used_on, hours, user_staff_id, project_id, purpose, logged_by)
    VALUES (p_equipment_id, p_used_on, p_hours, nullif(btrim(p_user_staff_id), ''), v_e.project_id, btrim(p_purpose), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.equipment_logbook_required(p_equipment_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT coalesce((SELECT e.project_id IS NOT NULL
                          AND e.purchase_cost > public.csir_rule('project.major_equipment_threshold_inr')::numeric
                     FROM public.equipment e WHERE e."UInsID" = p_equipment_id), false);
$$;

CREATE OR REPLACE FUNCTION public.expertise_find(p_term_ids uuid[] DEFAULT NULL::uuid[], p_text text DEFAULT NULL::text)
 RETURNS TABLE(staff_id text, name text, division text, designation text, confirmed_terms integer, evidence jsonb, evidence_count integer, active_projects integer, overload boolean, retires_on date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
WITH q AS (
    SELECT nullif(btrim(p_text), '') AS txt
), terms AS (
    SELECT t.id, t.label FROM public.expertise_terms t, q
     WHERE t.status = 'ACTIVE'
       AND (t.id = ANY (coalesce(p_term_ids, '{}'::uuid[]))
            OR (q.txt IS NOT NULL AND t.label ~* public.expertise_pattern(q.txt)))
), patterns AS (
    SELECT public.expertise_pattern(label) AS re FROM terms
    UNION
    SELECT public.expertise_pattern(q.txt) FROM q WHERE q.txt IS NOT NULL
), tagged AS (
    SELECT se.staff_id, count(*)::int AS n
      FROM public.staff_expertise se JOIN terms t ON t.id = se.term_id
     WHERE se.confirmed_at IS NOT NULL
     GROUP BY 1
), ev AS (
    SELECT l.staff_id, 'project'::text AS record_type, pr."ProjectID" AS record_id,
           coalesce(pr."ProjectName", pr."ProjectNo") AS title, '/projects/' || pr."ProjectID" AS link
      FROM public.staff_project_links l JOIN public.projects pr ON pr."ProjectID" = l.project_id
     WHERE EXISTS (SELECT 1 FROM patterns p WHERE coalesce(pr."ProjectName", pr."ProjectNo") ~* p.re)
    UNION
    SELECT a.staff_id, 'scientific_output', o.id, o.title,
           coalesce('https://doi.org/' || nullif(btrim(o.doi), ''), '/intelligence')
      FROM public.output_authors a JOIN public.scientific_outputs o ON o.id = a.output_id
     WHERE a.staff_id IS NOT NULL AND EXISTS (SELECT 1 FROM patterns p WHERE o.title ~* p.re)
    UNION
    SELECT i.staff_id, 'ip', ip.id, ip.title, '/intelligence'
      FROM public.ip_inventors i JOIN public.ip_intelligence ip ON ip.id = i.ip_id
     WHERE i.staff_id IS NOT NULL AND EXISTS (SELECT 1 FROM patterns p WHERE ip.title ~* p.re)
    UNION
    SELECT s."ID", 'note', s."ID", s."Expertise", '/staff/' || s."ID"
      FROM public.staff s
     WHERE EXISTS (SELECT 1 FROM patterns p WHERE s."Expertise" ~* p.re)
), evidence AS (
    SELECT staff_id,
           jsonb_agg(jsonb_build_object('type', record_type, 'id', record_id, 'title', title, 'link', link)
                     ORDER BY record_type, title) AS items,
           count(*)::int AS n
      FROM ev GROUP BY 1
), hits AS (
    SELECT staff_id FROM tagged UNION SELECT staff_id FROM evidence
)
-- The join to the summary also drops anyone whose staff row the caller may not read.
SELECT r.staff_id, r.name, r.division, r.designation,
       coalesce(tg.n, 0), coalesce(e.items, '[]'::jsonb), coalesce(e.n, 0),
       r.active_projects, r.active_projects > 4, r.retires_on
  FROM hits h
  JOIN public.staff_research_summary r ON r.staff_id = h.staff_id
  LEFT JOIN tagged tg ON tg.staff_id = h.staff_id
  LEFT JOIN evidence e ON e.staff_id = h.staff_id
 ORDER BY 5 DESC, 7 DESC, 2;
$$;

CREATE OR REPLACE FUNCTION public.expertise_merge(p_from uuid, p_into uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT coalesce(public.caller_is_expertise_curator(), false) THEN
        RAISE EXCEPTION 'Only HR or a staff data steward keeps the vocabulary';
    END IF;
    IF p_from = p_into THEN RAISE EXCEPTION 'Choose two different terms'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.expertise_terms WHERE id = p_into AND status = 'ACTIVE') THEN
        RAISE EXCEPTION 'Merge into an active term';
    END IF;
    UPDATE public.expertise_terms SET status = 'MERGED', merged_into = p_into WHERE id = p_from AND status = 'ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Term not found or already merged'; END IF;
    -- Keep the stronger row when the person already holds both.
    INSERT INTO public.staff_expertise (staff_id, term_id, source, confirmed_at, added_by)
    SELECT staff_id, p_into, source, confirmed_at, added_by FROM public.staff_expertise WHERE term_id = p_from
    ON CONFLICT (staff_id, term_id) DO UPDATE
       SET confirmed_at = coalesce(staff_expertise.confirmed_at, EXCLUDED.confirmed_at);
    DELETE FROM public.staff_expertise WHERE term_id = p_from;
END;
$$;

CREATE OR REPLACE FUNCTION public.expertise_pattern(p_label text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
    SELECT '\m' || regexp_replace(btrim(p_label), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M';
$$;

CREATE OR REPLACE FUNCTION public.expertise_suggest(p_staff_id text)
 RETURNS TABLE(term_id uuid, label text, kind text, evidence_count integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT t.id, t.label, t.kind, count(DISTINCT (f.record_type, f.record_id))::int
      FROM public.staff_profile_facts(p_staff_id) f
      JOIN public.expertise_terms t ON t.status = 'ACTIVE' AND f.title ~* public.expertise_pattern(t.label)
     WHERE f.section IN ('PROJECT', 'OUTPUT', 'IP')
       AND NOT EXISTS (SELECT 1 FROM public.staff_expertise se WHERE se.staff_id = p_staff_id AND se.term_id = t.id)
     GROUP BY t.id, t.label, t.kind
     ORDER BY 4 DESC, 2;
$$;

CREATE OR REPLACE FUNCTION public.fiscal_year_of(p_date date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT to_char(y, 'FM0000') || '-' || to_char((y + 1) % 100, 'FM00')
    FROM (SELECT CASE WHEN extract(month FROM p_date) >= 4
                      THEN extract(year FROM p_date)::int
                      ELSE extract(year FROM p_date)::int - 1 END AS y) s;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    INSERT INTO public.user_roles (user_id, role, must_change_password)
    VALUES (NEW.id, 'DefaultUser', true)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.user_profiles (user_id, email, must_change_password, password_fingerprint)
    VALUES (NEW.id, NEW.email, true,
            encode(extensions.digest(COALESCE(NEW.encrypted_password, ''), 'sha256'), 'hex'))
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.helpdesk_add_response(p_ticket_id uuid, p_author_id uuid, p_message text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_response_id  uuid;
    v_submitted_by uuid;
    v_assigned_to  uuid;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
    IF p_author_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Author ID must match authenticated user';
    END IF;

    SELECT submitted_by, assigned_to INTO v_submitted_by, v_assigned_to
      FROM public.tickets WHERE id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- COALESCE is load-bearing. assigned_to is nullable, so on an unassigned
    -- ticket `v_assigned_to = auth.uid()` is NULL, the whole OR-chain
    -- collapses to NULL, `NOT NULL` is NULL, and `IF NULL THEN` does not
    -- execute — the guard reads correctly and lets everyone through. Caught
    -- by T14 on the first CI run that reached it.
    IF NOT COALESCE(
        v_submitted_by = auth.uid()
        OR v_assigned_to = auth.uid()
        OR public.caller_is_admin()
        OR public.caller_has_role('Director')
    , false) THEN
        RAISE EXCEPTION 'not authorized to respond to this ticket';
    END IF;

    INSERT INTO public.ticket_responses (ticket_id, author_id, message)
    VALUES (p_ticket_id, p_author_id, p_message)
    RETURNING id INTO v_response_id;

    RETURN v_response_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.helpdesk_assign_ticket(p_ticket_id uuid, p_new_handler_id uuid, p_actor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_old_handler_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
    IF p_actor_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'actor must be the authenticated user';
    END IF;
    IF NOT public.caller_is_admin() THEN
        RAISE EXCEPTION 'not authorized to reassign tickets';
    END IF;

    SELECT assigned_to INTO v_old_handler_id FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;

    -- The FK now rejects an unknown handler, so no explicit existence check.
    UPDATE public.tickets
       SET assigned_to = p_new_handler_id, updated_at = now()
     WHERE id = p_ticket_id;

    INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
    VALUES (p_ticket_id, 'Assigned', p_actor_id,
            jsonb_build_object('from', v_old_handler_id, 'to', p_new_handler_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.helpdesk_create_ticket(p_subject text, p_category text, p_urgency text, p_description text, p_submitted_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_ticket_id uuid; v_token text; v_seq integer; v_assigned_to uuid;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
    IF p_submitted_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'submitter must be the authenticated user';
    END IF;

    -- Serialize per day (same shape as proposals_set_code) and read every
    -- digit, so token 1000 parses and MAX keeps climbing.
    PERFORM pg_advisory_xact_lock(hashtext('ticket_token_' || TO_CHAR(CURRENT_DATE, 'YYMMDD')));
    SELECT COALESCE(MAX(SUBSTRING(token FROM 'AMPRI-\d{6}-(\d+)$')::integer), 0) + 1
    INTO v_seq FROM public.tickets
    WHERE token LIKE 'AMPRI-' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-%';

    v_token := 'AMPRI-' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-' || LPAD(v_seq::text, GREATEST(3, length(v_seq::text)), '0');
    v_assigned_to := public.route_ticket(p_category, p_submitted_by);

    INSERT INTO public.tickets (token, subject, category, urgency, description,
                                submitted_by, assigned_to, status)
    VALUES (v_token, p_subject, p_category, p_urgency, p_description,
            p_submitted_by, v_assigned_to, 'Open')
    RETURNING id INTO v_ticket_id;

    INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
    VALUES (v_ticket_id, 'Created', p_submitted_by,
            jsonb_build_object('token', v_token, 'category', p_category,
                               'assigned_to', v_assigned_to));

    IF v_assigned_to IS NOT NULL THEN
        -- actor_id NULL = the system did this, not a person.
        INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
        VALUES (v_ticket_id, 'Assigned', NULL,
                jsonb_build_object('assigned_to', v_assigned_to, 'by', 'system'));
    END IF;

    RETURN v_ticket_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.helpdesk_update_status(p_ticket_id uuid, p_new_status text, p_actor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_current_status text; v_submitted_by uuid; v_assigned_to uuid;
    v_caller uuid := auth.uid(); v_allowed boolean := false;
BEGIN
    IF v_caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
    IF p_actor_id IS DISTINCT FROM v_caller THEN
        RAISE EXCEPTION 'actor must be the authenticated user';
    END IF;

    SELECT status, submitted_by, assigned_to
      INTO v_current_status, v_submitted_by, v_assigned_to
      FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;

    IF public.caller_is_admin() THEN
        v_allowed := true;
    ELSIF v_assigned_to IS NOT NULL AND v_assigned_to = v_caller THEN
        v_allowed := (v_current_status, p_new_status) IN
                     (('Open','InProgress'), ('InProgress','Resolved'), ('Closed','InProgress'));
    ELSIF v_submitted_by = v_caller THEN
        v_allowed := (v_current_status = 'Resolved' AND p_new_status = 'Closed');
    END IF;

    IF NOT v_allowed THEN
        RAISE EXCEPTION 'not authorized to move this ticket % -> %', v_current_status, p_new_status;
    END IF;

    IF v_current_status = 'Open' AND p_new_status NOT IN ('InProgress', 'Closed') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    ELSIF v_current_status = 'InProgress' AND p_new_status NOT IN ('Resolved', 'Closed') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    ELSIF v_current_status = 'Resolved' AND p_new_status NOT IN ('Closed', 'InProgress') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    ELSIF v_current_status = 'Closed' AND p_new_status NOT IN ('InProgress') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    END IF;

    UPDATE public.tickets
       SET status = p_new_status,
           resolved_at = CASE WHEN p_new_status = 'Resolved' THEN now() ELSE resolved_at END,
           updated_at = now()
     WHERE id = p_ticket_id;

    INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
    VALUES (p_ticket_id,
            CASE
                WHEN p_new_status = 'InProgress' AND v_current_status = 'Closed' THEN 'Reopened'
                WHEN p_new_status = 'Resolved' THEN 'Resolved'
                WHEN p_new_status = 'Closed' THEN 'Closed'
                ELSE 'StatusChanged'
            END,
            p_actor_id,
            jsonb_build_object('from', v_current_status, 'to', p_new_status));
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_sync_typed_dates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF TG_TABLE_NAME = 'staff' THEN
        NEW.doj_date   := public.try_parse_date(NEW."DOJ");
        NEW.dob_date   := public.try_parse_date(NEW."DOB");
        NEW.doapp_date := public.try_parse_date(NEW."DoAPP");
    ELSIF TG_TABLE_NAME = 'project_staff' THEN
        NEW.joined_on       := public.try_parse_date(NEW."DateOfJoining");
        NEW.project_ends_on := public.try_parse_date(NEW."DateOfProjectDuration");
    ELSE
        NEW.joined_on := public.try_parse_date(NEW."DateOfJoining");
        NEW.ends_on   := public.try_parse_date(NEW."ContractEndDate");
        NEW.born_on   := public.try_parse_date(NEW."DateOfBirth");
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.identity_autolink(p_kind text, p_record_id text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_n integer;
BEGIN
    IF p_kind = 'OUTPUT' THEN
        UPDATE public.output_authors a SET staff_id = m.staff_id, link_source = 'auto'
          FROM (SELECT public.person_name_key("Name") AS k, min("ID") AS staff_id
                  FROM public.staff GROUP BY 1 HAVING count(*) = 1) m
         WHERE m.k = public.person_name_key(a.author_name)
           AND a.staff_id IS NULL AND a.link_source IS NULL
           AND (p_record_id IS NULL OR a.output_id = p_record_id);
    ELSIF p_kind = 'IP' THEN
        UPDATE public.ip_inventors a SET staff_id = m.staff_id, link_source = 'auto'
          FROM (SELECT public.person_name_key("Name") AS k, min("ID") AS staff_id
                  FROM public.staff GROUP BY 1 HAVING count(*) = 1) m
         WHERE m.k = public.person_name_key(a.author_name)
           AND a.staff_id IS NULL AND a.link_source IS NULL
           AND (p_record_id IS NULL OR a.ip_id = p_record_id);
    ELSE
        RAISE EXCEPTION 'Unknown kind: %', p_kind;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.identity_link_authors()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT coalesce(public.caller_is_admin(), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN public.identity_autolink('OUTPUT') + public.identity_autolink('IP');
END;
$$;

CREATE OR REPLACE FUNCTION public.identity_link_gaps()
 RETURNS TABLE(kind text, record_id text, name text, candidates integer, pos integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT coalesce(public.caller_is_admin() OR public.caller_has_role('Director'), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN QUERY
    WITH names AS (
        SELECT 'OUTPUT'::text AS kind, a.output_id AS record_id, a.author_name AS name, a.pos
          FROM public.output_authors a WHERE a.staff_id IS NULL AND a.link_source IS NULL
        UNION ALL
        SELECT 'IP', i.ip_id, i.author_name, i.pos
          FROM public.ip_inventors i WHERE i.staff_id IS NULL AND i.link_source IS NULL
    ), scored AS (
        SELECT n.*, (SELECT count(*)::int FROM public.staff s
                      WHERE length(public.person_name_key(n.name)) >= 3
                        AND (public.person_name_key(s."Name") = public.person_name_key(n.name)
                             OR strpos(public.person_name_key(s."Name"), public.person_name_key(n.name)) > 0
                             OR strpos(public.person_name_key(n.name), public.person_name_key(s."Name")) > 0)) AS c
          FROM names n
    )
    SELECT s.kind, s.record_id, s.name, s.c, s.pos FROM scored s WHERE s.c > 0
    UNION ALL
    SELECT g.table_name || '.' || g.name_column, g.row_key, g.unresolved_name,
           (SELECT count(*)::int FROM public.staff s
             WHERE public.person_name_key(s."Name") = public.person_name_key(g.unresolved_name)),
           NULL::integer
      FROM public.staff_link_gaps g
    ORDER BY 1, 2, 5;
END;
$$;

CREATE OR REPLACE FUNCTION public.identity_set_link(p_kind text, p_record_id text, p_position integer, p_staff_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_me      text := public.caller_staff_id();
    v_current text;
    v_found   boolean;
BEGIN
    IF p_kind = 'OUTPUT' THEN
        SELECT staff_id, true INTO v_current, v_found FROM public.output_authors
         WHERE output_id = p_record_id AND pos = p_position FOR UPDATE;
    ELSIF p_kind = 'IP' THEN
        SELECT staff_id, true INTO v_current, v_found FROM public.ip_inventors
         WHERE ip_id = p_record_id AND pos = p_position FOR UPDATE;
    ELSE
        RAISE EXCEPTION 'Unknown kind: %', p_kind;
    END IF;
    IF NOT coalesce(v_found, false) THEN RAISE EXCEPTION 'No such name on that record'; END IF;

    IF NOT coalesce(
         public.caller_is_admin()
         OR (v_me IS NOT NULL AND p_staff_id = v_me AND (v_current IS NULL OR v_current = v_me))
         OR (v_me IS NOT NULL AND p_staff_id IS NULL AND v_current = v_me),
         false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    IF p_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff WHERE "ID" = p_staff_id) THEN
        RAISE EXCEPTION 'No staff member %', p_staff_id;
    END IF;

    IF p_kind = 'OUTPUT' THEN
        UPDATE public.output_authors
           SET staff_id = p_staff_id, link_source = 'manual', confirmed_by = auth.uid(), confirmed_at = now()
         WHERE output_id = p_record_id AND pos = p_position;
    ELSE
        UPDATE public.ip_inventors
           SET staff_id = p_staff_id, link_source = 'manual', confirmed_by = auth.uid(), confirmed_at = now()
         WHERE ip_id = p_record_id AND pos = p_position;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.identity_sync_names()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF TG_TABLE_NAME = 'scientific_outputs' THEN
        DELETE FROM public.output_authors
         WHERE output_id = NEW.id AND pos > coalesce(cardinality(NEW.authors), 0);
        INSERT INTO public.output_authors (output_id, pos, author_name)
        SELECT NEW.id, u.o, btrim(u.n) FROM unnest(NEW.authors) WITH ORDINALITY u(n, o)
        ON CONFLICT (output_id, pos) DO UPDATE
           SET author_name = EXCLUDED.author_name, staff_id = NULL, link_source = NULL,
               confirmed_by = NULL, confirmed_at = NULL
         WHERE output_authors.author_name IS DISTINCT FROM EXCLUDED.author_name;
        PERFORM public.identity_autolink('OUTPUT', NEW.id);
    ELSE
        DELETE FROM public.ip_inventors
         WHERE ip_id = NEW.id AND pos > coalesce(cardinality(NEW.inventors), 0);
        INSERT INTO public.ip_inventors (ip_id, pos, author_name)
        SELECT NEW.id, u.o, btrim(u.n) FROM unnest(NEW.inventors) WITH ORDINALITY u(n, o)
        ON CONFLICT (ip_id, pos) DO UPDATE
           SET author_name = EXCLUDED.author_name, staff_id = NULL, link_source = NULL,
               confirmed_by = NULL, confirmed_at = NULL
         WHERE ip_inventors.author_name IS DISTINCT FROM EXCLUDED.author_name;
        PERFORM public.identity_autolink('IP', NEW.id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_combined_audit_logs(p_source text DEFAULT 'all'::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(source text, id uuid, action text, entity_type text, entity_id uuid, actor_label text, details jsonb, created_at timestamp with time zone, total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    WITH combined AS (
        SELECT 'pms'::text AS source,
               l.id,
               l.action,
               l.entity_type,
               l.entity_id,
               l.user_id::text AS actor_label,
               l.details,
               l.created_at
          FROM public.pms_audit_logs l
         WHERE p_source IN ('all', 'pms')
        UNION ALL
        SELECT 'modules'::text AS source,
               a.id,
               a.action,
               a.entity_type,
               a.entity_id,
               a.actor_id AS actor_label,
               a.changes AS details,
               a.created_at
          FROM public.audit_log a
         WHERE p_source IN ('all', 'modules')
    ),
    counted AS (
        SELECT count(*) AS total_count FROM combined
    )
    SELECT c.source,
           c.id,
           c.action,
           c.entity_type,
           c.entity_id,
           c.actor_label,
           c.details,
           c.created_at,
           counted.total_count
      FROM combined c, counted
     ORDER BY c.created_at DESC, c.id
     LIMIT GREATEST(1, LEAST(coalesce(p_limit, 25), 100))
    OFFSET GREATEST(0, coalesce(p_offset, 0));
$$;

CREATE OR REPLACE FUNCTION public.merge_user_preferences(p_patch jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    UPDATE public.user_profiles
    SET preferences = preferences || p_patch
    WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.metric_digest_run()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_n integer;
    v_week text := to_char(public.ist_today(), 'IYYY-IW');
BEGIN
    IF auth.uid() IS NOT NULL AND NOT coalesce(public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only MasterAdmin runs the digest';
    END IF;
    WITH readers AS (
        -- One digest per user: the widest role wins (institute before division).
        SELECT DISTINCT ON (r.user_id) r.user_id, r.role,
               CASE WHEN r.role IN ('HOD', 'DivisionHead') THEN r.division_code END AS division
          FROM public.user_roles r
         WHERE r.role IN ('Director', 'MasterAdmin', 'HRAdmin', 'PME', 'HOD', 'DivisionHead')
         ORDER BY r.user_id, (r.role IN ('HOD', 'DivisionHead')), r.role
    ), wanted AS (
        SELECT rd.user_id, rd.division, m.key, m.label, m.unit, m.sort
          FROM readers rd JOIN public.metrics m
            ON (rd.role IN ('Director', 'MasterAdmin', 'HOD', 'DivisionHead'))
            OR (rd.role = 'HRAdmin' AND m.owner_role = 'HRAdmin')
            OR (rd.role = 'PME' AND m.owner_role = 'PME')
    ), vals AS (
        SELECT w.*, public.metric_value(w.key, CASE WHEN w.division IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('division', w.division) END) AS now_v,
               (SELECT s.value FROM public.metric_snapshots s
                 WHERE s.metric_key = w.key
                   AND s.scope = CASE WHEN w.division IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('division', w.division) END
                 ORDER BY s.as_on DESC LIMIT 1) AS last_v
          FROM wanted w
    )
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT v.user_id, 'metric-digest', 'info',
           'Weekly numbers' || coalesce(' · ' || v.division, ''),
           string_agg(v.label || ' ' || coalesce(CASE v.unit WHEN 'pct' THEN v.now_v || '%' WHEN 'inr' THEN '₹' || to_char(v.now_v, 'FM99,99,99,99,999') ELSE v.now_v::text END, '—')
                      || CASE WHEN v.last_v IS NOT NULL AND v.now_v IS NOT NULL AND v.now_v <> v.last_v
                              THEN ' (' || CASE WHEN v.now_v > v.last_v THEN '+' ELSE '' END || (v.now_v - v.last_v) || ')' ELSE '' END,
                      ' · ' ORDER BY v.sort),
           '/divisions', 'rule', 'metric-digest:' || v_week
      FROM vals v
     GROUP BY v.user_id, v.division
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.metric_outputs_per_year(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT count(*) FROM public.scientific_outputs o
     WHERE o.year = coalesce((p_scope->>'year')::int, extract(year FROM public.ist_today())::int)
       AND (p_scope->>'division' IS NULL OR o.division_code = p_scope->>'division');
$$;

CREATE OR REPLACE FUNCTION public.metric_patents(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT count(*) FROM public.ip_intelligence i
     WHERE i.type = 'Patent'
       AND (p_scope->>'stage' IS NULL OR lower(i.status) = lower(p_scope->>'stage'))
       AND (p_scope->>'division' IS NULL OR i.division_code = p_scope->>'division');
$$;

CREATE OR REPLACE FUNCTION public.metric_posts(p_scope jsonb, p_col text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT coalesce(sum(CASE p_col WHEN 'sanctioned' THEN d.sanctioned WHEN 'filled' THEN d.filled ELSE d.vacant END), 0)
      FROM public.division_strength d WHERE p_scope->>'division' IS NULL OR d.division_code = p_scope->>'division';
$$;

CREATE OR REPLACE FUNCTION public.metric_posts_filled(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ SELECT public.metric_posts(p_scope, 'filled') $function$
;

CREATE OR REPLACE FUNCTION public.metric_posts_sanctioned(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ SELECT public.metric_posts(p_scope, 'sanctioned') $function$
;

CREATE OR REPLACE FUNCTION public.metric_posts_vacant(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ SELECT public.metric_posts(p_scope, 'vacant') $function$
;

CREATE OR REPLACE FUNCTION public.metric_projects_active(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT count(*) FROM public.projects p
     WHERE p.stage = 'ACTIVE' AND (p_scope->>'division' IS NULL OR p."DivisionCode" = p_scope->>'division');
$$;

CREATE OR REPLACE FUNCTION public.metric_projects_sanctioned_value(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT coalesce(sum(p.sanctioned_cost), 0) FROM public.projects p
     WHERE p.stage = 'ACTIVE' AND (p_scope->>'division' IS NULL OR p."DivisionCode" = p_scope->>'division');
$$;

CREATE OR REPLACE FUNCTION public.metric_projects_utilisation_pct(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    WITH a AS (
        SELECT p.sanctioned_cost AS cost, (SELECT sum(e.amount) FROM public.project_expenditure e WHERE e.project_id = p."ProjectID") AS spent
          FROM public.projects p
         WHERE p.stage = 'ACTIVE' AND p.sanctioned_cost > 0
           AND (p_scope->>'division' IS NULL OR p."DivisionCode" = p_scope->>'division')
    )
    SELECT round(100 * sum(spent) / nullif(sum(cost), 0), 1) FROM a WHERE spent IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.metric_reports_overdue(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ SELECT public.metric_review_slots_overdue(p_scope, true) $function$
;

CREATE OR REPLACE FUNCTION public.metric_review_slots_overdue(p_scope jsonb, p_reports boolean)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT count(*) FROM public.project_review_slots s JOIN public.projects p ON p."ProjectID" = s.project_id
     WHERE s.status = 'PENDING' AND s.due_date < public.ist_today()
       AND (s.kind = 'PROGRESS_REPORT') = p_reports
       AND p.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING')
       AND (p_scope->>'division' IS NULL OR p."DivisionCode" = p_scope->>'division');
$$;

CREATE OR REPLACE FUNCTION public.metric_reviews_overdue(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ SELECT public.metric_review_slots_overdue(p_scope, false) $function$
;

CREATE OR REPLACE FUNCTION public.metric_snapshot_run(p_as_on date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_n integer;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT coalesce(public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only MasterAdmin takes a snapshot';
    END IF;
    INSERT INTO public.metric_snapshots (metric_key, scope, as_on, value)
    SELECT t.metric_key, CASE WHEN t.division IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('division', t.division) END,
           coalesce(p_as_on, public.ist_today() - 1), t.value
      FROM public.metric_table() t
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.metric_staff_headcount(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT count(*) FROM public.staff s WHERE p_scope->>'division' IS NULL OR s."Division" = p_scope->>'division';
$$;

CREATE OR REPLACE FUNCTION public.metric_students_in_progress(p_scope jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT count(*) FROM public.phd_students s
     WHERE coalesce(s."CurrentStatus", '') !~* '(thesis submitted|viva|awarded)'
       AND (p_scope->>'division' IS NULL OR s."DivisionCode" = p_scope->>'division');
$$;

CREATE OR REPLACE FUNCTION public.metric_table()
 RETURNS TABLE(metric_key text, division text, value numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT m.key, NULL::text, public.metric_value(m.key, '{}') FROM public.metrics m
    UNION ALL
    SELECT m.key, d."divCode", public.metric_value(m.key, jsonb_build_object('division', d."divCode"))
      FROM public.metrics m CROSS JOIN public.divisions d WHERE 'division' = ANY (m.scope_kinds);
$$;

CREATE OR REPLACE FUNCTION public.metric_value(p_key text, p_scope jsonb DEFAULT '{}'::jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
DECLARE
    v_fn  regproc;
    v_out numeric;
BEGIN
    SELECT fn INTO v_fn FROM public.metrics WHERE key = p_key;
    IF v_fn IS NULL THEN RAISE EXCEPTION 'Unknown metric %', p_key; END IF;
    EXECUTE format('SELECT %s($1)', v_fn) INTO v_out USING coalesce(p_scope, '{}'::jsonb);
    RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_change_steps()
 RETURNS TABLE(step_id uuid, change_id uuid, project_id text, project_no text, change_kind text, step_kind text, submitted_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT s.id, r.id, r.project_id, p."ProjectNo", r.kind, s.kind, r.submitted_at
    FROM public.project_change_steps s
    JOIN public.project_change_requests r ON r.id = s.change_id AND s.round = r.round
    JOIN public.projects p ON p."ProjectID" = r.project_id
   WHERE s.status = 'PENDING' AND r.status IN ('SUBMITTED', 'UNDER_REVIEW')
     AND NOT EXISTS (SELECT 1 FROM public.project_change_steps e
                      WHERE e.change_id = s.change_id AND e.round = s.round AND e.seq < s.seq AND e.status = 'PENDING')
     AND public.project_change_caller_may_act(r.project_id, s.kind)
   ORDER BY r.submitted_at;
$$;

CREATE OR REPLACE FUNCTION public.my_closure_items()
 RETURNS TABLE(item text, project_id text, project_no text, step_id uuid, step_kind text, end_date date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT 'step', r.project_id, p."ProjectNo", s.id, s.kind, p.end_date
    FROM public.project_completion_steps s
    JOIN public.project_completion_reports r ON r.id = s.report_id AND s.round = r.round
    JOIN public.projects p ON p."ProjectID" = r.project_id
   WHERE s.status = 'PENDING' AND r.status IN ('SUBMITTED', 'UNDER_REVIEW')
     AND NOT EXISTS (SELECT 1 FROM public.project_completion_steps e
                      WHERE e.report_id = s.report_id AND e.round = s.round AND e.seq < s.seq AND e.status = 'PENDING')
     AND public.project_change_caller_may_act(r.project_id, s.kind)
  UNION ALL
  -- The PI's: the end date has passed (or the project is closing) and no
  -- report has gone forward.
  SELECT 'due', p."ProjectID", p."ProjectNo", NULL, NULL, p.end_date
    FROM public.projects p
    LEFT JOIN public.project_completion_reports r ON r.project_id = p."ProjectID"
   WHERE (p.stage = 'CLOSING' OR (p.stage IN ('ACTIVE', 'ON_HOLD') AND p.end_date < public.ist_today())
          OR (p.stage = 'FORECLOSED' AND p.proposal_id IS NOT NULL))
     AND coalesce(r.status, 'DRAFT') IN ('DRAFT', 'RETURNED')
     AND public.project_caller_is_pi(p."ProjectID");
$$;

CREATE OR REPLACE FUNCTION public.my_due_project_slots()
 RETURNS TABLE(slot_id uuid, project_id text, project_no text, kind text, body text, period_label text, due_date date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT s.id, s.project_id, p."ProjectNo", s.kind, s.body, s.period_label, s.due_date
    FROM public.project_review_slots s
    JOIN public.projects p ON p."ProjectID" = s.project_id
   WHERE s.status = 'PENDING'
     AND s.kind IN ('PROGRESS_REPORT', 'CALLED_REVIEW')
     AND s.due_date <= public.ist_today() + 30
     AND public.project_caller_is_party(s.project_id)
   ORDER BY s.due_date;
$$;

CREATE OR REPLACE FUNCTION public.notification_accept(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_action jsonb;
    v_kind   text;
    v_args   jsonb;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    UPDATE public.notifications SET status = 'accepted'
     WHERE id = p_id AND user_id = auth.uid() AND status IN ('open', 'read') AND proposed_action IS NOT NULL
    RETURNING proposed_action INTO v_action;
    IF NOT FOUND THEN RAISE EXCEPTION 'Nothing to accept'; END IF;

    v_kind := v_action->>'kind';
    v_args := coalesce(v_action->'args', '{}'::jsonb);
    IF v_kind = 'identity_link' THEN
        PERFORM public.identity_set_link(v_args->>'record_kind', v_args->>'record_id', (v_args->>'pos')::int, v_args->>'staff_id');
    ELSIF v_kind = 'expertise_confirm' THEN
        IF (v_args->>'staff_id') IS DISTINCT FROM public.caller_staff_id() THEN
            RAISE EXCEPTION 'Only the person confirms their own expertise';
        END IF;
        INSERT INTO public.staff_expertise (staff_id, term_id, source, confirmed_at, added_by)
        VALUES (v_args->>'staff_id', (v_args->>'term_id')::uuid, 'SUGGESTED', now(), auth.uid())
        ON CONFLICT (staff_id, term_id) DO UPDATE SET confirmed_at = now();
    ELSIF v_kind = 'open' THEN
        NULL;
    ELSE
        RAISE EXCEPTION 'Action % is not allowed', coalesce(v_kind, '(none)');
    END IF;

    INSERT INTO public.ai_action_log (notification_id, user_id, action_kind, args, outcome)
    VALUES (p_id, auth.uid(), v_kind, v_args, CASE WHEN v_kind = 'open' THEN 'OPENED' ELSE 'DONE' END);
    RETURN v_action->>'link';
END;
$$;

CREATE OR REPLACE FUNCTION public.notifications_sweep()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    WITH due (user_id, kind, severity, title, body, link, dedupe_key) AS (
        -- PMS self-appraisal still in draft and its submission deadline
        -- (15 May, or the condoned date) falls within 14 days. The due date is
        -- in the key, so a condonation earns its own reminder.
        SELECT r.scientist_id, 'pms-draft', 'warning',
               'PMS report in draft',
               'Complete and submit your appraisal report by ' || to_char(d.due, 'DD Mon YYYY'),
               '/pms/reports/' || r.id || '/edit',
               'pms-draft:' || r.id || ':' || d.due
          FROM pms_reports r
          JOIN appraisal_cycles c ON c.id = r.cycle_id
          JOIN LATERAL (
              SELECT greatest(
                       public.pms_deadline(c.id, 'SELF_APPRAISAL'),
                       (SELECT cd.condoned_until FROM pms_condonations cd WHERE cd.report_id = r.id)
                     ) AS due
          ) d ON true
         WHERE r.status = 'DRAFT'
           AND c.status = 'OPEN'
           AND d.due BETWEEN public.ist_today() AND public.ist_today() + 14

        UNION ALL
        -- PMS evaluation assigned and not completed.
        SELECT e.evaluator_id, 'pms-evaluation', 'info',
               'PMS evaluation pending',
               'A report is awaiting your evaluation',
               '/pms/evaluate/' || e.id,
               'pms-evaluation:' || e.id
          FROM pms_evaluations e
         WHERE e.status <> 'COMPLETED'

        UNION ALL
        -- Proposal sent back to its PI. The history count makes each
        -- revision round its own notification.
        SELECT p.pi_user_id, 'proposal-revision', 'warning',
               'Proposal revision requested',
               p.title,
               '/proposals/' || p.id || '/edit',
               'proposal-revision:' || p.id || ':'
                   || (SELECT count(*) FROM proposal_status_history h WHERE h.proposal_id = p.id)
          FROM proposals p
         WHERE p.status = 'REVISION_REQUESTED'

        UNION ALL
        -- Progress report in draft / sent back, due within 14 days (or overdue).
        SELECT pr.submitted_by, 'progress-report', 'warning',
               CASE pr.status WHEN 'REVISION_REQUESTED' THEN 'Progress report needs revision'
                              ELSE 'Progress report in draft' END,
               pr.project_name || ' · ' || pr.period_label || ' · due ' || to_char(pr.due_date, 'DD Mon YYYY'),
               '/reports/' || pr.id,
               'progress-report:' || pr.id || ':'
                   || (SELECT count(*) FROM project_report_history h WHERE h.report_id = pr.id)
          FROM project_reports pr
         WHERE pr.status IN ('DRAFT','REVISION_REQUESTED')
           AND pr.due_date <= current_date + 14

        UNION ALL
        -- Helpdesk ticket waiting on its handler. assigned_to is an auth
        -- user id since 20260725000004, so no staff mapping is needed.
        SELECT t.assigned_to, 'ticket', 'info',
               'Helpdesk ticket assigned to you',
               t.token || ' · ' || t.subject,
               '/helpdesk/' || t.id,
               'ticket:' || t.id
          FROM tickets t
         WHERE t.assigned_to IS NOT NULL
           AND t.status IN ('Open','InProgress')

        UNION ALL
        -- Contract engagement ending within 60 days → HRAdmin + MasterAdmin.
        -- SystemAdmin is platform-only and cannot open /staff/project.
        SELECT w.user_id, 'contract-end', 'warning',
               'Contract ending soon',
               coalesce(cs."Name", cs.id) || coalesce(' · ' || nullif(cs."Designation", ''), '')
                   || ' · ends ' || to_char(d.end_on, 'DD Mon YYYY'),
               '/staff/project',
               'contract-end:' || cs.id || ':' || d.end_on
          FROM contract_staff cs
         CROSS JOIN LATERAL (SELECT try_parse_date(cs."ContractEndDate") AS end_on) d
         CROSS JOIN (SELECT DISTINCT user_id FROM user_roles
                      WHERE role IN ('HRAdmin','MasterAdmin')) w
         WHERE d.end_on BETWEEN current_date AND current_date + 60

        UNION ALL
        -- NEW (review A1): active MoU expiring within 90 days → Director +
        -- MasterAdmin. valid_until is in the key so a renewed MoU alerts again.
        SELECT w.user_id, 'mou-expiry', 'warning',
               'MoU expiring soon',
               m.partner_name || ' · valid until ' || to_char(m.valid_until, 'DD Mon YYYY'),
               '/partnerships',
               'mou-expiry:' || m.id || ':' || m.valid_until
          FROM mous m
         CROSS JOIN (SELECT DISTINCT user_id FROM user_roles
                      WHERE role IN ('Director','MasterAdmin')) w
         WHERE m.status = 'Active'
           AND m.valid_until BETWEEN current_date AND current_date + 90

        UNION ALL
        -- ── P1 / EI4: rules that lived only in myActions.ts ─────────────
        -- Progress report owed on a project the user leads, due within 30 days
        -- or past. A called review is notified when it is called.
        SELECT pi.user_id, 'project-review', 'warning',
               'Progress report due — ' || p."ProjectNo",
               s.body || ' · ' || s.period_label || ' · due ' || to_char(s.due_date, 'DD Mon YYYY'),
               '/reports/new',
               'project-slot:' || s.id
          FROM project_review_slots s
          JOIN projects p ON p."ProjectID" = s.project_id
          JOIN LATERAL (SELECT coalesce((SELECT pr.pi_user_id FROM proposals pr WHERE pr.id = p.proposal_id),
                                        (SELECT st.user_id FROM staff st WHERE st."ID" = p.pi_staff_id)) AS user_id) pi ON true
         WHERE s.status = 'PENDING' AND s.kind = 'PROGRESS_REPORT'
           AND s.due_date <= public.ist_today() + 30
           AND pi.user_id IS NOT NULL

        UNION ALL
        -- Change-request step whose turn it is → the desk that records it
        -- (project_change_caller_may_act, without the MasterAdmin override).
        SELECT ur.user_id, 'project-change', 'info',
               'Change request to record — ' || p."ProjectNo",
               initcap(lower(replace(r.kind, '_', ' '))) || ' · ' || initcap(lower(replace(s.kind, '_', ' '))),
               '/projects/' || r.project_id || '?tab=changes',
               'change-step:' || s.id
          FROM project_change_steps s
          JOIN project_change_requests r ON r.id = s.change_id AND s.round = r.round
          JOIN projects p ON p."ProjectID" = r.project_id
          JOIN user_roles ur ON ur.role = CASE s.kind WHEN 'FINANCE' THEN 'FinanceAdmin'
                                                      WHEN 'DIRECTOR_APPROVAL' THEN 'Director'
                                                      WHEN 'DIRECTOR_FORWARD' THEN 'Director'
                                                      ELSE 'PME' END
         WHERE s.status = 'PENDING' AND r.status IN ('SUBMITTED', 'UNDER_REVIEW')
           AND NOT EXISTS (SELECT 1 FROM project_change_steps e
                            WHERE e.change_id = s.change_id AND e.round = s.round AND e.seq < s.seq AND e.status = 'PENDING')

        UNION ALL
        -- Completion-report step whose turn it is → its desk.
        SELECT ur.user_id, 'project-closure', 'info',
               'Completion report to record — ' || p."ProjectNo",
               initcap(lower(replace(s.kind, '_', ' '))),
               '/projects/' || r.project_id || '?tab=closure',
               'closure-step:' || s.id
          FROM project_completion_steps s
          JOIN project_completion_reports r ON r.id = s.report_id AND s.round = r.round
          JOIN projects p ON p."ProjectID" = r.project_id
          JOIN user_roles ur ON ur.role = CASE s.kind WHEN 'FINANCE' THEN 'FinanceAdmin'
                                                      WHEN 'DIRECTOR_APPROVAL' THEN 'Director'
                                                      WHEN 'DIRECTOR_FORWARD' THEN 'Director'
                                                      ELSE 'PME' END
         WHERE s.status = 'PENDING' AND r.status IN ('SUBMITTED', 'UNDER_REVIEW')
           AND NOT EXISTS (SELECT 1 FROM project_completion_steps e
                            WHERE e.report_id = s.report_id AND e.round = s.round AND e.seq < s.seq AND e.status = 'PENDING')

        UNION ALL
        -- Completion report owed by the PI (my_closure_items 'due').
        SELECT pi.user_id, 'project-closure', 'warning',
               'Completion report due — ' || p."ProjectNo",
               'Write what the project did and learned; it closes the project',
               '/projects/' || p."ProjectID" || '?tab=closure',
               'closure-due:' || p."ProjectID" || ':' || coalesce(p.end_date::text, '')
          FROM projects p
          LEFT JOIN project_completion_reports r ON r.project_id = p."ProjectID"
          JOIN LATERAL (SELECT coalesce((SELECT pr.pi_user_id FROM proposals pr WHERE pr.id = p.proposal_id),
                                        (SELECT st.user_id FROM staff st WHERE st."ID" = p.pi_staff_id)) AS user_id) pi ON true
         WHERE (p.stage = 'CLOSING' OR (p.stage IN ('ACTIVE', 'ON_HOLD') AND p.end_date < public.ist_today())
                OR (p.stage = 'FORECLOSED' AND p.proposal_id IS NOT NULL))
           AND coalesce(r.status, 'DRAFT') IN ('DRAFT', 'RETURNED')
           AND pi.user_id IS NOT NULL

        UNION ALL
        -- Proposal desk: vetting and sanction → PME and MasterAdmin;
        -- a recommended in-house proposal → the Director.
        SELECT ur.user_id, 'proposal', 'info',
               CASE p.status WHEN 'SUBMITTED' THEN 'Proposal awaiting vetting'
                             WHEN 'RECOMMENDED' THEN 'Recommended — awaiting your approval'
                             ELSE 'Approved — record the sanction' END,
               p.title,
               '/proposals/' || p.id,
               'proposal-desk:' || p.id || ':' || p.status || ':'
                   || (SELECT count(*) FROM proposal_status_history h WHERE h.proposal_id = p.id)
          FROM proposals p
          JOIN user_roles ur
            ON (p.status IN ('SUBMITTED', 'APPROVED', 'OM_ISSUED') AND ur.role IN ('PME', 'MasterAdmin'))
            OR (p.status = 'RECOMMENDED' AND p.track = 'ULIP' AND ur.role = 'Director')

        UNION ALL
        -- Progress report awaiting review → division heads of its division,
        -- and the institute-wide reviewers.
        SELECT DISTINCT ur.user_id, 'progress-report', 'info',
               'Progress report awaiting review',
               pr.project_name || ' · ' || pr.period_label,
               '/reports/' || pr.id,
               'progress-review:' || pr.id || ':'
                   || (SELECT count(*) FROM project_report_history h WHERE h.report_id = pr.id)
          FROM project_reports pr
          JOIN user_roles ur
            ON (ur.role IN ('HOD', 'DivisionHead') AND ur.division_code = pr.division_code)
            OR ur.role IN ('Director', 'HRAdmin', 'MasterAdmin')
         WHERE pr.status IN ('SUBMITTED', 'UNDER_REVIEW')

        UNION ALL
        -- Committee action item → its assignee: a staff ID, or a name that
        -- exactly one staff member carries.
        SELECT st.user_id, 'action-item', 'info',
               'Committee action item',
               a.task || ' · due ' || to_char(a.deadline, 'DD Mon YYYY'),
               '/committees',
               'action-item:' || a.id
          FROM action_items a
          JOIN staff st ON st."ID" = coalesce(
                 (SELECT s1."ID" FROM staff s1 WHERE s1."ID" = a.assigned_to),
                 (SELECT min(s2."ID") FROM staff s2
                   WHERE public.person_name_key(s2."Name") = public.person_name_key(a.assigned_to)
                  HAVING count(*) = 1))
         WHERE a.status <> 'Completed' AND st.user_id IS NOT NULL

        UNION ALL
        -- Superannuation (DOB + 60) within 6 months → institute-wide watchers,
        -- and division heads of the person's division. A DOB that does not
        -- parse raises nothing.
        SELECT DISTINCT ur.user_id, 'retirement', 'info',
               'Superannuation approaching',
               coalesce(st."Name", st."ID") || coalesce(' · ' || nullif(st."Designation", ''), '')
                   || ' · ' || to_char(d.on_date, 'DD Mon YYYY'),
               '/staff/analytics',
               'retirement:' || st."ID" || ':' || d.on_date
          FROM staff st
         CROSS JOIN LATERAL (SELECT (st.dob_date + interval '60 years')::date AS on_date) d
          JOIN user_roles ur
            ON ur.role IN ('Director', 'HRAdmin', 'MasterAdmin')
            OR (ur.role IN ('HOD', 'DivisionHead') AND ur.division_code = st."Division")
         WHERE d.on_date BETWEEN public.ist_today() AND (public.ist_today() + interval '6 months')::date
    ),
    ins AS (
        INSERT INTO notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
        SELECT user_id, kind, severity, title, body, link, 'rule', dedupe_key
          FROM due
        ON CONFLICT (user_id, dedupe_key) DO NOTHING
        RETURNING 1
    )
    SELECT count(*)::int FROM ins;
$$;

CREATE OR REPLACE FUNCTION public.person_name_may_be(a text, b text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT coalesce(length(public.person_name_key(a)) >= 3 AND length(public.person_name_key(b)) >= 3
     AND (public.person_name_key(a) = public.person_name_key(b)
          OR strpos(public.person_name_key(a), public.person_name_key(b)) > 0
          OR strpos(public.person_name_key(b), public.person_name_key(a)) > 0), false);
$$;

CREATE OR REPLACE FUNCTION public.pme_compliance_counts()
 RETURNS TABLE(declarations_missing integer, transfers_missing_docs integer, logbooks_idle integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT coalesce(public.caller_is_pme() OR public.caller_is_admin() OR public.caller_has_role('Director'), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN QUERY SELECT
        -- Meetings from 30 days back to 14 days ahead with a member yet to declare.
        (SELECT count(*)::int FROM public.meetings m
          WHERE m.status <> 'Cancelled'
            AND m.meeting_date BETWEEN public.ist_today() - 30 AND public.ist_today() + 14
            AND EXISTS (
                SELECT 1 FROM public.staff s
                 WHERE s.user_id IS NOT NULL
                   AND (s."ID" IN (SELECT c.chairperson_id FROM public.committees c WHERE c.id = m.committee_id
                                   UNION SELECT c.secretary_id FROM public.committees c WHERE c.id = m.committee_id
                                   UNION SELECT cm.staff_id FROM public.committee_members cm WHERE cm.committee_id = m.committee_id))
                   AND NOT EXISTS (SELECT 1 FROM public.coi_declarations d
                                    WHERE d.meeting_id = m.id AND d.member_user_id = s.user_id))),
        (SELECT count(DISTINCT g.project_id)::int FROM public.project_transfer_gaps() g),
        -- Logbook instruments with no entry in the last 30 days.
        (SELECT count(*)::int FROM public.equipment e
          WHERE public.equipment_logbook_required(e."UInsID")
            AND NOT EXISTS (SELECT 1 FROM public.equipment_usage_log l
                             WHERE l.equipment_id = e."UInsID" AND l.used_on >= public.ist_today() - 30));
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_annexure_b_due(p_cycle_id uuid, p_step smallint)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT CASE p_step
        WHEN 1 THEN make_date(y, 4, 1)    -- distribute
        WHEN 2 THEN make_date(y, 5, 15)   -- self-appraisal + AWP
        WHEN 3 THEN make_date(y, 6, 30)   -- Evaluation Committee
        WHEN 4 THEN make_date(y, 7, 31)   -- Empowered Committee
        WHEN 5 THEN make_date(y, 8, 15)   -- communicate (15 days after #4)
        WHEN 6 THEN make_date(y, 8, 30)   -- accept or represent (15 days)
        WHEN 7 THEN NULL                  -- dispose: one month from each receipt
        WHEN 8 THEN make_date(y, 11, 15)  -- communicate decision
        WHEN 9 THEN make_date(y, 11, 30)  -- close, take on record
    END
    FROM (SELECT extract(year FROM end_date)::int AS y FROM public.appraisal_cycles WHERE id = p_cycle_id) c;
$$;

CREATE OR REPLACE FUNCTION public.pms_assign_evaluators(p_report_id uuid, p_committee_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
    v_uid    uuid;
    v_tier   text;
    v_want   text;
BEGIN
    IF NOT pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can assign evaluators'; END IF;

    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'SUBMITTED' THEN
        RAISE EXCEPTION 'Report must be SUBMITTED before assigning evaluators';
    END IF;

    IF NOT pms_committee_panel_valid(p_committee_id) THEN
        RAISE EXCEPTION 'Evaluation Committee panel is invalid: needs an odd number of members including a Reporting Officer, a Reviewing Officer, and an Empowered Committee member';
    END IF;

    IF v_report.proforma_version = '2026' THEN
        SELECT tier INTO v_tier FROM pms_evaluation_committees WHERE id = p_committee_id;
        v_want := public.csir_rule('pms.designation_committee_tier') ->> public.pms_report_designation(p_report_id);
        IF v_want IS NULL THEN
            RAISE EXCEPTION 'The scientist''s designation does not name a grade; correct it on the staff record first';
        END IF;
        IF v_tier IS DISTINCT FROM v_want THEN
            RAISE EXCEPTION 'This report goes to a tier % committee (the scientist''s grade); this committee is tier %',
                v_want, coalesce(v_tier, 'not set');
        END IF;
    END IF;

    FOR v_uid IN
        SELECT user_id FROM pms_evaluation_committee_members WHERE committee_id = p_committee_id
    LOOP
        INSERT INTO pms_evaluations (report_id, evaluator_id)
        VALUES (p_report_id, v_uid)
        ON CONFLICT (report_id, evaluator_id) DO NOTHING;

        INSERT INTO pms_notifications (user_id, type, title, body, report_id)
        VALUES (v_uid, 'assigned_evaluator',
                'You have been assigned to evaluate a report',
                'A scientist''s appraisal report has been assigned to your Evaluation Committee.',
                p_report_id);
    END LOOP;

    UPDATE pms_reports
        SET status = 'UNDER_EVALUATION_COMMITTEE_REVIEW', committee_id = p_committee_id, updated_at = now()
        WHERE id = p_report_id AND status = 'SUBMITTED';

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'ASSIGN_EVALUATORS', 'pms_reports', p_report_id,
            jsonb_build_object('committee_id', p_committee_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_can_read(p_staff_id text, p_ro text, p_rvo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT auth.uid() IS NOT NULL AND (
           public.pms_is_admin()
        OR public.user_has_role('Director')
        OR EXISTS (SELECT 1 FROM public.staff s WHERE s."ID" = p_staff_id AND s.user_id = auth.uid())
        OR public.caller_staff_id() IN (p_ro, p_rvo)
    );
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_content(a pms_awps)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT jsonb_build_object(
        'partA', a.part_a, 'activitySplit', a.activity_split, 'projects', a.projects,
        'objectives', a.objectives, 'development', a.development,
        'institutionalWork', a.institutional_work, 'other', a.other);
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_decide_revision(p_revision_id uuid, p_approve boolean, p_remarks text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_rev public.pms_awp_revisions%ROWTYPE;
    v_awp public.pms_awps%ROWTYPE;
BEGIN
    IF NOT public.user_has_role('Director') THEN
        RAISE EXCEPTION 'Only the Director can decide an AWP revision';
    END IF;
    SELECT * INTO v_rev FROM public.pms_awp_revisions WHERE id = p_revision_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found'; END IF;
    IF v_rev.status <> 'PENDING' THEN RAISE EXCEPTION 'Revision already decided'; END IF;
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = v_rev.awp_id FOR UPDATE;

    UPDATE public.pms_awp_revisions SET
        status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
        decided_by = auth.uid(), decided_at = now(), decision_remarks = p_remarks
     WHERE id = p_revision_id;

    IF p_approve THEN
        UPDATE public.pms_awps SET
            part_a             = coalesce(v_rev.after->'partA', part_a),
            activity_split     = coalesce(v_rev.after->'activitySplit', activity_split),
            projects           = coalesce(v_rev.after->'projects', projects),
            objectives         = coalesce(v_rev.after->'objectives', objectives),
            development        = coalesce(v_rev.after->'development', development),
            institutional_work = coalesce(v_rev.after->>'institutionalWork', institutional_work),
            other              = coalesce(v_rev.after->>'other', other),
            communicated_at    = now()
         WHERE id = v_rev.awp_id;
    END IF;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_REVISION_DECIDED', 'pms_awps', v_rev.awp_id,
            jsonb_build_object('revision', p_revision_id, 'approved', p_approve));

    PERFORM public.pms_awp_notify(v_awp.staff_id, 'awp_revision_decided',
        'Annual Work Plan revision ' || CASE WHEN p_approve THEN 'approved' ELSE 'not approved' END,
        'The Director has decided the revision of your Annual Work Plan for ' || v_awp.reporting_year || '.');
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_director_decide(p_awp_id uuid, p_decision text, p_remarks text, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
BEGIN
    -- §5.E.a.iv: the Director's decision, not an administrator's. Paper
    -- approvals already given are recorded through pms_awp_import instead.
    IF NOT public.user_has_role('Director') THEN
        RAISE EXCEPTION 'Only the Director can approve an Annual Work Plan';
    END IF;
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF v_awp.status <> 'WITH_DIRECTOR' THEN RAISE EXCEPTION 'AWP is not waiting for the Director'; END IF;
    IF p_decision NOT IN ('ACCEPTED','MODIFIED') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
    IF p_decision = 'MODIFIED' AND (p_payload IS NULL OR length(trim(coalesce(p_remarks, ''))) < 20) THEN
        RAISE EXCEPTION 'A modification needs the revised plan and remarks (at least 20 characters)';
    END IF;
    IF p_decision = 'MODIFIED' AND public.pms_awp_total(p_payload->'activitySplit') <> 100 THEN
        RAISE EXCEPTION 'Time committed must total 100%%';
    END IF;

    IF p_decision = 'MODIFIED' THEN
        UPDATE public.pms_awps SET
            part_a             = coalesce(p_payload->'partA', part_a),
            activity_split     = coalesce(p_payload->'activitySplit', activity_split),
            projects           = coalesce(p_payload->'projects', projects),
            objectives         = coalesce(p_payload->'objectives', objectives),
            development        = coalesce(p_payload->'development', development),
            institutional_work = coalesce(p_payload->>'institutionalWork', institutional_work),
            other              = coalesce(p_payload->>'other', other)
         WHERE id = p_awp_id;
    END IF;

    UPDATE public.pms_awps SET
        status            = 'APPROVED',
        director_decision = p_decision,
        director_remarks  = p_remarks,
        approved_at       = now(),
        approved_by       = auth.uid(),
        communicated_at   = now(),
        -- RO step was skipped because the Director is the RO (§5.E.a.v)
        ro_verdict        = coalesce(ro_verdict, 'REASONABLE'),
        ro_reasons        = CASE WHEN ro_verdict IS NULL THEN 'Director is the Reporting Officer' ELSE ro_reasons END,
        ro_at             = coalesce(ro_at, now())
     WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_APPROVED', 'pms_awps', p_awp_id, jsonb_build_object('decision', p_decision));

    PERFORM public.pms_awp_notify(v_awp.staff_id, 'awp_approved',
        'Your Annual Work Plan is approved',
        'Your Annual Work Plan for ' || v_awp.reporting_year || ' has been approved by the Director'
            || CASE WHEN p_decision = 'MODIFIED' THEN ' with modifications.' ELSE '.' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_director_staff_id()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT s."ID" FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.user_id AND ur.role = 'Director'
     ORDER BY s."ID" LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_for_report(p_report_id uuid)
 RETURNS SETOF pms_awps
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
    v_awp    public.pms_awps%ROWTYPE;
    v_year   text;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id;
    IF NOT FOUND THEN RETURN; END IF;
    IF NOT COALESCE(
           v_report.scientist_id = auth.uid()
        OR public.pms_is_admin()
        OR public.user_has_role('Director')
        OR public.pms_is_grievance_member(v_report.cycle_id)
        OR EXISTS (SELECT 1 FROM public.pms_evaluations e
                    WHERE e.report_id = p_report_id AND e.evaluator_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members m
                    WHERE m.cycle_id = v_report.cycle_id AND m.user_id = auth.uid()), false) THEN
        RETURN;
    END IF;

    v_year := to_char(coalesce(v_report.period_from,
                               (SELECT start_date FROM public.appraisal_cycles WHERE id = v_report.cycle_id)), 'YYYY');
    v_year := v_year || '-' || lpad(((v_year::int + 1) % 100)::text, 2, '0');

    SELECT * INTO v_awp FROM public.pms_awps a
     WHERE a.reporting_year = v_year
       AND (a.scientist_user_id = v_report.scientist_id
            OR a.staff_id IN (SELECT s."ID" FROM public.staff s WHERE s.user_id = v_report.scientist_id))
     LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;
    v_awp.projects := public.pms_awp_redact_projects(v_awp.projects);
    RETURN NEXT v_awp;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_forward_blank(p_staff_id text, p_year text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_staff public.staff%ROWTYPE;
    v_awp   public.pms_awps%ROWTYPE;
    v_ro    text;
    v_id    uuid;
BEGIN
    IF NOT public.pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can forward a blank AWP'; END IF;
    SELECT * INTO v_staff FROM public.staff WHERE "ID" = p_staff_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not found'; END IF;

    v_ro := coalesce(v_staff."ReportingID",
                     (SELECT d."divHoDID" FROM public.divisions d WHERE d."divCode" = v_staff."Division"));

    SELECT * INTO v_awp FROM public.pms_awps
     WHERE staff_id = p_staff_id AND reporting_year = p_year FOR UPDATE;
    IF coalesce(v_awp.reporting_officer_id, v_ro) IS NULL THEN
        RAISE EXCEPTION 'No Reporting Officer on record; ask HR to set one';
    END IF;
    IF FOUND AND v_awp.status NOT IN ('DRAFT','RETURNED') THEN
        RAISE EXCEPTION 'AWP has already been submitted';
    END IF;

    IF NOT FOUND THEN
        INSERT INTO public.pms_awps (staff_id, scientist_user_id, reporting_year,
                                     reporting_officer_id, reviewing_officer_id)
        VALUES (p_staff_id, v_staff.user_id, p_year, v_ro, public.pms_awp_director_staff_id())
        RETURNING id INTO v_id;
    ELSE
        v_id := v_awp.id;
        v_ro := coalesce(v_awp.reporting_officer_id, v_ro);
    END IF;

    UPDATE public.pms_awps SET
        status = CASE WHEN v_ro = public.pms_awp_director_staff_id() THEN 'WITH_DIRECTOR' ELSE 'WITH_RO' END,
        reporting_officer_id = v_ro,
        source = 'BLANK_FORWARDED',
        submitted_at = now()
     WHERE id = v_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_BLANK_FORWARDED', 'pms_awps', v_id, '{}');

    PERFORM public.pms_awp_notify(v_ro, 'awp_review_needed', 'Blank Annual Work Plan forwarded',
        'A scientist did not submit an Annual Work Plan for ' || p_year || '. Please take action.');
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_import(p_staff_id text, p_year text, p_payload jsonb, p_status text, p_pdf_path text, p_ro_verdict text, p_ro_date date, p_approved_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_staff    public.staff%ROWTYPE;
    v_ro       text;
    v_director text := public.pms_awp_director_staff_id();
    v_status   text := p_status;
    v_id       uuid;
BEGIN
    IF NOT public.pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can import AWPs'; END IF;
    IF p_status NOT IN ('APPROVED','WITH_DIRECTOR','WITH_RO') THEN RAISE EXCEPTION 'Invalid import status'; END IF;
    IF p_ro_verdict IS NOT NULL AND p_ro_verdict NOT IN ('REASONABLE','NOT_REASONABLE') THEN
        RAISE EXCEPTION 'Invalid verdict';
    END IF;
    SELECT * INTO v_staff FROM public.staff WHERE "ID" = p_staff_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not found'; END IF;
    IF EXISTS (SELECT 1 FROM public.pms_awps WHERE staff_id = p_staff_id AND reporting_year = p_year) THEN
        RAISE EXCEPTION 'AWP already exists for this scientist and year';
    END IF;
    -- OCR / manual-entry mistakes must not land as an approved plan.
    IF public.pms_awp_total(p_payload->'activitySplit') <> 100 THEN
        RAISE EXCEPTION 'Time committed must total 100%%';
    END IF;

    v_ro := coalesce(v_staff."ReportingID",
                     (SELECT d."divHoDID" FROM public.divisions d WHERE d."divCode" = v_staff."Division"));
    IF v_status = 'WITH_RO' AND v_ro IS NULL THEN
        RAISE EXCEPTION 'No Reporting Officer on record; ask HR to set one';
    END IF;
    IF v_status = 'WITH_RO' AND v_ro = v_director THEN v_status := 'WITH_DIRECTOR'; END IF;

    INSERT INTO public.pms_awps (
        staff_id, scientist_user_id, reporting_year, status,
        part_a, activity_split, projects, objectives, development, institutional_work, other,
        reporting_officer_id, reviewing_officer_id,
        ro_verdict, ro_at, director_decision, approved_at, approved_by, communicated_at,
        source, source_pdf_path, submitted_at)
    VALUES (
        p_staff_id, v_staff.user_id, p_year, v_status,
        coalesce(p_payload->'partA', '{}'), coalesce(p_payload->'activitySplit', '[]'),
        coalesce(p_payload->'projects', '[]'), coalesce(p_payload->'objectives', '{}'),
        coalesce(p_payload->'development', '{}'), coalesce(p_payload->>'institutionalWork', ''),
        coalesce(p_payload->>'other', ''),
        v_ro, v_director,
        CASE WHEN v_status = 'WITH_RO' THEN NULL ELSE coalesce(p_ro_verdict, 'REASONABLE') END,
        CASE WHEN v_status = 'WITH_RO' THEN NULL ELSE coalesce(p_ro_date::timestamptz, now()) END,
        CASE WHEN v_status = 'APPROVED' THEN 'ACCEPTED' END,
        CASE WHEN v_status = 'APPROVED' THEN coalesce(p_approved_date::timestamptz, now()) END,
        CASE WHEN v_status = 'APPROVED' THEN auth.uid() END,
        CASE WHEN v_status = 'APPROVED' THEN now() END,
        'IMPORTED', p_pdf_path, now())
    RETURNING id INTO v_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_IMPORTED', 'pms_awps', v_id,
            jsonb_build_object('status', v_status, 'pdf', p_pdf_path));
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_notify(p_staff_id text, p_type text, p_title text, p_body text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $$
    INSERT INTO public.pms_notifications (user_id, type, title, body)
    SELECT s.user_id, p_type, p_title, p_body
      FROM public.staff s WHERE s."ID" = p_staff_id AND s.user_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_redact_projects(p_projects jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
    SELECT coalesce(jsonb_agg(
        CASE WHEN coalesce((p->>'confidential')::boolean, false)
             THEN jsonb_build_object('kind', p->'kind', 'details', '', 'objectives', '',
                                     'resources', '', 'confidential', true)
             ELSE p END), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(p_projects, '[]'::jsonb)) p;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_request_revision(p_awp_id uuid, p_reasons text, p_after jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
    v_me  text := public.caller_staff_id();
    v_id  uuid;
BEGIN
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF NOT COALESCE(
           public.pms_is_admin()
        OR public.user_has_role('Director')
        OR v_me IN (v_awp.staff_id, v_awp.reporting_officer_id, v_awp.reviewing_officer_id), false) THEN
        RAISE EXCEPTION 'Not allowed to revise this AWP';
    END IF;
    IF v_awp.status <> 'APPROVED' THEN RAISE EXCEPTION 'Only an approved AWP can be revised'; END IF;
    -- Lab time (IST), not UTC: 00:00–05:30 IST on 1 Oct is already closed.
    IF (now() AT TIME ZONE 'Asia/Kolkata')::date > make_date(left(v_awp.reporting_year, 4)::int, 9, 30) THEN
        RAISE EXCEPTION 'Revision window (first six months) has closed';
    END IF;
    IF length(trim(coalesce(p_reasons, ''))) < 20 THEN
        RAISE EXCEPTION 'Reasons must be at least 20 characters';
    END IF;
    IF public.pms_awp_total(p_after->'activitySplit') <> 100 THEN
        RAISE EXCEPTION 'Time committed must total 100%%';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pms_awp_revisions WHERE awp_id = p_awp_id AND status = 'PENDING') THEN
        RAISE EXCEPTION 'A revision is already pending';
    END IF;

    INSERT INTO public.pms_awp_revisions (awp_id, initiated_by, reasons, before, after)
    VALUES (p_awp_id, auth.uid(), p_reasons, public.pms_awp_content(v_awp), p_after)
    RETURNING id INTO v_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_REVISION_REQUESTED', 'pms_awps', p_awp_id, jsonb_build_object('revision', v_id));

    PERFORM public.pms_awp_notify(public.pms_awp_director_staff_id(), 'awp_review_needed',
        'Annual Work Plan revision requested',
        'A revision of an Annual Work Plan for ' || v_awp.reporting_year || ' needs your approval.');
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_return(p_awp_id uuid, p_reasons text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
    v_me  text := public.caller_staff_id();
BEGIN
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF NOT COALESCE(
           (public.pms_is_admin() AND v_awp.status <> 'WITH_DIRECTOR')
        OR (v_awp.status = 'WITH_RO'       AND v_me = v_awp.reporting_officer_id)
        OR (v_awp.status = 'WITH_RVO'      AND v_me = v_awp.reviewing_officer_id)
        OR (v_awp.status = 'WITH_DIRECTOR' AND public.user_has_role('Director')), false) THEN
        RAISE EXCEPTION 'Only the current reviewer can return this AWP';
    END IF;
    IF v_awp.status NOT IN ('WITH_RO','WITH_RVO','WITH_DIRECTOR') THEN
        RAISE EXCEPTION 'AWP is not under review';
    END IF;
    IF length(trim(coalesce(p_reasons, ''))) < 20 THEN
        RAISE EXCEPTION 'Reasons must be at least 20 characters';
    END IF;

    UPDATE public.pms_awps SET status = 'RETURNED', return_reasons = p_reasons WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_RETURNED', 'pms_awps', p_awp_id, jsonb_build_object('reasons', p_reasons));

    PERFORM public.pms_awp_notify(v_awp.staff_id, 'awp_returned',
        'Your Annual Work Plan was returned',
        'Please revise your Annual Work Plan for ' || v_awp.reporting_year || ': ' || p_reasons);
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_ro_review(p_awp_id uuid, p_verdict text, p_reasons text, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
    v_director text := public.pms_awp_director_staff_id();
    v_next text;
BEGIN
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF NOT COALESCE(public.caller_staff_id() = v_awp.reporting_officer_id, false) THEN
        RAISE EXCEPTION 'Not the Reporting Officer';
    END IF;
    IF v_awp.status <> 'WITH_RO' THEN RAISE EXCEPTION 'AWP is not waiting for the Reporting Officer'; END IF;
    IF p_verdict NOT IN ('REASONABLE','NOT_REASONABLE') THEN RAISE EXCEPTION 'Invalid verdict'; END IF;
    IF p_verdict = 'NOT_REASONABLE' AND length(trim(coalesce(p_reasons, ''))) < 20 THEN
        RAISE EXCEPTION 'Reasons (at least 20 characters) are required when the plan does not appear reasonable';
    END IF;

    IF p_payload IS NOT NULL THEN
        IF v_awp.source <> 'BLANK_FORWARDED' THEN
            RAISE EXCEPTION 'Only a blank-forwarded AWP can be filled in by the Reporting Officer';
        END IF;
        IF public.pms_awp_total(p_payload->'activitySplit') <> 100 THEN
            RAISE EXCEPTION 'Time committed must total 100%%';
        END IF;
        UPDATE public.pms_awps SET
            part_a             = coalesce(p_payload->'partA', '{}'),
            activity_split     = coalesce(p_payload->'activitySplit', '[]'),
            projects           = coalesce(p_payload->'projects', '[]'),
            objectives         = coalesce(p_payload->'objectives', '{}'),
            development        = coalesce(p_payload->'development', '{}'),
            institutional_work = coalesce(p_payload->>'institutionalWork', ''),
            other              = coalesce(p_payload->>'other', '')
         WHERE id = p_awp_id;
    ELSIF v_awp.source = 'BLANK_FORWARDED' AND public.pms_awp_total(v_awp.activity_split) <> 100 THEN
        RAISE EXCEPTION 'Fill in the blank-forwarded plan before reviewing it';
    END IF;

    v_next := CASE WHEN v_awp.reviewing_officer_id IS NULL OR v_awp.reviewing_officer_id = v_director
                   THEN 'WITH_DIRECTOR' ELSE 'WITH_RVO' END;

    UPDATE public.pms_awps SET status = v_next, ro_verdict = p_verdict, ro_reasons = p_reasons, ro_at = now()
     WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_RO_REVIEWED', 'pms_awps', p_awp_id, jsonb_build_object('verdict', p_verdict));

    PERFORM public.pms_awp_notify(
        CASE v_next WHEN 'WITH_RVO' THEN v_awp.reviewing_officer_id ELSE v_director END,
        'awp_review_needed', 'Annual Work Plan waiting for you',
        'An Annual Work Plan for ' || v_awp.reporting_year || ' needs your review.');
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_rvo_review(p_awp_id uuid, p_remarks text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
BEGIN
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF NOT COALESCE(public.caller_staff_id() = v_awp.reviewing_officer_id, false) THEN
        RAISE EXCEPTION 'Not the Reviewing Officer';
    END IF;
    IF v_awp.status <> 'WITH_RVO' THEN RAISE EXCEPTION 'AWP is not waiting for the Reviewing Officer'; END IF;

    UPDATE public.pms_awps SET status = 'WITH_DIRECTOR', rvo_remarks = p_remarks, rvo_at = now()
     WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_RVO_REVIEWED', 'pms_awps', p_awp_id, '{}');

    PERFORM public.pms_awp_notify(public.pms_awp_director_staff_id(),
        'awp_review_needed', 'Annual Work Plan waiting for you',
        'An Annual Work Plan for ' || v_awp.reporting_year || ' needs your approval.');
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_save_draft(p_staff_id text, p_year text, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_staff public.staff%ROWTYPE;
    v_awp   public.pms_awps%ROWTYPE;
    v_id    uuid;
BEGIN
    SELECT * INTO v_staff FROM public.staff WHERE "ID" = p_staff_id;
    IF NOT FOUND OR v_staff.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Not your Annual Work Plan';
    END IF;

    SELECT * INTO v_awp FROM public.pms_awps
     WHERE staff_id = p_staff_id AND reporting_year = p_year FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.pms_awps (staff_id, scientist_user_id, reporting_year,
                                     reporting_officer_id, reviewing_officer_id)
        VALUES (p_staff_id, auth.uid(), p_year,
                coalesce(v_staff."ReportingID",
                         (SELECT d."divHoDID" FROM public.divisions d WHERE d."divCode" = v_staff."Division")),
                public.pms_awp_director_staff_id())
        RETURNING id INTO v_id;
    ELSIF v_awp.status NOT IN ('DRAFT','RETURNED') THEN
        RAISE EXCEPTION 'AWP can only be edited while DRAFT or RETURNED';
    ELSE
        v_id := v_awp.id;
    END IF;

    UPDATE public.pms_awps SET
        part_a             = coalesce(p_payload->'partA', '{}'),
        activity_split     = coalesce(p_payload->'activitySplit', '[]'),
        projects           = coalesce(p_payload->'projects', '[]'),
        objectives         = coalesce(p_payload->'objectives', '{}'),
        development        = coalesce(p_payload->'development', '{}'),
        institutional_work = coalesce(p_payload->>'institutionalWork', ''),
        other              = coalesce(p_payload->>'other', '')
     WHERE id = v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_set_reviewing_officer(p_awp_id uuid, p_staff_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
BEGIN
    IF NOT public.pms_is_admin() THEN
        RAISE EXCEPTION 'Only PMS administrators can change the Reviewing Officer';
    END IF;
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF v_awp.status NOT IN ('DRAFT','RETURNED','WITH_RO') THEN
        RAISE EXCEPTION 'The Reviewing Officer can only change before the Reporting Officer has reviewed';
    END IF;
    IF p_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff WHERE "ID" = p_staff_id) THEN
        RAISE EXCEPTION 'Staff member not found';
    END IF;

    UPDATE public.pms_awps SET reviewing_officer_id = p_staff_id WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_RVO_SET', 'pms_awps', p_awp_id, jsonb_build_object('reviewing_officer', p_staff_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_submit(p_awp_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
    v_next text;
BEGIN
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.staff s WHERE s."ID" = v_awp.staff_id AND s.user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Not your Annual Work Plan';
    END IF;
    IF v_awp.status NOT IN ('DRAFT','RETURNED') THEN RAISE EXCEPTION 'AWP is not a draft'; END IF;
    IF public.pms_awp_total(v_awp.activity_split) <> 100 THEN
        RAISE EXCEPTION 'Time committed must total 100%%';
    END IF;
    IF v_awp.reporting_officer_id IS NULL THEN
        RAISE EXCEPTION 'No Reporting Officer on record; ask HR to set one';
    END IF;
    -- §5.E.a.i: due 15 May (IST) of the plan's first year, with the
    -- self-appraisal. Late plans go to the RO via pms_awp_forward_blank (§5.E.a.iii).
    IF (now() AT TIME ZONE 'Asia/Kolkata')::date > make_date(left(v_awp.reporting_year, 4)::int, 5, 15) THEN
        RAISE EXCEPTION 'AWP submission deadline (15 May %) has passed; HR can forward it to your Reporting Officer',
            left(v_awp.reporting_year, 4);
    END IF;

    v_next := CASE WHEN v_awp.reporting_officer_id = public.pms_awp_director_staff_id()
                   THEN 'WITH_DIRECTOR' ELSE 'WITH_RO' END;

    UPDATE public.pms_awps SET status = v_next, submitted_at = now(), return_reasons = NULL
     WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_SUBMITTED', 'pms_awps', p_awp_id, jsonb_build_object('status', v_next));

    PERFORM public.pms_awp_notify(
        CASE v_next WHEN 'WITH_RO' THEN v_awp.reporting_officer_id ELSE public.pms_awp_director_staff_id() END,
        'awp_review_needed', 'Annual Work Plan waiting for you',
        'An Annual Work Plan for ' || v_awp.reporting_year || ' needs your review.');
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_sync_staff_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    UPDATE public.pms_awps SET scientist_user_id = NEW.user_id
     WHERE staff_id = NEW."ID" AND scientist_user_id IS DISTINCT FROM NEW.user_id;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_total(p_split jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
    SELECT coalesce(sum((r->>'timePct')::numeric), 0)::int
      FROM jsonb_array_elements(coalesce(p_split, '[]'::jsonb)) r;
$$;

CREATE OR REPLACE FUNCTION public.pms_block_locked_cycle_children()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE
    v_report_id uuid;
    v_cycle_id  uuid;
    v_status    text;
BEGIN
    v_report_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.report_id ELSE NEW.report_id END;
    SELECT cycle_id, status INTO v_cycle_id, v_status
      FROM public.pms_reports WHERE id = v_report_id;
    IF v_cycle_id IS NOT NULL AND public.pms_cycle_locked(v_cycle_id) THEN
        IF TG_TABLE_NAME = 'pms_representations'
           AND v_status IN ('FINALIZED', 'UNDER_GRIEVANCE_REVIEW') THEN
            RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        RAISE EXCEPTION 'PMS cycle is locked (system-wide lock after November 30)';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_block_locked_cycle_reports()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE
    v_cycle_id uuid;
BEGIN
    v_cycle_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.cycle_id ELSE NEW.cycle_id END;
    IF public.pms_cycle_locked(v_cycle_id) THEN
        IF TG_OP = 'UPDATE'
           AND ((OLD.status = 'FINALIZED'              AND NEW.status = 'UNDER_GRIEVANCE_REVIEW')
             OR (OLD.status = 'UNDER_GRIEVANCE_REVIEW' AND NEW.status = 'FINALIZED')) THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'PMS cycle is locked (system-wide lock after November 30)';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_caller_track()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_designation text;
BEGIN
    IF public.user_has_role('Director') THEN
        RETURN 'ANNEXURE_II';
    END IF;

    SELECT trim("Designation") INTO v_designation
      FROM public.staff
     WHERE user_id = auth.uid()
        OR (user_id IS NULL AND lower("Email") = public.caller_email())
     ORDER BY (user_id = auth.uid()) DESC NULLS LAST
     LIMIT 1;

    IF v_designation ~* '^scientist[[:space:]-]*G$'
       OR v_designation ILIKE 'Chief Scientist'
       OR v_designation ILIKE 'Outstanding Scientist'
       OR v_designation ILIKE 'Distinguished Scientist' THEN
        RETURN 'ANNEXURE_I';
    END IF;

    RETURN 'STANDARD';
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_can_read_report_path(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pms_reports r
    WHERE r.id::text = split_part(p_path, '/', 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.pms_check_evaluation_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report_id uuid;
    v_cycle_id  uuid;
    v_total     int;
    v_done      int;
BEGIN
    v_report_id := NEW.report_id;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'COMPLETED')
        INTO v_total, v_done
        FROM pms_evaluations
        WHERE report_id = v_report_id;

    IF v_total > 0 AND v_total = v_done THEN
        UPDATE pms_reports
            SET status = 'EMPOWERED_COMMITTEE_REVIEW', updated_at = now()
            WHERE id = v_report_id AND status = 'UNDER_EVALUATION_COMMITTEE_REVIEW'
            RETURNING cycle_id INTO v_cycle_id;

        INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (NEW.evaluator_id, 'AUTO_ADVANCE_EMPOWERED_COMMITTEE', 'pms_reports', v_report_id,
                jsonb_build_object('trigger', 'all_evaluations_complete'));

        -- Notify configured Empowered Committee members (fallback: role holders)
        INSERT INTO pms_notifications (user_id, type, title, body, report_id)
        SELECT user_id,
               'committee_review_needed',
               'Report ready for Empowered Committee decision',
               'The Evaluation Committee has completed its appraisal. Your final decision is needed.',
               v_report_id
          FROM pms_empowered_committee_members
         WHERE cycle_id = v_cycle_id;

        IF NOT EXISTS (SELECT 1 FROM pms_empowered_committee_members WHERE cycle_id = v_cycle_id) THEN
            INSERT INTO pms_notifications (user_id, type, title, body, report_id)
            SELECT ur.user_id, 'committee_review_needed',
                   'Report ready for Empowered Committee decision',
                   'The Evaluation Committee has completed its appraisal. Your final decision is needed.',
                   v_report_id
              FROM user_roles ur
             WHERE ur.role = 'EmpoweredCommittee';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_committee_panel_valid(p_committee_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT COUNT(*) % 2 = 1
       AND COUNT(*) FILTER (WHERE role = 'REPORTING_OFFICER') >= 1
       AND COUNT(*) FILTER (WHERE role = 'REVIEWING_OFFICER') >= 1
       AND COUNT(*) FILTER (WHERE role = 'EC_MEMBER') >= 1
      FROM pms_evaluation_committee_members
     WHERE committee_id = p_committee_id;
$$;

CREATE OR REPLACE FUNCTION public.pms_condone_delay(p_report_id uuid, p_condoned_until date, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    IF NOT COALESCE(public.pms_is_admin() OR public.user_has_role('Director'), false) THEN
        RAISE EXCEPTION 'Only the Director or PMS administrators can condone a delay';
    END IF;

    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'DRAFT' THEN RAISE EXCEPTION 'Only a DRAFT report can be condoned'; END IF;
    IF p_condoned_until IS NULL OR p_condoned_until < public.ist_today() THEN
        RAISE EXCEPTION 'Condoned-until date must be today or later';
    END IF;
    IF p_condoned_until > public.pms_deadline(v_report.cycle_id, 'EC_COMPLETION') THEN
        RAISE EXCEPTION 'Condoned-until date cannot be after the Evaluation Committee deadline (June 30)';
    END IF;
    IF length(trim(coalesce(p_reason, ''))) < 20 THEN
        RAISE EXCEPTION 'Reason must be at least 20 characters';
    END IF;

    INSERT INTO public.pms_condonations (report_id, condoned_until, reason, condoned_by)
    VALUES (p_report_id, p_condoned_until, p_reason, auth.uid())
    ON CONFLICT (report_id) DO UPDATE
        SET condoned_until = EXCLUDED.condoned_until,
            reason         = EXCLUDED.reason,
            condoned_by    = EXCLUDED.condoned_by,
            created_at     = now();

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'DELAY_CONDONED', 'pms_reports', p_report_id,
            jsonb_build_object('condoned_until', p_condoned_until, 'reason', p_reason));

    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'delay_condoned',
            'Late submission allowed',
            'The Director has condoned the delay. You may submit your self-appraisal until '
                || to_char(p_condoned_until, 'DD Mon YYYY') || '.',
            p_report_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_cycle_locked(p_cycle_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT public.ist_today() > public.pms_deadline(p_cycle_id, 'SYSTEM_LOCK');
$$;

CREATE OR REPLACE FUNCTION public.pms_deadline(p_cycle_id uuid, p_kind text)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT CASE p_kind
        WHEN 'SELF_APPRAISAL'       THEN make_date(extract(year FROM end_date)::int, 5, 15)
        WHEN 'EC_COMPLETION'        THEN make_date(extract(year FROM end_date)::int, 6, 30)
        WHEN 'EMPOWERED_COMPLETION' THEN make_date(extract(year FROM end_date)::int, 7, 31)
        WHEN 'SYSTEM_LOCK'          THEN make_date(extract(year FROM end_date)::int, 11, 30)
    END
    FROM appraisal_cycles WHERE id = p_cycle_id;
$$;

CREATE OR REPLACE FUNCTION public.pms_decisions_require_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.ec_action IS NULL
       AND EXISTS (SELECT 1 FROM public.pms_reports r WHERE r.id = NEW.report_id AND r.proforma_version = '2026') THEN
        RAISE EXCEPTION 'A 2026 report is finalized with pms_finalize_report_2026 (concur, upgrade or downgrade)';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_delay_report(p_cycle_id uuid)
 RETURNS TABLE(report_id uuid, scientist text, status text, step smallint, due date, days_late integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_today date := public.ist_today();
BEGIN
    IF NOT coalesce(public.pms_is_admin() OR public.caller_has_role('Director'), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN QUERY
    WITH r AS (
        SELECT pr.id, pr.status, pr.score_communicated_at, rep.status AS rep_status, rep.submitted_at AS rep_at,
               coalesce((SELECT s."Name" FROM public.staff s WHERE s.user_id = pr.scientist_id LIMIT 1), pr.scientist_id::text) AS who,
               greatest(public.pms_annexure_b_due(p_cycle_id, 2::smallint),
                        (SELECT c.condoned_until FROM public.pms_condonations c WHERE c.report_id = pr.id)) AS self_due
          FROM public.pms_reports pr
          LEFT JOIN public.pms_representations rep ON rep.report_id = pr.id
         WHERE pr.cycle_id = p_cycle_id AND pr.status <> 'NOT_ASSESSED'
    ), late AS (
        SELECT r.id, r.who, r.status, 2::smallint AS step, r.self_due AS due FROM r WHERE r.status = 'DRAFT'
        UNION ALL
        SELECT r.id, r.who, r.status, 3::smallint, public.pms_annexure_b_due(p_cycle_id, 3::smallint) FROM r
         WHERE r.status IN ('SUBMITTED', 'UNDER_EVALUATION_COMMITTEE_REVIEW')
        UNION ALL
        SELECT r.id, r.who, r.status, 4::smallint, public.pms_annexure_b_due(p_cycle_id, 4::smallint) FROM r
         WHERE r.status = 'EMPOWERED_COMMITTEE_REVIEW'
        UNION ALL
        SELECT r.id, r.who, r.status, 7::smallint, ((r.rep_at AT TIME ZONE 'Asia/Kolkata') + interval '1 month')::date FROM r
         WHERE r.rep_status = 'PENDING'
    )
    SELECT l.id, l.who, l.status, l.step, l.due, (v_today - l.due)::int
      FROM late l WHERE v_today > l.due
     ORDER BY l.step, l.due, l.who;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_designation_key(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT initcap(regexp_replace(btrim(coalesce(p, '')), '\s*-\s*', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.pms_empowered_committee_valid(p_cycle_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT COUNT(*) FILTER (WHERE NOT is_chairman) IN (3,5,7)
       AND COUNT(*) FILTER (WHERE is_chairman) = 1
      FROM pms_empowered_committee_members
     WHERE cycle_id = p_cycle_id;
$$;

CREATE OR REPLACE FUNCTION public.pms_evaluations_guard_2026()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon')
       AND (NEW.total_score IS NOT NULL OR NEW.status = 'COMPLETED')
       AND EXISTS (SELECT 1 FROM public.pms_reports r WHERE r.id = NEW.report_id AND r.proforma_version = '2026') THEN
        RAISE EXCEPTION 'A 2026 report gets one panel score, recorded by the Reporting Officer';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_evaluations_guard_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon')
       AND (NEW.report_id IS DISTINCT FROM OLD.report_id
            OR NEW.evaluator_id IS DISTINCT FROM OLD.evaluator_id) THEN
        RAISE EXCEPTION 'An evaluation cannot be moved to another report or evaluator';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_finalize_report(p_report_id uuid, p_final_score integer, p_justification text, p_reasons_outstanding text DEFAULT NULL::text, p_reasons_below text DEFAULT NULL::text, p_suggestions text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'EMPOWERED_COMMITTEE_REVIEW' THEN
        RAISE EXCEPTION 'Report is not in EMPOWERED_COMMITTEE_REVIEW status';
    END IF;
    IF NOT COALESCE(public.pms_is_admin()
            OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members
                        WHERE cycle_id = v_report.cycle_id AND user_id = auth.uid()), false) THEN
        RAISE EXCEPTION 'Only Empowered Committee members can finalize reports';
    END IF;
    IF NOT public.pms_empowered_committee_valid(v_report.cycle_id) THEN
        RAISE EXCEPTION 'Empowered Committee configuration is invalid: needs 3, 5, or 7 members plus the Director/DG as Chairman';
    END IF;
    IF p_final_score IS NULL OR p_final_score < 0 OR p_final_score > 100 THEN
        RAISE EXCEPTION 'Final score must be an integer between 0 and 100';
    END IF;
    IF length(trim(p_justification)) < 50 THEN
        RAISE EXCEPTION 'Justification must be at least 50 characters';
    END IF;
    IF p_final_score >= 90 AND length(trim(coalesce(p_reasons_outstanding, ''))) = 0 THEN
        RAISE EXCEPTION 'Scores of 90 or above require reasons_for_outstanding';
    END IF;
    IF p_final_score <= 75 AND (length(trim(coalesce(p_reasons_below, ''))) = 0
                                 OR length(trim(coalesce(p_suggestions, ''))) = 0) THEN
        RAISE EXCEPTION 'Scores of 75 or below require reasons_below_threshold and suggestions_for_improvement';
    END IF;

    INSERT INTO public.pms_committee_decisions
        (report_id, decided_by, final_score, justification,
         reasons_for_outstanding, reasons_below_threshold, suggestions_for_improvement)
    VALUES
        (p_report_id, auth.uid(), p_final_score, p_justification,
         p_reasons_outstanding, p_reasons_below, p_suggestions)
    ON CONFLICT (report_id) DO UPDATE
        SET final_score                 = EXCLUDED.final_score,
            justification               = EXCLUDED.justification,
            reasons_for_outstanding     = EXCLUDED.reasons_for_outstanding,
            reasons_below_threshold     = EXCLUDED.reasons_below_threshold,
            suggestions_for_improvement = EXCLUDED.suggestions_for_improvement,
            decided_by                  = EXCLUDED.decided_by;

    UPDATE public.pms_reports
        SET status = 'FINALIZED', score_communicated_at = now(), updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'REPORT_FINALIZED', 'pms_reports', p_report_id,
            jsonb_build_object('final_score', p_final_score));

    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'report_finalized',
            'Your appraisal report has been finalized',
            'The Empowered Committee has assigned your final score. You may submit a representation within 15 days.',
            p_report_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_finalize_report_2026(p_report_id uuid, p_action text, p_final_score integer, p_reasons text, p_suggestions text, p_general_comments text, p_critical_assessment text, p_quorum_present integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report  public.pms_reports%ROWTYPE;
    v_panel   public.pms_panel_scores%ROWTYPE;
    v_members integer;
    v_score   integer;
    v_out     text;
    v_below   text;
    v_sugg    text;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF NOT coalesce(public.pms_is_admin()
            OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members
                        WHERE cycle_id = v_report.cycle_id AND user_id = auth.uid()), false) THEN
        RAISE EXCEPTION 'Only Empowered Committee members can finalize reports';
    END IF;
    IF v_report.proforma_version <> '2026' THEN RAISE EXCEPTION 'Older reports are finalized with pms_finalize_report'; END IF;
    IF v_report.status <> 'EMPOWERED_COMMITTEE_REVIEW' THEN
        RAISE EXCEPTION 'Report is not in EMPOWERED_COMMITTEE_REVIEW status';
    END IF;
    IF NOT public.pms_empowered_committee_valid(v_report.cycle_id) THEN
        RAISE EXCEPTION 'Empowered Committee configuration is invalid: needs 3, 5, or 7 members plus the Director/DG as Chairman';
    END IF;
    SELECT * INTO v_panel FROM public.pms_panel_scores WHERE report_id = p_report_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The Evaluation Committee has not recorded its panel score'; END IF;

    SELECT count(*) FILTER (WHERE NOT is_chairman) INTO v_members
      FROM public.pms_empowered_committee_members WHERE cycle_id = v_report.cycle_id;
    IF p_quorum_present IS NULL OR p_quorum_present > v_members + 1 OR (p_quorum_present - 1) * 2 < v_members THEN
        RAISE EXCEPTION 'Quorum: the Chairman and at least half of the % members must be present', v_members;
    END IF;

    IF p_action = 'CONCUR' THEN
        v_score := v_panel.score;
        v_out := v_panel.reasons_for_outstanding;
        v_below := v_panel.reasons_below_threshold;
        v_sugg := v_panel.suggestions_for_improvement;
    ELSIF p_action IN ('UPGRADE', 'DOWNGRADE') THEN
        IF p_final_score IS NULL OR p_final_score < 0 OR p_final_score > 100 THEN
            RAISE EXCEPTION 'The score is a whole number from 0 to 100';
        END IF;
        IF (p_action = 'UPGRADE' AND p_final_score <= v_panel.score) OR (p_action = 'DOWNGRADE' AND p_final_score >= v_panel.score) THEN
            RAISE EXCEPTION 'To % the score must be % than the panel''s %', lower(p_action),
                CASE p_action WHEN 'UPGRADE' THEN 'higher' ELSE 'lower' END, v_panel.score;
        END IF;
        IF length(coalesce(btrim(p_reasons), '')) < 20 THEN
            RAISE EXCEPTION 'Give the reasons for changing the panel''s score';
        END IF;
        v_score := p_final_score;
        v_out := CASE WHEN v_score >= 90 THEN btrim(p_reasons) END;
        v_below := CASE WHEN v_score <= 75 THEN btrim(p_reasons) END;
        v_sugg := nullif(btrim(p_suggestions), '');
        IF v_score <= 75 AND v_sugg IS NULL THEN
            RAISE EXCEPTION 'Scores of 75 or below require suggestions_for_improvement';
        END IF;
    ELSE
        RAISE EXCEPTION 'Concur, upgrade or downgrade';
    END IF;

    INSERT INTO public.pms_committee_decisions
        (report_id, decided_by, final_score, justification, reasons_for_outstanding, reasons_below_threshold,
         suggestions_for_improvement, ec_action, panel_score, general_comments, critical_assessment,
         quorum_present, members_total)
    VALUES (p_report_id, auth.uid(), v_score,
            CASE WHEN p_action = 'CONCUR'
                 THEN 'The Empowered Committee concurs with the Evaluation Committee''s score of ' || v_panel.score || '.'
                 ELSE 'The Empowered Committee ' || lower(p_action) || 's the score from ' || v_panel.score || ' to ' || v_score
                      || ': ' || btrim(p_reasons) END,
            v_out, v_below, v_sugg, p_action, v_panel.score, nullif(btrim(p_general_comments), ''),
            nullif(btrim(p_critical_assessment), ''), p_quorum_present, v_members + 1);

    UPDATE public.pms_reports SET status = 'FINALIZED', score_communicated_at = now(), updated_at = now()
     WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'REPORT_FINALIZED', 'pms_reports', p_report_id,
            jsonb_build_object('final_score', v_score, 'ec_action', p_action, 'panel_score', v_panel.score));
    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'report_finalized', 'Your appraisal report has been finalized',
            'The Empowered Committee has assigned your final score. You may submit a representation within 15 days.',
            p_report_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_finalize_senior_report(p_report_id uuid, p_remarks text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;

    IF NOT (public.pms_is_admin()
            OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members
                        WHERE cycle_id = v_report.cycle_id AND user_id = auth.uid())) THEN
        RAISE EXCEPTION 'Only PMS administrators or Empowered Committee members can finalize senior-track reports';
    END IF;

    IF v_report.track = 'STANDARD' THEN
        RAISE EXCEPTION 'Standard-track reports are finalized with a score via pms_finalize_report';
    END IF;
    IF v_report.status NOT IN ('SUBMITTED','UNDER_EVALUATION_COMMITTEE_REVIEW','EMPOWERED_COMMITTEE_REVIEW') THEN
        RAISE EXCEPTION 'Report cannot be finalized from status %', v_report.status;
    END IF;
    IF length(trim(coalesce(p_remarks, ''))) < 50 THEN
        RAISE EXCEPTION 'Review remarks must be at least 50 characters';
    END IF;

    UPDATE public.pms_reports
        SET status        = 'FINALIZED',
            system_remark = p_remarks,
            updated_at    = now()
        WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'SENIOR_REPORT_FINALIZED', 'pms_reports', p_report_id,
            jsonb_build_object('track', v_report.track));

    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'report_finalized',
            'Your performance mapping proforma has been finalized',
            'The reviewing authority has recorded its evaluation on your report.',
            p_report_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_grade(p_score integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT CASE WHEN p_score IS NULL THEN NULL
              WHEN p_score >= 90 THEN 'Outstanding'
              WHEN p_score >= 85 THEN 'Excellent'
              WHEN p_score >= 75 THEN 'Very Good'
              WHEN p_score >= 60 THEN 'Good'
              WHEN p_score >= 50 THEN 'Satisfactory'
              ELSE 'Need Improvement' END;
$$;

CREATE OR REPLACE FUNCTION public.pms_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT public.proposals_caller_is_admin();
$$;

CREATE OR REPLACE FUNCTION public.pms_is_evaluation_committee_member(p_cycle_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM pms_evaluation_committee_members pcm
          JOIN pms_evaluation_committees pc ON pc.id = pcm.committee_id
         WHERE pc.cycle_id = p_cycle_id
           AND pcm.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.pms_is_grievance_member(p_cycle_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM pms_grievance_members
        WHERE cycle_id = p_cycle_id AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.pms_mark_not_assessed(p_report_id uuid, p_remark text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report pms_reports%ROWTYPE;
BEGIN
    IF NOT pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can mark reports not assessed'; END IF;

    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status IN ('FINALIZED','NOT_ASSESSED') THEN
        RAISE EXCEPTION 'Report is already terminal';
    END IF;
    IF v_report.duty_days IS NULL OR v_report.duty_days >= 90 THEN
        RAISE EXCEPTION 'Report can only be marked NOT_ASSESSED when recorded duty days are below 90';
    END IF;

    UPDATE pms_reports
        SET status = 'NOT_ASSESSED',
            system_remark = coalesce(p_remark,
                'Not assessed: physical duty days (' || v_report.duty_days || ') below the 90-day minimum for the reporting year (2026 PMS guidelines).'),
            updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'MARKED_NOT_ASSESSED', 'pms_reports', p_report_id,
            jsonb_build_object('duty_days', v_report.duty_days));

    INSERT INTO pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'report_not_assessed',
            'Your PMS report was not assessed',
            'Your report was excluded from appraisal because physical duty days were below the 90-day minimum.',
            p_report_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_own_draft(p_report_id uuid)
 RETURNS pms_reports
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v public.pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v FROM public.pms_reports WHERE id = p_report_id AND scientist_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Only the scientist works on their own report'; END IF;
    IF v.status <> 'DRAFT' THEN RAISE EXCEPTION 'The report is no longer a draft'; END IF;
    RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_owns_report_path(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.pms_reports r
        WHERE r.id::text = split_part(p_path, '/', 1)
          AND r.scientist_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.pms_part1_from_staff(p_scientist uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT jsonb_strip_nulls(jsonb_build_object(
        'name', s."Name", 'employeeId', s."ID", 'group', s."Group", 'designation', s."Designation",
        'division', s."Division", 'dateOfBirth', s.dob_date, 'dateOfJoining', s.doj_date,
        'inPresentGradeSince', s.doapp_date, 'category', s."Cat", 'email', s."Email",
        'reportingOfficer', (SELECT ro."Name" FROM public.staff ro WHERE ro."ID" = nullif(s."ReportingID", '')),
        'coreSubjectArea', nullif(s."CoreArea", ''), 'specialization', nullif(s."Expertise", ''),
        'highestQualification', nullif(s."HighestQualification", '')))
      FROM public.staff s WHERE s.user_id = p_scientist LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pms_part1_prefill(p_cycle_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_n integer;
BEGIN
    IF NOT coalesce(public.pms_is_admin(), false) THEN
        RAISE EXCEPTION 'Only Establishment (PMS administrators) pre-fills Part I';
    END IF;
    INSERT INTO public.pms_part1 (report_id, data, prefilled_by, prefilled_at)
    SELECT r.id, d.data, auth.uid(), now()
      FROM public.pms_reports r
      CROSS JOIN LATERAL (SELECT public.pms_part1_from_staff(r.scientist_id) AS data) d
     WHERE r.cycle_id = p_cycle_id AND d.data IS NOT NULL
       AND NOT public.pms_cycle_locked(r.cycle_id)
    ON CONFLICT (report_id) DO UPDATE
       SET data = EXCLUDED.data, prefilled_by = EXCLUDED.prefilled_by, prefilled_at = EXCLUDED.prefilled_at
     WHERE pms_part1.verified_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_part1_report_discrepancy(p_report_id uuid, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.pms_reports WHERE id = p_report_id AND scientist_id = auth.uid()) THEN
        RAISE EXCEPTION 'Only the scientist can report a discrepancy in their Part I';
    END IF;
    IF coalesce(btrim(p_text), '') = '' THEN RAISE EXCEPTION 'Say what is wrong'; END IF;
    UPDATE public.pms_part1
       SET discrepancy = btrim(p_text), discrepancy_at = now(), verified_by = NULL, verified_at = NULL
     WHERE report_id = p_report_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Part I has not been pre-filled yet'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_part1_verify(p_report_id uuid, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT coalesce(public.pms_is_admin(), false) THEN
        RAISE EXCEPTION 'Only Establishment (PMS administrators) verifies Part I';
    END IF;
    IF p_data IS NOT NULL AND jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'Corrections must be an object'; END IF;
    UPDATE public.pms_part1
       SET data = coalesce(p_data, data), verified_by = auth.uid(), verified_at = now()
     WHERE report_id = p_report_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Part I has not been pre-filled yet'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_prefill_from_profile(p_report_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
    v_staff  text;
    v_from   date;
    v_to     date;
    v_n      integer;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    v_report := public.pms_own_draft(p_report_id);
    SELECT "ID" INTO v_staff FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
    IF v_staff IS NULL THEN RAISE EXCEPTION 'Your login is not linked to a staff record. Ask HR to link it.'; END IF;
    SELECT coalesce(v_report.period_from, c.start_date), coalesce(v_report.period_to, c.end_date)
      INTO v_from, v_to FROM public.appraisal_cycles c WHERE c.id = v_report.cycle_id;

    INSERT INTO public.pms_report_items (report_id, section, source_record_type, source_record_id, link, text)
    SELECT p_report_id, f.section, f.record_type, f.record_id, f.link,
           f.title || coalesce(' — ' || nullif(f.role, ''), '')
      FROM public.staff_profile_facts(v_staff, v_from, v_to) f
     WHERE f.section IN ('PROJECT', 'OUTPUT', 'IP', 'TECH_TRANSFER', 'STUDENT', 'COMMITTEE')
    ON CONFLICT (report_id, section, source_record_type, source_record_id) DO UPDATE
       SET text = EXCLUDED.text, link = EXCLUDED.link, updated_at = now()
     WHERE pms_report_items.state = 'PREFILLED' AND pms_report_items.text IS DISTINCT FROM EXCLUDED.text;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_record_non_submission(p_report_id uuid, p_cert_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    IF NOT public.pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can record non-submission'; END IF;

    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'DRAFT' THEN RAISE EXCEPTION 'Report is not in DRAFT status'; END IF;
    IF public.ist_today() <= public.pms_deadline(v_report.cycle_id, 'SELF_APPRAISAL') THEN
        RAISE EXCEPTION 'Non-submission can only be recorded after the May 15 deadline';
    END IF;

    UPDATE public.pms_reports
        SET status = 'SUBMITTED',
            submitted_at = now(),
            non_submission_certificate_path = p_cert_path,
            system_remark = 'Self-appraisal not submitted by May 15. Evaluation Committee may award a zero score or rate strictly on Reporting Officer inputs.',
            updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'NON_SUBMISSION_RECORDED', 'pms_reports', p_report_id,
            jsonb_build_object('certificate', p_cert_path));

    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'non_submission_flagged',
            'Non-submission certificate recorded',
            'You missed the self-appraisal deadline. Your appraisal will proceed on Reporting Officer inputs or a zero score.',
            p_report_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_record_panel_score(p_report_id uuid, p_score integer, p_reasons_outstanding text, p_reasons_below text, p_suggestions text, p_pen_picture jsonb, p_integrity text, p_adverse_remarks text, p_critical_assessment text, p_remarks text, p_quorum_present integer, p_signed_scan_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report  public.pms_reports%ROWTYPE;
    v_total   integer;
    v_missing text;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF NOT coalesce(public.pms_is_admin() OR EXISTS (
            SELECT 1 FROM public.pms_evaluation_committee_members m
             WHERE m.committee_id = v_report.committee_id AND m.user_id = auth.uid() AND m.role = 'REPORTING_OFFICER'), false) THEN
        RAISE EXCEPTION 'The Reporting Officer records the panel''s score';
    END IF;
    IF v_report.proforma_version <> '2026' THEN RAISE EXCEPTION 'Older reports are scored by each member, as before'; END IF;
    IF v_report.status <> 'UNDER_EVALUATION_COMMITTEE_REVIEW' THEN
        RAISE EXCEPTION 'The report is not with the Evaluation Committee';
    END IF;
    IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN RAISE EXCEPTION 'The score is a whole number from 0 to 100'; END IF;
    IF p_score >= 90 AND coalesce(btrim(p_reasons_outstanding), '') = '' THEN
        RAISE EXCEPTION 'Scores of 90 or above require reasons_for_outstanding';
    END IF;
    IF p_score <= 75 AND (coalesce(btrim(p_reasons_below), '') = '' OR coalesce(btrim(p_suggestions), '') = '') THEN
        RAISE EXCEPTION 'Scores of 75 or below require reasons_below_threshold and suggestions_for_improvement';
    END IF;
    SELECT string_agg(i.label, ', ' ORDER BY i.group_code, i.sort) INTO v_missing
      FROM public.pms_pen_picture_items i
     WHERE coalesce(p_pen_picture -> 'ratings' ->> i.item_key, '') NOT IN ('Excellent', 'Very Good', 'Good', 'Needs to be improved');
    IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'Rate every pen-picture item: %', v_missing; END IF;
    IF coalesce(btrim(p_integrity), '') = '' THEN
        RAISE EXCEPTION 'The integrity entry is mandatory (Appendix-B)';
    END IF;
    SELECT count(*) INTO v_total FROM public.pms_evaluation_committee_members WHERE committee_id = v_report.committee_id;
    IF p_quorum_present IS NULL OR p_quorum_present > v_total OR p_quorum_present * 2 < v_total THEN
        RAISE EXCEPTION 'Quorum: at least half of the % members must be present', v_total;
    END IF;

    INSERT INTO public.pms_panel_scores (report_id, committee_id, score, reasons_for_outstanding, reasons_below_threshold,
        suggestions_for_improvement, pen_picture, integrity, adverse_remarks, critical_assessment, remarks,
        quorum_present, members_total, signed_scan_path, recorded_by)
    VALUES (p_report_id, v_report.committee_id, p_score, nullif(btrim(p_reasons_outstanding), ''), nullif(btrim(p_reasons_below), ''),
        nullif(btrim(p_suggestions), ''), p_pen_picture, btrim(p_integrity), nullif(btrim(p_adverse_remarks), ''),
        nullif(btrim(p_critical_assessment), ''), nullif(btrim(p_remarks), ''), p_quorum_present, v_total, p_signed_scan_path, auth.uid());

    UPDATE public.pms_evaluations SET status = 'COMPLETED', updated_at = now() WHERE report_id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'PANEL_SCORE_RECORDED', 'pms_reports', p_report_id,
            jsonb_build_object('score', p_score, 'quorum', p_quorum_present, 'members', v_total));
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_report_designation(p_report_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.pms_designation_key(s."Designation")
    FROM public.pms_reports r JOIN public.staff s ON s.user_id = r.scientist_id
   WHERE r.id = p_report_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pms_report_item_add(p_report_id uuid, p_section text, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.pms_reports WHERE id = p_report_id AND scientist_id = auth.uid()) THEN
        RAISE EXCEPTION 'Only the scientist works on their own report';
    END IF;
    PERFORM public.pms_own_draft(p_report_id);
    IF coalesce(btrim(p_text), '') = '' THEN RAISE EXCEPTION 'Write the item'; END IF;
    INSERT INTO public.pms_report_items (report_id, section, text, state)
    VALUES (p_report_id, coalesce(p_section, 'OTHER'), btrim(p_text), 'ADDED')
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_report_item_set(p_item_id uuid, p_state text, p_text text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_item public.pms_report_items%ROWTYPE;
BEGIN
    SELECT * INTO v_item FROM public.pms_report_items WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.pms_reports WHERE id = v_item.report_id AND scientist_id = auth.uid()) THEN
        RAISE EXCEPTION 'Item not found';
    END IF;
    PERFORM public.pms_own_draft(v_item.report_id);
    IF p_state NOT IN ('CONFIRMED', 'EDITED', 'REMOVED') THEN RAISE EXCEPTION 'Confirm, edit or remove'; END IF;
    IF p_state = 'EDITED' AND coalesce(btrim(p_text), '') = '' THEN RAISE EXCEPTION 'Write the corrected text'; END IF;
    UPDATE public.pms_report_items
       SET state = CASE WHEN p_state = 'EDITED' AND v_item.state = 'ADDED' THEN 'ADDED' ELSE p_state END,
           text = CASE WHEN p_state = 'EDITED' THEN btrim(p_text) ELSE text END,
           updated_at = now()
     WHERE id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_reports_guard_2026_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'INSERT' THEN
            -- pms_caller_track() is what trg_pms_reports_track will set.
            NEW.proforma_version := CASE WHEN coalesce(public.pms_caller_track(), 'STANDARD') = 'STANDARD'
                                         THEN '2026' ELSE 'LEGACY' END;
            NEW.committee_id := NULL;
            NEW.deemed_accepted_at := NULL;
        ELSIF NEW.proforma_version IS DISTINCT FROM OLD.proforma_version
           OR NEW.committee_id IS DISTINCT FROM OLD.committee_id
           OR NEW.deemed_accepted_at IS DISTINCT FROM OLD.deemed_accepted_at THEN
            RAISE EXCEPTION 'proforma, committee and acceptance are written only by the PMS workflow';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_reports_guard_owner_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'INSERT' THEN
            IF NEW.submitted_at                    IS NOT NULL
            OR NEW.duty_days                       IS NOT NULL
            OR NEW.system_remark                   IS NOT NULL
            OR NEW.score_communicated_at           IS NOT NULL
            OR NEW.non_submission_certificate_path IS NOT NULL
            THEN
                RAISE EXCEPTION 'submission, duty days and score fields are written only by the PMS workflow RPCs';
            END IF;
        ELSIF NEW.status                          IS DISTINCT FROM OLD.status
           OR NEW.scientist_id                    IS DISTINCT FROM OLD.scientist_id
           OR NEW.cycle_id                        IS DISTINCT FROM OLD.cycle_id
           OR NEW.submitted_at                    IS DISTINCT FROM OLD.submitted_at
           OR NEW.duty_days                       IS DISTINCT FROM OLD.duty_days
           OR NEW.system_remark                   IS DISTINCT FROM OLD.system_remark
           OR NEW.score_communicated_at           IS DISTINCT FROM OLD.score_communicated_at
           OR NEW.non_submission_certificate_path IS DISTINCT FROM OLD.non_submission_certificate_path
        THEN
            RAISE EXCEPTION
                'status, scores, duty days and cycle are written only by the PMS workflow RPCs'
                USING HINT = 'Use pms_submit_report / pms_finalize_report / pms_mark_not_assessed / pms_set_duty_days.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_reports_set_questionnaire_b()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.questionnaire_b := coalesce((
            SELECT (public.csir_rule('pms.designation_pay_level') ->> public.pms_designation_key(s."Designation"))::int
                   >= public.csir_rule('pms.questionnaire_b_min_pay_level')::int
              FROM public.staff s WHERE s.user_id = NEW.scientist_id LIMIT 1), false);
    ELSE
        NEW.questionnaire_b := OLD.questionnaire_b;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_resolve_representation(p_report_id uuid, p_resolution text, p_revised_score integer DEFAULT NULL::integer, p_reasons_outstanding text DEFAULT NULL::text, p_reasons_below text DEFAULT NULL::text, p_suggestions text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
    v_rep    public.pms_representations%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'UNDER_GRIEVANCE_REVIEW' THEN
        RAISE EXCEPTION 'Report is not under grievance review';
    END IF;
    IF NOT COALESCE(public.pms_is_admin() OR public.pms_is_grievance_member(v_report.cycle_id), false) THEN
        RAISE EXCEPTION 'Only Grievance Committee members can resolve representations';
    END IF;
    SELECT * INTO v_rep FROM public.pms_representations WHERE report_id = p_report_id FOR UPDATE;
    IF NOT FOUND OR v_rep.status <> 'PENDING' THEN
        RAISE EXCEPTION 'There is no pending representation for this report';
    END IF;
    IF length(trim(coalesce(p_resolution, ''))) < 20 THEN
        RAISE EXCEPTION 'Resolution must be at least 20 characters';
    END IF;

    IF p_revised_score IS NOT NULL THEN
        IF p_revised_score < 0 OR p_revised_score > 100 THEN
            RAISE EXCEPTION 'Revised score must be an integer between 0 and 100';
        END IF;
        IF p_revised_score >= 90 AND length(trim(coalesce(p_reasons_outstanding, ''))) = 0 THEN
            RAISE EXCEPTION 'Scores of 90 or above require reasons_for_outstanding';
        END IF;
        IF p_revised_score <= 75 AND (length(trim(coalesce(p_reasons_below, ''))) = 0
                                       OR length(trim(coalesce(p_suggestions, ''))) = 0) THEN
            RAISE EXCEPTION 'Scores of 75 or below require reasons_below_threshold and suggestions_for_improvement';
        END IF;

        UPDATE public.pms_committee_decisions
            SET final_score                 = p_revised_score,
                reasons_for_outstanding     = p_reasons_outstanding,
                reasons_below_threshold     = p_reasons_below,
                suggestions_for_improvement = p_suggestions
            WHERE report_id = p_report_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'This report has no committee score to revise';
        END IF;
    END IF;

    UPDATE public.pms_representations
        SET status = 'RESOLVED', resolution = p_resolution,
            resolved_by = auth.uid(), resolved_at = now()
        WHERE report_id = p_report_id;

    UPDATE public.pms_reports
        SET status = 'FINALIZED', updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'REPRESENTATION_RESOLVED', 'pms_reports', p_report_id,
            jsonb_build_object('revised_score', p_revised_score));

    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'representation_resolved',
            'Your representation has been resolved',
            'The Grievance Redressal Committee has resolved your representation.',
            p_report_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_save_awp_activities(p_report_id uuid, p_activities jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Report not found';
    END IF;
    IF v_report.scientist_id <> (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'Not your report';
    END IF;
    IF v_report.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Activities can only be saved on a DRAFT report';
    END IF;
    IF p_activities IS NOT NULL AND jsonb_typeof(p_activities) <> 'array' THEN
        RAISE EXCEPTION 'p_activities must be a JSON array';
    END IF;

    DELETE FROM public.pms_awp_activities WHERE report_id = p_report_id;

    IF jsonb_array_length(coalesce(p_activities, '[]'::jsonb)) > 0 THEN
        INSERT INTO public.pms_awp_activities (
            report_id, nature_of_activity, role, time_committed_percentage, milestones
        )
        SELECT p_report_id,
               x.nature_of_activity,
               x.role,
               x.time_committed_percentage,
               coalesce(x.milestones, '[]'::jsonb)
          FROM jsonb_to_recordset(p_activities) AS x(
              nature_of_activity text,
              role text,
              time_committed_percentage numeric,
              milestones jsonb
          );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_score_history(p_staff_id text)
 RETURNS TABLE(cycle_id uuid, cycle text, score integer, grade text, lab_average numeric, normalised numeric, remarks text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_user uuid;
BEGIN
    SELECT user_id INTO v_user FROM public.staff WHERE "ID" = p_staff_id;
    IF v_user IS NULL OR auth.uid() IS NULL THEN RETURN; END IF;
    IF NOT coalesce(
           v_user = auth.uid()
        OR public.caller_has_role('Director')
        OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members m
                     JOIN public.appraisal_cycles c ON c.id = m.cycle_id
                    WHERE m.user_id = auth.uid() AND c.status = 'OPEN')
        OR EXISTS (SELECT 1 FROM public.pms_reports r
                     JOIN public.appraisal_cycles c ON c.id = r.cycle_id AND c.status = 'OPEN'
                     JOIN public.pms_evaluation_committee_members m ON m.committee_id = r.committee_id
                    WHERE r.scientist_id = v_user AND m.user_id = auth.uid()
                      AND m.role IN ('REPORTING_OFFICER', 'REVIEWING_OFFICER')),
        false) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT c.id, c.name, d.final_score, public.pms_grade(d.final_score),
           round(avg_.a, 1), round(100.0 * d.final_score / nullif(avg_.a, 0), 1), d.justification
      FROM public.pms_reports r
      JOIN public.appraisal_cycles c ON c.id = r.cycle_id
      JOIN public.pms_committee_decisions d ON d.report_id = r.id
      CROSS JOIN LATERAL (
          SELECT avg(d2.final_score)::numeric AS a
            FROM public.pms_committee_decisions d2
            JOIN public.pms_reports r2 ON r2.id = d2.report_id
           WHERE r2.cycle_id = r.cycle_id AND r2.status IN ('FINALIZED', 'UNDER_GRIEVANCE_REVIEW')) avg_
     WHERE r.scientist_id = v_user AND r.status IN ('FINALIZED', 'UNDER_GRIEVANCE_REVIEW')
     ORDER BY c.end_date DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_set_duty_days(p_report_id uuid, p_duty_days integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report pms_reports%ROWTYPE;
BEGIN
    IF NOT pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can record duty days'; END IF;
    IF p_duty_days IS NULL OR p_duty_days < 0 THEN RAISE EXCEPTION 'Duty days must be zero or more'; END IF;

    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status IN ('FINALIZED','NOT_ASSESSED') THEN
        RAISE EXCEPTION 'Report is already terminal';
    END IF;

    UPDATE pms_reports SET duty_days = p_duty_days, updated_at = now() WHERE id = p_report_id;

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'DUTY_DAYS_RECORDED', 'pms_reports', p_report_id,
            jsonb_build_object('duty_days', p_duty_days));
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_set_report_track()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.track := coalesce(public.pms_caller_track(), 'STANDARD');
    ELSE
        NEW.track := OLD.track;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_submit_report(p_report_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report  public.pms_reports%ROWTYPE;
    v_cycle   public.appraisal_cycles%ROWTYPE;
    v_until   date;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.scientist_id <> auth.uid() THEN RAISE EXCEPTION 'Not your report'; END IF;
    IF v_report.status <> 'DRAFT' THEN RAISE EXCEPTION 'Report is not in DRAFT status'; END IF;
    IF v_report.period_from IS NULL OR v_report.period_to IS NULL THEN
        RAISE EXCEPTION 'period_from and period_to must be set before submitting';
    END IF;

    SELECT * INTO v_cycle FROM public.appraisal_cycles WHERE id = v_report.cycle_id;
    IF v_cycle.status <> 'OPEN' THEN RAISE EXCEPTION 'Appraisal cycle is not OPEN'; END IF;

    SELECT condoned_until INTO v_until FROM public.pms_condonations WHERE report_id = p_report_id;
    IF public.ist_today() > greatest(public.pms_deadline(v_report.cycle_id, 'SELF_APPRAISAL'), v_until) THEN
        RAISE EXCEPTION 'Self-appraisal deadline (May 15) has passed; ask the Director to condone the delay';
    END IF;

    IF v_report.duty_days IS NOT NULL AND v_report.duty_days < 90 THEN
        RAISE EXCEPTION 'Physical duty days below 90; report is not assessable under 2026 guidelines';
    END IF;

    UPDATE public.pms_reports
        SET status = 'SUBMITTED', submitted_at = now(), updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'SUBMIT', 'pms_reports', p_report_id,
            CASE WHEN v_until IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('condoned_until', v_until) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_submit_representation(p_report_id uuid, p_grounds text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_report pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.scientist_id <> auth.uid() THEN RAISE EXCEPTION 'Not your report'; END IF;
    IF v_report.status <> 'FINALIZED' THEN RAISE EXCEPTION 'Report is not FINALIZED'; END IF;
    IF v_report.score_communicated_at IS NULL
       OR now() > v_report.score_communicated_at + interval '15 days' THEN
        RAISE EXCEPTION 'Representation window (15 days after score communication) has closed';
    END IF;
    IF (SELECT COUNT(*) FROM pms_grievance_members WHERE cycle_id = v_report.cycle_id) <> 5 THEN
        RAISE EXCEPTION 'Grievance Redressal Committee (5 members) is not configured for this cycle';
    END IF;

    INSERT INTO pms_representations (report_id, scientist_id, grounds)
    VALUES (p_report_id, auth.uid(), p_grounds);

    UPDATE pms_reports
        SET status = 'UNDER_GRIEVANCE_REVIEW', updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'REPRESENTATION_SUBMITTED', 'pms_reports', p_report_id, '{}');

    INSERT INTO pms_notifications (user_id, type, title, body, report_id)
    SELECT user_id, 'representation_submitted',
           'A representation needs Grievance Committee review',
           'A scientist has submitted a representation against their finalized PMS score.',
           p_report_id
      FROM pms_grievance_members
     WHERE cycle_id = v_report.cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_timeline_status(p_cycle_id uuid)
 RETURNS TABLE(step smallint, label text, due date, done integer, pending integer, overdue integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_today date := public.ist_today();
BEGIN
    IF NOT coalesce(public.pms_is_admin() OR public.caller_has_role('Director'), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN QUERY
    WITH r AS (
        SELECT pr.*, rep.status AS rep_status, rep.submitted_at AS rep_at, rep.resolved_at AS rep_resolved_at,
               greatest(public.pms_annexure_b_due(p_cycle_id, 2::smallint),
                        (SELECT c.condoned_until FROM public.pms_condonations c WHERE c.report_id = pr.id)) AS self_due
          FROM public.pms_reports pr
          LEFT JOIN public.pms_representations rep ON rep.report_id = pr.id
         WHERE pr.cycle_id = p_cycle_id AND pr.status <> 'NOT_ASSESSED'
    ), s AS (
        SELECT 1::smallint AS step, 'Distribute PMS'::text AS label,
               count(*)::int AS done, 0 AS pending, 0 AS overdue FROM r
        UNION ALL
        SELECT 2::smallint, 'Self-appraisal and AWP',
               count(*) FILTER (WHERE r.status <> 'DRAFT')::int,
               count(*) FILTER (WHERE r.status = 'DRAFT')::int,
               count(*) FILTER (WHERE r.status = 'DRAFT' AND v_today > r.self_due)::int FROM r
        UNION ALL
        SELECT 3::smallint, 'Evaluation Committee',
               count(*) FILTER (WHERE r.status IN ('EMPOWERED_COMMITTEE_REVIEW', 'FINALIZED', 'UNDER_GRIEVANCE_REVIEW'))::int,
               count(*) FILTER (WHERE r.status IN ('SUBMITTED', 'UNDER_EVALUATION_COMMITTEE_REVIEW'))::int,
               count(*) FILTER (WHERE r.status IN ('SUBMITTED', 'UNDER_EVALUATION_COMMITTEE_REVIEW')
                                  AND v_today > public.pms_annexure_b_due(p_cycle_id, 3::smallint))::int FROM r
        UNION ALL
        SELECT 4::smallint, 'Empowered Committee',
               count(*) FILTER (WHERE r.status IN ('FINALIZED', 'UNDER_GRIEVANCE_REVIEW'))::int,
               count(*) FILTER (WHERE r.status = 'EMPOWERED_COMMITTEE_REVIEW')::int,
               count(*) FILTER (WHERE r.status = 'EMPOWERED_COMMITTEE_REVIEW'
                                  AND v_today > public.pms_annexure_b_due(p_cycle_id, 4::smallint))::int FROM r
        UNION ALL
        SELECT 5::smallint, 'Communicate PMS',
               count(*) FILTER (WHERE r.score_communicated_at IS NOT NULL)::int,
               count(*) FILTER (WHERE r.status = 'EMPOWERED_COMMITTEE_REVIEW')::int,
               count(*) FILTER (WHERE r.status = 'EMPOWERED_COMMITTEE_REVIEW'
                                  AND v_today > public.pms_annexure_b_due(p_cycle_id, 5::smallint))::int FROM r
        UNION ALL
        SELECT 6::smallint, 'Accept or represent (15 days)',
               count(*) FILTER (WHERE r.deemed_accepted_at IS NOT NULL OR r.rep_at IS NOT NULL)::int,
               count(*) FILTER (WHERE r.score_communicated_at IS NOT NULL AND r.deemed_accepted_at IS NULL AND r.rep_at IS NULL)::int,
               count(*) FILTER (WHERE r.score_communicated_at IS NOT NULL AND r.deemed_accepted_at IS NULL AND r.rep_at IS NULL
                                  AND v_today > (r.score_communicated_at AT TIME ZONE 'Asia/Kolkata')::date + 15)::int FROM r
        UNION ALL
        SELECT 7::smallint, 'Dispose representation (1 month)',
               count(*) FILTER (WHERE r.rep_status = 'RESOLVED')::int,
               count(*) FILTER (WHERE r.rep_status = 'PENDING')::int,
               count(*) FILTER (WHERE r.rep_status = 'PENDING'
                                  AND v_today > ((r.rep_at AT TIME ZONE 'Asia/Kolkata') + interval '1 month')::date)::int FROM r
        UNION ALL
        SELECT 8::smallint, 'Communicate decision on representation',
               count(*) FILTER (WHERE r.rep_status = 'RESOLVED')::int,
               count(*) FILTER (WHERE r.rep_status = 'PENDING')::int,
               count(*) FILTER (WHERE r.rep_status = 'PENDING' AND v_today > public.pms_annexure_b_due(p_cycle_id, 8::smallint))::int FROM r
        UNION ALL
        SELECT 9::smallint, 'Close and take on record',
               count(*) FILTER (WHERE r.status = 'FINALIZED' AND coalesce(r.rep_status, 'RESOLVED') = 'RESOLVED')::int,
               count(*) FILTER (WHERE NOT (r.status = 'FINALIZED' AND coalesce(r.rep_status, 'RESOLVED') = 'RESOLVED'))::int,
               count(*) FILTER (WHERE NOT (r.status = 'FINALIZED' AND coalesce(r.rep_status, 'RESOLVED') = 'RESOLVED')
                                  AND v_today > public.pms_annexure_b_due(p_cycle_id, 9::smallint))::int FROM r
    )
    SELECT s.step, s.label, public.pms_annexure_b_due(p_cycle_id, s.step), s.done, s.pending, s.overdue
      FROM s ORDER BY s.step;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_timeline_sweep()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_n integer;
BEGIN
    UPDATE public.pms_reports pr
       SET deemed_accepted_at = now()
     WHERE pr.status = 'FINALIZED'
       AND pr.score_communicated_at IS NOT NULL
       AND pr.deemed_accepted_at IS NULL
       AND public.ist_today() > (pr.score_communicated_at AT TIME ZONE 'Asia/Kolkata')::date + 15
       AND NOT EXISTS (SELECT 1 FROM public.pms_representations rep WHERE rep.report_id = pr.id)
       AND NOT public.pms_cycle_locked(pr.cycle_id);
    GET DIAGNOSTICS v_n = ROW_COUNT;

    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    -- Representation not disposed within a month → grievance members and PMS admins.
    SELECT DISTINCT w.user_id, 'pms-representation-overdue', 'warning', 'Representation overdue',
           'A PMS representation received on ' || to_char(rep.submitted_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY')
               || ' is not yet disposed (one month allowed)',
           '/pms/grievance', 'rule', 'pms-rep-overdue:' || rep.id
      FROM public.pms_representations rep
      JOIN public.pms_reports pr ON pr.id = rep.report_id
      JOIN (SELECT g.cycle_id, g.user_id FROM public.pms_grievance_members g
            UNION SELECT c.id, ur.user_id FROM public.appraisal_cycles c
                    CROSS JOIN public.user_roles ur WHERE ur.role IN ('HRAdmin', 'MasterAdmin')) w ON w.cycle_id = pr.cycle_id
     WHERE rep.status = 'PENDING'
       AND public.ist_today() > ((rep.submitted_at AT TIME ZONE 'Asia/Kolkata') + interval '1 month')::date
    UNION ALL
    -- Empowered Committee past 31 July → its members.
    SELECT m.user_id, 'pms-empowered-overdue', 'warning', 'PMS decision overdue',
           'A report has waited for the Empowered Committee since 31 July',
           '/pms/committee', 'rule', 'pms-ec-overdue:' || pr.id
      FROM public.pms_reports pr
      JOIN public.pms_empowered_committee_members m ON m.cycle_id = pr.cycle_id
     WHERE pr.status = 'EMPOWERED_COMMITTEE_REVIEW'
       AND public.ist_today() > public.pms_annexure_b_due(pr.cycle_id, 4::smallint)
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_create(p_post_code text, p_group text, p_level text, p_designation text, p_discipline text, p_division text, p_category text, p_sanction_ref text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT public.caller_has_role('HRAdmin') AND NOT public.caller_has_role('MasterAdmin') THEN
        RAISE EXCEPTION 'Only HR keeps the post register';
    END IF;
    IF coalesce(btrim(p_post_code), '') = '' OR coalesce(btrim(p_group), '') = '' OR coalesce(btrim(p_designation), '') = '' THEN
        RAISE EXCEPTION 'Give the post code, group and designation';
    END IF;
    INSERT INTO public.sanctioned_posts (post_code, staff_group, level, designation, discipline, division_code, category,
                                         state, vacant_since, sanction_ref)
    VALUES (btrim(p_post_code), btrim(p_group), nullif(btrim(p_level), ''), btrim(p_designation), nullif(btrim(p_discipline), ''),
            nullif(btrim(p_division), ''), nullif(btrim(p_category), ''), 'VACANT', public.ist_today(), nullif(btrim(p_sanction_ref), ''))
    RETURNING id INTO v_id;
    INSERT INTO public.sanctioned_post_events (post_id, actor, from_state, to_state, effective_on, order_ref, note)
    VALUES (v_id, auth.uid(), NULL, 'VACANT', public.ist_today(), nullif(btrim(p_sanction_ref), ''), 'Post entered in the register');
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_fill(p_post_id uuid, p_staff_id text, p_on date, p_order_ref text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v public.sanctioned_posts%ROWTYPE;
BEGIN
    IF NOT public.caller_has_role('HRAdmin') AND NOT public.caller_has_role('MasterAdmin') THEN
        RAISE EXCEPTION 'Only HR keeps the post register';
    END IF;
    SELECT * INTO v FROM public.sanctioned_posts WHERE id = p_post_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
    IF v.state NOT IN ('VACANT', 'ADVERTISED') THEN RAISE EXCEPTION 'Only a vacant or advertised post can be filled (it is %)', v.state; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.staff WHERE "ID" = p_staff_id) THEN RAISE EXCEPTION 'No staff member %', p_staff_id; END IF;
    IF EXISTS (SELECT 1 FROM public.sanctioned_posts WHERE holder_staff_id = p_staff_id) THEN
        RAISE EXCEPTION '% already holds a post; vacate it first', p_staff_id;
    END IF;
    IF coalesce(btrim(p_order_ref), '') = '' THEN RAISE EXCEPTION 'Name the appointment order'; END IF;
    UPDATE public.sanctioned_posts SET state = 'FILLED', holder_staff_id = p_staff_id, vacant_since = NULL WHERE id = p_post_id;
    INSERT INTO public.sanctioned_post_events (post_id, actor, from_state, to_state, staff_id, effective_on, order_ref)
    VALUES (p_post_id, auth.uid(), v.state, 'FILLED', p_staff_id, coalesce(p_on, public.ist_today()), btrim(p_order_ref));
END;
$$;

CREATE OR REPLACE FUNCTION public.post_set_state(p_post_id uuid, p_state text, p_order_ref text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v public.sanctioned_posts%ROWTYPE;
BEGIN
    IF NOT public.caller_has_role('HRAdmin') AND NOT public.caller_has_role('MasterAdmin') THEN
        RAISE EXCEPTION 'Only HR keeps the post register';
    END IF;
    SELECT * INTO v FROM public.sanctioned_posts WHERE id = p_post_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
    IF p_state NOT IN ('VACANT', 'ADVERTISED', 'ABEYANCE', 'ABOLISHED') THEN
        RAISE EXCEPTION 'Use post_fill or post_vacate for a holder; this sets VACANT, ADVERTISED, ABEYANCE or ABOLISHED';
    END IF;
    IF v.state = 'FILLED' THEN RAISE EXCEPTION 'The post is held; vacate it first'; END IF;
    IF v.state = 'ABOLISHED' THEN RAISE EXCEPTION 'An abolished post stays abolished'; END IF;
    IF coalesce(btrim(p_order_ref), '') = '' THEN RAISE EXCEPTION 'Name the order'; END IF;
    UPDATE public.sanctioned_posts SET state = p_state,
           vacant_since = CASE WHEN p_state IN ('VACANT', 'ADVERTISED') THEN coalesce(v.vacant_since, public.ist_today()) END
     WHERE id = p_post_id;
    INSERT INTO public.sanctioned_post_events (post_id, actor, from_state, to_state, effective_on, order_ref)
    VALUES (p_post_id, auth.uid(), v.state, p_state, public.ist_today(), btrim(p_order_ref));
END;
$$;

CREATE OR REPLACE FUNCTION public.post_vacate(p_post_id uuid, p_on date, p_reason text, p_order_ref text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v public.sanctioned_posts%ROWTYPE;
BEGIN
    IF NOT public.caller_has_role('HRAdmin') AND NOT public.caller_has_role('MasterAdmin') THEN
        RAISE EXCEPTION 'Only HR keeps the post register';
    END IF;
    SELECT * INTO v FROM public.sanctioned_posts WHERE id = p_post_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
    IF v.state <> 'FILLED' THEN RAISE EXCEPTION 'Only a filled post can fall vacant'; END IF;
    IF p_on IS NULL OR coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'Give the date and the reason (retirement, promotion, transfer …)'; END IF;
    UPDATE public.sanctioned_posts SET state = 'VACANT', holder_staff_id = NULL, vacant_since = p_on WHERE id = p_post_id;
    INSERT INTO public.sanctioned_post_events (post_id, actor, from_state, to_state, staff_id, effective_on, order_ref, note)
    VALUES (p_post_id, auth.uid(), 'FILLED', 'VACANT', v.holder_staff_id, p_on, nullif(btrim(p_order_ref), ''), btrim(p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.profile_consistency_issues(p_staff_id text DEFAULT NULL::text)
 RETURNS TABLE(staff_id text, kind text, record_ref text, detail text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
WITH people AS (
    SELECT s."ID" AS id, s."Name" AS name, s."VidwanID" AS vidwan
      FROM public.staff s
     WHERE (p_staff_id IS NULL OR s."ID" = p_staff_id) AND coalesce(btrim(s."Name"), '') <> ''
), irins_pubs AS (
    SELECT p.id, pub
      FROM people p
      JOIN public.irins_profiles ir ON ir.vidwan_id = p.vidwan
     CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(ir.profile_data -> 'publications') = 'array'
                THEN ir.profile_data -> 'publications' ELSE '[]'::jsonb END) pub
     WHERE coalesce(btrim(pub ->> 'title'), '') <> ''
)
SELECT i.id, 'IRINS_OUTPUT_NOT_IN_SURYA', coalesce(nullif(btrim(i.pub ->> 'doi'), ''), i.pub ->> 'title'),
       'On IRINS, not in SURYA: ' || (i.pub ->> 'title') || coalesce(' (' || nullif(i.pub ->> 'year', '') || ')', '')
  FROM irins_pubs i
 WHERE NOT EXISTS (
        SELECT 1 FROM public.scientific_outputs o
         WHERE (nullif(btrim(i.pub ->> 'doi'), '') IS NOT NULL AND lower(btrim(o.doi)) = lower(btrim(i.pub ->> 'doi')))
            OR regexp_replace(lower(o.title), '[^a-z0-9]', '', 'g') = regexp_replace(lower(i.pub ->> 'title'), '[^a-z0-9]', '', 'g'))
UNION ALL
SELECT p.id, 'OUTPUT_AUTHOR_UNLINKED', a.output_id || ':' || a.pos,
       'Is "' || a.author_name || '" on "' || o.title || '" you?'
  FROM people p
  JOIN public.output_authors a ON a.staff_id IS NULL AND a.link_source IS NULL AND public.person_name_may_be(a.author_name, p.name)
  JOIN public.scientific_outputs o ON o.id = a.output_id
UNION ALL
SELECT p.id, 'PI_NAME_UNLINKED', pr."ProjectID",
       'Is the PI "' || pr."PrincipalInvestigator" || '" of ' || coalesce(pr."ProjectNo", pr."ProjectID") || ' you?'
  FROM people p
  JOIN public.projects pr ON pr.pi_staff_id IS NULL AND public.person_name_may_be(pr."PrincipalInvestigator", p.name)
UNION ALL
SELECT p.id, 'STUDENT_SUPERVISOR_UNLINKED', st."EnrollmentNo",
       'Do you supervise ' || coalesce(st."StudentName", st."EnrollmentNo") || '?'
  FROM people p
  JOIN public.phd_students st
    ON (st.supervisor_staff_id IS NULL AND public.person_name_may_be(st."SupervisorName", p.name))
    OR (st.cosupervisor_staff_id IS NULL AND public.person_name_may_be(st."CoSupervisorName", p.name))
UNION ALL
SELECT DISTINCT p.id, 'AWP_PROJECT_NOT_ON_TEAM', pr."ProjectID",
       'Your work plan ' || w.reporting_year || ' names ' || pr."ProjectNo" || ', but you are not on its team'
  FROM people p
  JOIN public.pms_awps w ON w.staff_id = p.id
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(w.projects) = 'array' THEN w.projects ELSE '[]'::jsonb END) e
  JOIN public.projects pr ON length(btrim(pr."ProjectNo")) >= 4
                         AND strpos(upper(coalesce(e ->> 'details', '')), upper(btrim(pr."ProjectNo"))) > 0
 WHERE coalesce(pr.pi_staff_id, '') <> p.id
   AND NOT EXISTS (SELECT 1 FROM public.project_staff ps WHERE ps.project_id = pr."ProjectID" AND ps.staff_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.proposal_copis c WHERE c.proposal_id = pr.proposal_id AND c.staff_id = p.id)
ORDER BY 1, 2, 3;
$$;

CREATE OR REPLACE FUNCTION public.profile_consistency_sweep()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    s       record;
    v_n     integer := 0;
    v_id    uuid;
    v_event uuid;
BEGIN
    FOR s IN
        SELECT st."ID" AS staff_id, st.user_id, st."Division" AS division,
               count(*) AS issues, string_agg(DISTINCT i.kind, ', ') AS kinds
          FROM public.profile_consistency_issues(NULL) i
          JOIN public.staff st ON st."ID" = i.staff_id
         WHERE st.user_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.contribution_requests c
                            WHERE left(c.dedupe_key, length('profile:' || st."ID" || ':')) = 'profile:' || st."ID" || ':'
                              AND c.status NOT IN ('done', 'declined'))
         GROUP BY st."ID", st.user_id, st."Division"
    LOOP
        v_id := NULL;
        INSERT INTO public.contribution_requests
            (domain, record_ref, division_code, title, reason, link, requested_by, assignee_id, dedupe_key)
        VALUES ('staff', s.staff_id, s.division, 'Check your research profile',
                s.issues || ' item(s) to confirm: ' || s.kinds, '/me', NULL, s.user_id,
                'profile:' || s.staff_id || ':' || public.ist_today())
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id INTO v_id;

        IF v_id IS NOT NULL THEN
            v_n := v_n + 1;
            INSERT INTO public.contribution_request_events (request_id, actor_id, action, from_status, to_status)
            VALUES (v_id, NULL, 'created', NULL, 'open') RETURNING id INTO v_event;
            INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
            VALUES (s.user_id, 'contribution', 'info', 'Check your research profile',
                    s.issues || ' item(s) where your profile and the records disagree',
                    '/work?r=' || v_id, 'contribution:' || v_id || ':' || v_event)
            ON CONFLICT (user_id, dedupe_key) DO NOTHING;
        END IF;
    END LOOP;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_archive(p_project_id text, p_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_pr public.projects%ROWTYPE;
    v_r  public.project_completion_reports%ROWTYPE;
BEGIN
    IF NOT public.project_caller_is_office(p_project_id) THEN
        RAISE EXCEPTION 'Only PME archives a project, and not one of their own';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.stage NOT IN ('CLOSED', 'FORECLOSED') THEN RAISE EXCEPTION 'Only a closed or foreclosed project is archived'; END IF;
    SELECT * INTO v_r FROM public.project_completion_reports WHERE project_id = p_project_id;
    IF v_r.id IS NOT NULL AND v_r.status <> 'APPROVED' THEN
        RAISE EXCEPTION 'The completion report is still in review';
    END IF;
    IF v_r.id IS NULL AND v_pr.proposal_id IS NOT NULL THEN
        RAISE EXCEPTION 'Close the project with an approved completion report first';
    END IF;
    IF v_r.id IS NOT NULL THEN
        IF p_document_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.documents d
             WHERE d.id = p_document_id AND d.entity_type = 'project' AND d.entity_id = p_project_id
               AND d.doc_type = 'completion_report' AND d.owner_id = auth.uid()) THEN
            RAISE EXCEPTION 'Publish the completion report first';
        END IF;
        UPDATE public.documents SET access_tier = 'institute', division_code = v_pr."DivisionCode" WHERE id = p_document_id;
        UPDATE public.project_completion_reports SET published_document_id = p_document_id WHERE id = v_r.id;
    END IF;
    UPDATE public.projects SET stage = 'ARCHIVED' WHERE "ProjectID" = p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_assert_document(p_project_id text, p_document_id uuid, p_type text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
BEGIN
    IF p_document_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.project_documents d
         WHERE d.id = p_document_id AND d.project_id = p_project_id AND d.doc_type = p_type) THEN
        RAISE EXCEPTION 'Upload the signed scan first';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_call_review(p_project_id text, p_due_date date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_pr  public.projects%ROWTYPE;
    v_id  uuid;
    v_pi  uuid;
BEGIN
    IF public.project_caller_is_party(p_project_id)
       OR NOT (public.caller_has_role('Director') OR public.caller_is_pme() OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only the Director or PME can call a review';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING') THEN
        RAISE EXCEPTION 'Only a running project can be called for review';
    END IF;
    IF p_due_date IS NULL OR p_due_date < public.ist_today() THEN RAISE EXCEPTION 'Give a review date from today on'; END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'Say what the review should look at'; END IF;

    INSERT INTO public.project_review_slots (project_id, kind, body, period_label, period_end, due_date, generated, notes)
    VALUES (p_project_id, 'CALLED_REVIEW',
            CASE WHEN public.caller_has_role('Director') THEN 'Review called by the Director' ELSE 'Review called by PME' END,
            'Called ' || to_char(public.ist_today(), 'DD Mon YYYY'), p_due_date, p_due_date, false, btrim(p_reason))
    ON CONFLICT (project_id, kind, period_end) DO UPDATE SET notes = EXCLUDED.notes
    RETURNING id INTO v_id;

    SELECT coalesce(
        (SELECT pi_user_id FROM public.proposals WHERE id = v_pr.proposal_id),
        (SELECT user_id FROM public.staff WHERE "ID" = v_pr.pi_staff_id)) INTO v_pi;
    IF v_pi IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
        VALUES (v_pi, 'project_review_called', 'warning',
                'Review called: ' || v_pr."ProjectNo",
                'A review of ' || coalesce(v_pr."ProjectName", v_pr."ProjectNo") || ' is called for '
                    || to_char(p_due_date, 'DD Mon YYYY') || '. ' || btrim(p_reason),
                '/projects/' || p_project_id || '?tab=monitoring', 'rule', 'review_called:' || v_id)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_caller_is_office(p_project_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT (public.caller_is_pme() OR public.caller_has_role('MasterAdmin'))
     AND NOT public.project_caller_is_party(p_project_id);
$$;

CREATE OR REPLACE FUNCTION public.project_caller_is_party(p_project_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects pr
      LEFT JOIN public.proposals p ON p.id = pr.proposal_id
     WHERE pr."ProjectID" = p_project_id
       AND (
         (pr.pi_staff_id IS NOT NULL AND pr.pi_staff_id = public.caller_staff_id())
         OR p.pi_user_id = (SELECT auth.uid())
         OR p.created_by = (SELECT auth.uid())
         OR (p.id IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.proposal_copis c
                WHERE c.proposal_id = p.id AND c.staff_id = public.caller_staff_id()))
       ));
$$;

CREATE OR REPLACE FUNCTION public.project_caller_is_pi(p_project_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects pr
      LEFT JOIN public.proposals p ON p.id = pr.proposal_id
     WHERE pr."ProjectID" = p_project_id
       AND ((pr.pi_staff_id IS NOT NULL AND pr.pi_staff_id = public.caller_staff_id())
            OR p.pi_user_id = (SELECT auth.uid())
            OR p.created_by = (SELECT auth.uid())));
$$;

CREATE OR REPLACE FUNCTION public.project_caller_may_file(p_project_id text, p_doc_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.project_caller_is_office(p_project_id)
      OR (p_doc_type = 'milestone_evidence' AND public.project_caller_is_party(p_project_id))
      OR (p_doc_type IN ('change_request', 'completion_report') AND public.project_caller_is_pi(p_project_id))
      OR (p_doc_type IN ('change_order', 'closure_order') AND NOT public.project_caller_is_party(p_project_id)
          AND (public.caller_has_role('FinanceAdmin') OR public.caller_has_role('Director')
               OR EXISTS (SELECT 1 FROM public.projects pr JOIN public.project_schemes s ON s.code = pr.track
                           WHERE pr."ProjectID" = p_project_id AND s.leader_user_id = (SELECT auth.uid()))));
$$;

CREATE OR REPLACE FUNCTION public.project_category(p_project_id text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT coalesce(
           (SELECT upper(btrim(pr.category_code)) FROM public.proposals pr WHERE pr.id = p.proposal_id),
           CASE WHEN upper(btrim(p."ProjectCategory")) IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP','IST')
                THEN upper(btrim(p."ProjectCategory")) END,
           upper(substring(btrim(p."ProjectNo") FROM '^(FIR|FBR|NCP|FTT|FTC|MMP|FCP|HCP|IST|fir|fbr|ncp|ftt|ftc|mmp|fcp|hcp|ist)[0-9]')))
    FROM public.projects p WHERE p."ProjectID" = p_project_id;
$$;

CREATE OR REPLACE FUNCTION public.project_category_code(p projects)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN upper(left(coalesce(p."ProjectCategory", ''), 3)) IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP','IST')
         AND length(btrim(p."ProjectCategory")) = 3 THEN upper(p."ProjectCategory")
    WHEN upper(left(coalesce(p."ProjectNo", ''), 3)) IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP','IST')
         THEN upper(left(p."ProjectNo", 3))
  END;
$$;

CREATE OR REPLACE FUNCTION public.project_change_apply(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_cr    public.project_change_requests%ROWTYPE;
    v_end   date;
    v_total numeric;
BEGIN
    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = p_id;

    INSERT INTO public.project_budget_lines (project_id, fiscal_year, head, item, amount, source, change_request_id)
    SELECT v_cr.project_id, d.fiscal_year, d.head,
           CASE v_cr.kind WHEN 'REALLOCATION' THEN coalesce(v_cr.payload->>'lab', '') ELSE '' END,
           d.delta, 'CHANGE', p_id
      FROM public.project_change_deltas(v_cr.project_id, v_cr.kind, v_cr.payload) d;

    IF v_cr.kind IN ('RCE', 'REALLOCATION') THEN
        SELECT sum(amount) INTO v_total FROM public.project_budget_lines WHERE project_id = v_cr.project_id;
        UPDATE public.projects SET sanctioned_cost = v_total, "SanctionedCost" = v_total::text
         WHERE "ProjectID" = v_cr.project_id;
    END IF;

    v_end := CASE WHEN v_cr.kind IN ('TIME_OVERRUN', 'RCE') THEN (v_cr.payload->>'new_end_date')::date
                  WHEN v_cr.kind = 'FORECLOSURE' THEN (v_cr.payload->>'effective_date')::date END;
    IF v_end IS NOT NULL THEN
        UPDATE public.projects SET end_date = v_end, "CompletioDate" = v_end::text WHERE "ProjectID" = v_cr.project_id;
    END IF;

    IF v_cr.kind = 'FORECLOSURE' THEN
        UPDATE public.projects SET stage = 'FORECLOSED' WHERE "ProjectID" = v_cr.project_id;
        UPDATE public.project_review_slots SET status = 'CANCELLED'
         WHERE project_id = v_cr.project_id AND status = 'PENDING';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_change_caller_may_act(p_project_id text, p_kind text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT NOT public.project_caller_is_party(p_project_id)
     AND (public.caller_has_role('MasterAdmin')
          OR CASE p_kind
               WHEN 'FINANCE'           THEN public.caller_has_role('FinanceAdmin')
               WHEN 'REVIEW_COMMITTEE'  THEN public.caller_is_pme()
                                          OR EXISTS (SELECT 1 FROM public.projects pr JOIN public.project_schemes s ON s.code = pr.track
                                                      WHERE pr."ProjectID" = p_project_id AND s.leader_user_id = (SELECT auth.uid()))
               WHEN 'DIRECTOR_APPROVAL' THEN public.caller_has_role('Director') OR public.caller_is_pme()
               WHEN 'DIRECTOR_FORWARD'  THEN public.caller_has_role('Director') OR public.caller_is_pme()
               ELSE public.caller_is_pme()
             END);
$$;

CREATE OR REPLACE FUNCTION public.project_change_deltas(p_project_id text, p_kind text, p_payload jsonb)
 RETURNS TABLE(fiscal_year text, head text, delta numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
    v_pr     public.projects%ROWTYPE;
    v_heads  text[] := ARRAY['EQUIPMENT', 'WORKS', 'MANPOWER', 'CONSUMABLES', 'TA_INDIA', 'TA_ABROAD',
                             'CONTINGENCY', 'OUTSOURCING', 'OTHER'];
    v_fy     text := '^[0-9]{4}-[0-9]{2}$';
    v_d      jsonb := '[]'::jsonb;
    v_m      record;
    v_bad    record;
    v_old    numeric;
    v_new    numeric;
BEGIN
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    p_payload := coalesce(p_payload, '{}'::jsonb);

    IF p_kind = 'TIME_OVERRUN' THEN
        IF (p_payload->>'new_end_date') IS NULL THEN RAISE EXCEPTION 'Give the new end date'; END IF;
        IF v_pr.end_date IS NOT NULL AND (p_payload->>'new_end_date')::date <= v_pr.end_date THEN
            RAISE EXCEPTION 'The new end date must be after the current one (%)', v_pr.end_date;
        END IF;

    ELSIF p_kind = 'FORECLOSURE' THEN
        IF (p_payload->>'effective_date') IS NULL THEN RAISE EXCEPTION 'Give the date the project is to close'; END IF;
        IF coalesce(btrim(p_payload->>'cost_benefit'), '') = '' THEN
            RAISE EXCEPTION 'A foreclosure needs a cost-benefit analysis of continuing against stopping (§6.4)';
        END IF;

    ELSIF p_kind = 'REPHASING' THEN
        IF jsonb_array_length(coalesce(p_payload->'moves', '[]')) = 0 THEN RAISE EXCEPTION 'Add at least one amount to carry forward'; END IF;
        FOR v_m IN SELECT * FROM jsonb_to_recordset(p_payload->'moves') AS x(head text, from_year text, to_year text, amount numeric) LOOP
            IF v_m.head IS NULL OR NOT (v_m.head = ANY (v_heads)) THEN RAISE EXCEPTION 'Unknown budget head: %', v_m.head; END IF;
            IF v_m.head IN ('TA_INDIA', 'TA_ABROAD', 'MANPOWER') THEN
                RAISE EXCEPTION 'Unspent travel and project manpower cannot be rephased under any circumstances (§7.2)';
            END IF;
            IF coalesce(v_m.from_year, '') !~ v_fy OR coalesce(v_m.to_year, '') !~ v_fy THEN RAISE EXCEPTION 'Give both financial years'; END IF;
            IF v_m.to_year <= v_m.from_year THEN
                RAISE EXCEPTION 'Rephasing carries unspent money forward to a later year';
            END IF;
            IF coalesce(v_m.amount, 0) <= 0 THEN RAISE EXCEPTION 'Each amount must be above zero'; END IF;
            v_d := v_d || jsonb_build_array(
                jsonb_build_object('fiscal_year', v_m.from_year, 'head', v_m.head, 'delta', -v_m.amount),
                jsonb_build_object('fiscal_year', v_m.to_year,   'head', v_m.head, 'delta',  v_m.amount));
        END LOOP;

    ELSIF p_kind = 'REAPPROPRIATION' THEN
        IF jsonb_array_length(coalesce(p_payload->'moves', '[]')) = 0 THEN RAISE EXCEPTION 'Add at least one amount to move'; END IF;
        FOR v_m IN SELECT * FROM jsonb_to_recordset(p_payload->'moves') AS x(fiscal_year text, from_head text, to_head text, amount numeric) LOOP
            IF v_m.from_head IS NULL OR v_m.to_head IS NULL
               OR NOT (v_m.from_head = ANY (v_heads)) OR NOT (v_m.to_head = ANY (v_heads)) THEN
                RAISE EXCEPTION 'Choose the heads to move money from and to';
            END IF;
            IF v_m.from_head = v_m.to_head THEN RAISE EXCEPTION 'Choose two different heads'; END IF;
            IF public.budget_head_is_capital(v_m.from_head) <> public.budget_head_is_capital(v_m.to_head) THEN
                RAISE EXCEPTION 'Capital cannot be re-appropriated to Revenue, nor Revenue to Capital (§7.2)';
            END IF;
            IF v_m.to_head IN ('TA_INDIA', 'TA_ABROAD') THEN
                RAISE EXCEPTION 'The travel provision cannot be augmented by re-appropriation (§7.2)';
            END IF;
            IF coalesce(v_m.fiscal_year, '') !~ v_fy THEN RAISE EXCEPTION 'Give the financial year'; END IF;
            IF coalesce(v_m.amount, 0) <= 0 THEN RAISE EXCEPTION 'Each amount must be above zero'; END IF;
            v_d := v_d || jsonb_build_array(
                jsonb_build_object('fiscal_year', v_m.fiscal_year, 'head', v_m.from_head, 'delta', -v_m.amount),
                jsonb_build_object('fiscal_year', v_m.fiscal_year, 'head', v_m.to_head,   'delta',  v_m.amount));
        END LOOP;

    ELSIF p_kind = 'REALLOCATION' THEN
        IF v_pr.track IS DISTINCT FROM 'HQ' THEN
            RAISE EXCEPTION 'Reallocation moves money between participating laboratories of an HQ project';
        END IF;
        IF coalesce(btrim(p_payload->>'lab'), '') = '' THEN RAISE EXCEPTION 'Name the other laboratory'; END IF;
        IF coalesce(p_payload->>'direction', '') NOT IN ('OUT', 'IN') THEN RAISE EXCEPTION 'Say whether money goes out or comes in'; END IF;
        IF jsonb_array_length(coalesce(p_payload->'lines', '[]')) = 0 THEN RAISE EXCEPTION 'Add at least one amount'; END IF;
        FOR v_m IN SELECT * FROM jsonb_to_recordset(p_payload->'lines') AS x(fiscal_year text, head text, amount numeric) LOOP
            IF v_m.head IS NULL OR NOT (v_m.head = ANY (v_heads)) THEN RAISE EXCEPTION 'Unknown budget head: %', v_m.head; END IF;
            IF coalesce(v_m.fiscal_year, '') !~ v_fy THEN RAISE EXCEPTION 'Give the financial year'; END IF;
            IF coalesce(v_m.amount, 0) <= 0 THEN RAISE EXCEPTION 'Each amount must be above zero'; END IF;
            IF p_payload->>'direction' = 'IN' AND NOT EXISTS (
                SELECT 1 FROM public.project_head_position(p_project_id) hp WHERE hp.head = v_m.head AND hp.sanctioned > 0) THEN
                RAISE EXCEPTION 'Reallocated money can be used only for items approved under the project; % is not (§7.2)',
                    lower(replace(v_m.head, '_', ' '));
            END IF;
            v_d := v_d || jsonb_build_array(jsonb_build_object('fiscal_year', v_m.fiscal_year, 'head', v_m.head,
                'delta', CASE WHEN p_payload->>'direction' = 'OUT' THEN -v_m.amount ELSE v_m.amount END));
        END LOOP;

    ELSIF p_kind = 'RCE' THEN
        IF jsonb_array_length(coalesce(p_payload->'lines', '[]')) = 0 THEN RAISE EXCEPTION 'Enter the revised budget'; END IF;
        FOR v_m IN SELECT * FROM jsonb_to_recordset(p_payload->'lines') AS x(fiscal_year text, head text, amount numeric) LOOP
            IF v_m.head IS NULL OR NOT (v_m.head = ANY (v_heads)) THEN RAISE EXCEPTION 'Unknown budget head: %', v_m.head; END IF;
            IF coalesce(v_m.fiscal_year, '') !~ v_fy THEN RAISE EXCEPTION 'Give the financial year'; END IF;
            IF v_m.amount IS NULL OR v_m.amount < 0 THEN RAISE EXCEPTION 'Amounts cannot be negative'; END IF;
        END LOOP;
        IF (p_payload->>'new_end_date') IS NOT NULL AND v_pr.end_date IS NOT NULL
           AND (p_payload->>'new_end_date')::date <= v_pr.end_date THEN
            RAISE EXCEPTION 'The new end date must be after the current one (%)', v_pr.end_date;
        END IF;
        SELECT coalesce(sum(amount), 0) INTO v_old FROM public.project_budget_lines WHERE project_id = p_project_id;
        v_old := greatest(v_old, coalesce(v_pr.sanctioned_cost, 0));
        SELECT coalesce(sum(x.amount), 0) INTO v_new FROM jsonb_to_recordset(p_payload->'lines') AS x(amount numeric);
        IF v_new <= v_old THEN
            RAISE EXCEPTION 'A revised cost estimate raises the cost above % ; to move money between heads or years, use re-appropriation or rephasing', v_old;
        END IF;
        -- The revised budget replaces the current one, cell by cell.
        SELECT coalesce(jsonb_agg(jsonb_build_object('fiscal_year', c.fiscal_year, 'head', c.head, 'delta', c.n - c.o)), '[]')
          INTO v_d
          FROM (SELECT k.fiscal_year, k.head,
                       coalesce((SELECT sum(x.amount) FROM jsonb_to_recordset(p_payload->'lines') AS x(fiscal_year text, head text, amount numeric)
                                  WHERE x.fiscal_year = k.fiscal_year AND x.head = k.head), 0) AS n,
                       coalesce((SELECT sum(b.amount) FROM public.project_budget_lines b
                                  WHERE b.project_id = p_project_id AND b.fiscal_year = k.fiscal_year AND b.head = k.head), 0) AS o
                  FROM (SELECT x.fiscal_year, x.head FROM jsonb_to_recordset(p_payload->'lines') AS x(fiscal_year text, head text)
                        UNION
                        SELECT b.fiscal_year, b.head FROM public.project_budget_lines b WHERE b.project_id = p_project_id) k) c
         WHERE c.n <> c.o;
    ELSE
        RAISE EXCEPTION 'Unknown kind of change: %', p_kind;
    END IF;

    -- Only unspent money moves: no year and head may end up with less
    -- sanctioned than has already been spent in it.
    SELECT d.fiscal_year, d.head, coalesce(hp.sanctioned, 0) AS sanctioned, coalesce(hp.spent, 0) AS spent, d.delta
      INTO v_bad
      FROM (SELECT x.fiscal_year, x.head, sum(x.delta) AS delta
              FROM jsonb_to_recordset(v_d) AS x(fiscal_year text, head text, delta numeric)
             GROUP BY 1, 2) d
      LEFT JOIN public.project_head_position(p_project_id) hp ON hp.fiscal_year = d.fiscal_year AND hp.head = d.head
     WHERE d.delta < 0 AND coalesce(hp.sanctioned, 0) + d.delta < greatest(coalesce(hp.spent, 0), 0)
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Only unspent money can move: % in % has ₹% sanctioned and ₹% spent',
            lower(replace(v_bad.head, '_', ' ')), v_bad.fiscal_year,
            to_char(v_bad.sanctioned, 'FM99,99,99,99,990'), to_char(v_bad.spent, 'FM99,99,99,99,990');
    END IF;

    RETURN QUERY
        SELECT x.fiscal_year, x.head, sum(x.delta)
          FROM jsonb_to_recordset(v_d) AS x(fiscal_year text, head text, delta numeric)
         GROUP BY 1, 2
        HAVING sum(x.delta) <> 0
         ORDER BY 1, 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_change_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED', 'WITHDRAWN')
       AND NOT (NEW.status = 'WITHDRAWN' AND OLD.status IN ('DRAFT', 'RETURNED') AND NEW.round = 0) THEN
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'change',
                'Change request (' || lower(replace(NEW.kind, '_', ' ')) || ') ' ||
                CASE NEW.status WHEN 'SUBMITTED' THEN 'submitted'
                                WHEN 'RETURNED'  THEN 'returned for changes'
                                WHEN 'APPROVED'  THEN 'approved' || coalesce(' (' || NEW.order_no || ')', '')
                                WHEN 'REJECTED'  THEN 'rejected'
                                ELSE 'withdrawn' END
                || coalesce(' — ' || NEW.decision_note, ''), NEW.id::text);
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_change_record_step(p_step_id uuid, p_decision text, p_notes text, p_document_id uuid, p_meeting_id uuid DEFAULT NULL::uuid, p_order_no text DEFAULT NULL::text, p_order_date date DEFAULT NULL::date, p_ifd_file_no text DEFAULT NULL::text, p_ifd_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_step public.project_change_steps%ROWTYPE;
    v_cr   public.project_change_requests%ROWTYPE;
    v_pr   public.projects%ROWTYPE;
    v_last boolean;
    v_note text := nullif(btrim(p_notes), '');
    v_word text;
BEGIN
    SELECT * INTO v_step FROM public.project_change_steps WHERE id = p_step_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Step not found'; END IF;
    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = v_step.change_id FOR UPDATE;
    IF NOT public.project_change_caller_may_act(v_cr.project_id, v_step.kind) THEN
        RAISE EXCEPTION 'You cannot record this step on this change request';
    END IF;
    IF v_cr.status NOT IN ('SUBMITTED', 'UNDER_REVIEW') THEN RAISE EXCEPTION 'This change request is not in review'; END IF;
    IF v_step.status <> 'PENDING' OR v_step.round <> v_cr.round THEN RAISE EXCEPTION 'This step has already been recorded'; END IF;
    IF EXISTS (SELECT 1 FROM public.project_change_steps s
                WHERE s.change_id = v_cr.id AND s.round = v_step.round AND s.seq < v_step.seq AND s.status = 'PENDING') THEN
        RAISE EXCEPTION 'An earlier step is still pending';
    END IF;
    IF p_meeting_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.meetings WHERE id = p_meeting_id) THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = v_cr.project_id FOR UPDATE;

    IF p_decision = 'APPROVE' THEN
        PERFORM public.project_assert_document(v_cr.project_id, p_document_id, 'change_order');
        v_last := NOT EXISTS (SELECT 1 FROM public.project_change_steps s
                               WHERE s.change_id = v_cr.id AND s.round = v_step.round AND s.seq > v_step.seq);
        IF v_last AND v_pr.track = 'HQ' AND v_cr.kind <> 'FORECLOSURE'
           AND (coalesce(btrim(p_order_no), '') = '' OR p_order_date IS NULL
                OR coalesce(btrim(p_ifd_file_no), '') = '' OR p_ifd_date IS NULL) THEN
            RAISE EXCEPTION 'The order must state its number and date and the IFD concurrence file number and date; an OM without them is invalid (§7.2)';
        END IF;
        UPDATE public.project_change_steps
           SET status = 'DONE', decided_by = auth.uid(), decided_at = now(), notes = v_note,
               document_id = p_document_id, meeting_id = p_meeting_id
         WHERE id = v_step.id;
        IF v_last THEN
            IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING') THEN
                RAISE EXCEPTION 'The project is no longer running';
            END IF;
            PERFORM public.project_change_apply(v_cr.id);
            UPDATE public.project_change_requests
               SET status = 'APPROVED', decided_at = now(), updated_at = now(), decision_note = v_note,
                   order_no = nullif(btrim(p_order_no), ''), order_date = p_order_date,
                   ifd_file_no = nullif(btrim(p_ifd_file_no), ''), ifd_date = p_ifd_date
             WHERE id = v_cr.id;
            v_word := 'approved';
        ELSE
            UPDATE public.project_change_requests SET status = 'UNDER_REVIEW', updated_at = now() WHERE id = v_cr.id;
        END IF;

    ELSIF p_decision IN ('RETURN', 'REJECT') THEN
        IF v_note IS NULL THEN
            RAISE EXCEPTION '%', CASE p_decision WHEN 'RETURN' THEN 'Say what needs to change' ELSE 'Give the reason for rejection' END;
        END IF;
        UPDATE public.project_change_steps
           SET status = CASE p_decision WHEN 'RETURN' THEN 'RETURNED' ELSE 'REJECTED' END,
               decided_by = auth.uid(), decided_at = now(), notes = v_note,
               document_id = p_document_id, meeting_id = p_meeting_id
         WHERE id = v_step.id;
        UPDATE public.project_change_steps SET status = 'SKIPPED'
         WHERE change_id = v_cr.id AND round = v_step.round AND status = 'PENDING';
        UPDATE public.project_change_requests
           SET status = CASE p_decision WHEN 'RETURN' THEN 'RETURNED' ELSE 'REJECTED' END,
               decision_note = v_note, updated_at = now(),
               decided_at = CASE p_decision WHEN 'REJECT' THEN now() END
         WHERE id = v_cr.id;
        v_word := CASE p_decision WHEN 'RETURN' THEN 'returned for changes' ELSE 'rejected' END;
    ELSE
        RAISE EXCEPTION 'Unknown decision: %', p_decision;
    END IF;

    IF v_word IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
        VALUES (v_cr.created_by, 'project_change_decided',
                CASE WHEN v_word = 'approved' THEN 'info' ELSE 'warning' END,
                'Change request ' || v_word || ': ' || v_pr."ProjectNo",
                initcap(lower(replace(v_cr.kind, '_', ' '))) || ' on ' || coalesce(v_pr."ProjectName", v_pr."ProjectNo")
                    || ' was ' || v_word || coalesce('. ' || v_note, '.'),
                '/projects/' || v_cr.project_id || '?tab=changes', 'rule',
                'change:' || v_cr.id || ':' || v_step.id)
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_change_save(p_id uuid, p_project_id text, p_kind text, p_justification text, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_cr public.project_change_requests%ROWTYPE;
    v_id uuid;
BEGIN
    IF p_id IS NULL THEN
        IF NOT (public.project_caller_is_pi(p_project_id) OR public.project_caller_is_office(p_project_id)) THEN
            RAISE EXCEPTION 'Only the PI or PME can raise a change request on this project';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.projects WHERE "ProjectID" = p_project_id
                                                      AND stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING')) THEN
            RAISE EXCEPTION 'A change can be requested only on a running project';
        END IF;
        IF p_kind NOT IN ('TIME_OVERRUN', 'RCE', 'REPHASING', 'REAPPROPRIATION', 'REALLOCATION', 'FORECLOSURE') THEN
            RAISE EXCEPTION 'Unknown kind of change: %', p_kind;
        END IF;
        INSERT INTO public.project_change_requests (project_id, kind, justification, payload, created_by)
        VALUES (p_project_id, p_kind, coalesce(p_justification, ''), coalesce(p_payload, '{}'::jsonb), auth.uid())
        RETURNING id INTO v_id;
        RETURN v_id;
    END IF;

    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_cr.created_by <> auth.uid() THEN RAISE EXCEPTION 'Change request not found'; END IF;
    IF v_cr.status NOT IN ('DRAFT', 'RETURNED') THEN RAISE EXCEPTION 'A submitted request cannot be edited'; END IF;
    IF p_kind NOT IN ('TIME_OVERRUN', 'RCE', 'REPHASING', 'REAPPROPRIATION', 'REALLOCATION', 'FORECLOSURE') THEN
        RAISE EXCEPTION 'Unknown kind of change: %', p_kind;
    END IF;
    UPDATE public.project_change_requests
       SET kind = p_kind, justification = coalesce(p_justification, ''), payload = coalesce(p_payload, '{}'::jsonb),
           updated_at = now()
     WHERE id = p_id;
    RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_change_step_kinds(p_track text, p_kind text, p_increase_pct numeric)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_track IN ('ULIP', 'OLP') THEN ARRAY['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']
    WHEN p_track = 'EFP' THEN ARRAY['PME_VETTING', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'TIME_OVERRUN' THEN
         ARRAY['PME_VETTING', 'RESEARCH_COUNCIL', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'RCE' AND coalesce(p_increase_pct, 0) <= public.csir_rule('project.cost_overrun_dg_limit_pct')::numeric THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'RCE' THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE',
               'REVISED_COST_COMMITTEE', 'COMPETENT_AUTHORITY']
    WHEN p_kind IN ('REPHASING', 'REAPPROPRIATION', 'REALLOCATION') THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'FORECLOSURE' THEN ARRAY['PME_VETTING', 'MONITORING_COMMITTEE', 'RESEARCH_COUNCIL']
  END;
$$;

CREATE OR REPLACE FUNCTION public.project_change_submit(p_id uuid, p_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_cr    public.project_change_requests%ROWTYPE;
    v_pr    public.projects%ROWTYPE;
    v_pct   numeric;
    v_old   numeric;
    v_new   numeric;
    v_kinds text[];
BEGIN
    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_cr.created_by <> auth.uid() THEN RAISE EXCEPTION 'Change request not found'; END IF;
    IF NOT (public.project_caller_is_pi(v_cr.project_id) OR public.project_caller_is_office(v_cr.project_id)) THEN
        RAISE EXCEPTION 'Only the PI or PME can submit a change request on this project';
    END IF;
    IF v_cr.status NOT IN ('DRAFT', 'RETURNED') THEN RAISE EXCEPTION 'This request has already been submitted'; END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = v_cr.project_id FOR UPDATE;
    IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING') THEN
        RAISE EXCEPTION 'A change can be requested only on a running project';
    END IF;
    IF v_pr.track IS NULL THEN RAISE EXCEPTION 'PME must classify this project as ULIP or HQ first'; END IF;
    IF coalesce(btrim(v_cr.justification), '') = '' THEN RAISE EXCEPTION 'Give the justification'; END IF;
    IF EXISTS (SELECT 1 FROM public.project_change_requests
                WHERE project_id = v_cr.project_id AND id <> p_id AND status IN ('SUBMITTED', 'UNDER_REVIEW')) THEN
        RAISE EXCEPTION 'Another change request on this project is still in review; one at a time';
    END IF;
    PERFORM public.project_assert_document(v_cr.project_id, p_document_id, 'change_request');
    PERFORM 1 FROM public.project_change_deltas(v_cr.project_id, v_cr.kind, v_cr.payload);

    IF v_cr.kind = 'RCE' THEN
        SELECT coalesce(sum(amount), 0) INTO v_old FROM public.project_budget_lines WHERE project_id = v_cr.project_id;
        v_old := greatest(v_old, coalesce(v_pr.sanctioned_cost, 0));
        SELECT coalesce(sum(x.amount), 0) INTO v_new FROM jsonb_to_recordset(v_cr.payload->'lines') AS x(amount numeric);
        v_pct := CASE WHEN v_old > 0 THEN round((v_new - v_old) * 100 / v_old, 2) END;
    END IF;

    v_kinds := public.project_change_step_kinds(v_pr.track, v_cr.kind, v_pct);
    UPDATE public.project_change_requests
       SET status = 'SUBMITTED', round = round + 1, increase_pct = v_pct, request_document_id = p_document_id,
           submitted_at = now(), updated_at = now(), decision_note = NULL
     WHERE id = p_id;
    INSERT INTO public.project_change_steps (change_id, round, seq, kind)
    SELECT p_id, v_cr.round + 1, s.n, s.k FROM unnest(v_kinds) WITH ORDINALITY AS s(k, n);
END;
$$;

CREATE OR REPLACE FUNCTION public.project_change_withdraw(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_cr public.project_change_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_cr.created_by <> auth.uid() THEN RAISE EXCEPTION 'Change request not found'; END IF;
    IF v_cr.status NOT IN ('DRAFT', 'RETURNED', 'SUBMITTED') THEN
        RAISE EXCEPTION 'Review has started; this request can no longer be withdrawn';
    END IF;
    UPDATE public.project_change_steps SET status = 'SKIPPED' WHERE change_id = p_id AND status = 'PENDING';
    UPDATE public.project_change_requests SET status = 'WITHDRAWN', updated_at = now() WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_checklist_b(p_change_request_id uuid)
 RETURNS TABLE(item text, ok boolean, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
    v_cr  public.project_change_requests%ROWTYPE;
    v_pr  public.projects%ROWTYPE;
    v_m   record;
    v_bad text;
    v_err text;
BEGIN
    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = p_change_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found'; END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = v_cr.project_id;

    item := 'kind'; ok := v_cr.kind IN ('REPHASING', 'REAPPROPRIATION');
    detail := CASE WHEN ok THEN initcap(lower(v_cr.kind)) ELSE 'Checklist B covers rephasing and re-appropriation only' END;
    RETURN NEXT;

    item := 'project_running'; ok := v_pr.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD');
    detail := 'Project stage: ' || coalesce(v_pr.stage, 'not set');
    RETURN NEXT;

    -- §7.2: unspent travel and manpower are never rephased; travel is never
    -- augmented by re-appropriation.
    v_bad := NULL;
    IF v_cr.kind = 'REPHASING' THEN
        SELECT string_agg(DISTINCT m.head, ', ') INTO v_bad
          FROM jsonb_to_recordset(coalesce(v_cr.payload->'moves', '[]')) AS m(head text)
         WHERE m.head IN ('TA_INDIA', 'TA_ABROAD', 'MANPOWER');
    ELSIF v_cr.kind = 'REAPPROPRIATION' THEN
        SELECT string_agg(DISTINCT m.to_head, ', ') INTO v_bad
          FROM jsonb_to_recordset(coalesce(v_cr.payload->'moves', '[]')) AS m(to_head text)
         WHERE m.to_head IN ('TA_INDIA', 'TA_ABROAD');
    END IF;
    item := 'travel_manpower'; ok := v_bad IS NULL;
    detail := CASE WHEN ok THEN 'No travel or manpower money moved' ELSE 'Moves ' || v_bad || ' (not allowed, §7.2)' END;
    RETURN NEXT;

    -- Each amount moved is no more than what is unspent under that head and year.
    v_bad := NULL;
    FOR v_m IN
        SELECT coalesce(m.head, m.from_head) AS head, coalesce(m.from_year, m.fiscal_year) AS fy, m.amount
          FROM jsonb_to_recordset(coalesce(v_cr.payload->'moves', '[]'))
               AS m(head text, from_head text, from_year text, fiscal_year text, amount numeric)
    LOOP
        IF v_m.amount > coalesce((SELECT hp.sanctioned - hp.spent FROM public.project_head_position(v_cr.project_id) hp
                                   WHERE hp.fiscal_year = v_m.fy AND hp.head = v_m.head), 0) THEN
            v_bad := coalesce(v_bad || '; ', '') || v_m.head || ' ' || v_m.fy;
        END IF;
    END LOOP;
    item := 'within_unspent'; ok := v_bad IS NULL;
    detail := CASE WHEN ok THEN 'Every amount is within the unspent balance' ELSE 'More than is unspent: ' || v_bad END;
    RETURN NEXT;

    -- The request passes the same rules the approval applies.
    v_err := NULL;
    BEGIN
        PERFORM 1 FROM public.project_change_deltas(v_cr.project_id, v_cr.kind, v_cr.payload);
    EXCEPTION WHEN others THEN
        v_err := SQLERRM;
    END;
    item := 'rules'; ok := v_err IS NULL;
    detail := coalesce(v_err, 'Passes the rephasing and re-appropriation rules');
    RETURN NEXT;

    item := 'signed_request'; ok := v_cr.request_document_id IS NOT NULL;
    detail := CASE WHEN ok THEN 'Signed request on file' ELSE 'Attach the request signed by the PI' END;
    RETURN NEXT;

    item := 'justification'; ok := coalesce(btrim(v_cr.justification), '') <> '';
    detail := CASE WHEN ok THEN 'Justification given' ELSE 'Write why the change is needed' END;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_completion_annexures(p_project_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(a ORDER BY a->>'group', a->>'date'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('group', '1 Sanction', 'label', 'Sanction order ' || coalesce(p.sanction_ref, '(no number)'),
                              'date', p.sanction_date, 'missing', p.sanction_ref IS NULL) AS a
      FROM public.projects p WHERE p."ProjectID" = p_project_id
    UNION ALL
    SELECT jsonb_build_object('group', '2 Orders', 'label',
                              initcap(lower(replace(c.kind, '_', ' '))) || ' order ' || coalesce(c.order_no, '(recorded without a number)')
                                  || coalesce(', IFD ' || c.ifd_file_no, ''),
                              'date', coalesce(c.order_date, c.decided_at::date), 'missing', false)
      FROM public.project_change_requests c WHERE c.project_id = p_project_id AND c.status = 'APPROVED'
    UNION ALL
    SELECT jsonb_build_object('group', '3 Minutes', 'label', s.body || ' (' || s.period_label || ') minutes',
                              'date', s.held_on, 'document_id', s.minutes_document_id, 'missing', s.minutes_document_id IS NULL)
      FROM public.project_review_slots s
     WHERE s.project_id = p_project_id AND s.status = 'DONE' AND s.kind <> 'PROGRESS_REPORT'
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.project_completion_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'closure', 'Completion report started', NEW.id::text);
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('SUBMITTED', 'RETURNED', 'APPROVED') THEN
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'closure',
                'Completion report ' || CASE NEW.status WHEN 'SUBMITTED' THEN 'submitted'
                                                        WHEN 'RETURNED' THEN 'returned for changes'
                                                        ELSE 'approved' END
                || coalesce(' — ' || NEW.decision_note, ''), NEW.id::text);
    ELSIF NEW.published_document_id IS DISTINCT FROM OLD.published_document_id AND NEW.published_document_id IS NOT NULL THEN
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'closure', 'Completion report published to the institute archive', NEW.id::text);
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_completion_missing(r project_completion_reports)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN btrim(r.summary) = ''          THEN 'summary' END,
    CASE WHEN r.objectives_status IS NULL    THEN 'objectives_status' END,
    CASE WHEN r.objectives_status IN ('PARTLY_MET', 'NOT_MET') AND btrim(r.objectives_reason) = '' THEN 'objectives_reason' END,
    CASE WHEN btrim(r.what_worked) = ''      THEN 'what_worked' END,
    CASE WHEN btrim(r.what_did_not) = ''     THEN 'what_did_not' END,
    CASE WHEN btrim(r.recommendations) = ''  THEN 'recommendations' END
  ], NULL);
$$;

CREATE OR REPLACE FUNCTION public.project_completion_record_step(p_step_id uuid, p_decision text, p_notes text, p_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_step public.project_completion_steps%ROWTYPE;
    v_r    public.project_completion_reports%ROWTYPE;
    v_pr   public.projects%ROWTYPE;
    v_note text := nullif(btrim(p_notes), '');
    v_word text;
BEGIN
    SELECT * INTO v_step FROM public.project_completion_steps WHERE id = p_step_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Step not found'; END IF;
    SELECT * INTO v_r FROM public.project_completion_reports WHERE id = v_step.report_id FOR UPDATE;
    IF NOT public.project_change_caller_may_act(v_r.project_id, v_step.kind) THEN
        RAISE EXCEPTION 'You cannot record this step on this completion report';
    END IF;
    IF v_r.status NOT IN ('SUBMITTED', 'UNDER_REVIEW') THEN RAISE EXCEPTION 'This report is not in review'; END IF;
    IF v_step.status <> 'PENDING' OR v_step.round <> v_r.round THEN RAISE EXCEPTION 'This step has already been recorded'; END IF;
    IF EXISTS (SELECT 1 FROM public.project_completion_steps s
                WHERE s.report_id = v_r.id AND s.round = v_step.round AND s.seq < v_step.seq AND s.status = 'PENDING') THEN
        RAISE EXCEPTION 'An earlier step is still pending';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = v_r.project_id FOR UPDATE;

    IF p_decision = 'APPROVE' THEN
        PERFORM public.project_assert_document(v_r.project_id, p_document_id, 'closure_order');
        UPDATE public.project_completion_steps
           SET status = 'DONE', decided_by = auth.uid(), decided_at = now(), notes = v_note, document_id = p_document_id
         WHERE id = v_step.id;
        IF NOT EXISTS (SELECT 1 FROM public.project_completion_steps s
                        WHERE s.report_id = v_r.id AND s.round = v_step.round AND s.status = 'PENDING') THEN
            UPDATE public.project_completion_reports
               SET status = 'APPROVED', decided_at = now(), updated_at = now(), decision_note = v_note
             WHERE id = v_r.id;
            -- A foreclosed project stays foreclosed; its report is still memory.
            IF v_pr.stage <> 'FORECLOSED' THEN
                UPDATE public.projects SET stage = 'CLOSED' WHERE "ProjectID" = v_r.project_id;
            END IF;
            v_word := 'approved';
        ELSE
            UPDATE public.project_completion_reports SET status = 'UNDER_REVIEW', updated_at = now() WHERE id = v_r.id;
        END IF;
    ELSIF p_decision = 'RETURN' THEN
        IF v_note IS NULL THEN RAISE EXCEPTION 'Say what needs to change'; END IF;
        UPDATE public.project_completion_steps
           SET status = 'RETURNED', decided_by = auth.uid(), decided_at = now(), notes = v_note, document_id = p_document_id
         WHERE id = v_step.id;
        UPDATE public.project_completion_steps SET status = 'SKIPPED'
         WHERE report_id = v_r.id AND round = v_step.round AND status = 'PENDING';
        UPDATE public.project_completion_reports
           SET status = 'RETURNED', decision_note = v_note, updated_at = now()
         WHERE id = v_r.id;
        v_word := 'returned for changes';
    ELSE
        -- A completion report is not rejected: a project ends either way.
        RAISE EXCEPTION 'A completion report is approved or returned';
    END IF;

    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT v_r.created_by, 'project_completion_decided', CASE WHEN v_word = 'approved' THEN 'info' ELSE 'warning' END,
           'Completion report ' || v_word || ': ' || v_pr."ProjectNo",
           'The completion report of ' || coalesce(v_pr."ProjectName", v_pr."ProjectNo") || ' was ' || v_word || coalesce('. ' || v_note, '.'),
           '/projects/' || v_r.project_id || '?tab=closure', 'rule', 'completion:' || v_r.id || ':' || v_step.id
     WHERE v_word IS NOT NULL
    ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_completion_save(p_project_id text, p_fields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_pr public.projects%ROWTYPE;
    v_r  public.project_completion_reports%ROWTYPE;
    v_f  jsonb := coalesce(p_fields, '{}'::jsonb);
BEGIN
    IF NOT public.project_caller_is_pi(p_project_id) THEN
        RAISE EXCEPTION 'Only the PI writes the completion report';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    SELECT * INTO v_r FROM public.project_completion_reports WHERE project_id = p_project_id FOR UPDATE;
    IF FOUND AND v_r.status NOT IN ('DRAFT', 'RETURNED') THEN
        RAISE EXCEPTION 'The report has been submitted and cannot be edited';
    END IF;
    IF NOT FOUND AND v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING', 'FORECLOSED') THEN
        RAISE EXCEPTION 'A completion report is written for a running or foreclosed project';
    END IF;
    IF v_f ? 'objectives_status' AND nullif(v_f->>'objectives_status', '') NOT IN ('MET', 'PARTLY_MET', 'NOT_MET') THEN
        RAISE EXCEPTION 'Objectives are met, partly met or not met';
    END IF;

    INSERT INTO public.project_completion_reports (project_id, created_by) VALUES (p_project_id, auth.uid())
    ON CONFLICT (project_id) DO NOTHING;
    UPDATE public.project_completion_reports SET
        summary           = coalesce(v_f->>'summary', summary),
        objectives_status = CASE WHEN v_f ? 'objectives_status' THEN nullif(v_f->>'objectives_status', '') ELSE objectives_status END,
        objectives_reason = coalesce(v_f->>'objectives_reason', objectives_reason),
        what_worked       = coalesce(v_f->>'what_worked', what_worked),
        what_did_not      = coalesce(v_f->>'what_did_not', what_did_not),
        reusable_assets   = coalesce(v_f->>'reusable_assets', reusable_assets),
        trl_target        = CASE WHEN v_f ? 'trl_target' THEN nullif(v_f->>'trl_target', '')::int ELSE trl_target END,
        trl_reached       = CASE WHEN v_f ? 'trl_reached' THEN nullif(v_f->>'trl_reached', '')::int ELSE trl_reached END,
        recommendations   = coalesce(v_f->>'recommendations', recommendations),
        follow_on_ideas   = coalesce(v_f->>'follow_on_ideas', follow_on_ideas),
        updated_at        = now()
     WHERE project_id = p_project_id
    RETURNING * INTO v_r;

    IF v_pr.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD') THEN
        UPDATE public.projects SET stage = 'CLOSING' WHERE "ProjectID" = p_project_id;
    END IF;
    RETURN v_r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_completion_step_kinds(p_track text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT CASE p_track
    WHEN 'ULIP' THEN ARRAY['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']
    ELSE ARRAY['PME_VETTING', 'FINANCE', 'RESEARCH_COUNCIL', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY']
  END;
$$;

CREATE OR REPLACE FUNCTION public.project_completion_submit(p_project_id text, p_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_pr      public.projects%ROWTYPE;
    v_r       public.project_completion_reports%ROWTYPE;
    v_missing text[];
BEGIN
    IF NOT public.project_caller_is_pi(p_project_id) THEN
        RAISE EXCEPTION 'Only the PI submits the completion report';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    SELECT * INTO v_r FROM public.project_completion_reports WHERE project_id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Write the completion report first'; END IF;
    IF v_r.status NOT IN ('DRAFT', 'RETURNED') THEN RAISE EXCEPTION 'The report has already been submitted'; END IF;
    IF v_pr.track IS NULL THEN RAISE EXCEPTION 'PME must classify this project as ULIP or HQ first'; END IF;
    v_missing := public.project_completion_missing(v_r);
    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'The report still needs: %', array_to_string(v_missing, ', ');
    END IF;
    IF EXISTS (SELECT 1 FROM public.project_change_requests
                WHERE project_id = p_project_id AND status IN ('SUBMITTED', 'UNDER_REVIEW')) THEN
        RAISE EXCEPTION 'A change request on this project is still in review';
    END IF;
    PERFORM public.project_assert_document(p_project_id, p_document_id, 'completion_report');

    UPDATE public.project_completion_reports
       SET status = 'SUBMITTED', round = round + 1, document_id = p_document_id,
           financial_statement = public.project_financial_statement(p_project_id),
           annexures = public.project_completion_annexures(p_project_id),
           submitted_at = now(), updated_at = now(), decision_note = NULL
     WHERE id = v_r.id;
    INSERT INTO public.project_completion_steps (report_id, round, seq, kind)
    SELECT v_r.id, v_r.round + 1, s.n, s.k
      FROM unnest(public.project_completion_step_kinds(v_pr.track)) WITH ORDINALITY AS s(k, n);
END;
$$;

CREATE OR REPLACE FUNCTION public.project_cpd_halfyearly(p_period_end date)
 RETURNS TABLE(project_id text, project_no text, title text, pi text, category text, stage text, start_date date, end_date date, reviews_due integer, reviews_held integer, reviews_missed integer, last_review_on date, received numeric, spent numeric, milestones_achieved integer, milestones_total integer, reports_submitted integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
WITH period AS (SELECT (p_period_end - interval '6 months' + interval '1 day')::date AS from_on, p_period_end AS to_on),
review_slots AS (
    SELECT s.* FROM public.project_review_slots s, period
     WHERE s.kind <> 'PROGRESS_REPORT' AND s.status <> 'CANCELLED'
       AND s.due_date BETWEEN period.from_on AND period.to_on
)
SELECT p."ProjectID", p."ProjectNo", p."ProjectName",
       coalesce((SELECT pr.pi_name FROM public.proposals pr WHERE pr.id = p.proposal_id),
                (SELECT st."Name" FROM public.staff st WHERE st."ID" = p.pi_staff_id), p."PrincipalInvestigator"),
       public.project_category(p."ProjectID"),
       p.stage, p.start_date, p.end_date,
       (SELECT count(*)::int FROM review_slots s WHERE s.project_id = p."ProjectID"),
       (SELECT count(*)::int FROM review_slots s WHERE s.project_id = p."ProjectID" AND s.status = 'DONE'),
       (SELECT count(*)::int FROM review_slots s WHERE s.project_id = p."ProjectID" AND s.status = 'PENDING'
                                                  AND s.due_date < public.ist_today()),
       (SELECT max(s.held_on) FROM public.project_review_slots s WHERE s.project_id = p."ProjectID"
                                                                 AND s.status = 'DONE' AND s.held_on <= p_period_end),
       (SELECT coalesce(sum(r.amount), 0) FROM public.project_fund_receipts r WHERE r.project_id = p."ProjectID" AND r.received_on <= p_period_end),
       (SELECT coalesce(sum(e.amount), 0) FROM public.project_expenditure e WHERE e.project_id = p."ProjectID"
                                                                         AND e.fiscal_year <= public.fiscal_year_of(p_period_end)),
       (SELECT count(*)::int FROM public.project_milestones m WHERE m.project_id = p."ProjectID" AND m.status = 'ACHIEVED' AND m.achieved_on <= p_period_end),
       (SELECT count(*)::int FROM public.project_milestones m WHERE m.project_id = p."ProjectID" AND m.status <> 'DROPPED'),
       (SELECT count(*)::int FROM public.project_reports r, period WHERE r.project_id = p."ProjectID"
                                                                 AND r.submitted_at::date BETWEEN period.from_on AND period.to_on)
  FROM public.projects p, period
 WHERE p.track = 'HQ'
   AND p.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING', 'CLOSED', 'FORECLOSED', 'ARCHIVED')
   AND (p.start_date IS NULL OR p.start_date <= period.to_on)
   AND (p.end_date IS NULL OR p.end_date >= period.from_on)
 ORDER BY p."ProjectNo";
$$;

CREATE OR REPLACE FUNCTION public.project_engage(p_selection_id uuid, p_person_id uuid, p_from date, p_to date, p_emoluments numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_sel  public.project_selections%ROWTYPE;
    v_fail text;
    v_id   uuid;
BEGIN
    IF NOT public.project_staff_caller_keeps() THEN
        RAISE EXCEPTION 'Only PME or HR engages project staff';
    END IF;
    SELECT * INTO v_sel FROM public.project_selections WHERE id = p_selection_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Selection not found'; END IF;
    PERFORM 1 FROM public.project_staff_persons WHERE id = p_person_id FOR UPDATE;
    SELECT string_agg(c.detail, '; ') INTO v_fail
      FROM public.project_engagement_check(p_person_id, v_sel.project_id, v_sel.position_code, p_from, p_to, p_selection_id) c
     WHERE c.ok = false;
    IF v_fail IS NOT NULL THEN RAISE EXCEPTION 'Cannot engage: %', v_fail; END IF;
    INSERT INTO public.project_engagements (person_id, project_id, position_code, from_on, to_on, emoluments, selection_id, created_by)
    VALUES (p_person_id, v_sel.project_id, v_sel.position_code, p_from, p_to, p_emoluments, p_selection_id, auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
    VALUES (v_sel.project_id, auth.uid(), 'staff',
            'Engaged ' || (SELECT name FROM public.project_staff_persons WHERE id = p_person_id) || ' as ' || v_sel.position_code
                || ' from ' || to_char(p_from, 'DD Mon YYYY') || ' to ' || to_char(p_to, 'DD Mon YYYY'), v_id::text);
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_engagement_check(p_person_id uuid, p_project_id text, p_position_code text, p_from date, p_to date, p_selection_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(rule text, ok boolean, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
    v_person  public.project_staff_persons%ROWTYPE;
    v_sel     public.project_selections%ROWTYPE;
    v_pr      public.projects%ROWTYPE;
    v_max_age integer;
    v_relax   integer;
    v_age     integer;
    v_cap     integer := public.csir_rule('project_staff.tenure_cap_years')::int;
    v_days    integer;
    v_months  integer;
    v_quorum  jsonb := public.csir_rule('project_staff.selection_quorum');
BEGIN
    SELECT * INTO v_person FROM public.project_staff_persons WHERE id = p_person_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Person not found'; END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Give the engagement dates'; END IF;
    IF p_selection_id IS NOT NULL THEN SELECT * INTO v_sel FROM public.project_selections WHERE id = p_selection_id; END IF;
    v_months := CASE WHEN v_pr.start_date IS NOT NULL AND v_pr.end_date IS NOT NULL
                     THEN (extract(year FROM age(v_pr.end_date, v_pr.start_date)) * 12 + extract(month FROM age(v_pr.end_date, v_pr.start_date)))::int END;

    -- Age, with relaxation by category (a woman candidate also gets the
    -- women's relaxation where the OM gives one).
    v_max_age := (public.csir_rules_value_or_null('project_staff.positions', public.ist_today()) -> p_position_code ->> 'max_age')::int;
    v_relax := greatest(coalesce((public.csir_rule('project_staff.age_relaxation_years') ->> v_person.category)::int, 0),
                        CASE WHEN lower(coalesce(v_person.gender, '')) IN ('f', 'female', 'woman')
                             THEN coalesce((public.csir_rule('project_staff.age_relaxation_years') ->> 'Women')::int, 0) ELSE 0 END);
    rule := 'age';
    IF v_person.born_on IS NULL THEN
        ok := false; detail := 'Date of birth missing';
    ELSIF v_max_age IS NULL THEN
        ok := NULL; detail := 'Position catalogue not loaded — enter project_staff.positions from the OM; age not checked';
    ELSE
        v_age := extract(year FROM age(coalesce(v_sel.advert_on, p_from), v_person.born_on))::int;
        ok := v_age <= v_max_age + v_relax;
        detail := 'Age ' || v_age || ', limit ' || v_max_age || CASE WHEN v_relax > 0 THEN ' + ' || v_relax || ' relaxation' ELSE '' END;
    END IF;
    RETURN NEXT;

    v_days := public.project_staff_tenure_days(p_person_id, p_to, p_from, p_to);
    rule := 'tenure'; ok := v_days <= floor(v_cap * 365.25);
    detail := round(v_days / 365.25, 1) || ' years on projects with this engagement (PhD period excluded); cap ' || v_cap || ' years';
    RETURN NEXT;

    rule := 'selection';
    IF p_selection_id IS NULL THEN
        ok := false; detail := 'Record how the person was selected';
    ELSIF v_sel.project_id <> p_project_id THEN
        ok := false; detail := 'A move to another project needs a fresh selection for that project';
    ELSE
        ok := true; detail := initcap(lower(v_sel.mode));
    END IF;
    RETURN NEXT;

    IF v_sel.mode IN ('SELECTION', 'WAITLIST') THEN
        rule := 'quorum';
        ok := (SELECT count(*) FROM jsonb_array_elements(v_sel.committee) c WHERE c ->> 'role' = 'CHAIR') >= (v_quorum ->> 'chair')::int
          AND (SELECT count(*) FROM jsonb_array_elements(v_sel.committee) c WHERE c ->> 'role' = 'MEMBER') >= (v_quorum ->> 'members')::int;
        detail := 'Committee: chair + ' || (v_quorum ->> 'members') || ' members needed';
        RETURN NEXT;
    END IF;
    IF v_sel.mode = 'SELECTION' THEN
        rule := 'ncs_posting'; ok := coalesce(btrim(v_sel.advert_ncs_ref), '') <> '';
        detail := CASE WHEN ok THEN 'Posted on the NCS portal: ' || v_sel.advert_ncs_ref ELSE 'Record the NCS portal posting' END;
        RETURN NEXT;
    ELSIF v_sel.mode = 'WAITLIST' THEN
        rule := 'waitlist';
        ok := v_sel.waitlist_valid_until >= p_from
          AND coalesce(v_months, 0) >= public.csir_rule('project_staff.waitlist_min_project_months')::int;
        detail := 'Waitlist valid until ' || coalesce(v_sel.waitlist_valid_until::text, '—') || '; project of '
            || coalesce(v_months::text, '?') || ' months (needs ' || public.csir_rule('project_staff.waitlist_min_project_months')::text || '+)';
        RETURN NEXT;
    ELSIF v_sel.mode = 'DIRECT' THEN
        rule := 'direct';
        ok := v_months IS NOT NULL AND v_months < public.csir_rule('project_staff.direct_engagement_max_project_months')::int
          AND coalesce(btrim(v_sel.exigency_note), '') <> '';
        detail := 'Direct engagement needs a project under '
            || public.csir_rule('project_staff.direct_engagement_max_project_months')::text || ' months ('
            || coalesce(v_months::text, 'dates missing') || ') and the reason recorded';
        RETURN NEXT;
    END IF;

    rule := 'antecedents';
    ok := NOT v_person.abroad_last_5y OR v_person.antecedents_verified_on IS NOT NULL;
    detail := CASE WHEN NOT v_person.abroad_last_5y THEN 'Not abroad in the last 5 years'
                   WHEN ok THEN 'Antecedents verified ' || v_person.antecedents_verified_on
                   ELSE 'Abroad in the last 5 years: verify antecedents first' END;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_entry_set_lab(p_kind text, p_id uuid, p_lab_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_project text;
    v_lab     text := upper(btrim(p_lab_code));
BEGIN
    IF p_kind = 'receipt' THEN
        SELECT project_id INTO v_project FROM public.project_fund_receipts WHERE id = p_id AND reverses_id IS NULL;
    ELSIF p_kind = 'expenditure' THEN
        SELECT project_id INTO v_project FROM public.project_expenditure WHERE id = p_id AND reverses_id IS NULL;
    ELSIF p_kind = 'budget' THEN
        SELECT project_id INTO v_project FROM public.project_budget_lines WHERE id = p_id;
    ELSE
        RAISE EXCEPTION 'Unknown entry kind: %', p_kind;
    END IF;
    IF v_project IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
    IF NOT coalesce(public.project_caller_is_office(v_project), false) THEN
        RAISE EXCEPTION 'Only PME books entries to a lab, and not on a project of their own';
    END IF;
    IF v_lab <> 'AMPRI' AND NOT EXISTS (SELECT 1 FROM public.project_labs WHERE project_id = v_project AND lab_code = v_lab) THEN
        RAISE EXCEPTION 'Add % to the project''s labs first', v_lab;
    END IF;
    IF p_kind = 'receipt' THEN
        UPDATE public.project_fund_receipts SET lab_code = v_lab WHERE id = p_id OR reverses_id = p_id;
    ELSIF p_kind = 'expenditure' THEN
        UPDATE public.project_expenditure SET lab_code = v_lab WHERE id = p_id OR reverses_id = p_id;
    ELSE
        UPDATE public.project_budget_lines SET lab_code = v_lab WHERE id = p_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_expenditure_sync_utilized()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    UPDATE public.projects
       SET "UtilizedAmount" = (SELECT coalesce(sum(amount), 0)::text FROM public.project_expenditure
                                WHERE project_id = NEW.project_id)
     WHERE "ProjectID" = NEW.project_id AND proposal_id IS NOT NULL;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_financial_statement(p_project_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'heads', coalesce((SELECT jsonb_agg(jsonb_build_object('fiscal_year', h.fiscal_year, 'head', h.head,
                                                            'sanctioned', h.sanctioned, 'spent', h.spent)
                                        ORDER BY h.fiscal_year, h.head)
                         FROM public.project_head_position(p_project_id) h), '[]'::jsonb),
    'received', coalesce((SELECT jsonb_agg(jsonb_build_object('fiscal_year', r.fiscal_year, 'amount', r.amount) ORDER BY r.fiscal_year)
                            FROM (SELECT fiscal_year, sum(amount) AS amount FROM public.project_fund_receipts
                                   WHERE project_id = p_project_id GROUP BY fiscal_year) r), '[]'::jsonb),
    'sanctioned', coalesce((SELECT sum(amount) FROM public.project_budget_lines WHERE project_id = p_project_id), 0),
    'received_total', coalesce((SELECT sum(amount) FROM public.project_fund_receipts WHERE project_id = p_project_id), 0),
    'spent_total', coalesce((SELECT sum(amount) FROM public.project_expenditure WHERE project_id = p_project_id), 0));
$$;

CREATE OR REPLACE FUNCTION public.project_generate_slots(p_project_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_pr public.projects%ROWTYPE;
BEGIN
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RETURN; END IF;

    DELETE FROM public.project_review_slots
     WHERE project_id = p_project_id AND generated AND status = 'PENDING'
       AND meeting_id IS NULL AND report_id IS NULL;

    IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING')
       OR v_pr.start_date IS NULL OR v_pr.end_date IS NULL OR v_pr.end_date < v_pr.start_date THEN
        RETURN;
    END IF;

    INSERT INTO public.project_review_slots (project_id, kind, body, period_label, period_end, due_date, minutes_days)
    SELECT p_project_id, s.kind, s.body,
           CASE WHEN s.months = ARRAY[3, 9]
                THEN CASE extract(month FROM me)::int WHEN 9 THEN 'H1 ' ELSE 'H2 ' END
                ELSE CASE extract(month FROM me)::int WHEN 6 THEN 'Q1 ' WHEN 9 THEN 'Q2 ' WHEN 12 THEN 'Q3 ' ELSE 'Q4 ' END
           END || public.fiscal_year_of(me),
           me,
           CASE WHEN s.kind = 'PROGRESS_REPORT' THEN me + 15 ELSE me END,
           s.minutes_days
      FROM public.project_slot_plan(v_pr.track, public.project_category_code(v_pr)) s
     CROSS JOIN LATERAL (
        SELECT (g + interval '1 month' - interval '1 day')::date AS me
          FROM generate_series(date_trunc('month', v_pr.start_date)::date, v_pr.end_date, interval '1 month') g
     ) m
     WHERE extract(month FROM me)::int = ANY (s.months)
    ON CONFLICT (project_id, kind, period_end) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_head_position(p_project_id text)
 RETURNS TABLE(fiscal_year text, head text, sanctioned numeric, spent numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT k.fiscal_year, k.head,
         coalesce((SELECT sum(b.amount) FROM public.project_budget_lines b
                    WHERE b.project_id = p_project_id AND b.fiscal_year = k.fiscal_year AND b.head = k.head), 0),
         coalesce((SELECT sum(e.amount) FROM public.project_expenditure e
                    WHERE e.project_id = p_project_id AND e.fiscal_year = k.fiscal_year AND e.head = k.head), 0)
    FROM (SELECT b.fiscal_year, b.head FROM public.project_budget_lines b WHERE b.project_id = p_project_id
          UNION
          SELECT e.fiscal_year, e.head FROM public.project_expenditure e WHERE e.project_id = p_project_id) k;
$$;

CREATE OR REPLACE FUNCTION public.project_infer_track(p_no text, p_category text, p_fund_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN coalesce(p_no, '') ~* '^(FIR|FBR|NCP|FTT|FTC|MMP|FCP|HCP|IST)[0-9]{6}$'
      OR upper(btrim(coalesce(p_category, ''))) IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP','IST') THEN 'HQ'
    WHEN coalesce(p_no, '') ~* '^ULIP' OR coalesce(p_category, '') ~* '(ULIP|in[- ]?house)'
      OR coalesce(p_fund_type, '') ~* '(ULIP|in[- ]?house)' THEN 'ULIP'
  END;
$$;

CREATE OR REPLACE FUNCTION public.project_ip_agreement_add(p_project_id text, p_document_id uuid, p_signed_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT coalesce(public.project_caller_is_office(p_project_id), false) THEN
        RAISE EXCEPTION 'Only PME records the IP agreement, and not on a project of their own';
    END IF;
    IF p_signed_on IS NULL THEN RAISE EXCEPTION 'Give the date it was signed'; END IF;
    PERFORM public.project_assert_document(p_project_id, p_document_id, 'other');
    INSERT INTO public.project_ip_agreements (project_id, document_id, signed_on, recorded_by)
    VALUES (p_project_id, p_document_id, p_signed_on, auth.uid()) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_ip_agreement_missing(p_project_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = p_project_id AND p.stage = 'ACTIVE')
       AND EXISTS (SELECT 1 FROM public.project_labs l WHERE l.project_id = p_project_id AND l.lab_code <> 'AMPRI')
       AND NOT EXISTS (SELECT 1 FROM public.project_ip_agreements a WHERE a.project_id = p_project_id);
$$;

CREATE OR REPLACE FUNCTION public.project_lab_money(p_project_id text)
 RETURNS TABLE(lab_code text, role text, sanctioned numeric, received numeric, spent numeric, balance numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    WITH labs AS (
        SELECT l.lab_code, l.role FROM public.project_labs l WHERE l.project_id = p_project_id
        UNION SELECT 'AMPRI', NULL WHERE NOT EXISTS (SELECT 1 FROM public.project_labs l WHERE l.project_id = p_project_id AND l.lab_code = 'AMPRI')
        UNION SELECT b.lab_code, NULL FROM public.project_budget_lines b WHERE b.project_id = p_project_id
              AND NOT EXISTS (SELECT 1 FROM public.project_labs l WHERE l.project_id = p_project_id AND l.lab_code = b.lab_code)
              AND b.lab_code <> 'AMPRI'
    )
    SELECT l.lab_code, l.role, s.v, r.v, e.v, r.v - e.v
      FROM labs l
      CROSS JOIN LATERAL (SELECT coalesce(sum(amount), 0) v FROM public.project_budget_lines  WHERE project_id = p_project_id AND lab_code = l.lab_code) s
      CROSS JOIN LATERAL (SELECT coalesce(sum(amount), 0) v FROM public.project_fund_receipts WHERE project_id = p_project_id AND lab_code = l.lab_code) r
      CROSS JOIN LATERAL (SELECT coalesce(sum(amount), 0) v FROM public.project_expenditure   WHERE project_id = p_project_id AND lab_code = l.lab_code) e
     ORDER BY (l.role = 'NODAL') DESC NULLS LAST, l.lab_code;
$$;

CREATE OR REPLACE FUNCTION public.project_lab_set(p_project_id text, p_lab_code text, p_role text, p_rc_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT coalesce(public.project_caller_is_office(p_project_id), false) THEN
        RAISE EXCEPTION 'Only PME records the labs, and not on a project of their own';
    END IF;
    IF p_rc_document_id IS NOT NULL THEN
        PERFORM public.project_assert_document(p_project_id, p_rc_document_id, 'other');
    END IF;
    INSERT INTO public.project_labs (project_id, lab_code, role, rc_approval_document_id, added_by)
    VALUES (p_project_id, upper(btrim(p_lab_code)), p_role, p_rc_document_id, auth.uid())
    ON CONFLICT (project_id, lab_code) DO UPDATE
       SET role = EXCLUDED.role, rc_approval_document_id = coalesce(EXCLUDED.rc_approval_document_id, project_labs.rc_approval_document_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.project_legacy_complete(p_project_id text, p_track text, p_category text, p_start date, p_end date, p_sanction_ref text, p_sanction_date date, p_document_id uuid, p_lines jsonb, p_received jsonb, p_spent jsonb, p_as_of date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_pr    public.projects%ROWTYPE;
    v_heads text[] := ARRAY['EQUIPMENT', 'WORKS', 'MANPOWER', 'CONSUMABLES', 'TA_INDIA', 'TA_ABROAD',
                            'CONTINGENCY', 'OUTSOURCING', 'OTHER'];
    v_fy    text := '^[0-9]{4}-[0-9]{2}$';
    v_bad   record;
    v_total numeric;
BEGIN
    IF NOT public.project_caller_is_office(p_project_id) THEN
        RAISE EXCEPTION 'Only PME brings a legacy project in, and not one of their own';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.proposal_id IS NOT NULL THEN RAISE EXCEPTION 'This project came through SURYA; it has its own record'; END IF;
    IF v_pr.legacy_completed_at IS NOT NULL THEN RAISE EXCEPTION 'This project has already been brought in'; END IF;
    IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING') THEN
        RAISE EXCEPTION 'Only a running project is brought in; a closed one is archived';
    END IF;
    IF EXISTS (SELECT 1 FROM public.project_budget_lines WHERE project_id = p_project_id)
       OR EXISTS (SELECT 1 FROM public.project_fund_receipts WHERE project_id = p_project_id)
       OR EXISTS (SELECT 1 FROM public.project_expenditure WHERE project_id = p_project_id) THEN
        RAISE EXCEPTION 'This project already has money on record';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_schemes WHERE code = p_track) THEN RAISE EXCEPTION 'Choose the scheme'; END IF;
    IF p_track = 'HQ' AND coalesce(p_category, '') NOT IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP','IST') THEN
        RAISE EXCEPTION 'Choose the HQ category';
    END IF;
    IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN RAISE EXCEPTION 'Give the start and end dates'; END IF;
    IF coalesce(btrim(p_sanction_ref), '') = '' OR p_sanction_date IS NULL THEN
        RAISE EXCEPTION 'Give the sanction order number and date';
    END IF;
    IF p_as_of IS NULL OR p_as_of > public.ist_today() THEN RAISE EXCEPTION 'Give the date the figures are up to'; END IF;
    PERFORM public.project_assert_document(p_project_id, p_document_id, 'sanction_order');
    IF jsonb_array_length(coalesce(p_lines, '[]')) = 0 THEN RAISE EXCEPTION 'Enter the sanction by year and head'; END IF;

    SELECT x.* INTO v_bad FROM jsonb_to_recordset(p_lines) AS x(fiscal_year text, head text, amount numeric)
     WHERE x.head IS NULL OR NOT (x.head = ANY (v_heads)) OR coalesce(x.fiscal_year, '') !~ v_fy OR x.amount IS NULL OR x.amount < 0
     LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Each sanction line needs a financial year, a head and an amount'; END IF;
    SELECT x.* INTO v_bad FROM jsonb_to_recordset(coalesce(p_received, '[]')) AS x(fiscal_year text, amount numeric)
     WHERE coalesce(x.fiscal_year, '') !~ v_fy OR coalesce(x.amount, 0) <= 0 LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Each receipt needs a financial year and an amount above zero'; END IF;
    SELECT x.* INTO v_bad FROM jsonb_to_recordset(coalesce(p_spent, '[]')) AS x(fiscal_year text, head text, amount numeric)
     WHERE x.head IS NULL OR NOT (x.head = ANY (v_heads)) OR coalesce(x.fiscal_year, '') !~ v_fy OR coalesce(x.amount, 0) <= 0
     LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Each expenditure line needs a financial year, a head and an amount above zero'; END IF;

    SELECT sum(x.amount) INTO v_total FROM jsonb_to_recordset(p_lines) AS x(amount numeric);
    UPDATE public.projects SET
        track = p_track,
        "ProjectCategory" = CASE WHEN p_track = 'HQ' THEN p_category ELSE "ProjectCategory" END,
        "StartDate" = p_start::text, "CompletioDate" = p_end::text,
        "SanctionedCost" = trim_scale(v_total)::text,
        sanction_ref = btrim(p_sanction_ref), sanction_date = p_sanction_date,
        legacy_completed_at = now(), legacy_completed_by = auth.uid()
     WHERE "ProjectID" = p_project_id;

    INSERT INTO public.project_budget_lines (project_id, fiscal_year, head, item, amount, source)
    SELECT p_project_id, x.fiscal_year, x.head, '', x.amount, 'LEGACY'
      FROM jsonb_to_recordset(p_lines) AS x(fiscal_year text, head text, amount numeric)
     WHERE x.amount > 0;

    -- Dated at the end of their financial year, or the as-of date if earlier.
    INSERT INTO public.project_fund_receipts (project_id, received_on, fiscal_year, amount, source, order_no,
                                              document_id, notes, opening_balance, recorded_by)
    SELECT p_project_id,
           least(p_as_of, make_date(substr(x.fiscal_year, 1, 4)::int + 1, 3, 31)), x.fiscal_year, x.amount,
           'Opening balance', 'Opening balance', p_document_id,
           'Received before the project was brought into SURYA, to ' || to_char(p_as_of, 'DD Mon YYYY'), true, auth.uid()
      FROM jsonb_to_recordset(coalesce(p_received, '[]')) AS x(fiscal_year text, amount numeric);

    INSERT INTO public.project_expenditure (project_id, fiscal_year, period, head, amount, document_id, notes,
                                            opening_balance, recorded_by)
    SELECT p_project_id, x.fiscal_year, 'FY', x.head, x.amount, p_document_id,
           'Spent before the project was brought into SURYA, to ' || to_char(p_as_of, 'DD Mon YYYY'), true, auth.uid()
      FROM jsonb_to_recordset(coalesce(p_spent, '[]')) AS x(fiscal_year text, head text, amount numeric);

    UPDATE public.projects
       SET "UtilizedAmount" = trim_scale(coalesce((SELECT sum(amount) FROM public.project_expenditure WHERE project_id = p_project_id), 0))::text,
           stage = CASE WHEN stage = 'SANCTIONED' AND EXISTS (SELECT 1 FROM public.project_fund_receipts WHERE project_id = p_project_id)
                        THEN 'ACTIVE' ELSE stage END
     WHERE "ProjectID" = p_project_id;

    -- Reviews and reports that fell due before SURYA are not overdue.
    UPDATE public.project_review_slots
       SET status = 'CANCELLED', notes = 'Due before the project was brought into SURYA'
     WHERE project_id = p_project_id AND generated AND status = 'PENDING' AND due_date < p_as_of;

    INSERT INTO public.project_events (project_id, actor, kind, summary)
    VALUES (p_project_id, auth.uid(), 'legacy',
            'Brought into SURYA: sanction ₹' || to_char(v_total, 'FM99,99,99,99,990') || ' by head, money to '
                || to_char(p_as_of, 'DD Mon YYYY') || ' as opening balances');
END;
$$;

CREATE OR REPLACE FUNCTION public.project_legacy_lessons(p_project_id text, p_fields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_pr public.projects%ROWTYPE;
    v_f  jsonb := coalesce(p_fields, '{}'::jsonb);
    v_id uuid;
BEGIN
    IF NOT (public.project_caller_is_pi(p_project_id) OR public.project_caller_is_office(p_project_id)) THEN
        RAISE EXCEPTION 'Only the PI or PME records the lessons of a project';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.proposal_id IS NOT NULL OR v_pr.stage NOT IN ('CLOSED', 'FORECLOSED') THEN
        RAISE EXCEPTION 'A lessons note is for a project closed before SURYA; others write a completion report';
    END IF;
    IF EXISTS (SELECT 1 FROM public.project_completion_reports WHERE project_id = p_project_id) THEN
        RAISE EXCEPTION 'Lessons are already on record for this project';
    END IF;
    IF coalesce(btrim(v_f->>'summary'), '') = '' THEN RAISE EXCEPTION 'Say in a line what the project did'; END IF;
    IF coalesce(btrim(v_f->>'what_worked'), '') = '' AND coalesce(btrim(v_f->>'what_did_not'), '') = ''
       AND coalesce(btrim(v_f->>'recommendations'), '') = '' THEN
        RAISE EXCEPTION 'Add at least one lesson: what worked, what did not, or advice to a future team';
    END IF;
    IF nullif(v_f->>'objectives_status', '') NOT IN ('MET', 'PARTLY_MET', 'NOT_MET') THEN
        RAISE EXCEPTION 'Objectives are met, partly met or not met';
    END IF;

    INSERT INTO public.project_completion_reports (
        project_id, status, round, summary, objectives_status, objectives_reason, what_worked, what_did_not,
        reusable_assets, recommendations, follow_on_ideas, decision_note, created_by, submitted_at, decided_at)
    VALUES (p_project_id, 'APPROVED', 0, btrim(v_f->>'summary'), nullif(v_f->>'objectives_status', ''),
            coalesce(v_f->>'objectives_reason', ''), coalesce(v_f->>'what_worked', ''), coalesce(v_f->>'what_did_not', ''),
            coalesce(v_f->>'reusable_assets', ''), coalesce(v_f->>'recommendations', ''), coalesce(v_f->>'follow_on_ideas', ''),
            'Recorded for a project closed before SURYA; no approval chain', auth.uid(), now(), now())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_legacy_pending()
 RETURNS TABLE(project_id text, project_no text, project_name text, stage text, track text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT p."ProjectID", p."ProjectNo", p."ProjectName", p.stage, p.track
    FROM public.projects p
   WHERE p.proposal_id IS NULL AND p.legacy_completed_at IS NULL
     AND p.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING')
   ORDER BY p."ProjectNo";
$$;

CREATE OR REPLACE FUNCTION public.project_link_output(p_kind text, p_output_id text, p_project_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_current text;
    v_target  text;
BEGIN
    IF p_kind = 'publication' THEN
        SELECT project_id INTO v_current FROM public.scientific_outputs WHERE id = p_output_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Publication not found'; END IF;
    ELSIF p_kind = 'patent' THEN
        SELECT project_id INTO v_current FROM public.ip_intelligence WHERE id = p_output_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'IP record not found'; END IF;
    ELSIF p_kind = 'equipment' THEN
        SELECT project_id INTO v_current FROM public.equipment WHERE "UInsID" = p_output_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;
    ELSE
        RAISE EXCEPTION 'Unknown output kind: %', p_kind;
    END IF;

    v_target := coalesce(p_project_id, v_current);
    IF v_target IS NULL THEN RETURN; END IF;
    IF NOT (public.caller_is_pme() OR public.caller_has_role('MasterAdmin')
            OR public.project_caller_is_party(v_target)) THEN
        RAISE EXCEPTION 'Only PME or the project''s PI can link outputs to it';
    END IF;
    -- Moving an output away from another project needs rights on that one too.
    IF p_project_id IS NOT NULL AND v_current IS NOT NULL AND v_current <> p_project_id
       AND NOT (public.caller_is_pme() OR public.caller_has_role('MasterAdmin')
                OR public.project_caller_is_party(v_current)) THEN
        RAISE EXCEPTION 'This is already linked to another project';
    END IF;
    IF p_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE "ProjectID" = p_project_id) THEN
        RAISE EXCEPTION 'Project not found';
    END IF;

    IF p_kind = 'publication' THEN
        UPDATE public.scientific_outputs SET project_id = p_project_id WHERE id = p_output_id;
    ELSIF p_kind = 'patent' THEN
        UPDATE public.ip_intelligence SET project_id = p_project_id WHERE id = p_output_id;
    ELSE
        UPDATE public.equipment SET project_id = p_project_id WHERE "UInsID" = p_output_id;
    END IF;
    INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
    VALUES (v_target, auth.uid(), 'output',
            CASE WHEN p_project_id IS NULL THEN 'Unlinked ' ELSE 'Linked ' END || p_kind || ' ' || p_output_id, p_output_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.project_log_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_amount text;
BEGIN
    IF TG_TABLE_NAME = 'projects' THEN
        IF TG_OP = 'INSERT' THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary)
            VALUES (NEW."ProjectID", auth.uid(), 'created',
                    CASE WHEN NEW.proposal_id IS NOT NULL
                         THEN 'Sanctioned (' || coalesce(NEW.sanction_ref, 'no order number') || ') and created from proposal'
                         ELSE 'Project record created' END);
        ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary)
            VALUES (NEW."ProjectID", auth.uid(), 'stage',
                    'Stage: ' || coalesce(public.project_stage_label(OLD.stage), 'not set') || ' → '
                              || coalesce(public.project_stage_label(NEW.stage), 'not set'));
        END IF;
    ELSIF TG_TABLE_NAME = 'project_fund_receipts' THEN
        v_amount := '₹' || to_char(abs(NEW.amount), 'FM99,99,99,99,990');
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'receipt',
                CASE WHEN NEW.reverses_id IS NULL THEN 'Received ' || v_amount || ' (' || NEW.order_no || ')'
                     ELSE 'Receipt of ' || v_amount || ' reversed' END, NEW.id::text);
    ELSIF TG_TABLE_NAME = 'project_expenditure' THEN
        v_amount := '₹' || to_char(abs(NEW.amount), 'FM99,99,99,99,990');
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'expenditure',
                CASE WHEN NEW.reverses_id IS NULL
                     THEN 'Spent ' || v_amount || ' on ' || lower(replace(NEW.head, '_', ' ')) || ', ' || NEW.fiscal_year || ' ' || NEW.period
                     ELSE 'Expenditure of ' || v_amount || ' reversed' END, NEW.id::text);
    ELSIF TG_TABLE_NAME = 'project_milestones' THEN
        IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
            VALUES (NEW.project_id, auth.uid(), 'milestone',
                    'Milestone "' || NEW.title || '": ' || lower(NEW.status), NEW.id::text);
        END IF;
    ELSIF TG_TABLE_NAME = 'project_documents' THEN
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'document',
                'Filed ' || replace(NEW.doc_type, '_', ' ') || ': ' || NEW.file_name, NEW.id::text);
    ELSIF TG_TABLE_NAME = 'project_review_slots' THEN
        IF TG_OP = 'INSERT' THEN
            IF NOT NEW.generated THEN
                INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
                VALUES (NEW.project_id, auth.uid(), 'review',
                        NEW.body || ' for ' || to_char(NEW.due_date, 'DD Mon YYYY') || ': ' || coalesce(NEW.notes, ''), NEW.id::text);
            END IF;
        ELSIF NEW.meeting_id IS DISTINCT FROM OLD.meeting_id AND NEW.meeting_id IS NOT NULL THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
            VALUES (NEW.project_id, auth.uid(), 'review',
                    NEW.body || ' (' || NEW.period_label || ') placed on the agenda of '
                        || coalesce((SELECT title FROM public.meetings WHERE id = NEW.meeting_id), 'a meeting'), NEW.id::text);
        ELSIF NEW.status = 'DONE' AND OLD.status <> 'DONE' THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
            VALUES (NEW.project_id, auth.uid(), 'review',
                    CASE WHEN NEW.kind = 'PROGRESS_REPORT'
                         THEN 'Progress report submitted (' || NEW.period_label || ')'
                         ELSE NEW.body || ' (' || NEW.period_label || '): ' || lower(replace(NEW.decision, '_', ' '))
                              || coalesce(' — ' || NEW.outcome, '') END, NEW.id::text);
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_milestone_add(p_project_id text, p_title text, p_target_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_office boolean := public.project_caller_is_office(p_project_id);
    v_id     uuid;
BEGIN
    IF NOT (v_office OR public.project_caller_is_party(p_project_id)) THEN
        RAISE EXCEPTION 'Only the project''s PI or PME can add a milestone';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE "ProjectID" = p_project_id
                    AND stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING')) THEN
        RAISE EXCEPTION 'Milestones can be added only on a sanctioned or running project';
    END IF;
    IF coalesce(btrim(p_title), '') = '' OR p_target_date IS NULL THEN
        RAISE EXCEPTION 'Give the milestone a title and a target date';
    END IF;
    INSERT INTO public.project_milestones (project_id, title, target_date, status, created_by)
    VALUES (p_project_id, btrim(p_title), p_target_date,
            CASE WHEN v_office THEN 'PLANNED' ELSE 'PROPOSED' END, auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_milestone_decide(p_id uuid, p_decision text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_m    public.project_milestones%ROWTYPE;
    v_next text;
BEGIN
    SELECT * INTO v_m FROM public.project_milestones WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone not found'; END IF;
    IF NOT public.project_caller_is_office(v_m.project_id) THEN
        RAISE EXCEPTION 'Only PME decides on a milestone, and not on a project of their own';
    END IF;
    v_next := CASE
        WHEN p_decision = 'ACCEPT'  AND v_m.status = 'PROPOSED' THEN 'PLANNED'
        WHEN p_decision = 'CONFIRM' AND v_m.status = 'REPORTED' THEN 'ACHIEVED'
        WHEN p_decision = 'RETURN'  AND v_m.status = 'REPORTED' THEN 'PLANNED'
        WHEN p_decision = 'DROP'    AND v_m.status IN ('PROPOSED', 'PLANNED') THEN 'DROPPED'
    END;
    IF v_next IS NULL THEN
        RAISE EXCEPTION 'Cannot % a milestone that is %', lower(p_decision), lower(v_m.status);
    END IF;
    IF p_decision IN ('RETURN', 'DROP') AND coalesce(btrim(p_note), '') = '' THEN
        RAISE EXCEPTION 'Say why';
    END IF;
    UPDATE public.project_milestones
       SET status = v_next, decision_note = nullif(btrim(p_note), ''), updated_at = now(),
           achieved_on = CASE WHEN v_next = 'PLANNED' THEN NULL ELSE achieved_on END
     WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_milestone_report(p_id uuid, p_achieved_on date, p_note text, p_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_m public.project_milestones%ROWTYPE;
BEGIN
    SELECT * INTO v_m FROM public.project_milestones WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone not found'; END IF;
    IF NOT public.project_caller_is_party(v_m.project_id) THEN
        RAISE EXCEPTION 'Only the project''s PI or co-PIs report a milestone';
    END IF;
    IF v_m.status <> 'PLANNED' THEN RAISE EXCEPTION 'Only a planned milestone can be reported done'; END IF;
    IF p_achieved_on IS NULL THEN RAISE EXCEPTION 'Give the date it was achieved'; END IF;
    PERFORM public.project_assert_document(v_m.project_id, p_document_id, 'milestone_evidence');
    UPDATE public.project_milestones
       SET status = 'REPORTED', achieved_on = p_achieved_on, report_note = nullif(btrim(p_note), ''),
           document_id = p_document_id, updated_at = now()
     WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_money_reversal_lab()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.reverses_id IS NOT NULL THEN
        IF TG_TABLE_NAME = 'project_fund_receipts' THEN
            SELECT lab_code INTO NEW.lab_code FROM public.project_fund_receipts WHERE id = NEW.reverses_id;
        ELSE
            SELECT lab_code INTO NEW.lab_code FROM public.project_expenditure WHERE id = NEW.reverses_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_no_key(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT nullif(regexp_replace(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')),
                               '([A-Z])0+([0-9])', '\1\2', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.project_pack(p_project_id text, p_kind text, p_change_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
DECLARE
    v_pr       public.projects%ROWTYPE;
    v_cr       public.project_change_requests%ROWTYPE;
    v_pi       text;
    v_fy       text := public.fiscal_year_of(public.ist_today());
    v_year     text;
    v_received numeric;
    v_spent    numeric;
    v_year_sanction numeric;
    v_pack     jsonb;
BEGIN
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF p_kind NOT IN ('FIRST_RELEASE', 'NEXT_YEAR_RELEASE', 'REPHASING', 'REAPPROPRIATION') THEN
        RAISE EXCEPTION 'Unknown pack: %', p_kind;
    END IF;

    v_pi := coalesce((SELECT pr.pi_name FROM public.proposals pr WHERE pr.id = v_pr.proposal_id),
                     (SELECT s."Name" FROM public.staff s WHERE s."ID" = v_pr.pi_staff_id),
                     v_pr."PrincipalInvestigator");
    SELECT coalesce(sum(amount), 0) INTO v_received FROM public.project_fund_receipts WHERE project_id = p_project_id;
    SELECT coalesce(sum(amount), 0) INTO v_spent    FROM public.project_expenditure   WHERE project_id = p_project_id;

    v_pack := jsonb_build_object(
        'kind', p_kind,
        'as_on', public.ist_today(),
        'project', jsonb_build_object(
            'project_id', v_pr."ProjectID", 'project_no', v_pr."ProjectNo", 'title', v_pr."ProjectName",
            'pi', v_pi, 'division', v_pr."DivisionCode", 'track', v_pr.track, 'stage', v_pr.stage,
            'start_date', v_pr.start_date, 'end_date', v_pr.end_date, 'sanctioned_cost', v_pr.sanctioned_cost,
            'sanction_ref', v_pr.sanction_ref, 'sanction_date', v_pr.sanction_date),
        'heads', coalesce((
            SELECT jsonb_agg(jsonb_build_object('head', head, 'sanctioned', s, 'spent', e, 'balance', s - e) ORDER BY head)
              FROM (SELECT hp.head, sum(hp.sanctioned) s, sum(hp.spent) e
                      FROM public.project_head_position(p_project_id) hp GROUP BY hp.head) h), '[]'::jsonb),
        'years', coalesce((
            SELECT jsonb_agg(jsonb_build_object('fiscal_year', y.fy, 'sanctioned', y.s, 'received', y.r, 'spent', y.e) ORDER BY y.fy)
              FROM (SELECT k.fy,
                           (SELECT coalesce(sum(b.amount), 0) FROM public.project_budget_lines b WHERE b.project_id = p_project_id AND b.fiscal_year = k.fy) s,
                           (SELECT coalesce(sum(r.amount), 0) FROM public.project_fund_receipts r WHERE r.project_id = p_project_id AND r.fiscal_year = k.fy) r,
                           (SELECT coalesce(sum(x.amount), 0) FROM public.project_expenditure x WHERE x.project_id = p_project_id AND x.fiscal_year = k.fy) e
                      FROM (SELECT fiscal_year fy FROM public.project_budget_lines WHERE project_id = p_project_id
                            UNION SELECT fiscal_year FROM public.project_fund_receipts WHERE project_id = p_project_id
                            UNION SELECT fiscal_year FROM public.project_expenditure WHERE project_id = p_project_id) k) y), '[]'::jsonb),
        'totals', jsonb_build_object(
            'sanctioned', (SELECT coalesce(sum(amount), 0) FROM public.project_budget_lines WHERE project_id = p_project_id),
            'received', v_received, 'spent', v_spent, 'unspent_cash', v_received - v_spent),
        'orders', coalesce((
            SELECT jsonb_agg(jsonb_build_object('received_on', r.received_on, 'fiscal_year', r.fiscal_year, 'amount', r.amount,
                                                'order_no', r.order_no, 'order_date', r.order_date,
                                                'ifd_file_no', r.ifd_file_no, 'ifd_date', r.ifd_date) ORDER BY r.received_on)
              FROM public.project_fund_receipts r WHERE r.project_id = p_project_id), '[]'::jsonb),
        'signatories', jsonb_build_array(
            jsonb_build_object('role', 'Principal Investigator', 'name', v_pi),
            jsonb_build_object('role', 'Head, PME', 'name', NULL),
            jsonb_build_object('role', 'F&AO / CoFA', 'name', NULL),
            jsonb_build_object('role', 'Director', 'name', NULL)));

    IF p_kind IN ('FIRST_RELEASE', 'NEXT_YEAR_RELEASE') THEN
        v_year := CASE WHEN p_kind = 'FIRST_RELEASE'
                       THEN (SELECT min(fiscal_year) FROM public.project_budget_lines WHERE project_id = p_project_id)
                       ELSE (SELECT min(fiscal_year) FROM public.project_budget_lines
                              WHERE project_id = p_project_id AND fiscal_year > v_fy) END;
        IF v_year IS NULL THEN
            RAISE EXCEPTION 'No sanctioned budget for % on this project', CASE WHEN p_kind = 'FIRST_RELEASE' THEN 'any year' ELSE 'a year after ' || v_fy END;
        END IF;
        SELECT coalesce(sum(amount), 0) INTO v_year_sanction FROM public.project_budget_lines
         WHERE project_id = p_project_id AND fiscal_year = v_year;
        v_pack := v_pack || jsonb_build_object('release', jsonb_build_object(
            'fiscal_year', v_year,
            'sanctioned_for_year', v_year_sanction,
            'unspent_cash', CASE WHEN p_kind = 'FIRST_RELEASE' THEN 0 ELSE v_received - v_spent END,
            'demand', CASE WHEN p_kind = 'FIRST_RELEASE' THEN v_year_sanction
                           ELSE greatest(0, v_year_sanction - (v_received - v_spent)) END,
            'by_head', coalesce((SELECT jsonb_agg(jsonb_build_object('head', head, 'amount', a) ORDER BY head)
                                   FROM (SELECT head, sum(amount) a FROM public.project_budget_lines
                                          WHERE project_id = p_project_id AND fiscal_year = v_year GROUP BY head) h), '[]'::jsonb)));
    ELSE
        SELECT * INTO v_cr FROM public.project_change_requests
         WHERE id = p_change_request_id AND project_id = p_project_id AND kind = p_kind;
        IF NOT FOUND THEN RAISE EXCEPTION 'Choose a % request of this project', lower(p_kind); END IF;
        v_pack := v_pack || jsonb_build_object(
            'change', jsonb_build_object('id', v_cr.id, 'status', v_cr.status, 'justification', v_cr.justification,
                                         'payload', v_cr.payload, 'submitted_at', v_cr.submitted_at),
            'checklist_b', (SELECT jsonb_agg(jsonb_build_object('item', c.item, 'ok', c.ok, 'detail', c.detail))
                              FROM public.project_checklist_b(v_cr.id) c));
    END IF;
    RETURN v_pack;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_parse_amount(p text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
BEGIN
    RETURN nullif(regexp_replace(coalesce(p, ''), '[^0-9.\-]+', '', 'g'), '')::numeric;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_record_expenditure(p_project_id text, p_fiscal_year text, p_period text, p_head text, p_amount numeric, p_document_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_pr public.projects%ROWTYPE;
    v_id uuid;
BEGIN
    IF NOT public.project_caller_is_office(p_project_id) THEN
        RAISE EXCEPTION 'Only PME records expenditure, and not on a project of their own';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.stage NOT IN ('ACTIVE', 'ON_HOLD', 'CLOSING') THEN
        RAISE EXCEPTION 'Expenditure can be recorded only on a running project';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Enter an amount above zero'; END IF;
    PERFORM public.project_assert_document(p_project_id, p_document_id, 'expenditure_statement');

    INSERT INTO public.project_expenditure (project_id, fiscal_year, period, head, amount, document_id, notes, recorded_by)
    VALUES (p_project_id, p_fiscal_year, p_period, p_head, p_amount, p_document_id, nullif(btrim(p_notes), ''), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_record_receipt(p_project_id text, p_received_on date, p_amount numeric, p_head text, p_source text, p_order_no text, p_order_date date, p_ifd_file_no text, p_ifd_date date, p_document_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_pr       public.projects%ROWTYPE;
    v_received numeric;
    v_id       uuid;
BEGIN
    IF NOT public.project_caller_is_office(p_project_id) THEN
        RAISE EXCEPTION 'Only PME records money received, and not on a project of their own';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING') THEN
        RAISE EXCEPTION 'Money can be recorded only on a sanctioned or running project';
    END IF;
    IF p_received_on IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Enter the date and an amount above zero';
    END IF;
    IF coalesce(btrim(p_order_no), '') = '' THEN RAISE EXCEPTION 'Enter the release order number'; END IF;
    IF v_pr.track = 'HQ' AND (coalesce(btrim(p_ifd_file_no), '') = '' OR p_ifd_date IS NULL) THEN
        RAISE EXCEPTION 'An HQ release must state the IFD concurrence file number and date';
    END IF;
    PERFORM public.project_assert_document(p_project_id, p_document_id, 'receipt_order');

    IF v_pr.proposal_id IS NOT NULL AND v_pr.sanctioned_cost IS NOT NULL THEN
        SELECT coalesce(sum(amount), 0) INTO v_received FROM public.project_fund_receipts WHERE project_id = p_project_id;
        IF v_received + p_amount > v_pr.sanctioned_cost THEN
            RAISE EXCEPTION 'This would bring receipts to % against a sanction of %. A higher cost needs a revised cost estimate.',
                v_received + p_amount, v_pr.sanctioned_cost;
        END IF;
    END IF;

    INSERT INTO public.project_fund_receipts (project_id, received_on, fiscal_year, amount, head, source,
        order_no, order_date, ifd_file_no, ifd_date, document_id, notes, recorded_by)
    VALUES (p_project_id, p_received_on, public.fiscal_year_of(p_received_on), p_amount, p_head,
        coalesce(btrim(p_source), ''), btrim(p_order_no), p_order_date, nullif(btrim(p_ifd_file_no), ''), p_ifd_date,
        p_document_id, nullif(btrim(p_notes), ''), auth.uid())
    RETURNING id INTO v_id;

    -- The first money in starts the project.
    IF v_pr.stage = 'SANCTIONED' THEN
        UPDATE public.projects SET stage = 'ACTIVE' WHERE "ProjectID" = p_project_id;
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_report_review(p_id uuid, p_decision text, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_row public.project_reports%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.project_reports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;
  IF NOT public.project_reports_can_review(v_row) THEN RAISE EXCEPTION 'not_reviewer'; END IF;
  IF v_row.status NOT IN ('SUBMITTED','UNDER_REVIEW') THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> %', v_row.status, p_decision;
  END IF;
  IF p_decision NOT IN ('REVIEWED','REVISION_REQUESTED') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  IF p_decision = 'REVISION_REQUESTED' AND (p_notes IS NULL OR length(trim(p_notes)) = 0) THEN
    RAISE EXCEPTION 'notes_required';
  END IF;

  UPDATE public.project_reports
     SET status = p_decision,
         review_notes = p_notes,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.project_report_history(report_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, v_row.status, p_decision, jsonb_build_object('notes', p_notes), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.project_report_submit(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_row public.project_reports%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.project_reports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;
  IF v_row.submitted_by <> auth.uid() THEN RAISE EXCEPTION 'not_owner'; END IF;
  IF v_row.status NOT IN ('DRAFT','REVISION_REQUESTED') THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> SUBMITTED', v_row.status;
  END IF;
  IF length(trim(v_row.objectives_progress)) = 0 THEN RAISE EXCEPTION 'objectives_progress_required'; END IF;

  UPDATE public.project_reports
     SET status = 'SUBMITTED', submitted_at = COALESCE(submitted_at, now()), updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.project_report_history(report_id, from_status, to_status, changed_by)
  VALUES (p_id, v_row.status, 'SUBMITTED', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.project_reports_answer_slot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.slot_id IS NOT NULL THEN
        UPDATE public.project_review_slots
           SET report_id = NEW.id,
               status = CASE WHEN NEW.status IN ('SUBMITTED', 'UNDER_REVIEW', 'REVIEWED') THEN 'DONE' ELSE 'PENDING' END,
               recorded_at = CASE WHEN NEW.status IN ('SUBMITTED', 'UNDER_REVIEW', 'REVIEWED') THEN coalesce(recorded_at, now()) END
         WHERE id = NEW.slot_id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_reports_can_read(d project_reports)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT d.submitted_by = (SELECT auth.uid())
      OR public.project_reports_can_review(d)
      OR public.caller_is_pme();
$$;

CREATE OR REPLACE FUNCTION public.project_reports_can_review(d project_reports)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT
    public.proposals_caller_has_role('Director')
    OR public.proposals_caller_has_role('HRAdmin')
    OR public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
    OR ((public.proposals_caller_has_role('HOD')
         OR public.proposals_caller_has_role('DivisionHead'))
        AND d.division_code IS NOT NULL
        AND d.division_code = public.proposals_caller_division());
$$;

CREATE OR REPLACE FUNCTION public.project_reports_take_slot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.slot_id IS NULL AND NEW.project_id IS NOT NULL THEN
        SELECT s.id INTO NEW.slot_id
          FROM public.project_review_slots s
         WHERE s.project_id = NEW.project_id AND s.kind = 'PROGRESS_REPORT'
           AND s.status = 'PENDING' AND s.report_id IS NULL
         ORDER BY s.due_date
         LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_reverse_entry(p_kind text, p_entry_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_project text;
    v_id      uuid;
BEGIN
    IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'Say why the entry is being reversed'; END IF;
    IF p_kind = 'receipt' THEN
        SELECT project_id INTO v_project FROM public.project_fund_receipts WHERE id = p_entry_id;
    ELSIF p_kind = 'expenditure' THEN
        SELECT project_id INTO v_project FROM public.project_expenditure WHERE id = p_entry_id;
    ELSE
        RAISE EXCEPTION 'Unknown entry kind: %', p_kind;
    END IF;
    IF v_project IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
    IF NOT public.project_caller_is_office(v_project) THEN
        RAISE EXCEPTION 'Only PME reverses entries, and not on a project of their own';
    END IF;

    IF p_kind = 'receipt' THEN
        IF EXISTS (SELECT 1 FROM public.project_fund_receipts WHERE id = p_entry_id AND reverses_id IS NOT NULL) THEN
            RAISE EXCEPTION 'A reversal cannot itself be reversed; record the entry again';
        END IF;
        IF EXISTS (SELECT 1 FROM public.project_fund_receipts WHERE reverses_id = p_entry_id) THEN
            RAISE EXCEPTION 'This entry has already been reversed';
        END IF;
        INSERT INTO public.project_fund_receipts (project_id, received_on, fiscal_year, amount, head, source,
            order_no, order_date, ifd_file_no, ifd_date, document_id, notes, reverses_id, recorded_by)
        SELECT project_id, current_date, fiscal_year, -amount, head, source, order_no, order_date, ifd_file_no, ifd_date,
               document_id, 'Reversal: ' || btrim(p_reason), id, auth.uid()
          FROM public.project_fund_receipts WHERE id = p_entry_id
        RETURNING id INTO v_id;
    ELSE
        IF EXISTS (SELECT 1 FROM public.project_expenditure WHERE id = p_entry_id AND reverses_id IS NOT NULL) THEN
            RAISE EXCEPTION 'A reversal cannot itself be reversed; record the entry again';
        END IF;
        IF EXISTS (SELECT 1 FROM public.project_expenditure WHERE reverses_id = p_entry_id) THEN
            RAISE EXCEPTION 'This entry has already been reversed';
        END IF;
        INSERT INTO public.project_expenditure (project_id, fiscal_year, period, head, amount, document_id, notes,
            reverses_id, recorded_by)
        SELECT project_id, fiscal_year, period, head, -amount, document_id, 'Reversal: ' || btrim(p_reason), id, auth.uid()
          FROM public.project_expenditure WHERE id = p_entry_id
        RETURNING id INTO v_id;
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_selection_create(p_project_id text, p_position_code text, p_mode text, p_advert_ncs_ref text, p_advert_on date, p_committee jsonb, p_exigency_note text, p_waitlist_valid_until date, p_minutes_document_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only PME or HR records a selection';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE "ProjectID" = p_project_id) THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF p_mode NOT IN ('SELECTION', 'WAITLIST', 'DIRECT') THEN RAISE EXCEPTION 'Selection, waitlist or direct engagement'; END IF;
    IF coalesce(btrim(p_position_code), '') = '' THEN RAISE EXCEPTION 'Give the position'; END IF;
    INSERT INTO public.project_selections (project_id, position_code, mode, advert_ncs_ref, advert_on, committee, exigency_note,
                                           waitlist_valid_until, minutes_document_id, created_by)
    VALUES (p_project_id, btrim(p_position_code), p_mode, nullif(btrim(p_advert_ncs_ref), ''), p_advert_on,
            coalesce(p_committee, '[]'), nullif(btrim(p_exigency_note), ''), p_waitlist_valid_until, p_minutes_document_id, auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_set_lens(p_project_id text, p_theme_code text, p_trl_target integer, p_trl_reached integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT coalesce(public.caller_is_pme() OR public.caller_has_role('MasterAdmin')
           OR EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = p_project_id AND p.pi_staff_id = public.caller_staff_id()), false) THEN
        RAISE EXCEPTION 'Only PME or the PI sets the theme and TRL';
    END IF;
    UPDATE public.projects
       SET theme_code = nullif(btrim(p_theme_code), ''), trl_target = p_trl_target, trl_reached = p_trl_reached
     WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_slot_add_minutes(p_slot_id uuid, p_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_s public.project_review_slots%ROWTYPE;
BEGIN
    SELECT * INTO v_s FROM public.project_review_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
    IF NOT public.project_caller_is_office(v_s.project_id) THEN
        RAISE EXCEPTION 'Only PME files minutes, and not on a project of their own';
    END IF;
    IF v_s.status <> 'DONE' THEN RAISE EXCEPTION 'Record the review first'; END IF;
    PERFORM public.project_assert_document(v_s.project_id, p_document_id, 'minutes');
    UPDATE public.project_review_slots SET minutes_document_id = p_document_id, minutes_due = NULL WHERE id = p_slot_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_slot_plan(p_track text, p_category text)
 RETURNS TABLE(kind text, body text, months integer[], minutes_days integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  WITH r AS (
    -- §5 minutes deadline from the rule registry, checked (committee_minutes_days).
    SELECT public.committee_minutes_days('TFM') AS tfm
  )
  SELECT v.kind, v.body, v.months, v.minutes_days FROM (VALUES
    ('PROGRESS_REPORT',      'Progress report',                 ARRAY[3, 9],        NULL::int, true),
    ('REVIEW_COMMITTEE',     'ULIP review committee',           ARRAY[3, 9],        NULL,      p_track IN ('ULIP', 'OLP')),
    ('RESEARCH_COUNCIL',     'Research Council',                ARRAY[3, 9],        NULL,      p_track = 'HQ'),
    ('TASK_FORCE',           'Task Force',                      ARRAY[3, 6, 9, 12], (SELECT tfm FROM r),         p_track = 'HQ' AND p_category IN ('MMP','FBR','NCP','FIR','FTT','FTC')),
    ('TASK_FORCE',           'Task Force (FCP)',                ARRAY[3, 9],        (SELECT tfm FROM r),         p_track = 'HQ' AND p_category = 'FCP'),
    ('MONITORING_COMMITTEE', 'External Monitoring Committee',   ARRAY[3, 9],        NULL,      p_track = 'HQ' AND p_category IN ('FBR','NCP','FIR')),
    ('STAGE_GATE',           'Stage-gate review',               ARRAY[3, 9],        NULL,      p_track = 'HQ' AND p_category IN ('MMP','FTT','FTC'))
  ) v(kind, body, months, minutes_days, applies)
  WHERE applies;
$$;

CREATE OR REPLACE FUNCTION public.project_slot_record(p_slot_id uuid, p_held_on date, p_decision text, p_outcome text, p_minutes_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_s     public.project_review_slots%ROWTYPE;
    v_stage text;
BEGIN
    SELECT * INTO v_s FROM public.project_review_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
    IF NOT public.project_caller_is_office(v_s.project_id) THEN
        RAISE EXCEPTION 'Only PME records a review, and not on a project of their own';
    END IF;
    IF v_s.kind = 'PROGRESS_REPORT' THEN RAISE EXCEPTION 'A progress report is answered by filing the report'; END IF;
    IF v_s.status <> 'PENDING' THEN RAISE EXCEPTION 'This review has already been recorded'; END IF;
    IF p_held_on IS NULL THEN RAISE EXCEPTION 'Give the date the review was held'; END IF;
    IF NOT coalesce(CASE WHEN v_s.kind = 'STAGE_GATE'
                         THEN p_decision IN ('GO', 'CONDITIONAL_GO', 'HOLD', 'KILL', 'RECYCLE')
                         ELSE p_decision IN ('CONTINUE', 'CONTINUE_WITH_CHANGES', 'HOLD', 'FORECLOSURE_RECOMMENDED') END, false) THEN
        RAISE EXCEPTION 'Decision % does not apply to a %', coalesce(p_decision, '(none)'), lower(v_s.body);
    END IF;
    IF p_minutes_document_id IS NOT NULL THEN
        PERFORM public.project_assert_document(v_s.project_id, p_minutes_document_id, 'minutes');
    END IF;

    UPDATE public.project_review_slots
       SET status = 'DONE', held_on = p_held_on, decision = p_decision, outcome = nullif(btrim(p_outcome), ''),
           minutes_document_id = p_minutes_document_id,
           minutes_due = CASE WHEN p_minutes_document_id IS NULL AND minutes_days IS NOT NULL
                              THEN p_held_on + minutes_days END,
           recorded_by = auth.uid(), recorded_at = now()
     WHERE id = p_slot_id;

    SELECT stage INTO v_stage FROM public.projects WHERE "ProjectID" = v_s.project_id;
    IF p_decision = 'HOLD' AND v_stage = 'ACTIVE' THEN
        UPDATE public.projects SET stage = 'ON_HOLD' WHERE "ProjectID" = v_s.project_id;
    ELSIF p_decision IN ('CONTINUE', 'CONTINUE_WITH_CHANGES', 'GO', 'CONDITIONAL_GO') AND v_stage = 'ON_HOLD' THEN
        UPDATE public.projects SET stage = 'ACTIVE' WHERE "ProjectID" = v_s.project_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_slot_schedule(p_slot_id uuid, p_meeting_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_s  public.project_review_slots%ROWTYPE;
    v_pr public.projects%ROWTYPE;
    v_by text;
BEGIN
    SELECT * INTO v_s FROM public.project_review_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
    IF NOT public.project_caller_is_office(v_s.project_id) THEN
        RAISE EXCEPTION 'Only PME schedules a review, and not on a project of their own';
    END IF;
    IF v_s.kind = 'PROGRESS_REPORT' THEN RAISE EXCEPTION 'A progress report is not held at a meeting'; END IF;
    IF v_s.status <> 'PENDING' THEN RAISE EXCEPTION 'This review has already been held'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.meetings WHERE id = p_meeting_id) THEN RAISE EXCEPTION 'Meeting not found'; END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = v_s.project_id;
    SELECT "ID" INTO v_by FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

    UPDATE public.project_review_slots SET meeting_id = p_meeting_id WHERE id = p_slot_id;
    DELETE FROM public.agenda_items WHERE subject_type = 'project_review' AND subject_id = p_slot_id::text;
    INSERT INTO public.agenda_items (meeting_id, sequence, description, proposed_by, subject_type, subject_id)
    VALUES (p_meeting_id,
            coalesce((SELECT max(sequence) FROM public.agenda_items WHERE meeting_id = p_meeting_id), 0) + 1,
            v_s.body || ' — ' || v_pr."ProjectNo" || ' ' || coalesce(v_pr."ProjectName", '') || ' (' || v_s.period_label || ')',
            coalesce(v_by, 'PME'), 'project_review', p_slot_id::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.project_staff_backfill()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    r   record;
    v_n integer := 0;
BEGIN
    IF auth.uid() IS NOT NULL
       AND NOT (public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only PME or HR brings legacy project staff in';
    END IF;

    WITH uniq AS (
        SELECT public.project_no_key(p."ProjectNo") AS k, min(p."ProjectID") AS id
          FROM public.projects p
         WHERE public.project_no_key(p."ProjectNo") IS NOT NULL
         GROUP BY 1 HAVING count(*) = 1
    )
    UPDATE public.project_staff ps SET project_id = u.id
      FROM uniq u
     WHERE ps.project_id IS NULL AND public.project_no_key(ps."ProjectNo") = u.k;

    FOR r IN
        SELECT min(ps.id) AS id FROM public.project_staff ps
         WHERE ps.person_id IS NULL AND public.person_name_key(ps."StaffName") IS NOT NULL
         GROUP BY public.person_name_key(ps."StaffName") HAVING count(*) = 1
    LOOP
        PERFORM public.project_staff_link_rows(ARRAY[r.id], NULL);
        v_n := v_n + 1;
    END LOOP;

    INSERT INTO public.project_engagements (person_id, project_id, position_code, from_on, to_on, legacy_project_staff_id, created_by)
    SELECT ps.person_id, ps.project_id, coalesce(nullif(btrim(ps."Designation"), ''), 'UNSPECIFIED'), ps.joined_on,
           greatest(coalesce(ps.project_ends_on, pr.end_date, ps.joined_on), ps.joined_on), ps.id, auth.uid()
      FROM public.project_staff ps
      JOIN public.projects pr ON pr."ProjectID" = ps.project_id
     WHERE ps.person_id IS NOT NULL AND ps.joined_on IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.project_engagements e WHERE e.legacy_project_staff_id = ps.id);

    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_staff_caller_keeps()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT coalesce(public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin'), false);
$$;

CREATE OR REPLACE FUNCTION public.project_staff_leave_add(p_engagement_id uuid, p_kind text, p_from date, p_to date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_days  integer := p_to - p_from + 1;
    v_limit integer;
    v_used  integer;
    v_id    uuid;
BEGIN
    IF NOT public.project_staff_caller_keeps() THEN
        RAISE EXCEPTION 'Only PME or HR records leave';
    END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Give the leave dates'; END IF;
    PERFORM 1 FROM public.project_engagements WHERE id = p_engagement_id AND p_from >= from_on AND p_to <= to_on FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Leave must fall within the engagement'; END IF;
    IF p_kind = 'PAID' THEN
        v_limit := public.csir_rule('project_staff.paid_leave_days_per_year')::int;
        SELECT coalesce(sum(to_on - from_on + 1), 0) INTO v_used FROM public.project_staff_leave
         WHERE engagement_id = p_engagement_id AND kind = 'PAID' AND public.fiscal_year_of(from_on) = public.fiscal_year_of(p_from);
        IF v_used + v_days > v_limit THEN RAISE EXCEPTION 'Paid leave: % of % days used this year', v_used, v_limit; END IF;
    ELSIF p_kind IN ('MATERNITY', 'PATERNITY') THEN
        v_limit := public.csir_rule(CASE p_kind WHEN 'MATERNITY' THEN 'project_staff.maternity_leave_days' ELSE 'project_staff.paternity_leave_days' END)::int;
        IF v_days > v_limit THEN RAISE EXCEPTION '% leave is up to % days', initcap(lower(p_kind)), v_limit; END IF;
    ELSIF p_kind <> 'OTHER' THEN
        RAISE EXCEPTION 'Paid, maternity, paternity or other';
    END IF;
    INSERT INTO public.project_staff_leave (engagement_id, kind, from_on, to_on, recorded_by)
    VALUES (p_engagement_id, p_kind, p_from, p_to, auth.uid()) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_staff_legacy_pending()
 RETURNS TABLE(name_key text, legacy_ids text[], names text[], projects text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.person_name_key(ps."StaffName"), array_agg(ps.id ORDER BY ps.id), array_agg(DISTINCT ps."StaffName"),
         array_agg(DISTINCT coalesce(ps.project_id, ps."ProjectNo"))
    FROM public.project_staff ps
   WHERE ps.person_id IS NULL AND public.person_name_key(ps."StaffName") IS NOT NULL
   GROUP BY 1
  HAVING count(*) > 1
   ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.project_staff_link_legacy(p_legacy_ids text[], p_person_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT (public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only PME or HR brings legacy project staff in';
    END IF;
    IF coalesce(cardinality(p_legacy_ids), 0) = 0 THEN RAISE EXCEPTION 'Choose the legacy rows'; END IF;
    RETURN public.project_staff_link_rows(p_legacy_ids, p_person_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.project_staff_link_rows(p_legacy_ids text[], p_person_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_person uuid := p_person_id;
    r        record;
BEGIN
    IF v_person IS NULL THEN
        INSERT INTO public.project_staff_persons (name)
        SELECT btrim(ps."StaffName") FROM public.project_staff ps WHERE ps.id = p_legacy_ids[1]
        RETURNING id INTO v_person;
        IF v_person IS NULL THEN RAISE EXCEPTION 'Legacy row % not found', p_legacy_ids[1]; END IF;
    END IF;
    FOR r IN SELECT * FROM public.project_staff ps WHERE ps.id = ANY (p_legacy_ids) AND ps.person_id IS NULL LOOP
        IF r.project_id IS NOT NULL AND r.joined_on IS NOT NULL THEN
            INSERT INTO public.project_engagements (person_id, project_id, position_code, from_on, to_on, legacy_project_staff_id, created_by)
            VALUES (v_person, r.project_id, coalesce(nullif(btrim(r."Designation"), ''), 'UNSPECIFIED'), r.joined_on,
                    greatest(coalesce(r.project_ends_on, (SELECT end_date FROM public.projects WHERE "ProjectID" = r.project_id), r.joined_on), r.joined_on),
                    r.id, auth.uid());
        END IF;
        UPDATE public.project_staff SET person_id = v_person WHERE id = r.id;
    END LOOP;
    RETURN v_person;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_staff_person_save(p_id uuid, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_id uuid := p_id;
BEGIN
    IF NOT (public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only PME or HR keeps project staff records';
    END IF;
    IF coalesce(btrim(p ->> 'name'), '') = '' THEN RAISE EXCEPTION 'Give the name'; END IF;
    IF v_id IS NULL THEN
        INSERT INTO public.project_staff_persons (name) VALUES (btrim(p ->> 'name')) RETURNING id INTO v_id;
    END IF;
    UPDATE public.project_staff_persons SET
        name = btrim(p ->> 'name'),
        born_on = (p ->> 'born_on')::date,
        category = nullif(p ->> 'category', ''),
        gender = nullif(p ->> 'gender', ''),
        phd_registered_on = (p ->> 'phd_registered_on')::date,
        thesis_submitted_on = (p ->> 'thesis_submitted_on')::date,
        abroad_last_5y = coalesce((p ->> 'abroad_last_5y')::boolean, false),
        antecedents_verified_on = (p ->> 'antecedents_verified_on')::date
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Person not found'; END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_staff_tenure_days(p_person_id uuid, p_on date, p_extra_from date DEFAULT NULL::date, p_extra_to date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  WITH spans AS (
      SELECT from_on, least(to_on, p_on) AS to_on FROM public.project_engagements
       WHERE person_id = p_person_id AND from_on <= p_on
      UNION ALL
      SELECT p_extra_from, p_extra_to WHERE p_extra_from IS NOT NULL
  ), days AS (
      SELECT DISTINCT d::date AS d FROM spans, generate_series(spans.from_on, spans.to_on, interval '1 day') d
  )
  SELECT count(*)::int FROM days, public.project_staff_persons p
   WHERE p.id = p_person_id
     AND NOT (p.phd_registered_on IS NOT NULL
              AND days.d >= p.phd_registered_on
              AND days.d <= coalesce(p.thesis_submitted_on, days.d));
$$;

CREATE OR REPLACE FUNCTION public.project_stage_deliverable_record(p_project_id text, p_item_key text, p_document_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT coalesce(public.caller_is_pme() OR public.caller_has_role('MasterAdmin')
                    OR public.project_caller_is_pi(p_project_id), false) THEN
        RAISE EXCEPTION 'Only the PI or PME records a stage deliverable';
    END IF;
    IF coalesce(public.project_category(p_project_id), '') NOT IN ('FTT', 'FTC', 'MMP') THEN
        RAISE EXCEPTION 'Stage gates apply to FTT, FTC and MMP projects';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_stage_items WHERE item_key = p_item_key) THEN
        RAISE EXCEPTION 'Unknown deliverable: %', p_item_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_documents d
                    WHERE d.id = p_document_id AND d.project_id = p_project_id AND d.doc_type = 'stage_deliverable') THEN
        RAISE EXCEPTION 'Attach the deliverable to this project first';
    END IF;
    INSERT INTO public.project_stage_deliverables (project_id, item_key, document_id, done_by)
    VALUES (p_project_id, p_item_key, p_document_id, auth.uid())
    ON CONFLICT (project_id, item_key) DO UPDATE
       SET document_id = EXCLUDED.document_id, done_by = EXCLUDED.done_by, done_at = now();
    INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
    VALUES (p_project_id, auth.uid(), 'stage_gate',
            'Stage ' || (SELECT stage FROM public.project_stage_items WHERE item_key = p_item_key) || ' deliverable on file: '
                || (SELECT label FROM public.project_stage_items WHERE item_key = p_item_key), p_item_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.project_stage_label(p_stage text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT CASE p_stage
    WHEN 'SANCTIONED' THEN 'Sanctioned'
    WHEN 'ACTIVE'     THEN 'Active'
    WHEN 'ON_HOLD'    THEN 'On Hold'
    WHEN 'CLOSING'    THEN 'Closing'
    WHEN 'CLOSED'     THEN 'Completed'
    WHEN 'ARCHIVED'   THEN 'Archived'
    WHEN 'FORECLOSED' THEN 'Foreclosed'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.project_stage_of_status(p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT CASE lower(btrim(coalesce(p_status, '')))
    WHEN 'active'      THEN 'ACTIVE'
    WHEN 'ongoing'     THEN 'ACTIVE'
    WHEN 'on-going'    THEN 'ACTIVE'
    WHEN 'on going'    THEN 'ACTIVE'
    WHEN 'running'     THEN 'ACTIVE'
    WHEN 'in progress' THEN 'ACTIVE'
    WHEN 'sanctioned'  THEN 'SANCTIONED'
    WHEN 'approved'    THEN 'SANCTIONED'
    WHEN 'on hold'     THEN 'ON_HOLD'
    WHEN 'on-hold'     THEN 'ON_HOLD'
    WHEN 'hold'        THEN 'ON_HOLD'
    WHEN 'closing'     THEN 'CLOSING'
    WHEN 'completed'   THEN 'CLOSED'
    WHEN 'complete'    THEN 'CLOSED'
    WHEN 'closed'      THEN 'CLOSED'
    WHEN 'archived'    THEN 'ARCHIVED'
    WHEN 'foreclosed'  THEN 'FORECLOSED'
    WHEN 'terminated'  THEN 'FORECLOSED'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.project_transfer_gaps()
 RETURNS TABLE(project_id text, project_no text, transfer_title text, missing text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT p."ProjectID", p."ProjectNo", t.technology_title,
         ARRAY(SELECT i.label FROM public.project_stage_items i
                WHERE i.stage = 6
                  AND NOT EXISTS (SELECT 1 FROM public.project_stage_deliverables d
                                   WHERE d.project_id = p."ProjectID" AND d.item_key = i.item_key)
                ORDER BY i.sort)
    FROM public.tech_transfers t
    JOIN public.projects p ON p."ProjectID" = t.project_id
                           OR (t.project_id IS NULL AND t.linked_project_no = p."ProjectNo")
   WHERE public.project_category(p."ProjectID") IN ('FTT', 'FTC', 'MMP')
     AND t.status <> 'Terminated'
     AND EXISTS (SELECT 1 FROM public.project_stage_items i
                  WHERE i.stage = 6 AND NOT EXISTS (SELECT 1 FROM public.project_stage_deliverables d
                                                     WHERE d.project_id = p."ProjectID" AND d.item_key = i.item_key))
   ORDER BY p."ProjectNo";
$$;

CREATE OR REPLACE FUNCTION public.projects_archived_readonly()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF OLD.stage = 'ARCHIVED' AND row(NEW.*) IS DISTINCT FROM row(OLD.*) THEN
        RAISE EXCEPTION 'Project % is archived and read-only', OLD."ProjectNo";
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.projects_default_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF NEW."ApprovalAuthority" IS NULL THEN
        NEW."ApprovalAuthority" := CASE NEW.track
            WHEN 'OLP' THEN 'Director, CSIR-AMPRI'
            WHEN 'EFP' THEN coalesce(nullif(btrim(NEW."SponsorerName"), ''), 'Sponsor')
        END;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.projects_derive_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.stage IS NULL THEN
            NEW.stage := public.project_stage_of_status(NEW."ProjectStatus");
        ELSE
            NEW."ProjectStatus" := public.project_stage_label(NEW.stage);
        END IF;
        NEW.sanctioned_cost := coalesce(NEW.sanctioned_cost, public.project_parse_amount(NEW."SanctionedCost"));
        NEW.start_date      := coalesce(NEW.start_date, public.try_parse_date(NEW."StartDate"));
        NEW.end_date        := coalesce(NEW.end_date, public.try_parse_date(NEW."CompletioDate"));
        RETURN NEW;
    END IF;

    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
        IF NEW.stage IS NOT NULL THEN
            NEW."ProjectStatus" := public.project_stage_label(NEW.stage);
        END IF;
    ELSIF NEW."ProjectStatus" IS DISTINCT FROM OLD."ProjectStatus" THEN
        NEW.stage := public.project_stage_of_status(NEW."ProjectStatus");
    END IF;

    IF NEW."SanctionedCost" IS DISTINCT FROM OLD."SanctionedCost" THEN
        NEW.sanctioned_cost := public.project_parse_amount(NEW."SanctionedCost");
    END IF;
    IF NEW."StartDate" IS DISTINCT FROM OLD."StartDate" THEN
        NEW.start_date := public.try_parse_date(NEW."StartDate");
    END IF;
    IF NEW."CompletioDate" IS DISTINCT FROM OLD."CompletioDate" THEN
        NEW.end_date := public.try_parse_date(NEW."CompletioDate");
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.projects_regenerate_slots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    PERFORM public.project_generate_slots(NEW."ProjectID");
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.projects_resync_child_keys()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_no text := nullif(btrim(NEW."ProjectNo"), '');
    v_n  int;
    v_id text;
BEGIN
    IF v_no IS NULL OR (TG_OP = 'UPDATE' AND NEW."ProjectNo" IS NOT DISTINCT FROM OLD."ProjectNo") THEN
        RETURN NULL;
    END IF;

    SELECT count(*), min("ProjectID") INTO v_n, v_id FROM public.projects WHERE "ProjectNo" = v_no;
    IF v_n > 2 THEN
        RETURN NULL;
    END IF;
    IF v_n = 2 THEN
        v_id := NULL;
    END IF;

    UPDATE public.proposals pr SET project_id = v_id
     WHERE btrim(pr.linked_project_no) = v_no AND pr.project_id IS DISTINCT FROM v_id
       AND NOT EXISTS (SELECT 1 FROM public.projects x WHERE x.proposal_id = pr.id);
    UPDATE public.project_reports SET project_id = v_id WHERE btrim(project_no) = v_no        AND project_id IS DISTINCT FROM v_id;
    UPDATE public.project_staff   SET project_id = v_id WHERE btrim("ProjectNo") = v_no       AND project_id IS DISTINCT FROM v_id;
    UPDATE public.phd_students    SET project_id = v_id WHERE btrim("ProjectNo") = v_no       AND project_id IS DISTINCT FROM v_id;
    UPDATE public.mous            SET project_id = v_id WHERE btrim(linked_project_no) = v_no AND project_id IS DISTINCT FROM v_id;
    UPDATE public.tech_transfers  SET project_id = v_id WHERE btrim(linked_project_no) = v_no AND project_id IS DISTINCT FROM v_id;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_approve(p_id uuid, p_amount numeric, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'amount_required'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'sanction_date_required'; END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'RECOMMENDED' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> APPROVED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'APPROVED',
         sanctioned_amount     = p_amount,
         sanction_date         = p_date,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'RECOMMENDED', 'APPROVED',
          jsonb_build_object('sanctioned_amount', p_amount, 'sanction_date', p_date),
          auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_archive(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'OM_ISSUED' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> ARCHIVED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'ARCHIVED',
         archived              = true,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'OM_ISSUED', 'ARCHIVED', '{}'::jsonb, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_budget_lines_sync_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE
    v_id uuid := coalesce(NEW.proposal_id, OLD.proposal_id);
BEGIN
    UPDATE public.proposals
       SET requested_budget = (SELECT coalesce(sum(amount), 0) FROM public.proposal_budget_lines WHERE proposal_id = v_id)
     WHERE id = v_id
       AND status IN ('DRAFT', 'REVISION_REQUESTED');
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_caller_is_copi(p_proposal_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.proposal_copis c
         WHERE c.proposal_id = p_proposal_id
           AND c.staff_id = public.caller_staff_id()
    );
$$;

CREATE OR REPLACE FUNCTION public.proposal_caller_is_party(p proposals)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT p.pi_user_id = (SELECT auth.uid())
      OR p.created_by = (SELECT auth.uid())
      OR public.proposal_caller_is_copi(p.id);
$$;

CREATE OR REPLACE FUNCTION public.proposal_caller_may_act(p proposals, p_kind text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT NOT public.proposal_caller_is_party(p)
     AND (
       public.caller_has_role('MasterAdmin')
       OR CASE p_kind
            WHEN 'PME_VETTING'         THEN public.caller_is_pme()
            WHEN 'FINANCE'             THEN public.caller_has_role('FinanceAdmin')
            -- The committee decides; PME or the scheme leader records it.
            WHEN 'REVIEW_COMMITTEE'    THEN public.caller_is_pme()
                                         OR EXISTS (SELECT 1 FROM public.project_schemes s
                                                     WHERE s.code = p.track AND s.leader_user_id = (SELECT auth.uid()))
            -- The Director signs on paper; the Director or PME records it with the scan.
            WHEN 'DIRECTOR_APPROVAL'   THEN public.caller_has_role('Director') OR public.caller_is_pme()
            WHEN 'DIRECTOR_FORWARD'    THEN public.caller_has_role('Director') OR public.caller_is_pme()
            -- Decided at CSIR HQ; recorded here, never performed (plan §12).
            WHEN 'HQ_SCREENING'        THEN public.caller_is_pme()
            WHEN 'HQ_EXPERT'           THEN public.caller_is_pme()
            WHEN 'COMPETENT_AUTHORITY' THEN public.caller_is_pme()
            WHEN 'SANCTION'            THEN public.caller_is_pme()
            ELSE false
          END
     );
$$;

CREATE OR REPLACE FUNCTION public.proposal_caller_may_review(p proposals)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(coalesce(public.proposal_step_kinds(p.track),
                                  ARRAY['PME_VETTING']) || ARRAY['SANCTION']) k
     WHERE public.proposal_caller_may_act(p, k));
$$;

CREATE OR REPLACE FUNCTION public.proposal_issue_om(p_id uuid, p_om_no text, p_om_date date, p_doc_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_om_no IS NULL OR length(trim(p_om_no)) = 0 THEN RAISE EXCEPTION 'om_number_required'; END IF;
  IF p_om_date IS NULL THEN RAISE EXCEPTION 'om_date_required'; END IF;
  IF p_doc_id IS NULL THEN RAISE EXCEPTION 'om_document_required'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.proposal_documents
    WHERE id = p_doc_id AND proposal_id = p_id AND doc_type = 'om_document'
  ) THEN
    RAISE EXCEPTION 'om_document_not_found';
  END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> OM_ISSUED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'OM_ISSUED',
         om_number             = p_om_no,
         om_date               = p_om_date,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'APPROVED', 'OM_ISSUED',
          jsonb_build_object('om_number', p_om_no, 'om_date', p_om_date, 'om_doc_id', p_doc_id),
          auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_link_project(p_id uuid, p_project_no text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_exists boolean;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_project_no IS NULL OR length(trim(p_project_no)) = 0 THEN
    RAISE EXCEPTION 'project_no_required';
  END IF;
  IF to_regclass('public.projects') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.projects WHERE "ProjectNo" = $1)'
      INTO v_exists USING p_project_no;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'project_not_found';
    END IF;
  END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'OM_ISSUED' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> LINKED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'LINKED',
         linked_project_no     = p_project_no,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'OM_ISSUED', 'LINKED',
          jsonb_build_object('linked_project_no', p_project_no), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_missing_fields(p proposals)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN coalesce(btrim(p.title), '') = ''             THEN 'title' END,
    CASE WHEN p.track IS NULL                               THEN 'track' END,
    CASE WHEN coalesce(btrim(p.abstract), '') = ''          THEN 'abstract' END,
    CASE WHEN coalesce(btrim(p.problem_statement), '') = '' THEN 'problem_statement' END,
    CASE WHEN coalesce(btrim(p.domain_theme), '') = ''      THEN 'domain_theme' END,
    CASE WHEN coalesce(btrim(p.objectives), '') = ''        THEN 'objectives' END,
    CASE WHEN coalesce(btrim(p.expected_outcomes), '') = '' THEN 'expected_outcomes' END,
    CASE WHEN p.track = 'HQ' AND p.category_code IS NULL    THEN 'category_code' END,
    CASE WHEN p.track IS DISTINCT FROM 'HQ'
          AND coalesce(btrim(p.project_category), '') = ''  THEN 'project_category' END,
    CASE WHEN p.proposed_start_date IS NULL                 THEN 'proposed_start_date' END,
    CASE WHEN p.proposed_duration_months IS NULL            THEN 'proposed_duration_months' END,
    CASE WHEN coalesce(btrim(p.pi_name), '') = ''           THEN 'pi_name' END,
    CASE WHEN coalesce(btrim(p.division_code), '') = ''     THEN 'division_code' END,
    CASE WHEN coalesce(p.requested_budget, 0) <= 0          THEN 'requested_budget' END,
    CASE WHEN coalesce(btrim(p.fund_type), '') = ''         THEN 'fund_type' END,
    CASE WHEN coalesce(btrim(p.sponsor_type), '') = ''      THEN 'sponsor_type' END,
    CASE WHEN coalesce(btrim(p.sponsor_name), '') = ''      THEN 'sponsor_name' END
  ], NULL);
$$;

CREATE OR REPLACE FUNCTION public.proposal_open_round(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_row   public.proposals%ROWTYPE;
    v_round int;
    v_kinds text[];
    v_rank  int;
    i       int;
    v_rank_of CONSTANT jsonb := '{"SUBMITTED":0,"UNDER_REVIEW":1,"RECOMMENDED":2,"APPROVED":3,"OM_ISSUED":4}';
BEGIN
    SELECT * INTO v_row FROM public.proposals WHERE id = p_id;
    v_kinds := public.proposal_step_kinds(v_row.track);
    IF v_kinds IS NULL THEN
        RAISE EXCEPTION 'Choose in-house (ULIP) or HQ scheme before review can begin';
    END IF;
    SELECT coalesce(max(round), 0) + 1 INTO v_round FROM public.proposal_review_steps WHERE proposal_id = p_id;
    v_rank := coalesce((v_rank_of ->> v_row.status)::int, 0);
    FOR i IN 1 .. array_length(v_kinds, 1) LOOP
        INSERT INTO public.proposal_review_steps (proposal_id, round, seq, kind, status, notes)
        VALUES (p_id, v_round, i, v_kinds[i],
                CASE WHEN v_rank > 0 AND (v_rank_of ->> public.proposal_status_after(v_kinds[i]))::int <= v_rank
                     THEN 'SKIPPED' ELSE 'PENDING' END,
                CASE WHEN v_rank > 0 AND (v_rank_of ->> public.proposal_status_after(v_kinds[i]))::int <= v_rank
                     THEN 'Passed before step tracking began' END);
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_readiness(p_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.proposal_missing_fields(p) || array_remove(ARRAY[
    CASE WHEN EXISTS (SELECT 1 FROM public.proposal_budget_lines b
                       WHERE b.proposal_id = p.id AND b.head = 'EQUIPMENT'
                         AND b.amount >= public.csir_rule('project.major_equipment_threshold_inr')::numeric)
          AND NOT EXISTS (SELECT 1 FROM public.proposal_documents d
                           WHERE d.proposal_id = p.id AND d.doc_type = 'quotation')
         THEN 'equipment_quotation' END,
    CASE WHEN p.track = 'HQ' AND coalesce(p.category_code, '') NOT IN ('MMP', 'FCP')
          AND EXISTS (SELECT 1 FROM public.proposal_budget_lines b
                       WHERE b.proposal_id = p.id AND b.head = 'WORKS')
         THEN 'works_not_allowed' END
  ], NULL)
  FROM public.proposals p WHERE p.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.proposal_recommend(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> RECOMMENDED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'RECOMMENDED',
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'UNDER_REVIEW', 'RECOMMENDED', '{}'::jsonb, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_record_step(p_step_id uuid, p_decision text, p_notes text, p_document_id uuid, p_meeting_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_step public.proposal_review_steps%ROWTYPE;
    v_row  public.proposals%ROWTYPE;
    v_next text;
    v_from text;
BEGIN
    SELECT * INTO v_step FROM public.proposal_review_steps WHERE id = p_step_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Step not found'; END IF;
    SELECT * INTO v_row FROM public.proposals WHERE id = v_step.proposal_id FOR UPDATE;

    IF NOT public.proposal_caller_may_act(v_row, v_step.kind) THEN
        RAISE EXCEPTION 'You cannot record this step on this proposal';
    END IF;
    IF v_row.status NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED') THEN
        RAISE EXCEPTION 'This proposal is not under review';
    END IF;
    IF v_step.status <> 'PENDING' THEN RAISE EXCEPTION 'This step has already been recorded'; END IF;
    IF v_step.round <> (SELECT max(round) FROM public.proposal_review_steps WHERE proposal_id = v_row.id)
       OR EXISTS (SELECT 1 FROM public.proposal_review_steps s
                   WHERE s.proposal_id = v_row.id AND s.round = v_step.round
                     AND s.seq < v_step.seq AND s.status = 'PENDING') THEN
        RAISE EXCEPTION 'An earlier step is still pending';
    END IF;
    IF p_meeting_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.meetings WHERE id = p_meeting_id) THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;

    v_from := v_row.status;

    IF p_decision = 'APPROVE' THEN
        IF p_document_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.proposal_documents d
             WHERE d.id = p_document_id AND d.proposal_id = v_row.id AND d.doc_type = 'step_scan') THEN
            RAISE EXCEPTION 'Upload the signed scan for this step first';
        END IF;
        UPDATE public.proposal_review_steps
           SET status = 'DONE', decided_by = auth.uid(), decided_at = now(),
               notes = nullif(btrim(p_notes), ''), document_id = p_document_id, meeting_id = p_meeting_id
         WHERE id = v_step.id;
        v_next := public.proposal_status_after(v_step.kind);
        UPDATE public.proposals
           SET status = v_next, updated_at = now(),
               last_status_change_by = auth.uid(), last_status_change_at = now()
         WHERE id = v_row.id;

    ELSIF p_decision = 'RETURN' THEN
        IF coalesce(btrim(p_notes), '') = '' AND NOT EXISTS (
            SELECT 1 FROM public.proposal_review_comments c
             WHERE c.proposal_id = v_row.id AND c.resolved_at IS NULL) THEN
            RAISE EXCEPTION 'Say what needs to change: add a note or a comment on a section';
        END IF;
        UPDATE public.proposal_review_steps
           SET status = 'RETURNED', decided_by = auth.uid(), decided_at = now(),
               notes = nullif(btrim(p_notes), ''), document_id = p_document_id, meeting_id = p_meeting_id
         WHERE id = v_step.id;
        UPDATE public.proposal_review_steps SET status = 'SKIPPED'
         WHERE proposal_id = v_row.id AND round = v_step.round AND status = 'PENDING';
        v_next := 'REVISION_REQUESTED';
        UPDATE public.proposals
           SET status = v_next, revision_notes = nullif(btrim(p_notes), ''), updated_at = now(),
               last_status_change_by = auth.uid(), last_status_change_at = now()
         WHERE id = v_row.id;

    ELSIF p_decision = 'REJECT' THEN
        IF coalesce(btrim(p_notes), '') = '' THEN RAISE EXCEPTION 'Give the reason for rejection'; END IF;
        UPDATE public.proposal_review_steps
           SET status = 'REJECTED', decided_by = auth.uid(), decided_at = now(),
               notes = btrim(p_notes), document_id = p_document_id, meeting_id = p_meeting_id
         WHERE id = v_step.id;
        UPDATE public.proposal_review_steps SET status = 'SKIPPED'
         WHERE proposal_id = v_row.id AND round = v_step.round AND status = 'PENDING';
        v_next := 'REJECTED';
        UPDATE public.proposals
           SET status = v_next, rejection_reason = btrim(p_notes), updated_at = now(),
               last_status_change_by = auth.uid(), last_status_change_at = now()
         WHERE id = v_row.id;
    ELSE
        RAISE EXCEPTION 'Unknown decision: %', p_decision;
    END IF;

    INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
    VALUES (v_row.id, v_from, v_next,
            jsonb_build_object('step', v_step.kind, 'decision', p_decision,
                               'notes', nullif(btrim(p_notes), ''), 'document_id', p_document_id),
            auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_reject(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> REJECTED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'REJECTED',
         rejection_reason      = p_reason,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'UNDER_REVIEW', 'REJECTED',
          jsonb_build_object('rejection_reason', p_reason), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_request_revision(p_id uuid, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) = 0 THEN RAISE EXCEPTION 'notes_required'; END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> REVISION_REQUESTED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'REVISION_REQUESTED',
         revision_notes        = p_notes,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'UNDER_REVIEW', 'REVISION_REQUESTED',
          jsonb_build_object('revision_notes', p_notes), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_restore_version(p_version_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_ver public.proposal_versions%ROWTYPE;
    v_row public.proposals%ROWTYPE;
    v_old public.proposals%ROWTYPE;
BEGIN
    SELECT * INTO v_ver FROM public.proposal_versions WHERE id = p_version_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Version not found'; END IF;

    SELECT * INTO v_row FROM public.proposals WHERE id = v_ver.proposal_id FOR UPDATE;
    IF v_row.created_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Only the proposal''s author can restore a version';
    END IF;
    IF v_row.status NOT IN ('DRAFT', 'REVISION_REQUESTED') THEN
        RAISE EXCEPTION 'A version can be restored only while the proposal is being drafted or revised';
    END IF;

    PERFORM public.proposal_snapshot_version(v_row.id, 'Before restoring version ' || v_ver.version_no, 'manual');

    v_old := jsonb_populate_record(NULL::public.proposals, v_ver.snapshot -> 'proposal');

    -- Content only. Status, review outcome and sanction details are the
    -- workflow's, not the draft's, and are never rolled back.
    UPDATE public.proposals SET
        title                    = v_old.title,
        acronym                  = v_old.acronym,
        track                    = v_old.track,
        domain_theme             = v_old.domain_theme,
        fund_type                = v_old.fund_type,
        sponsor_type             = v_old.sponsor_type,
        sponsor_name             = v_old.sponsor_name,
        project_category         = v_old.project_category,
        proposed_start_date      = v_old.proposed_start_date,
        proposed_duration_months = v_old.proposed_duration_months,
        requested_budget         = v_old.requested_budget,
        pi_name                  = v_old.pi_name,
        division_code            = v_old.division_code,
        abstract                 = v_old.abstract,
        problem_statement        = v_old.problem_statement,
        objectives               = v_old.objectives,
        expected_outcomes        = v_old.expected_outcomes,
        current_trl              = v_old.current_trl,
        target_trl               = v_old.target_trl,
        updated_at               = now()
     WHERE id = v_row.id;

    DELETE FROM public.proposal_copis WHERE proposal_id = v_row.id;
    INSERT INTO public.proposal_copis (proposal_id, staff_id, staff_name)
    SELECT v_row.id, c ->> 'staff_id', c ->> 'staff_name'
      FROM jsonb_array_elements(coalesce(v_ver.snapshot -> 'copis', '[]'::jsonb)) c;
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_sanction(p_id uuid, p_project_no text, p_sanction_ref text, p_sanction_date date, p_amount numeric, p_document_id uuid, p_project_id text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_row   public.proposals%ROWTYPE;
    v_pid   text;
    v_no    text := btrim(coalesce(p_project_no, ''));
    v_start date;
    v_end   date;
    v_staff text;
BEGIN
    SELECT * INTO v_row FROM public.proposals WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
    IF NOT public.proposal_caller_may_act(v_row, 'SANCTION') THEN
        RAISE EXCEPTION 'Only PME can record the sanction';
    END IF;
    IF v_row.status NOT IN ('APPROVED', 'OM_ISSUED') THEN
        RAISE EXCEPTION 'The proposal must be approved before it is sanctioned';
    END IF;
    IF EXISTS (SELECT 1 FROM public.proposal_review_steps
                WHERE proposal_id = p_id AND status = 'PENDING') THEN
        RAISE EXCEPTION 'A review step is still pending';
    END IF;
    IF v_no = '' THEN RAISE EXCEPTION 'Enter the project number'; END IF;
    IF coalesce(btrim(p_sanction_ref), '') = '' OR p_sanction_date IS NULL THEN
        RAISE EXCEPTION 'Enter the sanction order number and date';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Enter the sanctioned amount'; END IF;
    IF p_document_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.proposal_documents d
         WHERE d.id = p_document_id AND d.proposal_id = p_id AND d.doc_type = 'sanction_order') THEN
        RAISE EXCEPTION 'Upload the scanned sanction order first';
    END IF;
    -- Guidelines §2.2 coding (FY 2024-25 onwards): category, then six digits.
    IF v_row.track = 'HQ' AND v_row.category_code IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP')
       AND v_no !~ ('^' || v_row.category_code || '[0-9]{6}$') THEN
        RAISE EXCEPTION 'An % project number is % followed by six digits, e.g. %040511',
            v_row.category_code, v_row.category_code, v_row.category_code;
    END IF;
    IF v_row.proposed_start_date IS NULL OR v_row.proposed_duration_months IS NULL THEN
        RAISE EXCEPTION 'The proposal has no start date or duration';
    END IF;

    v_pid := coalesce(nullif(btrim(p_project_id), ''), 'PRJ-' || substring(v_row.proposal_code FROM 6));
    IF EXISTS (SELECT 1 FROM public.projects WHERE "ProjectID" = v_pid) THEN
        RAISE EXCEPTION 'A project with ID % already exists', v_pid;
    END IF;

    v_start := v_row.proposed_start_date;
    v_end   := (v_start + make_interval(months => v_row.proposed_duration_months) - interval '1 day')::date;
    SELECT "ID" INTO v_staff FROM public.staff WHERE user_id = v_row.pi_user_id LIMIT 1;

    INSERT INTO public.projects (
        "ProjectID", "ProjectNo", "ProjectName", "FundType", "SponsorerType", "SponsorerName",
        "ProjectCategory", "StartDate", "CompletioDate", "SanctionedCost", "UtilizedAmount",
        "PrincipalInvestigator", "DivisionCode", "ApprovalAuthority",
        stage, track, pi_staff_id, proposal_id, sanction_ref, sanction_date
    ) VALUES (
        v_pid, v_no, v_row.title, v_row.fund_type, v_row.sponsor_type, v_row.sponsor_name,
        coalesce(v_row.category_code, v_row.project_category), v_start::text, v_end::text, p_amount::text, '0',
        v_row.pi_name, v_row.division_code,
        CASE v_row.track WHEN 'ULIP' THEN 'Director, CSIR-AMPRI' WHEN 'HQ' THEN 'CSIR HQ' END,
        'SANCTIONED', v_row.track, v_staff, p_id, btrim(p_sanction_ref), p_sanction_date
    );

    INSERT INTO public.project_budget_lines (project_id, fiscal_year, head, item, amount, source)
    SELECT v_pid, fiscal_year, head, item, amount, 'SANCTION'
      FROM public.proposal_budget_lines WHERE proposal_id = p_id;

    UPDATE public.proposals SET
        status = 'LINKED', sanctioned_amount = p_amount, sanction_date = p_sanction_date,
        om_number = btrim(p_sanction_ref), om_date = p_sanction_date,
        linked_project_no = v_no, project_id = v_pid,
        updated_at = now(), last_status_change_by = auth.uid(), last_status_change_at = now()
     WHERE id = p_id;

    INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
    VALUES (p_id, v_row.status, 'LINKED',
            jsonb_build_object('project_id', v_pid, 'project_no', v_no, 'sanction_ref', btrim(p_sanction_ref),
                               'sanction_date', p_sanction_date, 'amount', p_amount, 'document_id', p_document_id),
            auth.uid());
    RETURN v_pid;
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_save_copis(p_proposal_id uuid, p_copis jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE
    v_p public.proposals%ROWTYPE;
BEGIN
    SELECT * INTO v_p FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proposal not found';
    END IF;
    IF v_p.created_by <> (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'Not your proposal';
    END IF;
    IF v_p.status NOT IN ('DRAFT', 'REVISION_REQUESTED', 'RETURNED') THEN
        RAISE EXCEPTION 'Co-PIs can only be modified while DRAFT or REVISION_REQUESTED';
    END IF;
    IF p_copis IS NOT NULL AND jsonb_typeof(p_copis) <> 'array' THEN
        RAISE EXCEPTION 'p_copis must be a JSON array';
    END IF;

    DELETE FROM public.proposal_copis WHERE proposal_id = p_proposal_id;

    IF jsonb_array_length(coalesce(p_copis, '[]'::jsonb)) > 0 THEN
        INSERT INTO public.proposal_copis (proposal_id, staff_id, staff_name)
        SELECT p_proposal_id, x.staff_id, x.staff_name
          FROM jsonb_to_recordset(p_copis) AS x(staff_id text, staff_name text);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_save_version(p_id uuid, p_label text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_row public.proposals%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.proposals WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
    IF v_row.created_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Only the proposal''s author can mark a version';
    END IF;
    IF v_row.status NOT IN ('DRAFT', 'REVISION_REQUESTED') THEN
        RAISE EXCEPTION 'A version can be marked only while the proposal is being drafted or revised';
    END IF;
    RETURN public.proposal_snapshot_version(p_id, p_label, 'manual');
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_set_track(p_id uuid, p_track text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_row public.proposals%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.proposals WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
    IF NOT public.proposal_caller_may_act(v_row, 'PME_VETTING') THEN
        RAISE EXCEPTION 'Only PME can set the track of a submitted proposal';
    END IF;
    IF v_row.status NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED', 'APPROVED', 'OM_ISSUED') THEN
        RAISE EXCEPTION 'The track can be set by PME only on a proposal in review';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_schemes WHERE code = p_track) THEN RAISE EXCEPTION 'Unknown track: %', p_track; END IF;
    IF EXISTS (SELECT 1 FROM public.proposal_review_steps
                WHERE proposal_id = p_id AND status IN ('DONE', 'RETURNED', 'REJECTED')
                  AND round = (SELECT max(round) FROM public.proposal_review_steps WHERE proposal_id = p_id)) THEN
        RAISE EXCEPTION 'Review has already started on this track';
    END IF;

    DELETE FROM public.proposal_review_steps
     WHERE proposal_id = p_id
       AND round = (SELECT max(round) FROM public.proposal_review_steps WHERE proposal_id = p_id);
    UPDATE public.proposals SET track = p_track, updated_at = now() WHERE id = p_id;
    PERFORM public.proposal_open_round(p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_set_under_review(p_id uuid, p_body text, p_sent_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'review_body_required'; END IF;
  IF p_sent_date IS NULL THEN RAISE EXCEPTION 'review_sent_date_required'; END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> UNDER_REVIEW', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'UNDER_REVIEW',
         review_body           = p_body,
         review_sent_date      = p_sent_date,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'SUBMITTED', 'UNDER_REVIEW',
          jsonb_build_object('review_body', p_body, 'review_sent_date', p_sent_date),
          auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_snapshot_version(p_id uuid, p_label text, p_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_no int;
    v_id uuid;
BEGIN
    SELECT coalesce(max(version_no), 0) + 1 INTO v_no
      FROM public.proposal_versions WHERE proposal_id = p_id;

    INSERT INTO public.proposal_versions (proposal_id, version_no, label, kind, snapshot, created_by)
    SELECT p.id, v_no,
           coalesce(nullif(btrim(p_label), ''), 'Version ' || v_no),
           p_kind,
           jsonb_build_object(
               'proposal', to_jsonb(p),
               'copis', coalesce((SELECT jsonb_agg(jsonb_build_object('staff_id', c.staff_id, 'staff_name', c.staff_name)
                                                   ORDER BY c.staff_name)
                                    FROM public.proposal_copis c WHERE c.proposal_id = p.id), '[]'::jsonb)),
           auth.uid()
      FROM public.proposals p WHERE p.id = p_id
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_status_after(p_kind text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT CASE p_kind
    WHEN 'PME_VETTING'         THEN 'UNDER_REVIEW'
    WHEN 'FINANCE'             THEN 'UNDER_REVIEW'
    WHEN 'REVIEW_COMMITTEE'    THEN 'RECOMMENDED'
    WHEN 'DIRECTOR_FORWARD'    THEN 'RECOMMENDED'
    WHEN 'HQ_SCREENING'        THEN 'RECOMMENDED'
    WHEN 'HQ_EXPERT'           THEN 'RECOMMENDED'
    WHEN 'DIRECTOR_APPROVAL'   THEN 'APPROVED'
    WHEN 'COMPETENT_AUTHORITY' THEN 'APPROVED'
  END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_step_kinds(p_track text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT CASE p_track
    WHEN 'ULIP' THEN ARRAY['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']
    WHEN 'OLP'  THEN ARRAY['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']
    WHEN 'HQ'   THEN ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD',
                           'HQ_SCREENING', 'HQ_EXPERT', 'COMPETENT_AUTHORITY']
    WHEN 'EFP'  THEN ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY']
  END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_submit(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_row     public.proposals%ROWTYPE;
  v_from    text;
  v_missing text[];
  v_version uuid;
BEGIN
  SELECT * INTO v_row FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_row.created_by <> auth.uid() THEN RAISE EXCEPTION 'not_owner'; END IF;
  IF v_row.status NOT IN ('DRAFT','REVISION_REQUESTED') THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> SUBMITTED', v_row.status;
  END IF;

  v_missing := public.proposal_readiness(p_id);
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Not ready to submit. Still needed: %',
      replace(array_to_string(v_missing, ', '), '_', ' ');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.proposal_documents
                 WHERE proposal_id = p_id AND doc_type = 'signed_proposal') THEN
    RAISE EXCEPTION 'signed_proposal_required';
  END IF;

  v_version := public.proposal_snapshot_version(p_id, 'Submitted', 'submitted');
  v_from := v_row.status;
  UPDATE public.proposals
     SET status                = 'SUBMITTED',
         submitted_at          = COALESCE(submitted_at, now()),
         submitted_version_id  = v_version,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;
  PERFORM public.proposal_open_round(p_id);
  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, v_from, 'SUBMITTED', jsonb_build_object('version_id', v_version), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposals_caller_division()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  -- division_code lives on user_roles, scoped by the user's active_role.
  SELECT ur.division_code
    FROM public.user_roles ur
    JOIN public.user_profiles up ON up.user_id = ur.user_id
   WHERE ur.user_id = auth.uid()
     AND ur.role = up.active_role
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.proposals_caller_has_role(p_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = p_role
  );
$$;

CREATE OR REPLACE FUNCTION public.proposals_caller_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT public.proposals_caller_has_role('HRAdmin')
      OR public.proposals_caller_has_role('SystemAdmin')
      OR public.proposals_caller_has_role('MasterAdmin');
$$;

CREATE OR REPLACE FUNCTION public.proposals_can_read(p_row proposals)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT
    p_row.pi_user_id = (SELECT auth.uid())
    OR p_row.created_by = (SELECT auth.uid())
    OR public.proposal_caller_is_copi(p_row.id)
    OR (
      p_row.status <> 'DRAFT'
      AND (
        ((public.proposals_caller_has_role('HOD')
          OR public.proposals_caller_has_role('DivisionHead'))
         AND p_row.division_code = public.proposals_caller_division())
        OR public.proposals_caller_has_role('Director')
        OR public.proposals_caller_has_role('HRAdmin')
        OR public.proposals_caller_has_role('SystemAdmin')
        OR public.proposals_caller_has_role('MasterAdmin')
        OR public.proposals_caller_has_role('FinanceAdmin')
        OR public.caller_is_pme()
        OR EXISTS (
            SELECT 1 FROM public.project_schemes s
             WHERE s.code = p_row.track
               AND s.leader_user_id = (SELECT auth.uid()))
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.proposals_set_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_num  int;
BEGIN
  IF new.proposal_code IS NULL OR new.proposal_code = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('proposal_code_' || v_year));
    SELECT COALESCE(
             MAX((substring(proposal_code FROM 'PROP-' || v_year || '-(\d+)$'))::int),
             0
           ) + 1
      INTO v_num
      FROM public.proposals
     WHERE proposal_code LIKE 'PROP-' || v_year || '-%';
    new.proposal_code := 'PROP-' || v_year || '-' || lpad(v_num::text, 4, '0');
  END IF;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.publication_consent(p_file_id uuid, p_contribution text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.caller_staff_id() IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    IF coalesce(btrim(p_contribution), '') = '' THEN RAISE EXCEPTION 'State your contribution'; END IF;
    UPDATE public.publication_author_consents c SET contribution = btrim(p_contribution), consented_at = now()
     WHERE c.file_id = p_file_id
       AND c.staff_id IN (SELECT s."ID" FROM public.staff s WHERE s.user_id = auth.uid())
       AND EXISTS (SELECT 1 FROM public.publication_files f WHERE f.id = p_file_id AND f.status IN ('DRAFT', 'ETHICS_CHECK', 'CLEARED'));
    IF NOT FOUND THEN RAISE EXCEPTION 'You are not an author of this file, or it is already submitted'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.publication_file_create(p_title text, p_division text, p_authors jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_id  uuid;
    v_div text;
BEGIN
    IF public.caller_staff_id() IS NULL THEN RAISE EXCEPTION 'Only staff open a publication file'; END IF;
    -- The division decides who clears the paper, so it is the author's own, never the caller's choice.
    SELECT s."Division" INTO v_div FROM public.staff s WHERE s."ID" = public.caller_staff_id();
    IF v_div IS NULL THEN RAISE EXCEPTION 'No division on record for you'; END IF;
    IF p_division IS DISTINCT FROM v_div THEN RAISE EXCEPTION 'A paper is filed in your own division (%)', v_div; END IF;
    IF coalesce(jsonb_array_length(p_authors), 0) = 0 THEN RAISE EXCEPTION 'List the authors'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_authors) a WHERE a->>'staff_id' = public.caller_staff_id()) THEN
        RAISE EXCEPTION 'You must be one of the authors';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_authors) a
                WHERE a->>'staff_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s."ID" = a->>'staff_id')) THEN
        RAISE EXCEPTION 'Unknown staff ID among the authors';
    END IF;
    INSERT INTO public.publication_files (title, division_code, created_by)
    VALUES (btrim(p_title), v_div, auth.uid()) RETURNING id INTO v_id;
    INSERT INTO public.publication_author_consents (file_id, pos, name, staff_id)
    SELECT v_id, o, btrim(a->>'name'), nullif(a->>'staff_id', '')
      FROM jsonb_array_elements(p_authors) WITH ORDINALITY x(a, o);
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publication_move(p_file_id uuid, p_to text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_f     public.publication_files%ROWTYPE;
    v_owner boolean;
    v_no    text;
    v_out   text;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    SELECT * INTO v_f FROM public.publication_files WHERE id = p_file_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Publication file not found'; END IF;
    v_owner := v_f.created_by = auth.uid();

    IF v_f.status = 'DRAFT' AND p_to = 'ETHICS_CHECK' THEN
        IF NOT v_owner THEN RAISE EXCEPTION 'Only the corresponding author sends it for the ethics check'; END IF;
        UPDATE public.publication_files SET status = p_to,
               similarity_pct = coalesce((p_details->>'similarity_pct')::numeric, similarity_pct),
               similarity_report_document_id = coalesce((p_details->>'similarity_report_document_id')::uuid, similarity_report_document_id)
         WHERE id = p_file_id;
    ELSIF v_f.status = 'ETHICS_CHECK' AND p_to IN ('CLEARED', 'DRAFT') THEN
        IF NOT coalesce(public.caller_is_publication_clearer(v_f.division_code), false) OR v_owner THEN
            RAISE EXCEPTION 'The HoD, Division Head or Director clears a paper, and not their own';
        END IF;
        IF p_to = 'CLEARED' THEN
            IF v_f.similarity_pct IS NULL THEN RAISE EXCEPTION 'The similarity check result is missing'; END IF;
            -- Communication number: AMPRI/<year>/<serial in that year>.
            PERFORM pg_advisory_xact_lock(hashtext('publication_communication_no'));
            SELECT 'AMPRI/' || extract(year FROM public.ist_today())::int || '/'
                   || lpad((count(*) + 1)::text, 4, '0')
              INTO v_no FROM public.publication_files
             WHERE communication_no LIKE 'AMPRI/' || extract(year FROM public.ist_today())::int || '/%';
            UPDATE public.publication_files SET status = 'CLEARED', communication_no = v_no, cleared_by = auth.uid(), cleared_at = now()
             WHERE id = p_file_id;
            v_out := v_no;
        ELSE
            UPDATE public.publication_files SET status = 'DRAFT' WHERE id = p_file_id;
        END IF;
    ELSIF v_f.status = 'CLEARED' AND p_to = 'SUBMITTED' THEN
        IF NOT v_owner THEN RAISE EXCEPTION 'Only the corresponding author records the submission'; END IF;
        IF v_f.communication_no IS NULL THEN RAISE EXCEPTION 'The paper has no communication number'; END IF;
        IF EXISTS (SELECT 1 FROM public.publication_author_consents
                    WHERE file_id = p_file_id AND staff_id IS NOT NULL AND consented_at IS NULL) THEN
            RAISE EXCEPTION 'Every in-house author must consent before submission';
        END IF;
        UPDATE public.publication_files SET status = 'SUBMITTED', submitted_at = now(),
               journal = coalesce(nullif(btrim(p_details->>'journal'), ''), journal)
         WHERE id = p_file_id;
    ELSIF v_f.status = 'SUBMITTED' AND p_to = 'ACCEPTED' THEN
        IF NOT v_owner THEN RAISE EXCEPTION 'Only the corresponding author records the acceptance'; END IF;
        UPDATE public.publication_files SET status = 'ACCEPTED' WHERE id = p_file_id;
    ELSIF v_f.status = 'ACCEPTED' AND p_to = 'PUBLISHED' THEN
        IF NOT v_owner THEN RAISE EXCEPTION 'Only the corresponding author records the publication'; END IF;
        v_f.journal := coalesce(nullif(btrim(p_details->>'journal'), ''), v_f.journal);
        v_f.year := coalesce((p_details->>'year')::int, v_f.year);
        v_f.doi := coalesce(nullif(btrim(p_details->>'doi'), ''), v_f.doi);
        IF v_f.journal IS NULL OR v_f.year IS NULL THEN RAISE EXCEPTION 'Give the journal and the year'; END IF;
        v_out := coalesce(v_f.output_id, 'PF-' || v_f.communication_no);
        INSERT INTO public.scientific_outputs (id, title, authors, journal, year, doi, division_code)
        SELECT v_out, v_f.title, array_agg(c.name ORDER BY c.pos), v_f.journal, v_f.year, v_f.doi, v_f.division_code
          FROM public.publication_author_consents c WHERE c.file_id = p_file_id
        ON CONFLICT (id) DO NOTHING;
        UPDATE public.output_authors a SET staff_id = c.staff_id, link_source = 'manual', confirmed_by = auth.uid(), confirmed_at = now()
          FROM public.publication_author_consents c
         WHERE c.file_id = p_file_id AND c.staff_id IS NOT NULL AND a.output_id = v_out AND a.pos = c.pos;
        UPDATE public.publication_files SET status = 'PUBLISHED', published_at = now(), output_id = v_out,
               journal = v_f.journal, year = v_f.year, doi = v_f.doi
         WHERE id = p_file_id;
    ELSE
        RAISE EXCEPTION 'A paper at % cannot move to %', v_f.status, p_to;
    END IF;
    RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.rag_monitor_summary()
 RETURNS TABLE(status_counts jsonb, traceability_cited bigint, traceability_total bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    WITH doc_counts AS (
        SELECT
            count(*) FILTER (WHERE ingest_status = 'pending')    AS pending,
            count(*) FILTER (WHERE ingest_status = 'processing') AS processing,
            count(*) FILTER (WHERE ingest_status = 'indexed')    AS indexed,
            count(*) FILTER (WHERE ingest_status = 'failed')     AS failed,
            count(*) FILTER (WHERE ingest_status = 'skipped')    AS skipped
        FROM public.documents
    ),
    qlog_qual AS (
        SELECT
            (citations IS NOT NULL AND jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) > 0) AS is_cited
        FROM public.query_log
        WHERE mode <> 'structured'
          AND btrim(coalesce(answer, '')) <> 'Not found in institute documents.'
    )
    SELECT
        jsonb_build_object(
            'pending',    dc.pending,
            'processing', dc.processing,
            'indexed',    dc.indexed,
            'failed',     dc.failed,
            'skipped',    dc.skipped
        ) AS status_counts,
        count(*) FILTER (WHERE q.is_cited) AS traceability_cited,
        count(q.is_cited)                  AS traceability_total
    FROM doc_counts dc
    LEFT JOIN qlog_qual q ON true
    GROUP BY dc.pending, dc.processing, dc.indexed, dc.failed, dc.skipped;
$$;

CREATE OR REPLACE FUNCTION public.rag_replace_doc_pages(p_document_id uuid, p_pages jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    DELETE FROM public.doc_pages
    WHERE document_id = p_document_id;

    IF p_pages IS NOT NULL AND jsonb_typeof(p_pages) = 'array' AND jsonb_array_length(p_pages) > 0 THEN
        INSERT INTO public.doc_pages (document_id, page, text)
        SELECT p_document_id, x.page, COALESCE(x.text, '')
        FROM jsonb_to_recordset(p_pages) AS x(page integer, text text);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rag_requeue_all()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  n int;
BEGIN
  IF NOT (
    public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.documents
     SET ingest_status = 'pending',
         ingest_error = NULL,
         ingest_attempts = 0,
         processing_started_at = NULL
   WHERE ingest_status IN ('indexed', 'failed');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.rag_requeue_document(p_doc_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.documents
     SET ingest_status = 'pending',
         ingest_error = NULL,
         ingest_attempts = 0,
         processing_started_at = NULL
   WHERE id = p_doc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recruitment_advance(p_advt_id text, p_stage text, p_document_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_stages text[] := ARRAY['Advertised', 'Applications Closed', 'Screening', 'Interviews', 'Selection', 'Offers Issued', 'Joined', 'Closed'];
    v_from   text;
    v_advt   public.vacancy_advertisements%ROWTYPE;
BEGIN
    IF NOT coalesce(public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only HR moves a recruitment drive';
    END IF;
    SELECT * INTO v_advt FROM public.vacancy_advertisements WHERE id::text = p_advt_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Advertisement not found'; END IF;
    v_from := v_advt.drive_stage;
    IF NOT (p_stage = ANY (v_stages)) THEN RAISE EXCEPTION 'Unknown stage: %', p_stage; END IF;
    IF v_from = 'Closed' THEN RAISE EXCEPTION 'The drive is closed'; END IF;
    IF p_stage <> 'Closed' AND array_position(v_stages, p_stage) <> array_position(v_stages, v_from) + 1 THEN
        RAISE EXCEPTION 'From % the next stage is %', v_from, v_stages[array_position(v_stages, v_from) + 1];
    END IF;
    UPDATE public.vacancy_advertisements SET drive_stage = p_stage WHERE id = v_advt.id;
    INSERT INTO public.recruitment_events (advt_id, actor, from_stage, to_stage, document_id, note)
    VALUES (v_advt.id, auth.uid(), v_from, p_stage, p_document_id, nullif(btrim(p_note), ''));
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_access_request(p_request_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    UPDATE public.access_requests
        SET status = 'REJECTED', review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
        WHERE id = p_request_id AND status = 'PENDING';
END;
$$;

CREATE OR REPLACE FUNCTION public.route_ticket(p_category text, p_submitter_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_target_type text;
    v_target_id   text;
    v_result_id   uuid;
    v_div_code    text;
BEGIN
    SELECT target_type, target_id INTO v_target_type, v_target_id
      FROM public.helpdesk_routing WHERE category = p_category;

    IF FOUND THEN
        IF v_target_type = 'role' THEN
            SELECT ur.user_id INTO v_result_id
              FROM public.user_roles ur
             WHERE ur.role = v_target_id
             ORDER BY ur.user_id
             LIMIT 1;
        ELSIF v_target_type = 'division' THEN
            SELECT s.user_id INTO v_result_id
              FROM public.divisions d
              JOIN public.staff s ON s."ID" = d."divHoDID"
             WHERE d."divCode" = v_target_id AND s.user_id IS NOT NULL
             LIMIT 1;
        END IF;
        IF v_result_id IS NOT NULL THEN RETURN v_result_id; END IF;
    END IF;

    SELECT s."Division" INTO v_div_code
      FROM public.staff s WHERE s.user_id = p_submitter_id LIMIT 1;

    IF v_div_code IS NOT NULL THEN
        SELECT hod.user_id INTO v_result_id
          FROM public.divisions d
          JOIN public.staff hod ON hod."ID" = d."divHoDID"
         WHERE d."divCode" = v_div_code AND hod.user_id IS NOT NULL
         LIMIT 1;
        IF v_result_id IS NOT NULL THEN RETURN v_result_id; END IF;
    END IF;

    SELECT ur.user_id INTO v_result_id FROM public.user_roles ur
     WHERE ur.role = 'HRAdmin' ORDER BY ur.user_id LIMIT 1;
    IF v_result_id IS NOT NULL THEN RETURN v_result_id; END IF;

    SELECT ur.user_id INTO v_result_id FROM public.user_roles ur
     WHERE ur.role = 'SystemAdmin' ORDER BY ur.user_id LIMIT 1;
    RETURN v_result_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_profile_facts(p_staff_id text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(section text, record_type text, record_id text, title text, role text, date_from date, date_to date, amount numeric, link text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
WITH me AS (
    SELECT s."ID" AS id, s.user_id, s."Designation", s.doj_date, s.doapp_date
      FROM public.staff s WHERE s."ID" = p_staff_id
), my_projects AS (
    SELECT pr."ProjectID" AS project_id, 'PI'::text AS role FROM public.projects pr, me WHERE pr.pi_staff_id = me.id
    UNION
    SELECT pr."ProjectID", 'Co-PI' FROM public.projects pr
      JOIN public.proposal_copis c ON c.proposal_id = pr.proposal_id, me WHERE c.staff_id = me.id
    UNION
    SELECT ps.project_id, coalesce(nullif(ps."Designation", ''), 'Team member') FROM public.project_staff ps, me
     WHERE ps.staff_id = me.id AND ps.project_id IS NOT NULL
), my_ip AS (
    SELECT DISTINCT i.ip_id FROM public.ip_inventors i, me WHERE i.staff_id = me.id
), facts AS (
    SELECT 'SERVICE' AS section, 'staff' AS record_type, me.id AS record_id,
           'Joined CSIR-AMPRI' AS title, me."Designation" AS role,
           me.doj_date AS date_from, NULL::date AS date_to, NULL::numeric AS amount, '/staff/' || me.id AS link
      FROM me WHERE me.doj_date IS NOT NULL
    UNION ALL
    SELECT 'SERVICE', 'staff', me.id, 'In present grade', me."Designation", me.doapp_date, NULL, NULL, '/staff/' || me.id
      FROM me WHERE me.doapp_date IS NOT NULL
    UNION ALL
    SELECT 'PROJECT', 'project', pr."ProjectID", coalesce(pr."ProjectName", pr."ProjectNo"), mp.role,
           pr.start_date, pr.end_date, pr.sanctioned_cost, '/projects/' || pr."ProjectID"
      FROM my_projects mp JOIN public.projects pr ON pr."ProjectID" = mp.project_id
    UNION ALL
    SELECT 'OUTPUT', 'scientific_output', o.id, o.title, 'Author ' || a.pos || ' · ' || o.journal,
           make_date(o.year, 1, 1), make_date(o.year, 12, 31), NULL,
           coalesce('https://doi.org/' || nullif(btrim(o.doi), ''), '/intelligence')
      FROM public.output_authors a JOIN public.scientific_outputs o ON o.id = a.output_id, me
     WHERE a.staff_id = me.id
    UNION ALL
    SELECT 'IP', 'ip', ip.id, ip.title, ip.type || ' · ' || ip.status,
           public.try_parse_date(ip.filing_date), public.try_parse_date(ip.grant_date), NULL, '/intelligence'
      FROM my_ip JOIN public.ip_intelligence ip ON ip.id = my_ip.ip_id
    UNION ALL
    SELECT DISTINCT 'TECH_TRANSFER', 'tech_transfer', t.id::text, t.technology_title,
           t.agreement_type || ' · ' || t.licensee, t.agreement_date, NULL::date, t.value_lakhs * 100000, '/partnerships'
      FROM public.tech_transfers t
     WHERE t.linked_ip_id IN (SELECT ip_id FROM my_ip)
        OR t.linked_project_no IN (SELECT pr."ProjectNo" FROM public.projects pr
                                     JOIN my_projects mp ON mp.project_id = pr."ProjectID" AND mp.role IN ('PI', 'Co-PI'))
    UNION ALL
    SELECT 'STUDENT', 'phd_student', st."EnrollmentNo",
           st."StudentName" || coalesce(' — ' || nullif(st."ThesisTitle", ''), ''),
           CASE WHEN st.supervisor_staff_id = me.id THEN 'Supervisor' ELSE 'Co-supervisor' END
               || coalesce(' · ' || nullif(st."CurrentStatus", ''), ''),
           NULL, NULL, NULL, '/phd'
      FROM public.phd_students st, me
     WHERE me.id IN (st.supervisor_staff_id, st.cosupervisor_staff_id)
    UNION ALL
    SELECT 'COMMITTEE', 'committee', c.id::text, c.name,
           CASE WHEN c.chairperson_id = me.id THEN 'Chair'
                WHEN c.secretary_id = me.id THEN 'Secretary'
                ELSE (SELECT m.role FROM public.committee_members m WHERE m.committee_id = c.id AND m.staff_id = me.id LIMIT 1) END,
           c.formed_date, NULL, NULL, '/committees/' || c.id
      FROM public.committees c, me
     WHERE me.id IN (c.chairperson_id, c.secretary_id)
        OR EXISTS (SELECT 1 FROM public.committee_members m WHERE m.committee_id = c.id AND m.staff_id = me.id)
    UNION ALL
    SELECT 'AWP', 'awp', w.id::text, 'Annual work plan ' || w.reporting_year, initcap(lower(replace(w.status, '_', ' '))),
           make_date(left(w.reporting_year, 4)::int, 4, 1), make_date(left(w.reporting_year, 4)::int + 1, 3, 31), NULL,
           '/pms/awp'
      FROM public.pms_awps w, me WHERE w.staff_id = me.id
    UNION ALL
    SELECT 'LESSON', 'project_lessons', l.project_id, coalesce(l.project_name, l.project_no), 'Lessons learned',
           l.approved_at::date, NULL, NULL, '/lessons'
      FROM public.project_lessons l
     WHERE l.project_id IN (SELECT project_id FROM my_projects WHERE role = 'PI')
    UNION ALL
    SELECT 'EQUIPMENT', 'equipment', e."UInsID", e."Name", 'Owner', e.procurement_date, NULL, e.purchase_cost,
           '/facilities/' || e."UInsID"
      FROM public.equipment e, me WHERE me.user_id IS NOT NULL AND e.owner_user_id = me.user_id
)
SELECT f.* FROM facts f
 WHERE (p_from IS NULL OR coalesce(f.date_to, f.date_from, 'infinity'::date) >= p_from)
   AND (p_to IS NULL OR coalesce(f.date_from, '-infinity'::date) <= p_to)
 ORDER BY f.section, f.date_from DESC NULLS LAST, f.title;
$$;

CREATE OR REPLACE FUNCTION public.staff_workload(p_staff_id text DEFAULT NULL::text)
 RETURNS TABLE(staff_id text, name text, division text, active_projects integer, as_pi integer, sanctioned_value numeric, awp_year text, awp_time_pct jsonb, overload boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
SELECT r.staff_id, r.name, r.division, r.active_projects, r.as_pi, r.sanctioned_value,
       w.reporting_year, coalesce(w.activity_split, '[]'::jsonb),
       -- ponytail: fixed at 4 (roadmap B3); make it a csir_rules row if the lab sets one.
       r.active_projects > 4
  FROM public.staff_research_summary r
  LEFT JOIN LATERAL (
      SELECT a.reporting_year, a.activity_split FROM public.pms_awps a
       WHERE a.staff_id = r.staff_id ORDER BY a.reporting_year DESC LIMIT 1) w ON true
 WHERE p_staff_id IS NULL OR r.staff_id = p_staff_id
 ORDER BY 4 DESC, 2;
$$;

CREATE OR REPLACE FUNCTION public.sync_project_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_new_no text := nullif(btrim(to_jsonb(NEW) ->> TG_ARGV[0]), '');
    v_id     text;
    v_n      int;
BEGIN
    -- The number moved and nobody set the key by hand: the old key is stale.
    IF TG_OP = 'UPDATE'
       AND v_new_no IS DISTINCT FROM nullif(btrim(to_jsonb(OLD) ->> TG_ARGV[0]), '')
       AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
        NEW.project_id := NULL;
    END IF;

    IF NEW.project_id IS NULL AND v_new_no IS NOT NULL THEN
        SELECT min("ProjectID"), count(*) INTO v_id, v_n
          FROM public.projects WHERE "ProjectNo" = v_new_no;
        IF v_n = 1 THEN
            NEW.project_id := v_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_staff_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF TG_TABLE_NAME = 'projects' THEN
        -- Name moved ⇒ the cached key is about the wrong person. Drop it
        -- first so the resolve below runs; leaving it stale is the bug.
        IF TG_OP = 'UPDATE'
           AND NEW."PrincipalInvestigator" IS DISTINCT FROM OLD."PrincipalInvestigator"
           AND NEW.pi_staff_id IS NOT DISTINCT FROM OLD.pi_staff_id THEN
            NEW.pi_staff_id := NULL;
        END IF;
        IF NEW.pi_staff_id IS NULL THEN
            SELECT staff_id INTO NEW.pi_staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."PrincipalInvestigator");
        END IF;

    ELSIF TG_TABLE_NAME = 'phd_students' THEN
        IF TG_OP = 'UPDATE'
           AND NEW."SupervisorName" IS DISTINCT FROM OLD."SupervisorName"
           AND NEW.supervisor_staff_id IS NOT DISTINCT FROM OLD.supervisor_staff_id THEN
            NEW.supervisor_staff_id := NULL;
        END IF;
        IF NEW.supervisor_staff_id IS NULL THEN
            SELECT staff_id INTO NEW.supervisor_staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."SupervisorName");
        END IF;

        IF TG_OP = 'UPDATE'
           AND NEW."CoSupervisorName" IS DISTINCT FROM OLD."CoSupervisorName"
           AND NEW.cosupervisor_staff_id IS NOT DISTINCT FROM OLD.cosupervisor_staff_id THEN
            NEW.cosupervisor_staff_id := NULL;
        END IF;
        IF NEW.cosupervisor_staff_id IS NULL THEN
            SELECT staff_id INTO NEW.cosupervisor_staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."CoSupervisorName");
        END IF;

    ELSIF TG_TABLE_NAME = 'project_staff' THEN
        IF TG_OP = 'UPDATE'
           AND NEW."StaffName" IS DISTINCT FROM OLD."StaffName"
           AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id THEN
            NEW.staff_id := NULL;
        END IF;
        IF NEW.staff_id IS NULL THEN
            SELECT staff_id INTO NEW.staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."StaffName");
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_parse_date(p text)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
DECLARE
    m text[];
BEGIN
    p := btrim(p);
    -- A bare number is an Excel serial that escaped conversion, not a date.
    IF p IS NULL OR p = '' OR p ~ '^\d{1,6}$' THEN
        RETURN NULL;
    END IF;
    m := regexp_match(p, '^(\d{1,2})[./](\d{1,2})[./](\d{4})$');
    IF m IS NOT NULL THEN
        RETURN make_date(m[3]::int, m[2]::int, m[1]::int);
    END IF;
    RETURN p::date;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_meeting_minutes(p_meeting_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    SELECT public.user_has_role('MasterAdmin')
        OR public.user_has_role('SystemAdmin')
        OR public.user_has_role('Director')
    INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only administrators can unlock meeting minutes';
    END IF;

    UPDATE public.meetings
    SET meeting_date = CURRENT_DATE
    WHERE id = p_meeting_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_own_profile(p_fields jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_uid     uuid := auth.uid();
    v_row     public.staff%ROWTYPE;
    v_key     text;
    v_new     text;
    v_old     text;
    v_changes jsonb := '{}';
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    SELECT * INTO v_row FROM public.staff WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Your login is not linked to a staff record. Ask HR to link it.';
    END IF;
    IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
        RAISE EXCEPTION 'Send the fields to change';
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_fields) LOOP
        IF v_key NOT IN ('Expertise', 'CoreArea', 'Ext', 'orcid', 'VidwanID') THEN
            RAISE EXCEPTION 'You cannot change %; ask HR', v_key;
        END IF;
        IF jsonb_typeof(p_fields -> v_key) NOT IN ('string', 'null') THEN
            RAISE EXCEPTION '% must be text', v_key;
        END IF;
        v_new := nullif(btrim(p_fields ->> v_key), '');
        IF length(v_new) > 1000 THEN RAISE EXCEPTION '% is too long', v_key; END IF;
        IF v_key = 'orcid' AND v_new IS NOT NULL AND v_new !~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$' THEN
            RAISE EXCEPTION 'An ORCID iD looks like 0000-0002-1825-0097';
        END IF;
        v_old := to_jsonb(v_row) ->> v_key;
        IF v_old IS DISTINCT FROM v_new THEN
            v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old, 'to', v_new));
        END IF;
    END LOOP;

    IF v_changes = '{}' THEN RETURN; END IF;

    UPDATE public.staff SET
        "Expertise" = CASE WHEN v_changes ? 'Expertise' THEN v_changes -> 'Expertise' ->> 'to' ELSE "Expertise" END,
        "CoreArea"  = CASE WHEN v_changes ? 'CoreArea'  THEN v_changes -> 'CoreArea'  ->> 'to' ELSE "CoreArea"  END,
        "Ext"       = CASE WHEN v_changes ? 'Ext'       THEN v_changes -> 'Ext'       ->> 'to' ELSE "Ext"       END,
        orcid       = CASE WHEN v_changes ? 'orcid'     THEN v_changes -> 'orcid'     ->> 'to' ELSE orcid       END,
        "VidwanID"  = CASE WHEN v_changes ? 'VidwanID'  THEN v_changes -> 'VidwanID'  ->> 'to' ELSE "VidwanID"  END
     WHERE "ID" = v_row."ID";

    INSERT INTO public.staff_profile_changes (staff_id, user_id, changes) VALUES (v_row."ID", v_uid, v_changes);
END;
$$;

CREATE OR REPLACE FUNCTION public.user_directory()
 RETURNS TABLE(user_id uuid, email text, roles text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT
        up.user_id,
        up.email,
        COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::text[]) AS roles
    FROM public.user_profiles up
    LEFT JOIN public.user_roles ur ON ur.user_id = up.user_id
    WHERE public.caller_sees_directory() OR up.user_id = auth.uid()
    GROUP BY up.user_id, up.email;
$$;

CREATE OR REPLACE FUNCTION public.user_has_role(check_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = check_role
    )
$$;

CREATE OR REPLACE FUNCTION public.user_profiles_validate_active_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.active_role IS NOT NULL
       AND NEW.active_role IS DISTINCT FROM OLD.active_role
       AND NOT EXISTS (
           SELECT 1 FROM public.user_roles
            WHERE user_id = NEW.user_id AND role = NEW.active_role
       )
    THEN
        RAISE EXCEPTION 'active_role % is not assigned to this user', NEW.active_role;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.vacancy_advertisements_guard_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'INSERT' THEN
            NEW.drive_stage := 'Advertised';
        ELSIF NEW.drive_stage IS DISTINCT FROM OLD.drive_stage THEN
            RAISE EXCEPTION 'A drive moves stage only through recruitment_advance';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.workforce_outlook(p_years integer DEFAULT 5)
 RETURNS TABLE(kind text, year integer, discipline text, division text, ref text, label text, single_holder boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
WITH retiring AS (
    SELECT s."ID", s."Name", s."Designation", s."Division", nullif(btrim(s."CoreArea"), '') AS area,
           (s.dob_date + interval '60 years')::date AS on_date
      FROM public.staff s
     WHERE s.dob_date IS NOT NULL
       AND (s.dob_date + interval '60 years')::date BETWEEN public.ist_today()
           AND (public.ist_today() + make_interval(years => greatest(coalesce(p_years, 5), 1)))::date
)
SELECT 'RETIREMENT', extract(year FROM r.on_date)::int, r.area, r."Division", r."ID",
       r."Name" || coalesce(' · ' || nullif(r."Designation", ''), '') || ' · retires ' || to_char(r.on_date, 'DD Mon YYYY'),
       -- Only holder of the core area among those who stay past the horizon.
       r.area IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.staff o
            WHERE o."ID" <> r."ID" AND lower(btrim(o."CoreArea")) = lower(r.area)
              AND (o.dob_date IS NULL OR (o.dob_date + interval '60 years')::date > r.on_date))
  FROM retiring r
UNION ALL
SELECT 'VACANCY', extract(year FROM coalesce(p.vacant_since, public.ist_today()))::int, p.discipline, p.division_code, p.post_code,
       p.designation || ' · ' || lower(p.state) || coalesce(' since ' || to_char(p.vacant_since, 'DD Mon YYYY'), ''), false
  FROM public.sanctioned_posts p
 WHERE p.state IN ('VACANT', 'ADVERTISED', 'ABEYANCE')
ORDER BY 2, 1, 3;
$$;


SET check_function_bodies = on;

-- ── Metric Registry (references metric_* regproc functions above) ───────────
INSERT INTO public.metrics (key, label, definition, unit, scope_kinds, fn, owner_role, sort)
VALUES
    ('outputs_per_year', 'Publications this year', 'Scientific outputs in the calendar year (scope year, else this year)', 'count', ARRAY['institute', 'division'], 'public.metric_outputs_per_year'::regproc, 'Director', 40),
    ('patents', 'Patents', 'Patents in the IP register (scope stage: Filed, Published, Granted)', 'count', ARRAY['institute', 'division'], 'public.metric_patents'::regproc, 'Director', 41),
    ('posts_filled', 'Filled posts', 'Posts with a holder', 'count', ARRAY['institute', 'division'], 'public.metric_posts_filled'::regproc, 'HRAdmin', 21),
    ('posts_sanctioned', 'Sanctioned posts', 'Posts in the post register, not abolished', 'count', ARRAY['institute', 'division'], 'public.metric_posts_sanctioned'::regproc, 'HRAdmin', 20),
    ('posts_vacant', 'Vacant posts', 'Posts without a holder (vacant or advertised)', 'count', ARRAY['institute', 'division'], 'public.metric_posts_vacant'::regproc, 'HRAdmin', 22),
    ('projects_active', 'Active projects', 'Projects at stage ACTIVE', 'count', ARRAY['institute', 'division'], 'public.metric_projects_active'::regproc, 'PME', 30),
    ('projects_sanctioned_value', 'Sanctioned value of active projects', 'Sum of sanctioned cost, active projects', 'inr', ARRAY['institute', 'division'], 'public.metric_projects_sanctioned_value'::regproc, 'PME', 31),
    ('projects_utilisation_pct', 'Utilisation', 'Expenditure recorded over sanctioned cost, active projects with any expenditure', 'pct', ARRAY['institute', 'division'], 'public.metric_projects_utilisation_pct'::regproc, 'PME', 32),
    ('reports_overdue', 'Progress reports overdue', 'Progress-report slots pending past their due date', 'count', ARRAY['institute', 'division'], 'public.metric_reports_overdue'::regproc, 'PME', 33),
    ('reviews_overdue', 'Reviews overdue', 'Review slots (committee, council, stage gate …) pending past their due date', 'count', ARRAY['institute', 'division'], 'public.metric_reviews_overdue'::regproc, 'PME', 34),
    ('staff_headcount', 'Staff', 'Rows in the staff register', 'count', ARRAY['institute', 'division'], 'public.metric_staff_headcount'::regproc, 'HRAdmin', 10),
    ('students_in_progress', 'PhD students in progress', 'Scholars whose status is not thesis submitted, viva or awarded', 'count', ARRAY['institute', 'division'], 'public.metric_students_in_progress'::regproc, 'Director', 50)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    definition = EXCLUDED.definition,
    unit = EXCLUDED.unit,
    scope_kinds = EXCLUDED.scope_kinds,
    fn = EXCLUDED.fn,
    owner_role = EXCLUDED.owner_role,
    sort = EXCLUDED.sort;

-- ── Views ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public."unique_staff_names" WITH (security_invoker=on) AS
 SELECT TRIM(BOTH FROM "Name") AS name,
    min("ID") AS staff_id
   FROM staff
  WHERE "Name" IS NOT NULL AND length(TRIM(BOTH FROM "Name")) > 0
  GROUP BY (TRIM(BOTH FROM "Name"))
 HAVING count(*) = 1;

CREATE OR REPLACE VIEW public."staff_project_links" WITH (security_invoker=true) AS
 SELECT pr.pi_staff_id AS staff_id,
    pr."ProjectID" AS project_id,
    'PI'::text AS role
   FROM projects pr
  WHERE pr.pi_staff_id IS NOT NULL
UNION
 SELECT c.staff_id,
    pr."ProjectID" AS project_id,
    'Co-PI'::text AS role
   FROM projects pr
     JOIN proposal_copis c ON c.proposal_id = pr.proposal_id
UNION
 SELECT ps.staff_id,
    ps.project_id,
    COALESCE(NULLIF(ps."Designation", ''::text), 'Team member'::text) AS role
   FROM project_staff ps
  WHERE ps.staff_id IS NOT NULL AND ps.project_id IS NOT NULL;

CREATE OR REPLACE VIEW public."division_strength" WITH (security_invoker=true) AS
 SELECT COALESCE(division_code, '—'::text) AS division_code,
    count(*) FILTER (WHERE state <> 'ABOLISHED'::text)::integer AS sanctioned,
    count(*) FILTER (WHERE state = 'FILLED'::text)::integer AS filled,
    count(*) FILTER (WHERE state = ANY (ARRAY['VACANT'::text, 'ADVERTISED'::text, 'ABEYANCE'::text]))::integer AS vacant,
    count(*) FILTER (WHERE state = 'ADVERTISED'::text)::integer AS advertised,
    min(vacant_since) FILTER (WHERE state = ANY (ARRAY['VACANT'::text, 'ADVERTISED'::text])) AS oldest_vacancy
   FROM sanctioned_posts
  GROUP BY (COALESCE(division_code, '—'::text));

CREATE OR REPLACE VIEW public.entity_timeline WITH (security_invoker = true) AS
SELECT t.*, public.acting_capacity(t.actor_user_id, (t.at AT TIME ZONE 'Asia/Kolkata')::date) AS acted_as
  FROM (
    SELECT 'project'::text AS entity_type, e.project_id AS entity_id, e.at, e.actor AS actor_user_id,
           e.kind, e.summary, 'project_events'::text AS source
      FROM public.project_events e
    UNION ALL
    SELECT lower(a.entity_type), a.entity_id::text, a.created_at, a.user_id, a.action, a.action, 'pms_audit_logs'
      FROM public.pms_audit_logs a
    UNION ALL
    SELECT 'contribution_request', c.request_id::text, c.created_at, c.actor_id,
           c.action, coalesce(c.note, coalesce(c.from_status || ' → ', '') || c.to_status), 'contribution_request_events'
      FROM public.contribution_request_events c
    UNION ALL
    SELECT l.entity_type, l.entity_id::text, l.created_at,
           CASE WHEN l.actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN l.actor_id::uuid END,
           l.action, l.entity_type || ' ' || l.action, 'audit_log'
      FROM public.audit_log l
    UNION ALL
    SELECT 'staff', p.staff_id, p.changed_at, p.user_id,
           'profile', 'Profile updated: ' || (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(p.changes) k),
           'staff_profile_changes'
      FROM public.staff_profile_changes p
    UNION ALL
    SELECT 'staff', c.staff_id, c.effective_on::timestamptz, c.created_by,
           lower(c.kind), initcap(lower(c.kind)) || coalesce(' — ' || nullif(c.detail ->> 'summary', ''), '')
               || coalesce(' (' || c.order_ref || ')', ''), 'staff_career_events'
      FROM public.staff_career_events c
    UNION ALL
    SELECT 'recruitment', r.advt_id::text, r.at, r.actor, 'stage', coalesce(r.from_stage || ' → ', '') || r.to_stage, 'recruitment_events'
      FROM public.recruitment_events r
  ) t;

CREATE OR REPLACE VIEW public."project_lessons" WITH (security_invoker=false) AS
 SELECT r.project_id,
    p."ProjectNo" AS project_no,
    p."ProjectName" AS project_name,
    p."DivisionCode" AS division_code,
    p."PrincipalInvestigator" AS pi_name,
    p.track,
    p.stage,
    p.start_date,
    p.end_date,
    r.summary,
    r.objectives_status,
    r.objectives_reason,
    r.what_worked,
    r.what_did_not,
    r.reusable_assets,
    r.trl_target,
    r.trl_reached,
    r.recommendations,
    r.follow_on_ideas,
    r.decided_at AS approved_at,
    r.published_document_id
   FROM project_completion_reports r
     JOIN projects p ON p."ProjectID" = r.project_id
  WHERE r.status = 'APPROVED'::text AND caller_is_verified();

CREATE OR REPLACE VIEW public."project_portfolio" WITH (security_invoker=on) AS
 SELECT "ProjectID" AS project_id,
    "ProjectNo" AS project_no,
    "ProjectName" AS project_name,
    "DivisionCode" AS division_code,
    "PrincipalInvestigator" AS pi_name,
    stage,
    track,
    start_date,
    end_date,
    sanctioned_cost,
        CASE
            WHEN start_date IS NOT NULL AND end_date > start_date THEN LEAST(100::numeric, GREATEST(0::numeric, round(100.0 * (ist_today() - start_date)::numeric / (end_date - start_date)::numeric)))
            ELSE NULL::numeric
        END AS elapsed_pct,
    ( SELECT COALESCE(sum(r.amount), 0::numeric) AS "coalesce"
           FROM project_fund_receipts r
          WHERE r.project_id = p."ProjectID") AS received,
    ( SELECT COALESCE(sum(e.amount), 0::numeric) AS "coalesce"
           FROM project_expenditure e
          WHERE e.project_id = p."ProjectID") AS spent,
    ( SELECT count(*) AS count
           FROM project_milestones m
          WHERE m.project_id = p."ProjectID" AND m.status <> 'DROPPED'::text) AS milestones_total,
    ( SELECT count(*) AS count
           FROM project_milestones m
          WHERE m.project_id = p."ProjectID" AND m.status = 'ACHIEVED'::text) AS milestones_achieved,
    ( SELECT count(*) AS count
           FROM project_review_slots s
          WHERE s.project_id = p."ProjectID" AND s.status = 'PENDING'::text AND s.due_date < ist_today()) AS overdue,
    ( SELECT count(*) AS count
           FROM project_review_slots s
          WHERE s.project_id = p."ProjectID" AND s.status = 'DONE'::text AND s.minutes_due < ist_today()) AS minutes_overdue,
    ( SELECT min(s.due_date) AS min
           FROM project_review_slots s
          WHERE s.project_id = p."ProjectID" AND s.status = 'PENDING'::text AND s.due_date >= ist_today()) AS next_due,
    ( SELECT max(r.submitted_at)::date AS max
           FROM project_reports r
          WHERE r.project_id = p."ProjectID" AND r.submitted_at IS NOT NULL) AS last_report_on,
    ( SELECT s.decision
           FROM project_review_slots s
          WHERE s.project_id = p."ProjectID" AND s.status = 'DONE'::text AND s.decision IS NOT NULL
          ORDER BY s.held_on DESC NULLS LAST
         LIMIT 1) AS last_decision
   FROM projects p
  WHERE stage = ANY (ARRAY['SANCTIONED'::text, 'ACTIVE'::text, 'ON_HOLD'::text, 'CLOSING'::text]);

CREATE OR REPLACE VIEW public."staff_link_gaps" WITH (security_invoker=on) AS
 SELECT 'projects'::text AS table_name,
    projects."ProjectNo" AS row_key,
    'PrincipalInvestigator'::text AS name_column,
    projects."PrincipalInvestigator" AS unresolved_name
   FROM projects
  WHERE projects.pi_staff_id IS NULL AND projects."PrincipalInvestigator" IS NOT NULL AND length(TRIM(BOTH FROM projects."PrincipalInvestigator")) > 0
UNION ALL
 SELECT 'phd_students'::text AS table_name,
    phd_students."EnrollmentNo" AS row_key,
    'SupervisorName'::text AS name_column,
    phd_students."SupervisorName" AS unresolved_name
   FROM phd_students
  WHERE phd_students.supervisor_staff_id IS NULL AND phd_students."SupervisorName" IS NOT NULL AND length(TRIM(BOTH FROM phd_students."SupervisorName")) > 0
UNION ALL
 SELECT 'phd_students'::text AS table_name,
    phd_students."EnrollmentNo" AS row_key,
    'CoSupervisorName'::text AS name_column,
    phd_students."CoSupervisorName" AS unresolved_name
   FROM phd_students
  WHERE phd_students.cosupervisor_staff_id IS NULL AND phd_students."CoSupervisorName" IS NOT NULL AND length(TRIM(BOTH FROM phd_students."CoSupervisorName")) > 0
UNION ALL
 SELECT 'project_staff'::text AS table_name,
    project_staff."ProjectNo" AS row_key,
    'StaffName'::text AS name_column,
    project_staff."StaffName" AS unresolved_name
   FROM project_staff
  WHERE project_staff.staff_id IS NULL AND project_staff."StaffName" IS NOT NULL AND length(TRIM(BOTH FROM project_staff."StaffName")) > 0
UNION ALL
 SELECT 'staff'::text AS table_name,
    staff."ID" AS row_key,
    'user_id'::text AS name_column,
    staff."Name" AS unresolved_name
   FROM staff
  WHERE staff.user_id IS NULL;

CREATE OR REPLACE VIEW public."staff_research_summary" WITH (security_invoker=true) AS
 SELECT s."ID" AS staff_id,
    s."Name" AS name,
    s."Division" AS division,
    s."Designation" AS designation,
    p.active_projects,
    p.as_pi,
    p.sanctioned_value,
    ( SELECT count(DISTINCT a.output_id)::integer AS count
           FROM output_authors a
          WHERE a.staff_id = s."ID") AS outputs,
    ( SELECT count(DISTINCT i.ip_id)::integer AS count
           FROM ip_inventors i
          WHERE i.staff_id = s."ID") AS ip,
    ( SELECT count(*)::integer AS count
           FROM phd_students st
          WHERE s."ID" = st.supervisor_staff_id OR s."ID" = st.cosupervisor_staff_id) AS students,
    ( SELECT count(*)::integer AS count
           FROM staff_expertise se
          WHERE se.staff_id = s."ID" AND se.confirmed_at IS NOT NULL) AS confirmed_terms,
    (s.dob_date + '60 years'::interval)::date AS retires_on
   FROM staff s
     CROSS JOIN LATERAL ( SELECT count(*)::integer AS active_projects,
            count(*) FILTER (WHERE l.role = 'PI'::text)::integer AS as_pi,
            COALESCE(sum(pr.sanctioned_cost) FILTER (WHERE l.role = 'PI'::text), 0::numeric) AS sanctioned_value
           FROM staff_project_links l
             JOIN projects pr ON pr."ProjectID" = l.project_id
          WHERE l.staff_id = s."ID" AND (pr.start_date IS NULL OR pr.start_date <= ist_today()) AND (pr.end_date IS NULL OR pr.end_date >= ist_today())) p;

-- ── Triggers ────────────────────────────────────────────────────────────────
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
CREATE TRIGGER action_items_audit AFTER INSERT OR DELETE OR UPDATE ON action_items FOR EACH ROW EXECUTE FUNCTION audit_row_change('action_item');
CREATE TRIGGER calendar_events_updated_at_trg BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION calendar_events_set_updated_at();
CREATE TRIGGER committees_audit AFTER INSERT OR DELETE OR UPDATE ON committees FOR EACH ROW EXECUTE FUNCTION audit_row_change('committee');
CREATE TRIGGER trg_contract_staff_typed_dates BEFORE INSERT OR UPDATE ON contract_staff FOR EACH ROW EXECUTE FUNCTION hr_sync_typed_dates();
CREATE TRIGGER contribution_requests_set_updated_at BEFORE UPDATE ON contribution_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER contribution_requests_target_scope BEFORE INSERT OR UPDATE OF assignee_id, delegate_id ON contribution_requests FOR EACH ROW EXECUTE FUNCTION contribution_requests_target_scope();
CREATE TRIGGER trg_feature_controls_updated_at BEFORE UPDATE ON feature_controls FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();
CREATE TRIGGER trg_ip_intelligence_inventors AFTER INSERT OR UPDATE OF inventors ON ip_intelligence FOR EACH ROW EXECUTE FUNCTION identity_sync_names();
CREATE TRIGGER meetings_audit AFTER INSERT OR DELETE OR UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION audit_row_change('meeting');
CREATE TRIGGER trg_mous_project_key BEFORE INSERT OR UPDATE ON mous FOR EACH ROW EXECUTE FUNCTION sync_project_key('linked_project_no');
CREATE TRIGGER trg_mous_updated_at BEFORE UPDATE ON mous FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();
CREATE TRIGGER notifications_set_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_phd_students_project_key BEFORE INSERT OR UPDATE ON phd_students FOR EACH ROW EXECUTE FUNCTION sync_project_key('ProjectNo');
CREATE TRIGGER trg_phd_students_staff_key BEFORE INSERT OR UPDATE ON phd_students FOR EACH ROW EXECUTE FUNCTION sync_staff_key();
CREATE TRIGGER trg_lock_pms_annexures BEFORE INSERT OR DELETE OR UPDATE ON pms_annexures FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();
CREATE TRIGGER trg_lock_pms_awp_activities BEFORE INSERT OR DELETE OR UPDATE ON pms_awp_activities FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();
CREATE TRIGGER trg_pms_awp_activities_updated_at BEFORE UPDATE ON pms_awp_activities FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();
CREATE TRIGGER trg_pms_awps_updated_at BEFORE UPDATE ON pms_awps FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();
CREATE TRIGGER trg_lock_pms_committee_decisions BEFORE INSERT OR DELETE OR UPDATE ON pms_committee_decisions FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();
CREATE TRIGGER trg_pms_decisions_require_action BEFORE INSERT ON pms_committee_decisions FOR EACH ROW EXECUTE FUNCTION pms_decisions_require_action();
CREATE TRIGGER trg_lock_pms_condonations BEFORE INSERT OR DELETE OR UPDATE ON pms_condonations FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();
CREATE TRIGGER trg_lock_pms_evaluations BEFORE INSERT OR DELETE OR UPDATE ON pms_evaluations FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();
CREATE TRIGGER trg_pms_evaluation_complete AFTER UPDATE OF status ON pms_evaluations FOR EACH ROW WHEN (new.status = 'COMPLETED'::text) EXECUTE FUNCTION pms_check_evaluation_complete();
CREATE TRIGGER trg_pms_evaluations_guard_2026 BEFORE INSERT OR UPDATE ON pms_evaluations FOR EACH ROW EXECUTE FUNCTION pms_evaluations_guard_2026();
CREATE TRIGGER trg_pms_evaluations_identity BEFORE UPDATE ON pms_evaluations FOR EACH ROW EXECUTE FUNCTION pms_evaluations_guard_identity();
CREATE TRIGGER trg_pms_evaluations_updated_at BEFORE UPDATE ON pms_evaluations FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();
CREATE TRIGGER trg_lock_pms_panel_scores BEFORE INSERT OR DELETE OR UPDATE ON pms_panel_scores FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();
CREATE TRIGGER trg_lock_pms_part1 BEFORE INSERT OR DELETE OR UPDATE ON pms_part1 FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();
CREATE TRIGGER trg_lock_pms_report_items BEFORE INSERT OR DELETE OR UPDATE ON pms_report_items FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();
CREATE TRIGGER trg_lock_pms_report_sections BEFORE INSERT OR DELETE OR UPDATE ON pms_report_sections FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();
CREATE TRIGGER trg_pms_report_sections_updated_at BEFORE UPDATE ON pms_report_sections FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();
CREATE TRIGGER trg_lock_pms_reports BEFORE INSERT OR DELETE OR UPDATE ON pms_reports FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_reports();
CREATE TRIGGER trg_pms_reports_2026_columns BEFORE INSERT OR UPDATE ON pms_reports FOR EACH ROW EXECUTE FUNCTION pms_reports_guard_2026_columns();
CREATE TRIGGER trg_pms_reports_owner_columns BEFORE INSERT OR UPDATE ON pms_reports FOR EACH ROW EXECUTE FUNCTION pms_reports_guard_owner_columns();
CREATE TRIGGER trg_pms_reports_questionnaire_b BEFORE INSERT OR UPDATE ON pms_reports FOR EACH ROW EXECUTE FUNCTION pms_reports_set_questionnaire_b();
CREATE TRIGGER trg_pms_reports_track BEFORE INSERT OR UPDATE ON pms_reports FOR EACH ROW EXECUTE FUNCTION pms_set_report_track();
CREATE TRIGGER trg_pms_reports_updated_at BEFORE UPDATE ON pms_reports FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();
CREATE TRIGGER trg_lock_pms_representations BEFORE INSERT OR DELETE OR UPDATE ON pms_representations FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();
CREATE TRIGGER trg_project_change_requests_log AFTER UPDATE OF status ON project_change_requests FOR EACH ROW EXECUTE FUNCTION project_change_log();
CREATE TRIGGER trg_project_completion_reports_log AFTER INSERT OR UPDATE ON project_completion_reports FOR EACH ROW EXECUTE FUNCTION project_completion_log();
CREATE TRIGGER trg_project_documents_log AFTER INSERT ON project_documents FOR EACH ROW EXECUTE FUNCTION project_log_event();
CREATE TRIGGER trg_expenditure_reversal_lab BEFORE INSERT ON project_expenditure FOR EACH ROW EXECUTE FUNCTION project_money_reversal_lab();
CREATE TRIGGER trg_project_expenditure_log AFTER INSERT ON project_expenditure FOR EACH ROW EXECUTE FUNCTION project_log_event();
CREATE TRIGGER trg_project_expenditure_utilized AFTER INSERT ON project_expenditure FOR EACH ROW EXECUTE FUNCTION project_expenditure_sync_utilized();
CREATE TRIGGER trg_project_fund_receipts_log AFTER INSERT ON project_fund_receipts FOR EACH ROW EXECUTE FUNCTION project_log_event();
CREATE TRIGGER trg_receipts_reversal_lab BEFORE INSERT ON project_fund_receipts FOR EACH ROW EXECUTE FUNCTION project_money_reversal_lab();
CREATE TRIGGER trg_project_milestones_log AFTER INSERT OR UPDATE OF status ON project_milestones FOR EACH ROW EXECUTE FUNCTION project_log_event();
CREATE TRIGGER trg_project_reports_project_key BEFORE INSERT OR UPDATE ON project_reports FOR EACH ROW EXECUTE FUNCTION sync_project_key('project_no');
CREATE TRIGGER trg_project_reports_slot BEFORE INSERT OR UPDATE ON project_reports FOR EACH ROW EXECUTE FUNCTION project_reports_take_slot();
CREATE TRIGGER trg_project_reports_slot_answer AFTER INSERT OR UPDATE OF status, slot_id ON project_reports FOR EACH ROW EXECUTE FUNCTION project_reports_answer_slot();
CREATE TRIGGER trg_project_review_slots_log AFTER INSERT OR UPDATE ON project_review_slots FOR EACH ROW EXECUTE FUNCTION project_log_event();
CREATE TRIGGER trg_project_schemes_updated_at BEFORE UPDATE ON project_schemes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_project_staff_project_key BEFORE INSERT OR UPDATE ON project_staff FOR EACH ROW EXECUTE FUNCTION sync_project_key('ProjectNo');
CREATE TRIGGER trg_project_staff_staff_key BEFORE INSERT OR UPDATE ON project_staff FOR EACH ROW EXECUTE FUNCTION sync_staff_key();
CREATE TRIGGER trg_project_staff_typed_dates BEFORE INSERT OR UPDATE ON project_staff FOR EACH ROW EXECUTE FUNCTION hr_sync_typed_dates();
CREATE TRIGGER trg_projects_default_authority BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION projects_default_authority();
CREATE TRIGGER trg_projects_derive_columns BEFORE INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION projects_derive_columns();
CREATE TRIGGER trg_projects_log AFTER INSERT OR UPDATE OF stage, "ProjectStatus" ON projects FOR EACH ROW EXECUTE FUNCTION project_log_event();
CREATE TRIGGER trg_projects_regenerate_slots AFTER INSERT OR UPDATE OF stage, track, start_date, end_date, "StartDate", "CompletioDate", "ProjectStatus", "ProjectCategory", "ProjectNo" ON projects FOR EACH ROW EXECUTE FUNCTION projects_regenerate_slots();
CREATE TRIGGER trg_projects_resync_child_keys AFTER INSERT OR UPDATE OF "ProjectNo" ON projects FOR EACH ROW EXECUTE FUNCTION projects_resync_child_keys();
CREATE TRIGGER trg_projects_staff_key BEFORE INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION sync_staff_key();
CREATE TRIGGER trg_projects_zz_archived_readonly BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION projects_archived_readonly();
CREATE TRIGGER trg_proposal_budget_lines_total AFTER INSERT OR DELETE OR UPDATE ON proposal_budget_lines FOR EACH ROW EXECUTE FUNCTION proposal_budget_lines_sync_total();
CREATE TRIGGER trg_proposal_notes_updated_at BEFORE UPDATE ON proposal_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER proposals_set_code_trg BEFORE INSERT ON proposals FOR EACH ROW EXECUTE FUNCTION proposals_set_code();
CREATE TRIGGER trg_proposals_project_key BEFORE INSERT OR UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION sync_project_key('linked_project_no');
CREATE TRIGGER trg_scientific_outputs_authors AFTER INSERT OR UPDATE OF authors ON scientific_outputs FOR EACH ROW EXECUTE FUNCTION identity_sync_names();
CREATE TRIGGER trg_pms_awp_sync_staff_user AFTER UPDATE OF user_id ON staff FOR EACH ROW WHEN (new.user_id IS DISTINCT FROM old.user_id) EXECUTE FUNCTION pms_awp_sync_staff_user();
CREATE TRIGGER trg_staff_typed_dates BEFORE INSERT OR UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION hr_sync_typed_dates();
CREATE TRIGGER trg_tech_transfers_project_key BEFORE INSERT OR UPDATE ON tech_transfers FOR EACH ROW EXECUTE FUNCTION sync_project_key('linked_project_no');
CREATE TRIGGER trg_tech_transfers_updated_at BEFORE UPDATE ON tech_transfers FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();
CREATE TRIGGER ticket_responses_audit AFTER INSERT OR DELETE OR UPDATE ON ticket_responses FOR EACH ROW EXECUTE FUNCTION audit_row_change('ticket_response');
CREATE TRIGGER tickets_audit AFTER INSERT OR DELETE OR UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION audit_row_change('ticket');
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();
CREATE TRIGGER trg_user_profiles_validate_active_role BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION user_profiles_validate_active_role();
CREATE TRIGGER trg_vacancy_advertisements_stage BEFORE INSERT OR UPDATE ON vacancy_advertisements FOR EACH ROW EXECUTE FUNCTION vacancy_advertisements_guard_stage();

-- ── Row-Level Security & Policies ───────────────────────────────────────────
ALTER TABLE public."access_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acting_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."action_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agenda_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_action_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."appraisal_cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."calendar_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."coi_declarations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."collection_indexes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."committee_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."committees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contract_staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contribution_request_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contribution_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."csir_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."data_stewards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."divisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."doc_indexes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."doc_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."equipment_usage_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."expertise_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."feature_controls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."feature_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."harvested_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."helpdesk_routing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."import_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."import_field_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ingest_sender_map" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ip_intelligence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ip_inventors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."irins_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."irins_sync_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."labs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meeting_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."metric_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mous" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."output_authors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."phd_milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."phd_students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_annexures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_awp_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_awp_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_awps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_committee_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_condonations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_empowered_committee_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_evaluation_committee_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_evaluation_committees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_grievance_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_panel_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_part1" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_pen_picture_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_report_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_report_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pms_representations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_budget_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_change_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_change_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_completion_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_completion_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_engagements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_expenditure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_fund_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_ip_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_labs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_report_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_review_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_schemes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_selections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_staff_leave" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_staff_persons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_stage_deliverables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_stage_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_budget_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_copis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_review_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_review_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."publication_author_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."publication_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."query_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recruitment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."route_labels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sanctioned_post_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sanctioned_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."scheduled_queries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."scientific_outputs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff_career_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff_expertise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff_profile_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tech_transfers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ticket_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ticket_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vacancy_advertisements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vacancy_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vacancy_posts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_requests_insert_own" ON public."access_requests" FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "access_requests_select_admin" ON public."access_requests" FOR SELECT TO authenticated USING ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "access_requests_select_own" ON public."access_requests" FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "access_requests_update_admin" ON public."access_requests" FOR UPDATE TO authenticated USING ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "acting_assignments_select" ON public."acting_assignments" FOR SELECT TO authenticated USING (caller_is_verified());
CREATE POLICY "action_items_delete" ON public."action_items" FOR DELETE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "action_items_insert" ON public."action_items" FOR INSERT TO authenticated WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "action_items_select" ON public."action_items" FOR SELECT TO authenticated USING (true);
CREATE POLICY "action_items_update" ON public."action_items" FOR UPDATE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "agenda_items_delete" ON public."agenda_items" FOR DELETE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "agenda_items_insert" ON public."agenda_items" FOR INSERT TO authenticated WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "agenda_items_select" ON public."agenda_items" FOR SELECT TO authenticated USING (true);
CREATE POLICY "agenda_items_update" ON public."agenda_items" FOR UPDATE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "ai_action_log_select" ON public."ai_action_log" FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR caller_is_admin()));
CREATE POLICY "cycles_delete" ON public."appraisal_cycles" FOR DELETE TO authenticated USING (pms_is_admin());
CREATE POLICY "cycles_insert" ON public."appraisal_cycles" FOR INSERT TO authenticated WITH CHECK (pms_is_admin());
CREATE POLICY "cycles_select" ON public."appraisal_cycles" FOR SELECT TO authenticated USING (true);
CREATE POLICY "cycles_update" ON public."appraisal_cycles" FOR UPDATE TO authenticated USING (pms_is_admin());
CREATE POLICY "audit_log_select" ON public."audit_log" FOR SELECT TO authenticated USING ((caller_is_admin() OR caller_has_role('Director'::text)));
CREATE POLICY "calendar_events_delete" ON public."calendar_events" FOR DELETE TO authenticated USING (((created_by = ( SELECT auth.uid() AS uid)) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "calendar_events_insert" ON public."calendar_events" FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND ((visibility = 'Personal'::text) OR user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('Director'::text) OR user_has_role('HOD'::text) OR user_has_role('DivisionHead'::text) OR user_has_role('MasterAdmin'::text))));
CREATE POLICY "calendar_events_select" ON public."calendar_events" FOR SELECT TO authenticated USING (((visibility = 'OrgWide'::text) OR ((visibility = 'Personal'::text) AND (created_by = ( SELECT auth.uid() AS uid))) OR ((visibility = 'Division'::text) AND (division_code IN ( SELECT ur.division_code
   FROM (user_roles ur
     JOIN user_profiles up ON (((up.user_id = ur.user_id) AND (up.active_role = ur.role))))
  WHERE (ur.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "calendar_events_update" ON public."calendar_events" FOR UPDATE TO authenticated USING (((created_by = ( SELECT auth.uid() AS uid)) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "coi_declarations_select" ON public."coi_declarations" FOR SELECT TO authenticated USING (((member_user_id = ( SELECT auth.uid() AS uid)) OR coi_caller_chairs(meeting_id)));
CREATE POLICY "collection_indexes_read" ON public."collection_indexes" FOR SELECT TO PUBLIC USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY "committee_members_delete" ON public."committee_members" FOR DELETE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "committee_members_insert" ON public."committee_members" FOR INSERT TO authenticated WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "committee_members_select" ON public."committee_members" FOR SELECT TO authenticated USING (true);
CREATE POLICY "committee_members_update" ON public."committee_members" FOR UPDATE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "committees_delete" ON public."committees" FOR DELETE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "committees_insert" ON public."committees" FOR INSERT TO authenticated WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "committees_select" ON public."committees" FOR SELECT TO authenticated USING (true);
CREATE POLICY "committees_update" ON public."committees" FOR UPDATE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "contract_staff_delete" ON public."contract_staff" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "contract_staff_insert" ON public."contract_staff" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "contract_staff_select" ON public."contract_staff" FOR SELECT TO authenticated USING ((caller_sees_all_personnel() OR caller_in_division("Division") OR ("Name" = caller_staff_name())));
CREATE POLICY "contract_staff_update" ON public."contract_staff" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "contribution_request_events_select" ON public."contribution_request_events" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contribution_requests r
  WHERE (r.id = contribution_request_events.request_id))));
CREATE POLICY "contribution_requests_select" ON public."contribution_requests" FOR SELECT TO authenticated USING (((requested_by = ( SELECT auth.uid() AS uid)) OR (assignee_id = ( SELECT auth.uid() AS uid)) OR (delegate_id = ( SELECT auth.uid() AS uid)) OR contribution_is_reviewer(contribution_requests.*) OR caller_is_director() OR (caller_is_div_manager() AND caller_in_division(division_code))));
CREATE POLICY "csir_rules_select" ON public."csir_rules" FOR SELECT TO authenticated USING (caller_is_verified());
CREATE POLICY "data_stewards_select" ON public."data_stewards" FOR SELECT TO authenticated USING (true);
CREATE POLICY "divisions_delete" ON public."divisions" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "divisions_insert" ON public."divisions" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "divisions_select" ON public."divisions" FOR SELECT TO authenticated USING (true);
CREATE POLICY "divisions_update" ON public."divisions" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "doc_indexes_read" ON public."doc_indexes" FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM documents d
  WHERE ((d.id = doc_indexes.document_id) AND documents_can_read(d.*)))));
CREATE POLICY "doc_pages_read" ON public."doc_pages" FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM documents d
  WHERE ((d.id = doc_pages.document_id) AND documents_can_read(d.*)))));
CREATE POLICY "documents_delete" ON public."documents" FOR DELETE TO PUBLIC USING (((owner_id = ( SELECT auth.uid() AS uid)) OR proposals_caller_has_role('SystemAdmin'::text) OR proposals_caller_has_role('MasterAdmin'::text)));
CREATE POLICY "documents_insert" ON public."documents" FOR INSERT TO PUBLIC WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) AND ((storage_bucket <> 'documents'::text) OR (storage_path ~~ ((( SELECT auth.uid() AS uid))::text || '/%'::text))) AND (caller_is_admin() OR caller_has_role('Director'::text) OR (access_tier = ANY (ARRAY['owner'::text, 'confidential'::text])))));
CREATE POLICY "documents_select" ON public."documents" FOR SELECT TO PUBLIC USING (documents_can_read(documents.*));
CREATE POLICY "documents_update_admin" ON public."documents" FOR UPDATE TO PUBLIC USING ((proposals_caller_has_role('SystemAdmin'::text) OR proposals_caller_has_role('MasterAdmin'::text)));
CREATE POLICY "equipment_admin_delete" ON public."equipment" FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['SystemAdmin'::text, 'MasterAdmin'::text, 'HRAdmin'::text]))))));
CREATE POLICY "equipment_admin_insert" ON public."equipment" FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['SystemAdmin'::text, 'MasterAdmin'::text, 'HRAdmin'::text]))))));
CREATE POLICY "equipment_admin_update" ON public."equipment" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['SystemAdmin'::text, 'MasterAdmin'::text, 'HRAdmin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['SystemAdmin'::text, 'MasterAdmin'::text, 'HRAdmin'::text]))))));
CREATE POLICY "equipment_select" ON public."equipment" FOR SELECT TO authenticated USING ((caller_sees_all_personnel() OR caller_in_division("Division") OR ((caller_active_role() = 'Technician'::text) AND (caller_division() IS NOT NULL) AND ("Division" = caller_division())) OR (owner_user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "equipment_usage_log_select" ON public."equipment_usage_log" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM equipment e
  WHERE (e."UInsID" = equipment_usage_log.equipment_id))));
CREATE POLICY "expertise_terms_insert" ON public."expertise_terms" FOR INSERT TO authenticated WITH CHECK ((caller_is_expertise_curator() AND (status = 'ACTIVE'::text)));
CREATE POLICY "expertise_terms_select" ON public."expertise_terms" FOR SELECT TO authenticated USING (true);
CREATE POLICY "expertise_terms_update" ON public."expertise_terms" FOR UPDATE TO authenticated USING (caller_is_expertise_curator()) WITH CHECK ((caller_is_expertise_curator() AND (status = 'ACTIVE'::text)));
CREATE POLICY "feature_controls_delete" ON public."feature_controls" FOR DELETE TO authenticated USING (caller_has_role('MasterAdmin'::text));
CREATE POLICY "feature_controls_insert" ON public."feature_controls" FOR INSERT TO authenticated WITH CHECK (caller_has_role('MasterAdmin'::text));
CREATE POLICY "feature_controls_select" ON public."feature_controls" FOR SELECT TO authenticated USING (true);
CREATE POLICY "feature_controls_update" ON public."feature_controls" FOR UPDATE TO authenticated USING (caller_has_role('MasterAdmin'::text)) WITH CHECK (caller_has_role('MasterAdmin'::text));
CREATE POLICY "feature_grants_delete" ON public."feature_grants" FOR DELETE TO authenticated USING (caller_has_role('MasterAdmin'::text));
CREATE POLICY "feature_grants_insert" ON public."feature_grants" FOR INSERT TO authenticated WITH CHECK ((caller_has_role('MasterAdmin'::text) AND (granted_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "feature_grants_select" ON public."feature_grants" FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR caller_has_role('MasterAdmin'::text)));
CREATE POLICY "harvested_imports_select" ON public."harvested_imports" FOR SELECT TO authenticated USING (caller_is_admin());
CREATE POLICY "harvested_imports_update" ON public."harvested_imports" FOR UPDATE TO authenticated USING (caller_is_admin()) WITH CHECK (caller_is_admin());
CREATE POLICY "helpdesk_routing_delete" ON public."helpdesk_routing" FOR DELETE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "helpdesk_routing_insert" ON public."helpdesk_routing" FOR INSERT TO authenticated WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "helpdesk_routing_select" ON public."helpdesk_routing" FOR SELECT TO authenticated USING (true);
CREATE POLICY "helpdesk_routing_update" ON public."helpdesk_routing" FOR UPDATE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "holidays_delete" ON public."holidays" FOR DELETE TO authenticated USING ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "holidays_insert" ON public."holidays" FOR INSERT TO authenticated WITH CHECK ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "holidays_select" ON public."holidays" FOR SELECT TO authenticated USING (true);
CREATE POLICY "holidays_update" ON public."holidays" FOR UPDATE TO authenticated USING ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "import_events_insert" ON public."import_events" FOR INSERT TO authenticated WITH CHECK ((caller_is_admin() AND (uploaded_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "import_events_select" ON public."import_events" FOR SELECT TO authenticated USING ((caller_is_admin() OR caller_has_role('Director'::text) OR (uploaded_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "import_field_mappings_insert" ON public."import_field_mappings" FOR INSERT TO authenticated WITH CHECK ((caller_is_admin() AND (confirmed_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "import_field_mappings_select" ON public."import_field_mappings" FOR SELECT TO authenticated USING (caller_is_admin());
CREATE POLICY "import_field_mappings_update" ON public."import_field_mappings" FOR UPDATE TO authenticated USING (caller_is_admin()) WITH CHECK (caller_is_admin());
CREATE POLICY "ingest_sender_map_all" ON public."ingest_sender_map" FOR ALL TO authenticated USING (caller_is_admin()) WITH CHECK (caller_is_admin());
CREATE POLICY "ip_intelligence_delete" ON public."ip_intelligence" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "ip_intelligence_insert" ON public."ip_intelligence" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "ip_intelligence_select" ON public."ip_intelligence" FOR SELECT TO authenticated USING (true);
CREATE POLICY "ip_intelligence_update" ON public."ip_intelligence" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text))) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "ip_inventors_select" ON public."ip_inventors" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ip_intelligence i
  WHERE (i.id = ip_inventors.ip_id))));
CREATE POLICY "irins_profiles_admin_delete" ON public."irins_profiles" FOR DELETE TO authenticated USING ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "irins_profiles_admin_insert" ON public."irins_profiles" FOR INSERT TO authenticated WITH CHECK ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "irins_profiles_admin_update" ON public."irins_profiles" FOR UPDATE TO authenticated USING ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "irins_profiles_read_authenticated" ON public."irins_profiles" FOR SELECT TO authenticated USING (true);
CREATE POLICY "irins_profiles_service_write" ON public."irins_profiles" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "irins_sync_log_admin_delete" ON public."irins_sync_log" FOR DELETE TO authenticated USING ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "irins_sync_log_admin_insert" ON public."irins_sync_log" FOR INSERT TO authenticated WITH CHECK ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "irins_sync_log_admin_update" ON public."irins_sync_log" FOR UPDATE TO authenticated USING ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "irins_sync_log_read_authenticated" ON public."irins_sync_log" FOR SELECT TO authenticated USING (true);
CREATE POLICY "irins_sync_log_service_write" ON public."irins_sync_log" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "labs_admin_delete" ON public."labs" FOR DELETE TO authenticated USING ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "labs_admin_insert" ON public."labs" FOR INSERT TO authenticated WITH CHECK ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "labs_admin_update" ON public."labs" FOR UPDATE TO authenticated USING ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "labs_read_authenticated" ON public."labs" FOR SELECT TO authenticated USING (true);
CREATE POLICY "meeting_documents_delete" ON public."meeting_documents" FOR DELETE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "meeting_documents_insert" ON public."meeting_documents" FOR INSERT TO authenticated WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "meeting_documents_select" ON public."meeting_documents" FOR SELECT TO authenticated USING (true);
CREATE POLICY "meeting_documents_update" ON public."meeting_documents" FOR UPDATE TO authenticated USING ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "meetings_delete" ON public."meetings" FOR DELETE TO authenticated USING (((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)) AND ((status <> 'Completed'::text) OR (meeting_date >= (CURRENT_DATE - '7 days'::interval)) OR user_has_role('MasterAdmin'::text))));
CREATE POLICY "meetings_insert" ON public."meetings" FOR INSERT TO authenticated WITH CHECK ((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "meetings_select" ON public."meetings" FOR SELECT TO authenticated USING (true);
CREATE POLICY "meetings_update" ON public."meetings" FOR UPDATE TO authenticated USING (((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)) AND ((status <> 'Completed'::text) OR (meeting_date >= (CURRENT_DATE - '7 days'::interval)) OR user_has_role('MasterAdmin'::text)))) WITH CHECK (((user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)) AND ((status <> 'Completed'::text) OR (meeting_date >= (CURRENT_DATE - '7 days'::interval)) OR user_has_role('MasterAdmin'::text))));
CREATE POLICY "metric_snapshots_select" ON public."metric_snapshots" FOR SELECT TO authenticated USING (caller_is_verified());
CREATE POLICY "metrics_select" ON public."metrics" FOR SELECT TO authenticated USING (caller_is_verified());
CREATE POLICY "mous_delete" ON public."mous" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "mous_insert" ON public."mous" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "mous_select" ON public."mous" FOR SELECT TO authenticated USING (true);
CREATE POLICY "mous_update" ON public."mous" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme())) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "notifications_select_own" ON public."notifications" FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "notifications_update_own" ON public."notifications" FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "output_authors_select" ON public."output_authors" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM scientific_outputs o
  WHERE (o.id = output_authors.output_id))));
CREATE POLICY "phd_milestones_delete" ON public."phd_milestones" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "phd_milestones_insert" ON public."phd_milestones" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "phd_milestones_select" ON public."phd_milestones" FOR SELECT TO authenticated USING ((caller_sees_all_personnel() OR (EXISTS ( SELECT 1
   FROM phd_students ps
  WHERE (ps."EnrollmentNo" = phd_milestones.enrollment_no)))));
CREATE POLICY "phd_milestones_update" ON public."phd_milestones" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "phd_students_delete" ON public."phd_students" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "phd_students_insert" ON public."phd_students" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "phd_students_select" ON public."phd_students" FOR SELECT TO authenticated USING ((caller_sees_all_personnel() OR caller_in_division("DivisionCode") OR ((supervisor_staff_id IS NOT NULL) AND (supervisor_staff_id = caller_staff_id())) OR ((cosupervisor_staff_id IS NOT NULL) AND (cosupervisor_staff_id = caller_staff_id())) OR ((supervisor_staff_id IS NULL) AND ("SupervisorName" = caller_staff_name())) OR ((cosupervisor_staff_id IS NULL) AND ("CoSupervisorName" = caller_staff_name())) OR ("StudentName" = caller_staff_name())));
CREATE POLICY "phd_students_update" ON public."phd_students" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "annexures_delete" ON public."pms_annexures" FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_annexures.report_id) AND (r.scientist_id = ( SELECT auth.uid() AS uid)) AND (r.status = 'DRAFT'::text)))));
CREATE POLICY "annexures_insert" ON public."pms_annexures" FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_annexures.report_id) AND (r.scientist_id = ( SELECT auth.uid() AS uid)) AND (r.status = 'DRAFT'::text)))));
CREATE POLICY "annexures_select" ON public."pms_annexures" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE (r.id = pms_annexures.report_id))));
CREATE POLICY "audit_logs_select" ON public."pms_audit_logs" FOR SELECT TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "awp_delete_owner_draft" ON public."pms_awp_activities" FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_awp_activities.report_id) AND (r.scientist_id = ( SELECT auth.uid() AS uid)) AND (r.status = 'DRAFT'::text)))));
CREATE POLICY "awp_insert_owner_draft" ON public."pms_awp_activities" FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_awp_activities.report_id) AND (r.scientist_id = ( SELECT auth.uid() AS uid)) AND (r.status = 'DRAFT'::text)))));
CREATE POLICY "awp_select" ON public."pms_awp_activities" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE (r.id = pms_awp_activities.report_id))));
CREATE POLICY "awp_update_owner_draft" ON public."pms_awp_activities" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_awp_activities.report_id) AND (r.scientist_id = ( SELECT auth.uid() AS uid)) AND (r.status = 'DRAFT'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_awp_activities.report_id) AND (r.scientist_id = ( SELECT auth.uid() AS uid)) AND (r.status = 'DRAFT'::text)))));
CREATE POLICY "awp_revisions_select" ON public."pms_awp_revisions" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_awps a
  WHERE (a.id = pms_awp_revisions.awp_id))));
CREATE POLICY "awps_select" ON public."pms_awps" FOR SELECT TO authenticated USING (pms_awp_can_read(staff_id, reporting_officer_id, reviewing_officer_id));
CREATE POLICY "committee_decisions_select" ON public."pms_committee_decisions" FOR SELECT TO authenticated USING (((decided_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_committee_decisions.report_id) AND ((r.scientist_id <> ( SELECT auth.uid() AS uid)) OR (r.status = ANY (ARRAY['FINALIZED'::text, 'UNDER_GRIEVANCE_REVIEW'::text]))))))));
CREATE POLICY "condonations_select" ON public."pms_condonations" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE (r.id = pms_condonations.report_id))));
CREATE POLICY "empowered_members_delete" ON public."pms_empowered_committee_members" FOR DELETE TO authenticated USING (pms_is_admin());
CREATE POLICY "empowered_members_insert" ON public."pms_empowered_committee_members" FOR INSERT TO authenticated WITH CHECK (pms_is_admin());
CREATE POLICY "empowered_members_select" ON public."pms_empowered_committee_members" FOR SELECT TO authenticated USING (true);
CREATE POLICY "empowered_members_update" ON public."pms_empowered_committee_members" FOR UPDATE TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());
CREATE POLICY "evaluation_committee_members_delete" ON public."pms_evaluation_committee_members" FOR DELETE TO authenticated USING (pms_is_admin());
CREATE POLICY "evaluation_committee_members_insert" ON public."pms_evaluation_committee_members" FOR INSERT TO authenticated WITH CHECK (pms_is_admin());
CREATE POLICY "evaluation_committee_members_select" ON public."pms_evaluation_committee_members" FOR SELECT TO authenticated USING (true);
CREATE POLICY "evaluation_committee_members_update" ON public."pms_evaluation_committee_members" FOR UPDATE TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());
CREATE POLICY "evaluation_committees_delete" ON public."pms_evaluation_committees" FOR DELETE TO authenticated USING (pms_is_admin());
CREATE POLICY "evaluation_committees_insert" ON public."pms_evaluation_committees" FOR INSERT TO authenticated WITH CHECK (pms_is_admin());
CREATE POLICY "evaluation_committees_select" ON public."pms_evaluation_committees" FOR SELECT TO authenticated USING (true);
CREATE POLICY "evaluation_committees_update" ON public."pms_evaluation_committees" FOR UPDATE TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());
CREATE POLICY "evaluations_select" ON public."pms_evaluations" FOR SELECT TO authenticated USING (((evaluator_id = ( SELECT auth.uid() AS uid)) OR pms_is_admin()));
CREATE POLICY "evaluations_update" ON public."pms_evaluations" FOR UPDATE TO authenticated USING ((evaluator_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((evaluator_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "grievance_members_delete" ON public."pms_grievance_members" FOR DELETE TO authenticated USING (pms_is_admin());
CREATE POLICY "grievance_members_insert" ON public."pms_grievance_members" FOR INSERT TO authenticated WITH CHECK (pms_is_admin());
CREATE POLICY "grievance_members_select" ON public."pms_grievance_members" FOR SELECT TO authenticated USING (true);
CREATE POLICY "grievance_members_update" ON public."pms_grievance_members" FOR UPDATE TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());
CREATE POLICY "notifications_select" ON public."pms_notifications" FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR pms_is_admin()));
CREATE POLICY "notifications_update" ON public."pms_notifications" FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "pms_panel_scores_select" ON public."pms_panel_scores" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_panel_scores.report_id) AND ((r.scientist_id <> ( SELECT auth.uid() AS uid)) OR (r.status = ANY (ARRAY['FINALIZED'::text, 'UNDER_GRIEVANCE_REVIEW'::text])))))));
CREATE POLICY "pms_part1_select" ON public."pms_part1" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE (r.id = pms_part1.report_id))));
CREATE POLICY "pms_pen_picture_items_select" ON public."pms_pen_picture_items" FOR SELECT TO authenticated USING (true);
CREATE POLICY "pms_report_items_select" ON public."pms_report_items" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_report_items.report_id) AND ((r.scientist_id = ( SELECT auth.uid() AS uid)) OR (pms_report_items.state = ANY (ARRAY['CONFIRMED'::text, 'EDITED'::text, 'ADDED'::text])))))));
CREATE POLICY "sections_insert" ON public."pms_report_sections" FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_report_sections.report_id) AND (r.scientist_id = ( SELECT auth.uid() AS uid)) AND (r.status = 'DRAFT'::text)))));
CREATE POLICY "sections_select" ON public."pms_report_sections" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE (r.id = pms_report_sections.report_id))));
CREATE POLICY "sections_update" ON public."pms_report_sections" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_report_sections.report_id) AND (r.scientist_id = ( SELECT auth.uid() AS uid)) AND (r.status = 'DRAFT'::text)))));
CREATE POLICY "reports_insert" ON public."pms_reports" FOR INSERT TO authenticated WITH CHECK (((scientist_id = ( SELECT auth.uid() AS uid)) AND (status = 'DRAFT'::text) AND (EXISTS ( SELECT 1
   FROM appraisal_cycles c
  WHERE ((c.id = pms_reports.cycle_id) AND (c.status = 'OPEN'::text))))));
CREATE POLICY "reports_select" ON public."pms_reports" FOR SELECT TO authenticated USING (((scientist_id = ( SELECT auth.uid() AS uid)) OR pms_is_admin() OR (EXISTS ( SELECT 1
   FROM pms_evaluations e
  WHERE ((e.report_id = pms_reports.id) AND (e.evaluator_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM pms_empowered_committee_members m
  WHERE ((m.cycle_id = pms_reports.cycle_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))) OR pms_is_grievance_member(cycle_id)));
CREATE POLICY "reports_update" ON public."pms_reports" FOR UPDATE TO authenticated USING (((scientist_id = ( SELECT auth.uid() AS uid)) AND (status = 'DRAFT'::text))) WITH CHECK (((scientist_id = ( SELECT auth.uid() AS uid)) AND (status = 'DRAFT'::text)));
CREATE POLICY "representations_select" ON public."pms_representations" FOR SELECT TO authenticated USING (((scientist_id = ( SELECT auth.uid() AS uid)) OR pms_is_admin() OR (EXISTS ( SELECT 1
   FROM pms_reports r
  WHERE ((r.id = pms_representations.report_id) AND pms_is_grievance_member(r.cycle_id))))));
CREATE POLICY "project_budget_lines_select" ON public."project_budget_lines" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_budget_lines.project_id))));
CREATE POLICY "project_change_requests_select" ON public."project_change_requests" FOR SELECT TO authenticated USING (((created_by = ( SELECT auth.uid() AS uid)) OR ((status <> ALL (ARRAY['DRAFT'::text, 'WITHDRAWN'::text])) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_change_requests.project_id))))));
CREATE POLICY "project_change_steps_select" ON public."project_change_steps" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM project_change_requests r
  WHERE (r.id = project_change_steps.change_id))));
CREATE POLICY "project_completion_reports_select" ON public."project_completion_reports" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_completion_reports.project_id))));
CREATE POLICY "project_completion_steps_select" ON public."project_completion_steps" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM project_completion_reports r
  WHERE (r.id = project_completion_steps.report_id))));
CREATE POLICY "project_documents_insert" ON public."project_documents" FOR INSERT TO authenticated WITH CHECK (((uploaded_by = ( SELECT auth.uid() AS uid)) AND project_caller_may_file(project_id, doc_type)));
CREATE POLICY "project_documents_select" ON public."project_documents" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_documents.project_id))));
CREATE POLICY "project_engagements_select" ON public."project_engagements" FOR SELECT TO authenticated USING ((project_staff_caller_keeps() OR caller_sees_all_personnel() OR project_caller_is_party(project_id)));
CREATE POLICY "project_events_select" ON public."project_events" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_events.project_id))));
CREATE POLICY "project_expenditure_select" ON public."project_expenditure" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_expenditure.project_id))));
CREATE POLICY "project_fund_receipts_select" ON public."project_fund_receipts" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_fund_receipts.project_id))));
CREATE POLICY "project_ip_agreements_select" ON public."project_ip_agreements" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_ip_agreements.project_id))));
CREATE POLICY "project_labs_select" ON public."project_labs" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_labs.project_id))));
CREATE POLICY "project_milestones_select" ON public."project_milestones" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_milestones.project_id))));
CREATE POLICY "project_report_history_select" ON public."project_report_history" FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM project_reports r
  WHERE ((r.id = project_report_history.report_id) AND project_reports_can_read(r.*)))));
CREATE POLICY "project_reports_delete_owner" ON public."project_reports" FOR DELETE TO PUBLIC USING (((submitted_by = ( SELECT auth.uid() AS uid)) AND (status = 'DRAFT'::text)));
CREATE POLICY "project_reports_insert" ON public."project_reports" FOR INSERT TO PUBLIC WITH CHECK ((submitted_by = ( SELECT auth.uid() AS uid)));
CREATE POLICY "project_reports_select" ON public."project_reports" FOR SELECT TO PUBLIC USING (project_reports_can_read(project_reports.*));
CREATE POLICY "project_reports_update_owner" ON public."project_reports" FOR UPDATE TO PUBLIC USING (((submitted_by = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])))) WITH CHECK (((submitted_by = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text]))));
CREATE POLICY "project_review_slots_select" ON public."project_review_slots" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_review_slots.project_id))));
CREATE POLICY "project_schemes_delete_master" ON public."project_schemes" FOR DELETE TO authenticated USING (user_has_role('MasterAdmin'::text));
CREATE POLICY "project_schemes_insert_master" ON public."project_schemes" FOR INSERT TO authenticated WITH CHECK (user_has_role('MasterAdmin'::text));
CREATE POLICY "project_schemes_select" ON public."project_schemes" FOR SELECT TO authenticated USING (caller_is_verified());
CREATE POLICY "project_schemes_update_master" ON public."project_schemes" FOR UPDATE TO authenticated USING (user_has_role('MasterAdmin'::text)) WITH CHECK (user_has_role('MasterAdmin'::text));
CREATE POLICY "project_selections_select" ON public."project_selections" FOR SELECT TO authenticated USING ((project_staff_caller_keeps() OR caller_sees_all_personnel() OR project_caller_is_party(project_id)));
CREATE POLICY "project_staff_delete" ON public."project_staff" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "project_staff_insert" ON public."project_staff" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "project_staff_select" ON public."project_staff" FOR SELECT TO authenticated USING ((caller_sees_all_personnel() OR caller_is_finance() OR caller_is_pme() OR caller_in_division("DivisionCode") OR ((staff_id IS NOT NULL) AND (staff_id = caller_staff_id())) OR ((staff_id IS NULL) AND ("StaffName" = caller_staff_name()))));
CREATE POLICY "project_staff_update" ON public."project_staff" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme())) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "project_staff_leave_select" ON public."project_staff_leave" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM project_engagements e
  WHERE (e.id = project_staff_leave.engagement_id))));
CREATE POLICY "project_staff_persons_select" ON public."project_staff_persons" FOR SELECT TO authenticated USING ((project_staff_caller_keeps() OR caller_sees_all_personnel() OR (EXISTS ( SELECT 1
   FROM project_engagements e
  WHERE (e.person_id = project_staff_persons.id)))));
CREATE POLICY "project_stage_deliverables_select" ON public."project_stage_deliverables" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = project_stage_deliverables.project_id))));
CREATE POLICY "project_stage_items_select" ON public."project_stage_items" FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_delete" ON public."projects" FOR DELETE TO authenticated USING ((user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "projects_insert" ON public."projects" FOR INSERT TO authenticated WITH CHECK ((user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "projects_select" ON public."projects" FOR SELECT TO authenticated USING ((caller_sees_all_personnel() OR caller_is_finance() OR caller_is_pme() OR caller_in_division("DivisionCode") OR ((pi_staff_id IS NOT NULL) AND (pi_staff_id = caller_staff_id())) OR ((pi_staff_id IS NULL) AND ("PrincipalInvestigator" = caller_staff_name())) OR (EXISTS ( SELECT 1
   FROM project_staff ps
  WHERE ((ps."ProjectNo" = projects."ProjectNo") AND (((ps.staff_id IS NOT NULL) AND (ps.staff_id = caller_staff_id())) OR ((ps.staff_id IS NULL) AND (ps."StaffName" = caller_staff_name()))))))));
CREATE POLICY "projects_select_parties" ON public."projects" FOR SELECT TO authenticated USING (((proposal_id IS NOT NULL) AND (proposal_caller_is_copi(proposal_id) OR (EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = projects.proposal_id) AND (p.pi_user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "projects_update" ON public."projects" FOR UPDATE TO authenticated USING ((user_has_role('MasterAdmin'::text) OR caller_is_pme())) WITH CHECK ((user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "proposal_budget_lines_delete_author" ON public."proposal_budget_lines" FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_budget_lines.proposal_id) AND (p.created_by = ( SELECT auth.uid() AS uid)) AND (p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text]))))));
CREATE POLICY "proposal_budget_lines_insert_author" ON public."proposal_budget_lines" FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_budget_lines.proposal_id) AND (p.created_by = ( SELECT auth.uid() AS uid)) AND (p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text]))))));
CREATE POLICY "proposal_budget_lines_select" ON public."proposal_budget_lines" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_budget_lines.proposal_id) AND proposals_can_read(p.*)))));
CREATE POLICY "proposal_budget_lines_update_author" ON public."proposal_budget_lines" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_budget_lines.proposal_id) AND (p.created_by = ( SELECT auth.uid() AS uid)) AND (p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_budget_lines.proposal_id) AND (p.created_by = ( SELECT auth.uid() AS uid)) AND (p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text]))))));
CREATE POLICY "proposal_copis_delete" ON public."proposal_copis" FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_copis.proposal_id) AND (p.created_by = ( SELECT auth.uid() AS uid)) AND (p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text]))))));
CREATE POLICY "proposal_copis_insert" ON public."proposal_copis" FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_copis.proposal_id) AND (p.created_by = ( SELECT auth.uid() AS uid)) AND (p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text]))))));
CREATE POLICY "proposal_copis_select" ON public."proposal_copis" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_copis.proposal_id) AND proposals_can_read(p.*)))));
CREATE POLICY "proposal_copis_update" ON public."proposal_copis" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_copis.proposal_id) AND (p.created_by = ( SELECT auth.uid() AS uid)) AND (p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_copis.proposal_id) AND (p.created_by = ( SELECT auth.uid() AS uid)) AND (p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text]))))));
CREATE POLICY "proposal_documents_insert" ON public."proposal_documents" FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_documents.proposal_id) AND (((proposal_documents.doc_type = ANY (ARRAY['signed_proposal'::text, 'quotation'::text])) AND (p.created_by = ( SELECT auth.uid() AS uid)) AND (p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text]))) OR ((proposal_documents.doc_type = ANY (ARRAY['step_scan'::text, 'sanction_order'::text])) AND (p.status <> ALL (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text, 'REJECTED'::text, 'ARCHIVED'::text, 'LINKED'::text])) AND proposal_caller_may_review(p.*)) OR ((proposal_documents.doc_type = 'om_document'::text) AND proposals_caller_is_admin()))))));
CREATE POLICY "proposal_documents_select" ON public."proposal_documents" FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_documents.proposal_id) AND proposals_can_read(p.*)))));
CREATE POLICY "proposal_notes_delete_own" ON public."proposal_notes" FOR DELETE TO authenticated USING ((author_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "proposal_notes_insert_own" ON public."proposal_notes" FOR INSERT TO authenticated WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_notes.proposal_id) AND (p.created_by = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "proposal_notes_select_own" ON public."proposal_notes" FOR SELECT TO authenticated USING ((author_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "proposal_notes_update_own" ON public."proposal_notes" FOR UPDATE TO authenticated USING ((author_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((author_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "proposal_review_comments_delete" ON public."proposal_review_comments" FOR DELETE TO authenticated USING (((author_id = ( SELECT auth.uid() AS uid)) AND (resolved_at IS NULL)));
CREATE POLICY "proposal_review_comments_insert" ON public."proposal_review_comments" FOR INSERT TO authenticated WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_review_comments.proposal_id) AND (p.status = ANY (ARRAY['SUBMITTED'::text, 'UNDER_REVIEW'::text, 'RECOMMENDED'::text])) AND proposal_caller_may_review(p.*))))));
CREATE POLICY "proposal_review_comments_resolve" ON public."proposal_review_comments" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_review_comments.proposal_id) AND (p.created_by = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_review_comments.proposal_id) AND (p.created_by = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "proposal_review_comments_select" ON public."proposal_review_comments" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_review_comments.proposal_id) AND proposals_can_read(p.*)))));
CREATE POLICY "proposal_review_steps_select" ON public."proposal_review_steps" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_review_steps.proposal_id) AND proposals_can_read(p.*)))));
CREATE POLICY "proposal_status_history_select" ON public."proposal_status_history" FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_status_history.proposal_id) AND proposals_can_read(p.*)))));
CREATE POLICY "proposal_versions_select" ON public."proposal_versions" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM proposals p
  WHERE ((p.id = proposal_versions.proposal_id) AND ((p.created_by = ( SELECT auth.uid() AS uid)) OR ((proposal_versions.kind = 'submitted'::text) AND proposals_can_read(p.*)))))));
CREATE POLICY "proposals_insert" ON public."proposals" FOR INSERT TO PUBLIC WITH CHECK (((pi_user_id = ( SELECT auth.uid() AS uid)) AND (created_by = ( SELECT auth.uid() AS uid)) AND (status = 'DRAFT'::text) AND (proposals_caller_has_role('Scientist'::text) OR proposals_caller_has_role('HOD'::text) OR proposals_caller_has_role('DivisionHead'::text) OR proposals_caller_has_role('Director'::text))));
CREATE POLICY "proposals_select" ON public."proposals" FOR SELECT TO PUBLIC USING (proposals_can_read(proposals.*));
CREATE POLICY "proposals_update_owner" ON public."proposals" FOR UPDATE TO PUBLIC USING (((created_by = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text])))) WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text]))));
CREATE POLICY "publication_author_consents_select" ON public."publication_author_consents" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM publication_files f
  WHERE (f.id = publication_author_consents.file_id))));
CREATE POLICY "publication_files_select" ON public."publication_files" FOR SELECT TO authenticated USING (((created_by = ( SELECT auth.uid() AS uid)) OR caller_is_publication_clearer(division_code) OR (EXISTS ( SELECT 1
   FROM publication_author_consents c
  WHERE ((c.file_id = publication_files.id) AND (c.staff_id = caller_staff_id()))))));
CREATE POLICY "query_log_owner_insert" ON public."query_log" FOR INSERT TO PUBLIC WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "query_log_owner_update" ON public."query_log" FOR UPDATE TO PUBLIC USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "query_log_read" ON public."query_log" FOR SELECT TO PUBLIC USING (((user_id = ( SELECT auth.uid() AS uid)) OR proposals_caller_has_role('SystemAdmin'::text) OR proposals_caller_has_role('MasterAdmin'::text)));
CREATE POLICY "recruitment_events_select" ON public."recruitment_events" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM vacancy_advertisements a
  WHERE (a.id = recruitment_events.advt_id))));
CREATE POLICY "route_labels_admin_insert" ON public."route_labels" FOR INSERT TO PUBLIC WITH CHECK ((proposals_caller_has_role('SystemAdmin'::text) OR proposals_caller_has_role('MasterAdmin'::text)));
CREATE POLICY "route_labels_read" ON public."route_labels" FOR SELECT TO PUBLIC USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY "sanctioned_post_events_select" ON public."sanctioned_post_events" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM sanctioned_posts p
  WHERE (p.id = sanctioned_post_events.post_id))));
CREATE POLICY "sanctioned_posts_select" ON public."sanctioned_posts" FOR SELECT TO authenticated USING ((caller_sees_all_personnel() OR caller_in_division(division_code)));
CREATE POLICY "scheduled_queries_delete_own" ON public."scheduled_queries" FOR DELETE TO authenticated USING ((owner = ( SELECT auth.uid() AS uid)));
CREATE POLICY "scheduled_queries_insert_own" ON public."scheduled_queries" FOR INSERT TO authenticated WITH CHECK ((owner = ( SELECT auth.uid() AS uid)));
CREATE POLICY "scheduled_queries_select_own" ON public."scheduled_queries" FOR SELECT TO authenticated USING ((owner = ( SELECT auth.uid() AS uid)));
CREATE POLICY "scientific_outputs_delete" ON public."scientific_outputs" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "scientific_outputs_insert" ON public."scientific_outputs" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "scientific_outputs_select" ON public."scientific_outputs" FOR SELECT TO authenticated USING (true);
CREATE POLICY "scientific_outputs_update" ON public."scientific_outputs" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text))) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "staff_delete" ON public."staff" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "staff_insert" ON public."staff" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "staff_select" ON public."staff" FOR SELECT TO authenticated USING ((caller_sees_all_personnel() OR caller_in_division("Division") OR (user_id = ( SELECT auth.uid() AS uid)) OR ((user_id IS NULL) AND (lower("Email") = caller_email()))));
CREATE POLICY "staff_select_own_supervisor" ON public."staff" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM phd_students ps
  WHERE (((ps."SupervisorName" = staff."Name") OR (ps."CoSupervisorName" = staff."Name")) AND (ps."StudentName" = caller_staff_name())))));
CREATE POLICY "staff_update" ON public."staff" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "staff_career_events_select" ON public."staff_career_events" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM staff s
  WHERE (s."ID" = staff_career_events.staff_id))));
CREATE POLICY "staff_expertise_delete" ON public."staff_expertise" FOR DELETE TO authenticated USING (((staff_id = caller_staff_id()) OR caller_is_expertise_curator()));
CREATE POLICY "staff_expertise_insert" ON public."staff_expertise" FOR INSERT TO authenticated WITH CHECK (((added_by = ( SELECT auth.uid() AS uid)) AND ((staff_id = caller_staff_id()) OR (caller_is_expertise_curator() AND (confirmed_at IS NULL) AND (source = 'SUGGESTED'::text)))));
CREATE POLICY "staff_expertise_select" ON public."staff_expertise" FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_expertise_update" ON public."staff_expertise" FOR UPDATE TO authenticated USING ((staff_id = caller_staff_id())) WITH CHECK ((staff_id = caller_staff_id()));
CREATE POLICY "staff_profile_changes_select" ON public."staff_profile_changes" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM staff s
  WHERE (s."ID" = staff_profile_changes.staff_id))));
CREATE POLICY "tech_transfers_delete" ON public."tech_transfers" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "tech_transfers_insert" ON public."tech_transfers" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "tech_transfers_select" ON public."tech_transfers" FOR SELECT TO authenticated USING (true);
CREATE POLICY "tech_transfers_update" ON public."tech_transfers" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme())) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text) OR caller_is_pme()));
CREATE POLICY "ticket_events_select" ON public."ticket_events" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM tickets t
  WHERE (t.id = ticket_events.ticket_id))));
CREATE POLICY "ticket_responses_select" ON public."ticket_responses" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM tickets t
  WHERE (t.id = ticket_responses.ticket_id))));
CREATE POLICY "tickets_select" ON public."tickets" FOR SELECT TO authenticated USING (((submitted_by = ( SELECT auth.uid() AS uid)) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR caller_is_admin() OR caller_has_role('Director'::text)));
CREATE POLICY "user_profiles_delete_admin" ON public."user_profiles" FOR DELETE TO authenticated USING ((user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "user_profiles_insert_admin" ON public."user_profiles" FOR INSERT TO authenticated WITH CHECK ((user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "user_profiles_select" ON public."user_profiles" FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "user_profiles_update" ON public."user_profiles" FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "user_roles_delete_admin" ON public."user_roles" FOR DELETE TO authenticated USING ((user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "user_roles_insert_admin" ON public."user_roles" FOR INSERT TO authenticated WITH CHECK ((user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "user_roles_select_own" ON public."user_roles" FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "user_roles_update_admin" ON public."user_roles" FOR UPDATE TO authenticated USING ((user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text))) WITH CHECK ((user_has_role('MasterAdmin'::text) OR user_has_role('SystemAdmin'::text)));
CREATE POLICY "vacancy_advertisements_delete" ON public."vacancy_advertisements" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "vacancy_advertisements_insert" ON public."vacancy_advertisements" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "vacancy_advertisements_select" ON public."vacancy_advertisements" FOR SELECT TO authenticated USING (true);
CREATE POLICY "vacancy_advertisements_update" ON public."vacancy_advertisements" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "vacancy_applications_admin" ON public."vacancy_applications" FOR ALL TO authenticated USING (caller_is_admin()) WITH CHECK (caller_is_admin());
CREATE POLICY "vacancy_posts_delete" ON public."vacancy_posts" FOR DELETE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "vacancy_posts_insert" ON public."vacancy_posts" FOR INSERT TO authenticated WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "vacancy_posts_select" ON public."vacancy_posts" FOR SELECT TO authenticated USING (true);
CREATE POLICY "vacancy_posts_update" ON public."vacancy_posts" FOR UPDATE TO authenticated USING ((user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text))) WITH CHECK ((user_has_role('HRAdmin'::text) OR user_has_role('MasterAdmin'::text)));
CREATE POLICY "awp_pdfs_delete" ON storage."objects" FOR DELETE TO authenticated USING (((bucket_id = 'awp-pdfs'::text) AND pms_is_admin()));
CREATE POLICY "awp_pdfs_insert" ON storage."objects" FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'awp-pdfs'::text) AND pms_is_admin()));
CREATE POLICY "awp_pdfs_select" ON storage."objects" FOR SELECT TO authenticated USING (((bucket_id = 'awp-pdfs'::text) AND (pms_is_admin() OR (EXISTS ( SELECT 1
   FROM pms_awps a
  WHERE (a.source_pdf_path = objects.name))))));
CREATE POLICY "committee_docs_insert" ON storage."objects" FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'committee-docs'::text) AND (user_has_role('Director'::text) OR user_has_role('SystemAdmin'::text) OR user_has_role('MasterAdmin'::text))));
CREATE POLICY "committee_docs_select" ON storage."objects" FOR SELECT TO authenticated USING (((bucket_id = 'committee-docs'::text) AND (EXISTS ( SELECT 1
   FROM meeting_documents md
  WHERE (md.storage_path = objects.name)))));
CREATE POLICY "documents_storage_delete" ON storage."objects" FOR DELETE TO authenticated USING (((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1
   FROM documents d
  WHERE ((d.storage_bucket = 'documents'::text) AND (d.storage_path = objects.name) AND ((d.owner_id = ( SELECT auth.uid() AS uid)) OR proposals_caller_has_role('SystemAdmin'::text) OR proposals_caller_has_role('MasterAdmin'::text)))))));
CREATE POLICY "documents_storage_insert" ON storage."objects" FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = 'documents'::text) AND (name ~~ ((( SELECT auth.uid() AS uid))::text || '/%'::text))));
CREATE POLICY "documents_storage_select" ON storage."objects" FOR SELECT TO PUBLIC USING (((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1
   FROM documents d
  WHERE ((d.storage_bucket = 'documents'::text) AND (d.storage_path = objects.name) AND documents_can_read(d.*))))));
CREATE POLICY "pms_annexures_delete" ON storage."objects" FOR DELETE TO authenticated USING (((bucket_id = 'annexures'::text) AND (pms_is_admin() OR (pms_owns_report_path(name) AND (split_part(name, '/'::text, 2) !~~ 'finalized\_%'::text)))));
CREATE POLICY "pms_annexures_select" ON storage."objects" FOR SELECT TO authenticated USING (((bucket_id = 'annexures'::text) AND pms_can_read_report_path(name)));
CREATE POLICY "pms_annexures_write" ON storage."objects" FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'annexures'::text) AND (pms_owns_report_path(name) OR pms_is_admin())));
CREATE POLICY "pms_signatures_select" ON storage."objects" FOR SELECT TO authenticated USING (((bucket_id = 'signatures'::text) AND pms_can_read_report_path(name)));
CREATE POLICY "pms_signatures_update" ON storage."objects" FOR UPDATE TO authenticated USING (((bucket_id = 'signatures'::text) AND (pms_owns_report_path(name) OR pms_is_admin())));
CREATE POLICY "pms_signatures_write" ON storage."objects" FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'signatures'::text) AND (pms_owns_report_path(name) OR pms_is_admin())));
CREATE POLICY "project_docs_storage_insert" ON storage."objects" FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = 'project-documents'::text) AND project_caller_may_file(split_part(name, '/'::text, 1), split_part(name, '/'::text, 2))));
CREATE POLICY "project_docs_storage_select" ON storage."objects" FOR SELECT TO PUBLIC USING (((bucket_id = 'project-documents'::text) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE (p."ProjectID" = split_part(objects.name, '/'::text, 1))))));
CREATE POLICY "proposal_docs_storage_insert" ON storage."objects" FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = 'proposal-documents'::text) AND (EXISTS ( SELECT 1
   FROM proposals p
  WHERE (((p.id)::text = split_part(objects.name, '/'::text, 1)) AND (((split_part(objects.name, '/'::text, 2) = ANY (ARRAY['signed_proposal'::text, 'quotation'::text])) AND (p.created_by = ( SELECT auth.uid() AS uid)) AND (p.status = ANY (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text]))) OR ((split_part(objects.name, '/'::text, 2) = ANY (ARRAY['step_scan'::text, 'sanction_order'::text])) AND (p.status <> ALL (ARRAY['DRAFT'::text, 'REVISION_REQUESTED'::text, 'REJECTED'::text, 'ARCHIVED'::text, 'LINKED'::text])) AND proposal_caller_may_review(p.*)) OR ((split_part(objects.name, '/'::text, 2) = 'om_document'::text) AND proposals_caller_is_admin())))))));
CREATE POLICY "proposal_docs_storage_select" ON storage."objects" FOR SELECT TO PUBLIC USING (((bucket_id = 'proposal-documents'::text) AND (EXISTS ( SELECT 1
   FROM proposals p
  WHERE (((p.id)::text = split_part(objects.name, '/'::text, 1)) AND proposals_can_read(p.*))))));

-- ── Privileges (Tables, Columns, Views, Sequences, Functions) ───────────────
REVOKE ALL ON TABLE public."access_requests" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."access_requests" TO authenticated;
GRANT ALL ON TABLE public."access_requests" TO service_role;
REVOKE ALL ON TABLE public."acting_assignments" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."acting_assignments" TO authenticated;
GRANT ALL ON TABLE public."acting_assignments" TO service_role;
REVOKE ALL ON TABLE public."action_items" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."action_items" TO authenticated;
GRANT ALL ON TABLE public."action_items" TO service_role;
REVOKE ALL ON TABLE public."agenda_items" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."agenda_items" TO authenticated;
GRANT ALL ON TABLE public."agenda_items" TO service_role;
REVOKE ALL ON TABLE public."ai_action_log" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."ai_action_log" TO service_role;
GRANT SELECT ON TABLE public."ai_action_log" TO authenticated;
REVOKE ALL ON TABLE public."appraisal_cycles" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."appraisal_cycles" TO authenticated;
GRANT ALL ON TABLE public."appraisal_cycles" TO service_role;
REVOKE ALL ON TABLE public."audit_log" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."audit_log" TO authenticated;
GRANT ALL ON TABLE public."audit_log" TO service_role;
REVOKE ALL ON TABLE public."calendar_events" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."calendar_events" TO authenticated;
GRANT ALL ON TABLE public."calendar_events" TO service_role;
REVOKE ALL ON TABLE public."coi_declarations" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."coi_declarations" TO authenticated;
GRANT ALL ON TABLE public."coi_declarations" TO service_role;
REVOKE ALL ON TABLE public."collection_indexes" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."collection_indexes" TO authenticated;
GRANT ALL ON TABLE public."collection_indexes" TO service_role;
REVOKE ALL ON TABLE public."committee_members" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."committee_members" TO authenticated;
GRANT ALL ON TABLE public."committee_members" TO service_role;
REVOKE ALL ON TABLE public."committees" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."committees" TO authenticated;
GRANT ALL ON TABLE public."committees" TO service_role;
REVOKE ALL ON TABLE public."contract_staff" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."contract_staff" TO authenticated;
GRANT ALL ON TABLE public."contract_staff" TO service_role;
REVOKE ALL ON TABLE public."contribution_request_events" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."contribution_request_events" TO service_role;
GRANT SELECT ON TABLE public."contribution_request_events" TO authenticated;
REVOKE ALL ON TABLE public."contribution_requests" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."contribution_requests" TO service_role;
GRANT SELECT ON TABLE public."contribution_requests" TO authenticated;
REVOKE ALL ON TABLE public."csir_rules" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."csir_rules" TO authenticated;
GRANT ALL ON TABLE public."csir_rules" TO service_role;
REVOKE ALL ON TABLE public."data_stewards" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."data_stewards" TO service_role;
GRANT SELECT ON TABLE public."data_stewards" TO authenticated;
REVOKE ALL ON TABLE public."divisions" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."divisions" TO authenticated;
GRANT ALL ON TABLE public."divisions" TO service_role;
REVOKE ALL ON TABLE public."doc_indexes" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."doc_indexes" TO authenticated;
GRANT ALL ON TABLE public."doc_indexes" TO service_role;
REVOKE ALL ON TABLE public."doc_pages" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."doc_pages" TO authenticated;
GRANT ALL ON TABLE public."doc_pages" TO service_role;
REVOKE ALL ON TABLE public."documents" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."documents" TO authenticated;
GRANT ALL ON TABLE public."documents" TO service_role;
REVOKE ALL ON TABLE public."equipment" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."equipment" TO authenticated;
GRANT ALL ON TABLE public."equipment" TO service_role;
REVOKE ALL ON TABLE public."equipment_usage_log" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."equipment_usage_log" TO authenticated;
GRANT ALL ON TABLE public."equipment_usage_log" TO service_role;
REVOKE ALL ON TABLE public."expertise_terms" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."expertise_terms" TO authenticated;
GRANT ALL ON TABLE public."expertise_terms" TO service_role;
REVOKE ALL ON TABLE public."feature_controls" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."feature_controls" TO authenticated;
GRANT ALL ON TABLE public."feature_controls" TO service_role;
REVOKE ALL ON TABLE public."feature_grants" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, DELETE, MAINTAIN ON TABLE public."feature_grants" TO authenticated;
GRANT ALL ON TABLE public."feature_grants" TO service_role;
REVOKE ALL ON TABLE public."harvested_imports" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."harvested_imports" TO authenticated;
GRANT ALL ON TABLE public."harvested_imports" TO service_role;
REVOKE ALL ON TABLE public."helpdesk_routing" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."helpdesk_routing" TO authenticated;
GRANT ALL ON TABLE public."helpdesk_routing" TO service_role;
REVOKE ALL ON TABLE public."holidays" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."holidays" TO authenticated;
GRANT ALL ON TABLE public."holidays" TO service_role;
REVOKE ALL ON TABLE public."import_events" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."import_events" TO authenticated;
GRANT ALL ON TABLE public."import_events" TO service_role;
REVOKE ALL ON TABLE public."import_field_mappings" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."import_field_mappings" TO authenticated;
GRANT ALL ON TABLE public."import_field_mappings" TO service_role;
REVOKE ALL ON TABLE public."ingest_sender_map" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."ingest_sender_map" TO authenticated;
GRANT ALL ON TABLE public."ingest_sender_map" TO service_role;
REVOKE ALL ON TABLE public."ip_intelligence" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."ip_intelligence" TO authenticated;
GRANT ALL ON TABLE public."ip_intelligence" TO service_role;
REVOKE ALL ON TABLE public."ip_inventors" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."ip_inventors" TO authenticated;
GRANT ALL ON TABLE public."ip_inventors" TO service_role;
REVOKE ALL ON TABLE public."irins_profiles" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."irins_profiles" TO authenticated;
GRANT ALL ON TABLE public."irins_profiles" TO service_role;
REVOKE ALL ON TABLE public."irins_sync_log" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."irins_sync_log" TO authenticated;
GRANT ALL ON TABLE public."irins_sync_log" TO service_role;
REVOKE ALL ON TABLE public."labs" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."labs" TO authenticated;
GRANT ALL ON TABLE public."labs" TO service_role;
REVOKE ALL ON TABLE public."meeting_documents" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."meeting_documents" TO authenticated;
GRANT ALL ON TABLE public."meeting_documents" TO service_role;
REVOKE ALL ON TABLE public."meetings" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."meetings" TO authenticated;
GRANT ALL ON TABLE public."meetings" TO service_role;
REVOKE ALL ON TABLE public."metric_snapshots" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."metric_snapshots" TO service_role;
GRANT SELECT ON TABLE public."metric_snapshots" TO authenticated;
REVOKE ALL ON TABLE public."metrics" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."metrics" TO service_role;
GRANT SELECT ON TABLE public."metrics" TO authenticated;
REVOKE ALL ON TABLE public."mous" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."mous" TO authenticated;
GRANT ALL ON TABLE public."mous" TO service_role;
REVOKE ALL ON TABLE public."notifications" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."notifications" TO service_role;
GRANT SELECT ON TABLE public."notifications" TO authenticated;
GRANT UPDATE ("status") ON TABLE public."notifications" TO authenticated;
GRANT UPDATE ("updated_at") ON TABLE public."notifications" TO authenticated;
REVOKE ALL ON TABLE public."output_authors" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."output_authors" TO authenticated;
GRANT ALL ON TABLE public."output_authors" TO service_role;
REVOKE ALL ON TABLE public."phd_milestones" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."phd_milestones" TO authenticated;
GRANT ALL ON TABLE public."phd_milestones" TO service_role;
REVOKE ALL ON TABLE public."phd_students" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."phd_students" TO authenticated;
GRANT ALL ON TABLE public."phd_students" TO service_role;
REVOKE ALL ON TABLE public."pms_annexures" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_annexures" TO authenticated;
GRANT ALL ON TABLE public."pms_annexures" TO service_role;
REVOKE ALL ON TABLE public."pms_audit_logs" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_audit_logs" TO authenticated;
GRANT ALL ON TABLE public."pms_audit_logs" TO service_role;
REVOKE ALL ON TABLE public."pms_awp_activities" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_awp_activities" TO authenticated;
GRANT ALL ON TABLE public."pms_awp_activities" TO service_role;
REVOKE ALL ON TABLE public."pms_awp_revisions" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."pms_awp_revisions" TO authenticated;
GRANT ALL ON TABLE public."pms_awp_revisions" TO service_role;
REVOKE ALL ON TABLE public."pms_awps" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."pms_awps" TO authenticated;
GRANT ALL ON TABLE public."pms_awps" TO service_role;
REVOKE ALL ON TABLE public."pms_committee_decisions" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_committee_decisions" TO authenticated;
GRANT ALL ON TABLE public."pms_committee_decisions" TO service_role;
REVOKE ALL ON TABLE public."pms_condonations" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."pms_condonations" TO authenticated;
GRANT ALL ON TABLE public."pms_condonations" TO service_role;
REVOKE ALL ON TABLE public."pms_empowered_committee_members" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_empowered_committee_members" TO authenticated;
GRANT ALL ON TABLE public."pms_empowered_committee_members" TO service_role;
REVOKE ALL ON TABLE public."pms_evaluation_committee_members" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_evaluation_committee_members" TO authenticated;
GRANT ALL ON TABLE public."pms_evaluation_committee_members" TO service_role;
REVOKE ALL ON TABLE public."pms_evaluation_committees" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_evaluation_committees" TO authenticated;
GRANT ALL ON TABLE public."pms_evaluation_committees" TO service_role;
REVOKE ALL ON TABLE public."pms_evaluations" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_evaluations" TO authenticated;
GRANT ALL ON TABLE public."pms_evaluations" TO service_role;
REVOKE ALL ON TABLE public."pms_grievance_members" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_grievance_members" TO authenticated;
GRANT ALL ON TABLE public."pms_grievance_members" TO service_role;
REVOKE ALL ON TABLE public."pms_notifications" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_notifications" TO authenticated;
GRANT ALL ON TABLE public."pms_notifications" TO service_role;
REVOKE ALL ON TABLE public."pms_panel_scores" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."pms_panel_scores" TO authenticated;
GRANT ALL ON TABLE public."pms_panel_scores" TO service_role;
REVOKE ALL ON TABLE public."pms_part1" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."pms_part1" TO authenticated;
GRANT ALL ON TABLE public."pms_part1" TO service_role;
REVOKE ALL ON TABLE public."pms_pen_picture_items" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."pms_pen_picture_items" TO authenticated;
GRANT ALL ON TABLE public."pms_pen_picture_items" TO service_role;
REVOKE ALL ON TABLE public."pms_report_items" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."pms_report_items" TO authenticated;
GRANT ALL ON TABLE public."pms_report_items" TO service_role;
REVOKE ALL ON TABLE public."pms_report_sections" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_report_sections" TO authenticated;
GRANT ALL ON TABLE public."pms_report_sections" TO service_role;
REVOKE ALL ON TABLE public."pms_reports" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_reports" TO authenticated;
GRANT ALL ON TABLE public."pms_reports" TO service_role;
REVOKE ALL ON TABLE public."pms_representations" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."pms_representations" TO authenticated;
GRANT ALL ON TABLE public."pms_representations" TO service_role;
REVOKE ALL ON TABLE public."project_budget_lines" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_budget_lines" TO authenticated;
GRANT ALL ON TABLE public."project_budget_lines" TO service_role;
REVOKE ALL ON TABLE public."project_change_requests" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_change_requests" TO authenticated;
GRANT ALL ON TABLE public."project_change_requests" TO service_role;
REVOKE ALL ON TABLE public."project_change_steps" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_change_steps" TO authenticated;
GRANT ALL ON TABLE public."project_change_steps" TO service_role;
REVOKE ALL ON TABLE public."project_completion_reports" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_completion_reports" TO authenticated;
GRANT ALL ON TABLE public."project_completion_reports" TO service_role;
REVOKE ALL ON TABLE public."project_completion_steps" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_completion_steps" TO authenticated;
GRANT ALL ON TABLE public."project_completion_steps" TO service_role;
REVOKE ALL ON TABLE public."project_documents" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, MAINTAIN ON TABLE public."project_documents" TO authenticated;
GRANT ALL ON TABLE public."project_documents" TO service_role;
REVOKE ALL ON TABLE public."project_engagements" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_engagements" TO authenticated;
GRANT ALL ON TABLE public."project_engagements" TO service_role;
REVOKE ALL ON TABLE public."project_events" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_events" TO authenticated;
GRANT ALL ON TABLE public."project_events" TO service_role;
REVOKE ALL ON TABLE public."project_expenditure" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_expenditure" TO authenticated;
GRANT ALL ON TABLE public."project_expenditure" TO service_role;
REVOKE ALL ON TABLE public."project_fund_receipts" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_fund_receipts" TO authenticated;
GRANT ALL ON TABLE public."project_fund_receipts" TO service_role;
REVOKE ALL ON TABLE public."project_ip_agreements" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."project_ip_agreements" TO service_role;
GRANT SELECT ON TABLE public."project_ip_agreements" TO authenticated;
REVOKE ALL ON TABLE public."project_labs" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."project_labs" TO service_role;
GRANT SELECT ON TABLE public."project_labs" TO authenticated;
REVOKE ALL ON TABLE public."project_milestones" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_milestones" TO authenticated;
GRANT ALL ON TABLE public."project_milestones" TO service_role;
REVOKE ALL ON TABLE public."project_report_history" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."project_report_history" TO authenticated;
GRANT ALL ON TABLE public."project_report_history" TO service_role;
REVOKE ALL ON TABLE public."project_reports" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."project_reports" TO authenticated;
GRANT ALL ON TABLE public."project_reports" TO service_role;
REVOKE ALL ON TABLE public."project_review_slots" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_review_slots" TO authenticated;
GRANT ALL ON TABLE public."project_review_slots" TO service_role;
REVOKE ALL ON TABLE public."project_schemes" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."project_schemes" TO authenticated;
GRANT ALL ON TABLE public."project_schemes" TO service_role;
REVOKE ALL ON TABLE public."project_selections" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_selections" TO authenticated;
GRANT ALL ON TABLE public."project_selections" TO service_role;
REVOKE ALL ON TABLE public."project_staff" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."project_staff" TO authenticated;
GRANT ALL ON TABLE public."project_staff" TO service_role;
REVOKE ALL ON TABLE public."project_staff_leave" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_staff_leave" TO authenticated;
GRANT ALL ON TABLE public."project_staff_leave" TO service_role;
REVOKE ALL ON TABLE public."project_staff_persons" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_staff_persons" TO authenticated;
GRANT ALL ON TABLE public."project_staff_persons" TO service_role;
REVOKE ALL ON TABLE public."project_stage_deliverables" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_stage_deliverables" TO authenticated;
GRANT ALL ON TABLE public."project_stage_deliverables" TO service_role;
REVOKE ALL ON TABLE public."project_stage_items" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."project_stage_items" TO authenticated;
GRANT ALL ON TABLE public."project_stage_items" TO service_role;
REVOKE ALL ON TABLE public."projects" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."projects" TO authenticated;
GRANT ALL ON TABLE public."projects" TO service_role;
REVOKE ALL ON TABLE public."proposal_budget_lines" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."proposal_budget_lines" TO authenticated;
GRANT ALL ON TABLE public."proposal_budget_lines" TO service_role;
REVOKE ALL ON TABLE public."proposal_copis" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."proposal_copis" TO authenticated;
GRANT ALL ON TABLE public."proposal_copis" TO service_role;
REVOKE ALL ON TABLE public."proposal_documents" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."proposal_documents" TO authenticated;
GRANT ALL ON TABLE public."proposal_documents" TO service_role;
REVOKE ALL ON TABLE public."proposal_notes" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."proposal_notes" TO authenticated;
GRANT ALL ON TABLE public."proposal_notes" TO service_role;
REVOKE ALL ON TABLE public."proposal_review_comments" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, DELETE, MAINTAIN ON TABLE public."proposal_review_comments" TO authenticated;
GRANT ALL ON TABLE public."proposal_review_comments" TO service_role;
GRANT UPDATE ("resolved_at") ON TABLE public."proposal_review_comments" TO authenticated;
REVOKE ALL ON TABLE public."proposal_review_steps" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."proposal_review_steps" TO authenticated;
GRANT ALL ON TABLE public."proposal_review_steps" TO service_role;
REVOKE ALL ON TABLE public."proposal_status_history" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."proposal_status_history" TO authenticated;
GRANT ALL ON TABLE public."proposal_status_history" TO service_role;
REVOKE ALL ON TABLE public."proposal_versions" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."proposal_versions" TO authenticated;
GRANT ALL ON TABLE public."proposal_versions" TO service_role;
REVOKE ALL ON TABLE public."proposals" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."proposals" TO authenticated;
GRANT ALL ON TABLE public."proposals" TO service_role;
REVOKE ALL ON TABLE public."publication_author_consents" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."publication_author_consents" TO service_role;
GRANT SELECT ON TABLE public."publication_author_consents" TO authenticated;
REVOKE ALL ON TABLE public."publication_files" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."publication_files" TO service_role;
GRANT SELECT ON TABLE public."publication_files" TO authenticated;
REVOKE ALL ON TABLE public."query_log" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."query_log" TO authenticated;
GRANT ALL ON TABLE public."query_log" TO service_role;
REVOKE ALL ON TABLE public."recruitment_events" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."recruitment_events" TO authenticated;
GRANT ALL ON TABLE public."recruitment_events" TO service_role;
REVOKE ALL ON TABLE public."route_labels" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."route_labels" TO authenticated;
GRANT ALL ON TABLE public."route_labels" TO service_role;
REVOKE ALL ON TABLE public."sanctioned_post_events" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."sanctioned_post_events" TO authenticated;
GRANT ALL ON TABLE public."sanctioned_post_events" TO service_role;
REVOKE ALL ON TABLE public."sanctioned_posts" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."sanctioned_posts" TO authenticated;
GRANT ALL ON TABLE public."sanctioned_posts" TO service_role;
REVOKE ALL ON TABLE public."scheduled_queries" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."scheduled_queries" TO service_role;
GRANT INSERT, SELECT, DELETE ON TABLE public."scheduled_queries" TO authenticated;
REVOKE ALL ON TABLE public."scientific_outputs" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."scientific_outputs" TO authenticated;
GRANT ALL ON TABLE public."scientific_outputs" TO service_role;
REVOKE ALL ON TABLE public."staff" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."staff" TO authenticated;
GRANT ALL ON TABLE public."staff" TO service_role;
REVOKE ALL ON TABLE public."staff_career_events" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."staff_career_events" TO authenticated;
GRANT ALL ON TABLE public."staff_career_events" TO service_role;
REVOKE ALL ON TABLE public."staff_expertise" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."staff_expertise" TO authenticated;
GRANT ALL ON TABLE public."staff_expertise" TO service_role;
REVOKE ALL ON TABLE public."staff_profile_changes" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."staff_profile_changes" TO authenticated;
GRANT ALL ON TABLE public."staff_profile_changes" TO service_role;
REVOKE ALL ON TABLE public."tech_transfers" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."tech_transfers" TO authenticated;
GRANT ALL ON TABLE public."tech_transfers" TO service_role;
REVOKE ALL ON TABLE public."ticket_events" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."ticket_events" TO authenticated;
GRANT ALL ON TABLE public."ticket_events" TO service_role;
REVOKE ALL ON TABLE public."ticket_responses" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."ticket_responses" TO authenticated;
GRANT ALL ON TABLE public."ticket_responses" TO service_role;
REVOKE ALL ON TABLE public."tickets" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."tickets" TO authenticated;
GRANT ALL ON TABLE public."tickets" TO service_role;
REVOKE ALL ON TABLE public."user_profiles" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, DELETE, MAINTAIN ON TABLE public."user_profiles" TO authenticated;
GRANT ALL ON TABLE public."user_profiles" TO service_role;
GRANT UPDATE ("active_role") ON TABLE public."user_profiles" TO authenticated;
GRANT UPDATE ("last_seen_at") ON TABLE public."user_profiles" TO authenticated;
REVOKE ALL ON TABLE public."user_roles" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, MAINTAIN ON TABLE public."user_roles" TO authenticated;
GRANT ALL ON TABLE public."user_roles" TO service_role;
REVOKE ALL ON TABLE public."vacancy_advertisements" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."vacancy_advertisements" TO authenticated;
GRANT ALL ON TABLE public."vacancy_advertisements" TO service_role;
REVOKE ALL ON TABLE public."vacancy_applications" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."vacancy_applications" TO authenticated;
GRANT ALL ON TABLE public."vacancy_applications" TO service_role;
REVOKE ALL ON TABLE public."vacancy_posts" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."vacancy_posts" TO authenticated;
GRANT ALL ON TABLE public."vacancy_posts" TO service_role;

REVOKE ALL ON TABLE public."unique_staff_names" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."unique_staff_names" TO service_role;
REVOKE ALL ON TABLE public."staff_project_links" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."staff_project_links" TO authenticated;
GRANT ALL ON TABLE public."staff_project_links" TO service_role;
REVOKE ALL ON TABLE public."division_strength" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."division_strength" TO authenticated;
GRANT ALL ON TABLE public."division_strength" TO service_role;
REVOKE ALL ON TABLE public."entity_timeline" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."entity_timeline" TO authenticated;
GRANT ALL ON TABLE public."entity_timeline" TO service_role;
REVOKE ALL ON TABLE public."project_lessons" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."project_lessons" TO authenticated;
GRANT ALL ON TABLE public."project_lessons" TO service_role;
REVOKE ALL ON TABLE public."project_portfolio" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."project_portfolio" TO authenticated;
GRANT ALL ON TABLE public."project_portfolio" TO service_role;
REVOKE ALL ON TABLE public."staff_link_gaps" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public."staff_link_gaps" TO service_role;
REVOKE ALL ON TABLE public."staff_research_summary" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, MAINTAIN ON TABLE public."staff_research_summary" TO authenticated;
GRANT ALL ON TABLE public."staff_research_summary" TO service_role;

REVOKE ALL ON SEQUENCE public."ai_action_log_id_seq" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public."ai_action_log_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."ai_action_log_id_seq" TO service_role;
REVOKE ALL ON SEQUENCE public."irins_sync_log_id_seq" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public."irins_sync_log_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."irins_sync_log_id_seq" TO service_role;
REVOKE ALL ON SEQUENCE public."project_events_id_seq" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public."project_events_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."project_events_id_seq" TO service_role;
REVOKE ALL ON SEQUENCE public."proposal_status_history_id_seq" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public."proposal_status_history_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."proposal_status_history_id_seq" TO service_role;
REVOKE ALL ON SEQUENCE public."recruitment_events_id_seq" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public."recruitment_events_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."recruitment_events_id_seq" TO service_role;
REVOKE ALL ON SEQUENCE public."sanctioned_post_events_id_seq" FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public."sanctioned_post_events_id_seq" TO authenticated;
GRANT ALL ON SEQUENCE public."sanctioned_post_events_id_seq" TO service_role;

REVOKE ALL ON FUNCTION public.acting_assign(text,text,uuid,uuid,date,date,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acting_assign(text,text,uuid,uuid,date,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acting_assign(text,text,uuid,uuid,date,date,text) TO service_role;
REVOKE ALL ON FUNCTION public.acting_capacity(uuid,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acting_capacity(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acting_capacity(uuid,date) TO service_role;
REVOKE ALL ON FUNCTION public.acting_end(uuid,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acting_end(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acting_end(uuid,date) TO service_role;
REVOKE ALL ON FUNCTION public.admin_force_password_reset(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_force_password_reset(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_password_reset(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO service_role;
REVOKE ALL ON FUNCTION public.admin_set_user_roles(uuid,text[],text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid,text[],text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid,text[],text,text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_staff_link_gaps() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_staff_link_gaps() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_staff_link_gaps() TO service_role;
REVOKE ALL ON FUNCTION public.ai_suggest_sweep() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_suggest_sweep() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_suggest_sweep() TO service_role;
REVOKE ALL ON FUNCTION public.approve_access_request(uuid,text[],text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_access_request(uuid,text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_access_request(uuid,text[],text) TO service_role;
REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_row_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_row_change() TO service_role;
REVOKE ALL ON FUNCTION public.budget_head_is_capital(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.budget_head_is_capital(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.budget_head_is_capital(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.budget_head_is_capital(text) TO service_role;
REVOKE ALL ON FUNCTION public.calendar_events_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_events_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_events_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.caller_acting_as(text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_acting_as(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_acting_as(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.caller_active_role() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_active_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_active_role() TO service_role;
REVOKE ALL ON FUNCTION public.caller_division() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_division() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_division() TO service_role;
REVOKE ALL ON FUNCTION public.caller_email() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_email() TO service_role;
REVOKE ALL ON FUNCTION public.caller_has_role(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_has_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_has_role(text) TO service_role;
REVOKE ALL ON FUNCTION public.caller_in_division(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_in_division(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_in_division(text) TO service_role;
REVOKE ALL ON FUNCTION public.caller_is_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_admin() TO service_role;
REVOKE ALL ON FUNCTION public.caller_is_director() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_is_director() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_director() TO service_role;
REVOKE ALL ON FUNCTION public.caller_is_div_manager() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_is_div_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_div_manager() TO service_role;
REVOKE ALL ON FUNCTION public.caller_is_expertise_curator() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_is_expertise_curator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_expertise_curator() TO service_role;
REVOKE ALL ON FUNCTION public.caller_is_finance() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_is_finance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_finance() TO service_role;
REVOKE ALL ON FUNCTION public.caller_is_pme() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_is_pme() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_pme() TO service_role;
REVOKE ALL ON FUNCTION public.caller_is_publication_clearer(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_is_publication_clearer(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.caller_is_publication_clearer(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_publication_clearer(text) TO service_role;
REVOKE ALL ON FUNCTION public.caller_is_verified() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_is_verified() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_verified() TO service_role;
REVOKE ALL ON FUNCTION public.caller_sees_all_personnel() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_sees_all_personnel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_sees_all_personnel() TO service_role;
REVOKE ALL ON FUNCTION public.caller_sees_directory() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_sees_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_sees_directory() TO service_role;
REVOKE ALL ON FUNCTION public.caller_staff_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_staff_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_staff_id() TO service_role;
REVOKE ALL ON FUNCTION public.caller_staff_name() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_staff_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_staff_name() TO service_role;
REVOKE ALL ON FUNCTION public.can_use_ask_surya() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_use_ask_surya() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_ask_surya() TO service_role;
REVOKE ALL ON FUNCTION public.career_events_import(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.career_events_import(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.career_events_import(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.clear_must_change_password() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO service_role;
REVOKE ALL ON FUNCTION public.coi_caller_chairs(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coi_caller_chairs(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coi_caller_chairs(uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.coi_chair_decide(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coi_chair_decide(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coi_chair_decide(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.coi_declare(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coi_declare(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coi_declare(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.committee_minutes_days(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.committee_minutes_days(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.committee_minutes_days(text) TO service_role;
REVOKE ALL ON FUNCTION public.contribution_is_reviewer(contribution_requests) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contribution_is_reviewer(contribution_requests) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contribution_is_reviewer(contribution_requests) TO service_role;
REVOKE ALL ON FUNCTION public.contribution_request_act(uuid,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contribution_request_act(uuid,text,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contribution_request_act(uuid,text,text,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.contribution_request_create(text,text,text,text,text,text,date,jsonb,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contribution_request_create(text,text,text,text,text,text,date,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contribution_request_create(text,text,text,text,text,text,date,jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.contribution_requests_sweep() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contribution_requests_sweep() TO service_role;
REVOKE ALL ON FUNCTION public.contribution_requests_target_scope() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contribution_requests_target_scope() TO service_role;
REVOKE ALL ON FUNCTION public.contribution_steward_for(text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contribution_steward_for(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.contribution_target_can_see(uuid,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contribution_target_can_see(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.csir_rule(text,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.csir_rule(text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csir_rule(text,date) TO service_role;
REVOKE ALL ON FUNCTION public.csir_rule_set(text,jsonb,text,date,text,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.csir_rule_set(text,jsonb,text,date,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csir_rule_set(text,jsonb,text,date,text,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.csir_rules_value_or_null(text,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.csir_rules_value_or_null(text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csir_rules_value_or_null(text,date) TO service_role;
REVOKE ALL ON FUNCTION public.data_steward_remove(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.data_steward_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.data_steward_remove(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.data_steward_set(text,text,uuid,text,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.data_steward_set(text,text,uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.data_steward_set(text,text,uuid,text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.documents_can_read(documents) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.documents_can_read(documents) TO authenticated;
GRANT EXECUTE ON FUNCTION public.documents_can_read(documents) TO service_role;
REVOKE ALL ON FUNCTION public.documents_set_access_tier(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.documents_set_access_tier(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.documents_set_access_tier(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.equipment_log_usage(text,date,numeric,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_log_usage(text,date,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_log_usage(text,date,numeric,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.equipment_logbook_required(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_logbook_required(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_logbook_required(text) TO service_role;
REVOKE ALL ON FUNCTION public.expertise_find(uuid[],text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expertise_find(uuid[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expertise_find(uuid[],text) TO service_role;
REVOKE ALL ON FUNCTION public.expertise_merge(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expertise_merge(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expertise_merge(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.expertise_pattern(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expertise_pattern(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.expertise_pattern(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expertise_pattern(text) TO service_role;
REVOKE ALL ON FUNCTION public.expertise_suggest(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expertise_suggest(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expertise_suggest(text) TO service_role;
REVOKE ALL ON FUNCTION public.fiscal_year_of(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_year_of(date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_year_of(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_year_of(date) TO service_role;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO service_role;
REVOKE ALL ON FUNCTION public.helpdesk_add_response(uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.helpdesk_add_response(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helpdesk_add_response(uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.helpdesk_assign_ticket(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.helpdesk_assign_ticket(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helpdesk_assign_ticket(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.helpdesk_create_ticket(text,text,text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.helpdesk_create_ticket(text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helpdesk_create_ticket(text,text,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.helpdesk_update_status(uuid,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.helpdesk_update_status(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helpdesk_update_status(uuid,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.hr_sync_typed_dates() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_sync_typed_dates() TO service_role;
REVOKE ALL ON FUNCTION public.identity_autolink(text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_autolink(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.identity_link_authors() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_link_authors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.identity_link_authors() TO service_role;
REVOKE ALL ON FUNCTION public.identity_link_gaps() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_link_gaps() TO authenticated;
GRANT EXECUTE ON FUNCTION public.identity_link_gaps() TO service_role;
REVOKE ALL ON FUNCTION public.identity_set_link(text,text,integer,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_set_link(text,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.identity_set_link(text,text,integer,text) TO service_role;
REVOKE ALL ON FUNCTION public.identity_sync_names() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_sync_names() TO service_role;
REVOKE ALL ON FUNCTION public.ist_today() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ist_today() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ist_today() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ist_today() TO service_role;
REVOKE ALL ON FUNCTION public.list_combined_audit_logs(text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_combined_audit_logs(text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_combined_audit_logs(text,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.merge_user_preferences(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_user_preferences(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_user_preferences(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_digest_run() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_digest_run() TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_digest_run() TO service_role;
REVOKE ALL ON FUNCTION public.metric_outputs_per_year(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_outputs_per_year(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_outputs_per_year(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_outputs_per_year(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_patents(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_patents(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_patents(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_patents(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_posts(jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_posts(jsonb,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_posts(jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_posts(jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.metric_posts_filled(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_posts_filled(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_posts_filled(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_posts_filled(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_posts_sanctioned(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_posts_sanctioned(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_posts_sanctioned(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_posts_sanctioned(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_posts_vacant(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_posts_vacant(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_posts_vacant(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_posts_vacant(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_projects_active(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_projects_active(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_projects_active(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_projects_active(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_projects_sanctioned_value(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_projects_sanctioned_value(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_projects_sanctioned_value(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_projects_sanctioned_value(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_projects_utilisation_pct(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_projects_utilisation_pct(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_projects_utilisation_pct(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_projects_utilisation_pct(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_reports_overdue(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_reports_overdue(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_reports_overdue(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_reports_overdue(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_review_slots_overdue(jsonb,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_review_slots_overdue(jsonb,boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_review_slots_overdue(jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_review_slots_overdue(jsonb,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.metric_reviews_overdue(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_reviews_overdue(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_reviews_overdue(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_reviews_overdue(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_snapshot_run(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_snapshot_run(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_snapshot_run(date) TO service_role;
REVOKE ALL ON FUNCTION public.metric_staff_headcount(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_staff_headcount(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_staff_headcount(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_staff_headcount(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_students_in_progress(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_students_in_progress(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.metric_students_in_progress(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_students_in_progress(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.metric_table() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_table() TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_table() TO service_role;
REVOKE ALL ON FUNCTION public.metric_value(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_value(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.metric_value(text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.my_change_steps() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_change_steps() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_change_steps() TO service_role;
REVOKE ALL ON FUNCTION public.my_closure_items() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_closure_items() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_closure_items() TO service_role;
REVOKE ALL ON FUNCTION public.my_due_project_slots() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_due_project_slots() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_due_project_slots() TO service_role;
REVOKE ALL ON FUNCTION public.notification_accept(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notification_accept(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_accept(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.notifications_sweep() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notifications_sweep() TO service_role;
REVOKE ALL ON FUNCTION public.person_name_key(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.person_name_key(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.person_name_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.person_name_key(text) TO service_role;
REVOKE ALL ON FUNCTION public.person_name_may_be(text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.person_name_may_be(text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.person_name_may_be(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.person_name_may_be(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.pme_compliance_counts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pme_compliance_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pme_compliance_counts() TO service_role;
REVOKE ALL ON FUNCTION public.pms_annexure_b_due(uuid,smallint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_annexure_b_due(uuid,smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_annexure_b_due(uuid,smallint) TO service_role;
REVOKE ALL ON FUNCTION public.pms_assign_evaluators(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_assign_evaluators(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_assign_evaluators(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_can_read(text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_can_read(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_can_read(text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_content(pms_awps) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_content(pms_awps) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pms_awp_content(pms_awps) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_content(pms_awps) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_decide_revision(uuid,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_decide_revision(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_decide_revision(uuid,boolean,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_director_decide(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_director_decide(uuid,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_director_decide(uuid,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_director_staff_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_director_staff_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pms_awp_director_staff_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_director_staff_id() TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_for_report(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_for_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_for_report(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_forward_blank(text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_forward_blank(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_forward_blank(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_import(text,text,jsonb,text,text,text,date,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_import(text,text,jsonb,text,text,text,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_import(text,text,jsonb,text,text,text,date,date) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_notify(text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_notify(text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_redact_projects(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_redact_projects(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pms_awp_redact_projects(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_redact_projects(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_request_revision(uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_request_revision(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_request_revision(uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_return(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_return(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_return(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_ro_review(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_ro_review(uuid,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_ro_review(uuid,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_rvo_review(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_rvo_review(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_rvo_review(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_save_draft(text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_save_draft(text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_save_draft(text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_set_reviewing_officer(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_set_reviewing_officer(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_set_reviewing_officer(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_submit(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_submit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_submit(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_sync_staff_user() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_sync_staff_user() TO service_role;
REVOKE ALL ON FUNCTION public.pms_awp_total(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_awp_total(jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pms_awp_total(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_awp_total(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pms_block_locked_cycle_children() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_block_locked_cycle_children() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_block_locked_cycle_children() TO service_role;
REVOKE ALL ON FUNCTION public.pms_block_locked_cycle_reports() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_block_locked_cycle_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_block_locked_cycle_reports() TO service_role;
REVOKE ALL ON FUNCTION public.pms_caller_track() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_caller_track() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_caller_track() TO service_role;
REVOKE ALL ON FUNCTION public.pms_can_read_report_path(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_can_read_report_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_can_read_report_path(text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_check_evaluation_complete() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_check_evaluation_complete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_check_evaluation_complete() TO service_role;
REVOKE ALL ON FUNCTION public.pms_committee_panel_valid(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_committee_panel_valid(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pms_committee_panel_valid(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pms_condone_delay(uuid,date,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_condone_delay(uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_condone_delay(uuid,date,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_cycle_locked(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_cycle_locked(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_cycle_locked(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_deadline(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_deadline(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_deadline(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_decisions_require_action() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_decisions_require_action() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pms_decisions_require_action() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_decisions_require_action() TO service_role;
REVOKE ALL ON FUNCTION public.pms_delay_report(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_delay_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_delay_report(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_designation_key(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_designation_key(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pms_designation_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_designation_key(text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_empowered_committee_valid(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_empowered_committee_valid(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pms_empowered_committee_valid(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pms_evaluations_guard_2026() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_evaluations_guard_2026() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pms_evaluations_guard_2026() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_evaluations_guard_2026() TO service_role;
REVOKE ALL ON FUNCTION public.pms_evaluations_guard_identity() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_evaluations_guard_identity() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pms_evaluations_guard_identity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_evaluations_guard_identity() TO service_role;
REVOKE ALL ON FUNCTION public.pms_finalize_report(uuid,integer,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_finalize_report(uuid,integer,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_finalize_report(uuid,integer,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_finalize_report_2026(uuid,text,integer,text,text,text,text,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_finalize_report_2026(uuid,text,integer,text,text,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_finalize_report_2026(uuid,text,integer,text,text,text,text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.pms_finalize_senior_report(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_finalize_senior_report(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_finalize_senior_report(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_grade(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_grade(integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pms_grade(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_grade(integer) TO service_role;
REVOKE ALL ON FUNCTION public.pms_is_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_is_admin() TO service_role;
REVOKE ALL ON FUNCTION public.pms_is_evaluation_committee_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_is_evaluation_committee_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_is_evaluation_committee_member(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_is_grievance_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_is_grievance_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_is_grievance_member(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_mark_not_assessed(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_mark_not_assessed(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_mark_not_assessed(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_own_draft(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_own_draft(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_owns_report_path(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_owns_report_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_owns_report_path(text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_part1_from_staff(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_part1_from_staff(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_part1_prefill(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_part1_prefill(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_part1_prefill(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_part1_report_discrepancy(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_part1_report_discrepancy(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_part1_report_discrepancy(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_part1_verify(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_part1_verify(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_part1_verify(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pms_prefill_from_profile(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_prefill_from_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_prefill_from_profile(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_record_non_submission(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_record_non_submission(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_record_non_submission(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_record_panel_score(uuid,integer,text,text,text,jsonb,text,text,text,text,integer,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_record_panel_score(uuid,integer,text,text,text,jsonb,text,text,text,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_record_panel_score(uuid,integer,text,text,text,jsonb,text,text,text,text,integer,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_report_designation(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_report_designation(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_report_item_add(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_report_item_add(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_report_item_add(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_report_item_set(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_report_item_set(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_report_item_set(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_reports_guard_2026_columns() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_reports_guard_2026_columns() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pms_reports_guard_2026_columns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_reports_guard_2026_columns() TO service_role;
REVOKE ALL ON FUNCTION public.pms_reports_guard_owner_columns() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_reports_guard_owner_columns() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pms_reports_guard_owner_columns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_reports_guard_owner_columns() TO service_role;
REVOKE ALL ON FUNCTION public.pms_reports_set_questionnaire_b() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_reports_set_questionnaire_b() TO service_role;
REVOKE ALL ON FUNCTION public.pms_resolve_representation(uuid,text,integer,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_resolve_representation(uuid,text,integer,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_resolve_representation(uuid,text,integer,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_save_awp_activities(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_save_awp_activities(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_save_awp_activities(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pms_score_history(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_score_history(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_score_history(text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_set_duty_days(uuid,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_set_duty_days(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_set_duty_days(uuid,integer) TO service_role;
REVOKE ALL ON FUNCTION public.pms_set_report_track() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_set_report_track() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_set_report_track() TO service_role;
REVOKE ALL ON FUNCTION public.pms_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.pms_submit_report(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_submit_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_submit_report(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_submit_representation(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_submit_representation(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_submit_representation(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.pms_timeline_status(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_timeline_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_timeline_status(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pms_timeline_sweep() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_timeline_sweep() TO service_role;
REVOKE ALL ON FUNCTION public.post_create(text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_create(text,text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_create(text,text,text,text,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.post_fill(uuid,text,date,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_fill(uuid,text,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_fill(uuid,text,date,text) TO service_role;
REVOKE ALL ON FUNCTION public.post_set_state(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_set_state(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_set_state(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.post_vacate(uuid,date,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_vacate(uuid,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_vacate(uuid,date,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.profile_consistency_issues(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_consistency_issues(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_consistency_issues(text) TO service_role;
REVOKE ALL ON FUNCTION public.profile_consistency_sweep() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_consistency_sweep() TO service_role;
REVOKE ALL ON FUNCTION public.project_archive(text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_archive(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_archive(text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_assert_document(text,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_assert_document(text,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_call_review(text,date,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_call_review(text,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_call_review(text,date,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_caller_is_office(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_caller_is_office(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_caller_is_office(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_caller_is_office(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_caller_is_party(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_caller_is_party(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_caller_is_party(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_caller_is_pi(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_caller_is_pi(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_caller_is_pi(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_caller_may_file(text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_caller_may_file(text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_caller_may_file(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_caller_may_file(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_category(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_category(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_category(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_category_code(projects) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_category_code(projects) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_category_code(projects) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_category_code(projects) TO service_role;
REVOKE ALL ON FUNCTION public.project_change_apply(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_apply(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_change_caller_may_act(text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_caller_may_act(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_change_caller_may_act(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_change_deltas(text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_deltas(text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_change_deltas(text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.project_change_log() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_log() TO service_role;
REVOKE ALL ON FUNCTION public.project_change_record_step(uuid,text,text,uuid,uuid,text,date,text,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_record_step(uuid,text,text,uuid,uuid,text,date,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_change_record_step(uuid,text,text,uuid,uuid,text,date,text,date) TO service_role;
REVOKE ALL ON FUNCTION public.project_change_save(uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_save(uuid,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_change_save(uuid,text,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.project_change_step_kinds(text,text,numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_step_kinds(text,text,numeric) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_change_step_kinds(text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_change_step_kinds(text,text,numeric) TO service_role;
REVOKE ALL ON FUNCTION public.project_change_submit(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_submit(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_change_submit(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_change_withdraw(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_withdraw(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_change_withdraw(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_checklist_b(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_checklist_b(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_checklist_b(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_completion_annexures(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_completion_annexures(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_completion_annexures(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_completion_log() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_completion_log() TO service_role;
REVOKE ALL ON FUNCTION public.project_completion_missing(project_completion_reports) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_completion_missing(project_completion_reports) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_completion_missing(project_completion_reports) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_completion_missing(project_completion_reports) TO service_role;
REVOKE ALL ON FUNCTION public.project_completion_record_step(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_completion_record_step(uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_completion_record_step(uuid,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_completion_save(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_completion_save(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_completion_save(text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.project_completion_step_kinds(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_completion_step_kinds(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_completion_step_kinds(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_completion_step_kinds(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_completion_submit(text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_completion_submit(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_completion_submit(text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_cpd_halfyearly(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_cpd_halfyearly(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_cpd_halfyearly(date) TO service_role;
REVOKE ALL ON FUNCTION public.project_engage(uuid,uuid,date,date,numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_engage(uuid,uuid,date,date,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_engage(uuid,uuid,date,date,numeric) TO service_role;
REVOKE ALL ON FUNCTION public.project_engagement_check(uuid,text,text,date,date,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_engagement_check(uuid,text,text,date,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_engagement_check(uuid,text,text,date,date,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_entry_set_lab(text,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_entry_set_lab(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_entry_set_lab(text,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_expenditure_sync_utilized() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_expenditure_sync_utilized() TO service_role;
REVOKE ALL ON FUNCTION public.project_financial_statement(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_financial_statement(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_financial_statement(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_generate_slots(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_generate_slots(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_head_position(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_head_position(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_head_position(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_infer_track(text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_infer_track(text,text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_infer_track(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_infer_track(text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_ip_agreement_add(text,uuid,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_ip_agreement_add(text,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_ip_agreement_add(text,uuid,date) TO service_role;
REVOKE ALL ON FUNCTION public.project_ip_agreement_missing(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_ip_agreement_missing(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_ip_agreement_missing(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_lab_money(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_lab_money(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_lab_money(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_lab_set(text,text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_lab_set(text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_lab_set(text,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_legacy_complete(text,text,text,date,date,text,date,uuid,jsonb,jsonb,jsonb,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_legacy_complete(text,text,text,date,date,text,date,uuid,jsonb,jsonb,jsonb,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_legacy_complete(text,text,text,date,date,text,date,uuid,jsonb,jsonb,jsonb,date) TO service_role;
REVOKE ALL ON FUNCTION public.project_legacy_lessons(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_legacy_lessons(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_legacy_lessons(text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.project_legacy_pending() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_legacy_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_legacy_pending() TO service_role;
REVOKE ALL ON FUNCTION public.project_link_output(text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_link_output(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_link_output(text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_log_event() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_log_event() TO service_role;
REVOKE ALL ON FUNCTION public.project_milestone_add(text,text,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_milestone_add(text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_milestone_add(text,text,date) TO service_role;
REVOKE ALL ON FUNCTION public.project_milestone_decide(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_milestone_decide(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_milestone_decide(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_milestone_report(uuid,date,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_milestone_report(uuid,date,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_milestone_report(uuid,date,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_money_reversal_lab() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_money_reversal_lab() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_money_reversal_lab() TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_money_reversal_lab() TO service_role;
REVOKE ALL ON FUNCTION public.project_no_key(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_no_key(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_no_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_no_key(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_pack(text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_pack(text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_pack(text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_parse_amount(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_parse_amount(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_parse_amount(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_parse_amount(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_record_expenditure(text,text,text,text,numeric,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_record_expenditure(text,text,text,text,numeric,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_record_expenditure(text,text,text,text,numeric,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_record_receipt(text,date,numeric,text,text,text,date,text,date,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_record_receipt(text,date,numeric,text,text,text,date,text,date,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_record_receipt(text,date,numeric,text,text,text,date,text,date,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_report_review(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_report_review(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_report_review(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_report_submit(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_report_submit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_report_submit(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_reports_answer_slot() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_reports_answer_slot() TO service_role;
REVOKE ALL ON FUNCTION public.project_reports_can_read(project_reports) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_reports_can_read(project_reports) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_reports_can_read(project_reports) TO service_role;
REVOKE ALL ON FUNCTION public.project_reports_can_review(project_reports) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_reports_can_review(project_reports) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_reports_can_review(project_reports) TO service_role;
REVOKE ALL ON FUNCTION public.project_reports_take_slot() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_reports_take_slot() TO service_role;
REVOKE ALL ON FUNCTION public.project_reverse_entry(text,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_reverse_entry(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_reverse_entry(text,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_selection_create(text,text,text,text,date,jsonb,text,date,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_selection_create(text,text,text,text,date,jsonb,text,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_selection_create(text,text,text,text,date,jsonb,text,date,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_set_lens(text,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_set_lens(text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_set_lens(text,text,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.project_slot_add_minutes(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_slot_add_minutes(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_slot_add_minutes(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_slot_plan(text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_slot_plan(text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_slot_plan(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_slot_plan(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.project_slot_record(uuid,date,text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_slot_record(uuid,date,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_slot_record(uuid,date,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_slot_schedule(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_slot_schedule(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_slot_schedule(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_staff_backfill() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_backfill() TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_staff_backfill() TO service_role;
REVOKE ALL ON FUNCTION public.project_staff_caller_keeps() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_caller_keeps() TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_staff_caller_keeps() TO service_role;
REVOKE ALL ON FUNCTION public.project_staff_leave_add(uuid,text,date,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_leave_add(uuid,text,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_staff_leave_add(uuid,text,date,date) TO service_role;
REVOKE ALL ON FUNCTION public.project_staff_legacy_pending() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_legacy_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_staff_legacy_pending() TO service_role;
REVOKE ALL ON FUNCTION public.project_staff_link_legacy(text[],uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_link_legacy(text[],uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_staff_link_legacy(text[],uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_staff_link_rows(text[],uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_link_rows(text[],uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_staff_person_save(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_person_save(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_staff_person_save(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.project_staff_tenure_days(uuid,date,date,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_tenure_days(uuid,date,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_staff_tenure_days(uuid,date,date,date) TO service_role;
REVOKE ALL ON FUNCTION public.project_stage_deliverable_record(text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_stage_deliverable_record(text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_stage_deliverable_record(text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.project_stage_label(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_stage_label(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_stage_label(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_stage_label(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_stage_of_status(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_stage_of_status(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_stage_of_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_stage_of_status(text) TO service_role;
REVOKE ALL ON FUNCTION public.project_transfer_gaps() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_transfer_gaps() TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_transfer_gaps() TO service_role;
REVOKE ALL ON FUNCTION public.projects_archived_readonly() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.projects_archived_readonly() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.projects_archived_readonly() TO authenticated;
GRANT EXECUTE ON FUNCTION public.projects_archived_readonly() TO service_role;
REVOKE ALL ON FUNCTION public.projects_default_authority() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.projects_default_authority() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.projects_default_authority() TO authenticated;
GRANT EXECUTE ON FUNCTION public.projects_default_authority() TO service_role;
REVOKE ALL ON FUNCTION public.projects_derive_columns() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.projects_derive_columns() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.projects_derive_columns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.projects_derive_columns() TO service_role;
REVOKE ALL ON FUNCTION public.projects_regenerate_slots() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.projects_regenerate_slots() TO service_role;
REVOKE ALL ON FUNCTION public.projects_resync_child_keys() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.projects_resync_child_keys() TO service_role;
REVOKE ALL ON FUNCTION public.proposal_approve(uuid,numeric,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_approve(uuid,numeric,date) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_archive(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_archive(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_archive(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_budget_lines_sync_total() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_budget_lines_sync_total() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.proposal_budget_lines_sync_total() TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_budget_lines_sync_total() TO service_role;
REVOKE ALL ON FUNCTION public.proposal_caller_is_copi(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_caller_is_copi(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_caller_is_copi(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_caller_is_party(proposals) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_caller_is_party(proposals) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.proposal_caller_is_party(proposals) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_caller_is_party(proposals) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_caller_may_act(proposals,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_caller_may_act(proposals,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.proposal_caller_may_act(proposals,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_caller_may_act(proposals,text) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_caller_may_review(proposals) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_caller_may_review(proposals) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.proposal_caller_may_review(proposals) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_caller_may_review(proposals) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_issue_om(uuid,text,date,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_issue_om(uuid,text,date,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_link_project(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_link_project(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_link_project(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_missing_fields(proposals) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_missing_fields(proposals) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.proposal_missing_fields(proposals) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_missing_fields(proposals) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_open_round(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_open_round(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_readiness(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_readiness(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.proposal_readiness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_readiness(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_recommend(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_recommend(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_record_step(uuid,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_record_step(uuid,text,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_record_step(uuid,text,text,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_reject(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_reject(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_request_revision(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_request_revision(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_restore_version(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_restore_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_restore_version(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_sanction(uuid,text,text,date,numeric,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_sanction(uuid,text,text,date,numeric,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_sanction(uuid,text,text,date,numeric,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_save_copis(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_save_copis(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_save_copis(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_save_version(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_save_version(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_save_version(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_set_track(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_set_track(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_set_track(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_set_under_review(uuid,text,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_set_under_review(uuid,text,date) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_snapshot_version(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_snapshot_version(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_status_after(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_status_after(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.proposal_status_after(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_status_after(text) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_step_kinds(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_step_kinds(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.proposal_step_kinds(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_step_kinds(text) TO service_role;
REVOKE ALL ON FUNCTION public.proposal_submit(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_submit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_submit(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.proposals_caller_division() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposals_caller_division() TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposals_caller_division() TO service_role;
REVOKE ALL ON FUNCTION public.proposals_caller_has_role(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposals_caller_has_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposals_caller_has_role(text) TO service_role;
REVOKE ALL ON FUNCTION public.proposals_caller_is_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposals_caller_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposals_caller_is_admin() TO service_role;
REVOKE ALL ON FUNCTION public.proposals_can_read(proposals) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposals_can_read(proposals) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposals_can_read(proposals) TO service_role;
REVOKE ALL ON FUNCTION public.proposals_set_code() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposals_set_code() TO service_role;
REVOKE ALL ON FUNCTION public.publication_consent(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publication_consent(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publication_consent(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.publication_file_create(text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publication_file_create(text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publication_file_create(text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.publication_move(uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publication_move(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publication_move(uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.rag_monitor_summary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rag_monitor_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rag_monitor_summary() TO service_role;
REVOKE ALL ON FUNCTION public.rag_replace_doc_pages(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rag_replace_doc_pages(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.rag_requeue_all() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rag_requeue_all() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rag_requeue_all() TO service_role;
REVOKE ALL ON FUNCTION public.rag_requeue_document(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rag_requeue_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rag_requeue_document(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.recruitment_advance(text,text,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recruitment_advance(text,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_advance(text,text,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.reject_access_request(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_access_request(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_access_request(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.route_ticket(text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.route_ticket(text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.staff_profile_facts(text,date,date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_profile_facts(text,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_profile_facts(text,date,date) TO service_role;
REVOKE ALL ON FUNCTION public.staff_workload(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_workload(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_workload(text) TO service_role;
REVOKE ALL ON FUNCTION public.sync_project_key() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_project_key() TO service_role;
REVOKE ALL ON FUNCTION public.sync_staff_key() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_staff_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_staff_key() TO service_role;
REVOKE ALL ON FUNCTION public.try_parse_date(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.try_parse_date(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_parse_date(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.try_parse_date(text) TO service_role;
REVOKE ALL ON FUNCTION public.unlock_meeting_minutes(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unlock_meeting_minutes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_meeting_minutes(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.update_own_profile(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_own_profile(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_profile(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.user_directory() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_directory() TO service_role;
REVOKE ALL ON FUNCTION public.user_has_role(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role(text) TO service_role;
REVOKE ALL ON FUNCTION public.user_profiles_validate_active_role() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_profiles_validate_active_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_profiles_validate_active_role() TO service_role;
REVOKE ALL ON FUNCTION public.vacancy_advertisements_guard_stage() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vacancy_advertisements_guard_stage() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.vacancy_advertisements_guard_stage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vacancy_advertisements_guard_stage() TO service_role;
REVOKE ALL ON FUNCTION public.workforce_outlook(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workforce_outlook(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workforce_outlook(integer) TO service_role;

-- ── Scheduled Jobs (pg_cron) ────────────────────────────────────────────────
SELECT cron.schedule('notifications-sweep', '30 1 * * *', 'select public.notifications_sweep()');
SELECT cron.schedule('contribution-requests-sweep', '45 1 * * *',
                     'select public.contribution_requests_sweep()');
SELECT cron.schedule('profile-consistency-sweep', '0 2 * * 1', 'select public.profile_consistency_sweep()');
SELECT cron.schedule('pms-timeline-sweep', '15 1 * * *', 'select public.pms_timeline_sweep()');
SELECT cron.schedule('metric-snapshot', '30 0 1 * *', 'select public.metric_snapshot_run()');
SELECT cron.schedule('metric-digest', '0 2 * * 1', 'select public.metric_digest_run()');
SELECT cron.schedule('ai-suggest-sweep', '30 1 * * *', 'select public.ai_suggest_sweep()');

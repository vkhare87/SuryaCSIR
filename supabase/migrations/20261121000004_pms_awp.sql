-- ============================================================
-- Stage 04 / 08 — PMS (2026 Guidelines, Senior Tracks) & Annual Work Plan (Part V)
-- Depends    : Stage 01–03
-- Rerun      : NOT idempotent — fresh installs only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."appraisal_cycles" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "start_date" date NOT NULL,
    "end_date" date NOT NULL,
    "status" text DEFAULT 'OPEN'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "appraisal_cycles_dates" CHECK (end_date > start_date),
    CONSTRAINT "appraisal_cycles_march_end" CHECK (EXTRACT(month FROM end_date) = 3::numeric),
    CONSTRAINT "appraisal_cycles_status_check" CHECK (status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text, 'ARCHIVED'::text])),
    CONSTRAINT "appraisal_cycles_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX appraisal_cycles_one_open ON public.appraisal_cycles USING btree (status) WHERE (status = 'OPEN'::text);

CREATE TABLE IF NOT EXISTS public."pms_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "cycle_id" uuid NOT NULL,
    "scientist_id" uuid NOT NULL,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "period_from" date,
    "period_to" date,
    "self_score" integer,
    "submitted_at" timestamp with time zone,
    "signature_url" text,
    "previous_pms_submitted_on_time" boolean,
    "previous_pms_submission_date" date,
    "duty_days" integer,
    "system_remark" text,
    "score_communicated_at" timestamp with time zone,
    "non_submission_certificate_path" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "track" text DEFAULT 'STANDARD'::text NOT NULL,
    "proforma_version" text DEFAULT 'LEGACY'::text NOT NULL,
    "committee_id" uuid,
    "deemed_accepted_at" timestamp with time zone,
    "questionnaire_b" boolean DEFAULT false NOT NULL,
    CONSTRAINT "pms_reports_duty_days_check" CHECK (duty_days >= 0),
    CONSTRAINT "pms_reports_proforma_version_check" CHECK (proforma_version = ANY (ARRAY['LEGACY'::text, '2026'::text])),
    CONSTRAINT "pms_reports_self_score_check" CHECK (self_score >= 0 AND self_score <= 100),
    CONSTRAINT "pms_reports_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'UNDER_EVALUATION_COMMITTEE_REVIEW'::text, 'EMPOWERED_COMMITTEE_REVIEW'::text, 'FINALIZED'::text, 'NOT_ASSESSED'::text, 'UNDER_GRIEVANCE_REVIEW'::text])),
    CONSTRAINT "pms_reports_track_check" CHECK (track = ANY (ARRAY['STANDARD'::text, 'ANNEXURE_I'::text, 'ANNEXURE_II'::text])),
    CONSTRAINT "pms_reports_pkey" PRIMARY KEY (id),
    CONSTRAINT "pms_reports_cycle_id_scientist_id_key" UNIQUE (cycle_id, scientist_id)
);
CREATE INDEX pms_reports_committee_id_fk_idx ON public.pms_reports USING btree (committee_id);
CREATE INDEX pms_reports_created_at_idx ON public.pms_reports USING btree (created_at DESC);
CREATE INDEX pms_reports_scientist_id_idx ON public.pms_reports USING btree (scientist_id);
CREATE INDEX pms_reports_status_idx ON public.pms_reports USING btree (status);

CREATE TABLE IF NOT EXISTS public."pms_report_sections" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "section_key" text NOT NULL,
    "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pms_report_sections_pkey" PRIMARY KEY (id),
    CONSTRAINT "pms_report_sections_report_id_section_key_key" UNIQUE (report_id, section_key)
);

CREATE TABLE IF NOT EXISTS public."pms_report_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "section" text NOT NULL,
    "source_record_type" text,
    "source_record_id" text,
    "link" text,
    "text" text NOT NULL,
    "state" text DEFAULT 'PREFILLED'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pms_report_items_link_check" CHECK (link IS NULL OR link ~ '^(/|https://)'::text),
    CONSTRAINT "pms_report_items_section_check" CHECK (section = ANY (ARRAY['PROJECT'::text, 'OUTPUT'::text, 'IP'::text, 'TECH_TRANSFER'::text, 'STUDENT'::text, 'COMMITTEE'::text, 'OTHER'::text])),
    CONSTRAINT "pms_report_items_state_check" CHECK (state = ANY (ARRAY['PREFILLED'::text, 'CONFIRMED'::text, 'EDITED'::text, 'ADDED'::text, 'REMOVED'::text])),
    CONSTRAINT "pms_report_items_text_check" CHECK (btrim(text) <> ''::text),
    CONSTRAINT "pms_report_items_pkey" PRIMARY KEY (id),
    CONSTRAINT "pms_report_items_report_id_section_source_record_type_sourc_key" UNIQUE (report_id, section, source_record_type, source_record_id)
);
CREATE INDEX pms_report_items_report_idx ON public.pms_report_items USING btree (report_id, section);

CREATE TABLE IF NOT EXISTS public."pms_part1" (
    "report_id" uuid NOT NULL,
    "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "prefilled_by" uuid,
    "prefilled_at" timestamp with time zone,
    "discrepancy" text,
    "discrepancy_at" timestamp with time zone,
    "verified_by" uuid,
    "verified_at" timestamp with time zone,
    CONSTRAINT "pms_part1_pkey" PRIMARY KEY (report_id)
);
CREATE INDEX pms_part1_prefilled_by_fk_idx ON public.pms_part1 USING btree (prefilled_by);
CREATE INDEX pms_part1_verified_by_fk_idx ON public.pms_part1 USING btree (verified_by);

CREATE TABLE IF NOT EXISTS public."pms_annexures" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "file_name" text NOT NULL,
    "file_path" text NOT NULL,
    "file_size" bigint NOT NULL,
    "mime_type" text NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pms_annexures_pkey" PRIMARY KEY (id)
);
CREATE INDEX pms_annexures_report_id_fk_idx ON public.pms_annexures USING btree (report_id);
CREATE INDEX pms_annexures_report_uploaded_idx ON public.pms_annexures USING btree (report_id, uploaded_at);

CREATE TABLE IF NOT EXISTS public."pms_evaluations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "evaluator_id" uuid NOT NULL,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "comments" text,
    "total_score" integer,
    "reasons_for_outstanding" text,
    "reasons_below_threshold" text,
    "suggestions_for_improvement" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "pen_picture" jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT "pms_evaluations_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text])),
    CONSTRAINT "pms_evaluations_total_score_check" CHECK (total_score >= 0 AND total_score <= 100),
    CONSTRAINT "pms_evaluations_pkey" PRIMARY KEY (id),
    CONSTRAINT "pms_evaluations_report_id_evaluator_id_key" UNIQUE (report_id, evaluator_id)
);
CREATE INDEX pms_evaluations_created_id_idx ON public.pms_evaluations USING btree (created_at DESC, id);
CREATE INDEX pms_evaluations_evaluator_idx ON public.pms_evaluations USING btree (evaluator_id);
CREATE INDEX pms_evaluations_evaluator_status_idx ON public.pms_evaluations USING btree (evaluator_id, status);

CREATE TABLE IF NOT EXISTS public."pms_evaluation_committees" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "cycle_id" uuid NOT NULL,
    "tier" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pms_evaluation_committees_tier_check" CHECK (tier = ANY (ARRAY['I'::text, 'II'::text, 'III'::text, 'IV'::text])),
    CONSTRAINT "pms_evaluation_committees_pkey" PRIMARY KEY (id),
    CONSTRAINT "pms_evaluation_committees_name_cycle_id_key" UNIQUE (name, cycle_id)
);
CREATE INDEX pms_evaluation_committees_cycle_id_fk_idx ON public.pms_evaluation_committees USING btree (cycle_id);

CREATE TABLE IF NOT EXISTS public."pms_evaluation_committee_members" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "committee_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "role" text NOT NULL,
    CONSTRAINT "pms_evaluation_committee_members_role_check" CHECK (role = ANY (ARRAY['REPORTING_OFFICER'::text, 'REVIEWING_OFFICER'::text, 'EC_MEMBER'::text])),
    CONSTRAINT "pms_evaluation_committee_members_pkey" PRIMARY KEY (id),
    CONSTRAINT "pms_evaluation_committee_members_committee_id_user_id_key" UNIQUE (committee_id, user_id)
);
CREATE INDEX pms_evaluation_committee_members_user_id_fk_idx ON public.pms_evaluation_committee_members USING btree (user_id);

CREATE TABLE IF NOT EXISTS public."pms_empowered_committee_members" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "cycle_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "is_chairman" boolean DEFAULT false NOT NULL,
    CONSTRAINT "pms_empowered_committee_members_pkey" PRIMARY KEY (id),
    CONSTRAINT "pms_empowered_committee_members_cycle_id_user_id_key" UNIQUE (cycle_id, user_id)
);
CREATE INDEX pms_empowered_committee_members_user_id_fk_idx ON public.pms_empowered_committee_members USING btree (user_id);

CREATE TABLE IF NOT EXISTS public."pms_panel_scores" (
    "report_id" uuid NOT NULL,
    "committee_id" uuid NOT NULL,
    "score" integer NOT NULL,
    "reasons_for_outstanding" text,
    "reasons_below_threshold" text,
    "suggestions_for_improvement" text,
    "pen_picture" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "integrity" text NOT NULL,
    "adverse_remarks" text,
    "critical_assessment" text,
    "quorum_present" integer NOT NULL,
    "members_total" integer NOT NULL,
    "signed_scan_path" text,
    "recorded_by" uuid NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
    "remarks" text,
    CONSTRAINT "pms_panel_scores_integrity_check" CHECK (btrim(integrity) <> ''::text),
    CONSTRAINT "pms_panel_scores_score_check" CHECK (score >= 0 AND score <= 100),
    CONSTRAINT "pms_panel_scores_pkey" PRIMARY KEY (report_id)
);
CREATE INDEX pms_panel_scores_committee_id_fk_idx ON public.pms_panel_scores USING btree (committee_id);
CREATE INDEX pms_panel_scores_recorded_by_fk_idx ON public.pms_panel_scores USING btree (recorded_by);

CREATE TABLE IF NOT EXISTS public."pms_pen_picture_items" (
    "item_key" text NOT NULL,
    "group_code" text NOT NULL,
    "group_name" text NOT NULL,
    "label" text NOT NULL,
    "sort" smallint NOT NULL,
    CONSTRAINT "pms_pen_picture_items_group_code_check" CHECK (group_code = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])),
    CONSTRAINT "pms_pen_picture_items_pkey" PRIMARY KEY (item_key)
);

CREATE TABLE IF NOT EXISTS public."pms_committee_decisions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "decided_by" uuid NOT NULL,
    "final_score" integer,
    "justification" text NOT NULL,
    "reasons_for_outstanding" text,
    "reasons_below_threshold" text,
    "suggestions_for_improvement" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "ec_action" text,
    "panel_score" integer,
    "general_comments" text,
    "critical_assessment" text,
    "quorum_present" integer,
    "members_total" integer,
    CONSTRAINT "pms_committee_decisions_ec_action_check" CHECK (ec_action = ANY (ARRAY['CONCUR'::text, 'UPGRADE'::text, 'DOWNGRADE'::text])),
    CONSTRAINT "pms_committee_decisions_final_score_check" CHECK (final_score >= 0 AND final_score <= 100),
    CONSTRAINT "pms_committee_decisions_justification_check" CHECK (length(TRIM(BOTH FROM justification)) >= 50),
    CONSTRAINT "pms_committee_decisions_pkey" PRIMARY KEY (id),
    CONSTRAINT "pms_committee_decisions_report_id_key" UNIQUE (report_id)
);
CREATE INDEX pms_committee_decisions_decided_by_fk_idx ON public.pms_committee_decisions USING btree (decided_by);

CREATE TABLE IF NOT EXISTS public."pms_representations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "scientist_id" uuid NOT NULL,
    "grounds" text NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "resolution" text,
    "resolved_by" uuid,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "pms_representations_grounds_check" CHECK (length(TRIM(BOTH FROM grounds)) >= 20),
    CONSTRAINT "pms_representations_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'RESOLVED'::text])),
    CONSTRAINT "pms_representations_pkey" PRIMARY KEY (id),
    CONSTRAINT "pms_representations_report_id_key" UNIQUE (report_id)
);
CREATE INDEX pms_representations_resolved_by_fk_idx ON public.pms_representations USING btree (resolved_by);
CREATE INDEX pms_representations_scientist_id_fk_idx ON public.pms_representations USING btree (scientist_id);
CREATE INDEX pms_representations_submitted_id_idx ON public.pms_representations USING btree (submitted_at DESC, id);

CREATE TABLE IF NOT EXISTS public."pms_grievance_members" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "cycle_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    CONSTRAINT "pms_grievance_members_pkey" PRIMARY KEY (id),
    CONSTRAINT "pms_grievance_members_cycle_id_user_id_key" UNIQUE (cycle_id, user_id)
);
CREATE INDEX pms_grievance_members_user_id_fk_idx ON public.pms_grievance_members USING btree (user_id);

CREATE TABLE IF NOT EXISTS public."pms_condonations" (
    "report_id" uuid NOT NULL,
    "condoned_until" date NOT NULL,
    "reason" text NOT NULL,
    "condoned_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pms_condonations_reason_check" CHECK (length(TRIM(BOTH FROM reason)) >= 20),
    CONSTRAINT "pms_condonations_pkey" PRIMARY KEY (report_id)
);
CREATE INDEX pms_condonations_condoned_by_fk_idx ON public.pms_condonations USING btree (condoned_by);

CREATE TABLE IF NOT EXISTS public."pms_notifications" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "type" text NOT NULL,
    "title" text NOT NULL,
    "body" text NOT NULL,
    "report_id" uuid,
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pms_notifications_pkey" PRIMARY KEY (id)
);
CREATE INDEX pms_notifications_report_id_fk_idx ON public.pms_notifications USING btree (report_id);
CREATE INDEX pms_notifications_user_created_idx ON public.pms_notifications USING btree (user_id, created_at DESC);
CREATE INDEX pms_notifications_user_unread_idx ON public.pms_notifications USING btree (user_id, created_at DESC) WHERE (NOT read);

CREATE TABLE IF NOT EXISTS public."pms_audit_logs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "action" text NOT NULL,
    "entity_type" text NOT NULL,
    "entity_id" uuid NOT NULL,
    "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pms_audit_logs_pkey" PRIMARY KEY (id)
);
CREATE INDEX pms_audit_logs_created_at_idx ON public.pms_audit_logs USING btree (created_at DESC, id);
CREATE INDEX pms_audit_logs_entity_idx ON public.pms_audit_logs USING btree (entity_type, entity_id);
CREATE INDEX pms_audit_logs_user_created_idx ON public.pms_audit_logs USING btree (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public."pms_awps" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "staff_id" text NOT NULL,
    "scientist_user_id" uuid,
    "reporting_year" text NOT NULL,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "part_a" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "activity_split" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "projects" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "objectives" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "development" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "institutional_work" text DEFAULT ''::text NOT NULL,
    "other" text DEFAULT ''::text NOT NULL,
    "reporting_officer_id" text,
    "reviewing_officer_id" text,
    "ro_verdict" text,
    "ro_reasons" text,
    "ro_at" timestamp with time zone,
    "rvo_remarks" text,
    "rvo_at" timestamp with time zone,
    "director_decision" text,
    "director_remarks" text,
    "approved_at" timestamp with time zone,
    "approved_by" uuid,
    "communicated_at" timestamp with time zone,
    "return_reasons" text,
    "source" text DEFAULT 'ONLINE'::text NOT NULL,
    "source_pdf_path" text,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pms_awps_director_decision_check" CHECK (director_decision = ANY (ARRAY['ACCEPTED'::text, 'MODIFIED'::text])),
    CONSTRAINT "pms_awps_reporting_year_check" CHECK (reporting_year ~ '^\d{4}-\d{2}$'::text),
    CONSTRAINT "pms_awps_ro_verdict_check" CHECK (ro_verdict = ANY (ARRAY['REASONABLE'::text, 'NOT_REASONABLE'::text])),
    CONSTRAINT "pms_awps_source_check" CHECK (source = ANY (ARRAY['ONLINE'::text, 'IMPORTED'::text, 'BLANK_FORWARDED'::text])),
    CONSTRAINT "pms_awps_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'WITH_RO'::text, 'WITH_RVO'::text, 'WITH_DIRECTOR'::text, 'RETURNED'::text, 'APPROVED'::text])),
    CONSTRAINT "pms_awps_pkey" PRIMARY KEY (id),
    CONSTRAINT "pms_awps_staff_id_reporting_year_key" UNIQUE (staff_id, reporting_year)
);
CREATE INDEX pms_awps_approved_by_fk_idx ON public.pms_awps USING btree (approved_by);
CREATE INDEX pms_awps_reporting_year_status_idx ON public.pms_awps USING btree (reporting_year, status);
CREATE INDEX pms_awps_reviewing_officer_id_fk_idx ON public.pms_awps USING btree (reviewing_officer_id);
CREATE INDEX pms_awps_ro_idx ON public.pms_awps USING btree (reporting_officer_id);
CREATE INDEX pms_awps_scientist_user_id_fk_idx ON public.pms_awps USING btree (scientist_user_id);
CREATE INDEX pms_awps_status_idx ON public.pms_awps USING btree (status);
CREATE INDEX pms_awps_updated_id_idx ON public.pms_awps USING btree (updated_at DESC, id);

CREATE TABLE IF NOT EXISTS public."pms_awp_activities" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "nature_of_activity" text NOT NULL,
    "role" text NOT NULL,
    "time_committed_percentage" numeric(5,2) NOT NULL,
    "milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pms_awp_activities_time_committed_percentage_check" CHECK (time_committed_percentage >= 0::numeric AND time_committed_percentage <= 100::numeric),
    CONSTRAINT "pms_awp_activities_pkey" PRIMARY KEY (id)
);
CREATE INDEX pms_awp_activities_report_id_idx ON public.pms_awp_activities USING btree (report_id);

CREATE TABLE IF NOT EXISTS public."pms_awp_revisions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "awp_id" uuid NOT NULL,
    "initiated_by" uuid NOT NULL,
    "reasons" text NOT NULL,
    "before" jsonb NOT NULL,
    "after" jsonb NOT NULL,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "decided_by" uuid,
    "decided_at" timestamp with time zone,
    "decision_remarks" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pms_awp_revisions_reasons_check" CHECK (length(TRIM(BOTH FROM reasons)) >= 20),
    CONSTRAINT "pms_awp_revisions_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])),
    CONSTRAINT "pms_awp_revisions_pkey" PRIMARY KEY (id)
);
CREATE INDEX pms_awp_revisions_awp_idx ON public.pms_awp_revisions USING btree (awp_id);
CREATE INDEX pms_awp_revisions_created_id_idx ON public.pms_awp_revisions USING btree (created_at DESC, id);
CREATE INDEX pms_awp_revisions_decided_by_fk_idx ON public.pms_awp_revisions USING btree (decided_by);
CREATE INDEX pms_awp_revisions_initiated_by_fk_idx ON public.pms_awp_revisions USING btree (initiated_by);

INSERT INTO public.pms_pen_picture_items (item_key, group_code, group_name, label, sort)
VALUES
    ('collegiality', 'C', 'Managerial capabilities', 'Ability to get along with colleagues', 1),
    ('communication', 'B', 'Professional competence', 'Ability to communicate (both in speech and writing)', 3),
    ('comprehension', 'B', 'Professional competence', 'Comprehension and appreciation of new development related to the job', 5),
    ('crisisHandling', 'C', 'Managerial capabilities', 'Crisis handling', 4),
    ('decisionMaking', 'C', 'Managerial capabilities', 'Decision making ability', 3),
    ('dedication', 'B', 'Professional competence', 'Dedication and commitment to the job', 4),
    ('initiative', 'A', 'Personal attributes', 'Initiative and drive', 4),
    ('jobCompetence', 'B', 'Professional competence', 'Competence to handle the job', 2),
    ('leadership', 'C', 'Managerial capabilities', 'Qualities of leadership', 5),
    ('maturity', 'A', 'Personal attributes', 'Maturity and logical thinking', 2),
    ('mentalAlertness', 'A', 'Personal attributes', 'Mental alertness', 5),
    ('orgRolePerception', 'B', 'Professional competence', 'Perception of organizational role', 1),
    ('personality', 'A', 'Personal attributes', 'Personality', 1),
    ('responsibility', 'C', 'Managerial capabilities', 'Willingness to accept responsibility', 2),
    ('selfConfidence', 'A', 'Personal attributes', 'Level of self-confidence', 3)
ON CONFLICT (item_key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('annexures', 'annexures', false),
    ('awp-pdfs', 'awp-pdfs', false),
    ('signatures', 'signatures', false)
ON CONFLICT (id) DO NOTHING;


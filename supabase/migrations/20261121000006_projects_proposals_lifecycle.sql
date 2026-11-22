-- ============================================================
-- Stage 06 / 08 — R&D Project Lifecycle (PL0–PL7), Proposals & Progress Reports
-- Depends    : Stage 01–05
-- Rerun      : NOT idempotent — fresh installs only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."project_schemes" (
    "code" text NOT NULL,
    "name" text NOT NULL,
    "leader_user_id" uuid,
    "review_committee_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_schemes_pkey" PRIMARY KEY (code)
);
CREATE INDEX project_schemes_leader_user_id_fk_idx ON public.project_schemes USING btree (leader_user_id);
CREATE INDEX project_schemes_review_committee_id_fk_idx ON public.project_schemes USING btree (review_committee_id);

CREATE TABLE IF NOT EXISTS public."projects" (
    "ProjectID" text NOT NULL,
    "ProjectNo" text,
    "ProjectName" text,
    "FundType" text,
    "SponsorerType" text,
    "SponsorerName" text,
    "ProjectCategory" text,
    "ProjectStatus" text,
    "StartDate" text,
    "CompletioDate" text,
    "SanctionedCost" text,
    "UtilizedAmount" text,
    "PrincipalInvestigator" text,
    "DivisionCode" text,
    "Extension" text,
    "ApprovalAuthority" text,
    "pi_staff_id" text,
    "stage" text,
    "track" text,
    "sanctioned_cost" numeric,
    "start_date" date,
    "end_date" date,
    "proposal_id" uuid,
    "sanction_ref" text,
    "sanction_date" date,
    "legacy_completed_at" timestamp with time zone,
    "legacy_completed_by" uuid,
    "theme_code" text,
    "trl_target" smallint,
    "trl_reached" smallint,
    CONSTRAINT "projects_stage_check" CHECK (stage IS NULL OR (stage = ANY (ARRAY['SANCTIONED'::text, 'ACTIVE'::text, 'ON_HOLD'::text, 'CLOSING'::text, 'CLOSED'::text, 'ARCHIVED'::text, 'FORECLOSED'::text]))),
    CONSTRAINT "projects_theme_code_check" CHECK (theme_code ~ '^0[1-9]$'::text),
    CONSTRAINT "projects_trl_reached_check" CHECK (trl_reached >= 1 AND trl_reached <= 9),
    CONSTRAINT "projects_trl_target_check" CHECK (trl_target >= 1 AND trl_target <= 9),
    CONSTRAINT "projects_pkey" PRIMARY KEY ("ProjectID")
);
CREATE INDEX projects_division_code_idx ON public.projects USING btree ("DivisionCode");
CREATE INDEX projects_legacy_completed_by_fk_idx ON public.projects USING btree (legacy_completed_by);
CREATE INDEX projects_pi_staff_id_idx ON public.projects USING btree (pi_staff_id);
CREATE INDEX projects_project_no_idx ON public.projects USING btree ("ProjectNo");
CREATE UNIQUE INDEX projects_proposal_id_key ON public.projects USING btree (proposal_id) WHERE (proposal_id IS NOT NULL);
CREATE INDEX projects_stage_idx ON public.projects USING btree (stage);
CREATE INDEX projects_track_fk_idx ON public.projects USING btree (track);

CREATE TABLE IF NOT EXISTS public."project_budget_lines" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_id" text NOT NULL,
    "fiscal_year" text NOT NULL,
    "head" text NOT NULL,
    "item" text DEFAULT ''::text NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "source" text DEFAULT 'SANCTION'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "change_request_id" uuid,
    "lab_code" text DEFAULT 'AMPRI'::text NOT NULL,
    CONSTRAINT "project_budget_lines_amount_check" CHECK (amount >= 0::numeric OR change_request_id IS NOT NULL),
    CONSTRAINT "project_budget_lines_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_budget_lines_change_request_id_fk_idx ON public.project_budget_lines USING btree (change_request_id);
CREATE INDEX project_budget_lines_project_idx ON public.project_budget_lines USING btree (project_id);

CREATE TABLE IF NOT EXISTS public."project_fund_receipts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_id" text NOT NULL,
    "received_on" date NOT NULL,
    "fiscal_year" text NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "head" text,
    "source" text DEFAULT ''::text NOT NULL,
    "order_no" text DEFAULT ''::text NOT NULL,
    "order_date" date,
    "ifd_file_no" text,
    "ifd_date" date,
    "document_id" uuid,
    "notes" text,
    "reverses_id" uuid,
    "recorded_by" uuid NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
    "opening_balance" boolean DEFAULT false NOT NULL,
    "lab_code" text DEFAULT 'AMPRI'::text NOT NULL,
    CONSTRAINT "project_fund_receipts_amount_check" CHECK (amount <> 0::numeric),
    CONSTRAINT "project_fund_receipts_head_check" CHECK (head IS NULL OR (head = ANY (ARRAY['EQUIPMENT'::text, 'WORKS'::text, 'MANPOWER'::text, 'CONSUMABLES'::text, 'TA_INDIA'::text, 'TA_ABROAD'::text, 'CONTINGENCY'::text, 'OUTSOURCING'::text, 'OTHER'::text]))),
    CONSTRAINT "project_fund_receipts_pkey" PRIMARY KEY (id),
    CONSTRAINT "project_fund_receipts_reverses_id_key" UNIQUE (reverses_id)
);
CREATE INDEX project_fund_receipts_document_id_fk_idx ON public.project_fund_receipts USING btree (document_id);
CREATE INDEX project_fund_receipts_project_idx ON public.project_fund_receipts USING btree (project_id, received_on);
CREATE INDEX project_fund_receipts_recorded_by_fk_idx ON public.project_fund_receipts USING btree (recorded_by);

CREATE TABLE IF NOT EXISTS public."project_expenditure" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_id" text NOT NULL,
    "fiscal_year" text NOT NULL,
    "period" text NOT NULL,
    "head" text NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "document_id" uuid,
    "notes" text,
    "reverses_id" uuid,
    "recorded_by" uuid NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
    "opening_balance" boolean DEFAULT false NOT NULL,
    "lab_code" text DEFAULT 'AMPRI'::text NOT NULL,
    CONSTRAINT "project_expenditure_amount_check" CHECK (amount <> 0::numeric),
    CONSTRAINT "project_expenditure_fiscal_year_check" CHECK (fiscal_year ~ '^\d{4}-\d{2}$'::text),
    CONSTRAINT "project_expenditure_head_check" CHECK (head = ANY (ARRAY['EQUIPMENT'::text, 'WORKS'::text, 'MANPOWER'::text, 'CONSUMABLES'::text, 'TA_INDIA'::text, 'TA_ABROAD'::text, 'CONTINGENCY'::text, 'OUTSOURCING'::text, 'OTHER'::text])),
    CONSTRAINT "project_expenditure_period_check" CHECK (period = ANY (ARRAY['Q1'::text, 'Q2'::text, 'Q3'::text, 'Q4'::text, 'H1'::text, 'H2'::text, 'FY'::text])),
    CONSTRAINT "project_expenditure_pkey" PRIMARY KEY (id),
    CONSTRAINT "project_expenditure_reverses_id_key" UNIQUE (reverses_id)
);
CREATE INDEX project_expenditure_document_id_fk_idx ON public.project_expenditure USING btree (document_id);
CREATE INDEX project_expenditure_project_idx ON public.project_expenditure USING btree (project_id, fiscal_year);
CREATE INDEX project_expenditure_recorded_by_fk_idx ON public.project_expenditure USING btree (recorded_by);

CREATE TABLE IF NOT EXISTS public."project_labs" (
    "project_id" text NOT NULL,
    "lab_code" text NOT NULL,
    "role" text NOT NULL,
    "rc_approval_document_id" uuid,
    "added_by" uuid,
    "added_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_labs_lab_code_check" CHECK (lab_code ~ '^[A-Z][A-Z0-9-]{1,15}$'::text),
    CONSTRAINT "project_labs_role_check" CHECK (role = ANY (ARRAY['NODAL'::text, 'PARTICIPATING'::text])),
    CONSTRAINT "project_labs_pkey" PRIMARY KEY (project_id, lab_code)
);
CREATE INDEX project_labs_added_by_fk_idx ON public.project_labs USING btree (added_by);
CREATE UNIQUE INDEX project_labs_one_nodal ON public.project_labs USING btree (project_id) WHERE (role = 'NODAL'::text);
CREATE INDEX project_labs_rc_approval_document_id_fk_idx ON public.project_labs USING btree (rc_approval_document_id);

CREATE TABLE IF NOT EXISTS public."project_milestones" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_id" text NOT NULL,
    "title" text NOT NULL,
    "target_date" date NOT NULL,
    "status" text DEFAULT 'PROPOSED'::text NOT NULL,
    "achieved_on" date,
    "report_note" text,
    "document_id" uuid,
    "decision_note" text,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_milestones_status_check" CHECK (status = ANY (ARRAY['PROPOSED'::text, 'PLANNED'::text, 'REPORTED'::text, 'ACHIEVED'::text, 'DROPPED'::text])),
    CONSTRAINT "project_milestones_title_check" CHECK (length(btrim(title)) > 0),
    CONSTRAINT "project_milestones_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_milestones_created_by_fk_idx ON public.project_milestones USING btree (created_by);
CREATE INDEX project_milestones_document_id_fk_idx ON public.project_milestones USING btree (document_id);
CREATE INDEX project_milestones_project_idx ON public.project_milestones USING btree (project_id, target_date);
CREATE INDEX project_milestones_status_target_idx ON public.project_milestones USING btree (status, target_date);

CREATE TABLE IF NOT EXISTS public."project_review_slots" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_id" text NOT NULL,
    "kind" text NOT NULL,
    "body" text NOT NULL,
    "period_label" text NOT NULL,
    "period_end" date NOT NULL,
    "due_date" date NOT NULL,
    "generated" boolean DEFAULT true NOT NULL,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "meeting_id" uuid,
    "held_on" date,
    "decision" text,
    "outcome" text,
    "minutes_days" integer,
    "minutes_due" date,
    "minutes_document_id" uuid,
    "report_id" uuid,
    "notes" text,
    "recorded_by" uuid,
    "recorded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_review_slots_decision_check" CHECK (decision IS NULL OR (decision = ANY (ARRAY['CONTINUE'::text, 'CONTINUE_WITH_CHANGES'::text, 'HOLD'::text, 'FORECLOSURE_RECOMMENDED'::text, 'GO'::text, 'CONDITIONAL_GO'::text, 'KILL'::text, 'RECYCLE'::text]))),
    CONSTRAINT "project_review_slots_kind_check" CHECK (kind = ANY (ARRAY['PROGRESS_REPORT'::text, 'REVIEW_COMMITTEE'::text, 'RESEARCH_COUNCIL'::text, 'TASK_FORCE'::text, 'MONITORING_COMMITTEE'::text, 'STAGE_GATE'::text, 'CALLED_REVIEW'::text])),
    CONSTRAINT "project_review_slots_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'DONE'::text, 'CANCELLED'::text])),
    CONSTRAINT "project_review_slots_pkey" PRIMARY KEY (id),
    CONSTRAINT "project_review_slots_project_id_kind_period_end_key" UNIQUE (project_id, kind, period_end)
);
CREATE INDEX project_review_slots_due_idx ON public.project_review_slots USING btree (status, due_date);
CREATE INDEX project_review_slots_meeting_id_fk_idx ON public.project_review_slots USING btree (meeting_id);
CREATE INDEX project_review_slots_minutes_document_id_fk_idx ON public.project_review_slots USING btree (minutes_document_id);
CREATE INDEX project_review_slots_project_idx ON public.project_review_slots USING btree (project_id, due_date);
CREATE INDEX project_review_slots_recorded_by_fk_idx ON public.project_review_slots USING btree (recorded_by);
CREATE INDEX project_review_slots_report_id_fk_idx ON public.project_review_slots USING btree (report_id);

CREATE TABLE IF NOT EXISTS public."project_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_no" text NOT NULL,
    "project_name" text NOT NULL,
    "division_code" text,
    "period_type" text DEFAULT 'Q'::text NOT NULL,
    "period_label" text NOT NULL,
    "due_date" date,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "objectives_progress" text DEFAULT ''::text NOT NULL,
    "milestones" text DEFAULT ''::text NOT NULL,
    "expenditure_summary" text DEFAULT ''::text NOT NULL,
    "outcomes" text DEFAULT ''::text NOT NULL,
    "remarks" text DEFAULT ''::text NOT NULL,
    "review_notes" text,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone,
    "submitted_by" uuid NOT NULL,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "project_id" text,
    "slot_id" uuid,
    CONSTRAINT "project_reports_period_type_check" CHECK (period_type = ANY (ARRAY['Q'::text, 'H'::text, 'Y'::text])),
    CONSTRAINT "project_reports_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'UNDER_REVIEW'::text, 'REVISION_REQUESTED'::text, 'REVIEWED'::text])),
    CONSTRAINT "project_reports_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_reports_owner_idx ON public.project_reports USING btree (submitted_by);
CREATE INDEX project_reports_project_id_idx ON public.project_reports USING btree (project_id);
CREATE INDEX project_reports_project_idx ON public.project_reports USING btree (project_no);
CREATE INDEX project_reports_reviewed_by_fk_idx ON public.project_reports USING btree (reviewed_by);
CREATE INDEX project_reports_slot_id_fk_idx ON public.project_reports USING btree (slot_id);
CREATE INDEX project_reports_status_idx ON public.project_reports USING btree (status);

CREATE TABLE IF NOT EXISTS public."project_report_history" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "from_status" text,
    "to_status" text NOT NULL,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "changed_by" uuid NOT NULL,
    "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_report_history_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_report_history_changed_by_fk_idx ON public.project_report_history USING btree (changed_by);
CREATE INDEX project_report_history_report_id_fk_idx ON public.project_report_history USING btree (report_id);

CREATE TABLE IF NOT EXISTS public."project_change_requests" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_id" text NOT NULL,
    "kind" text NOT NULL,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "round" integer DEFAULT 0 NOT NULL,
    "justification" text DEFAULT ''::text NOT NULL,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "increase_pct" numeric(7,2),
    "request_document_id" uuid,
    "order_no" text,
    "order_date" date,
    "ifd_file_no" text,
    "ifd_date" date,
    "decision_note" text,
    "created_by" uuid DEFAULT auth.uid() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "submitted_at" timestamp with time zone,
    "decided_at" timestamp with time zone,
    CONSTRAINT "project_change_requests_kind_check" CHECK (kind = ANY (ARRAY['TIME_OVERRUN'::text, 'RCE'::text, 'REPHASING'::text, 'REAPPROPRIATION'::text, 'REALLOCATION'::text, 'FORECLOSURE'::text])),
    CONSTRAINT "project_change_requests_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'UNDER_REVIEW'::text, 'RETURNED'::text, 'APPROVED'::text, 'REJECTED'::text, 'WITHDRAWN'::text])),
    CONSTRAINT "project_change_requests_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_change_requests_created_by_fk_idx ON public.project_change_requests USING btree (created_by);
CREATE INDEX project_change_requests_project_idx ON public.project_change_requests USING btree (project_id, created_at);
CREATE INDEX project_change_requests_request_document_id_fk_idx ON public.project_change_requests USING btree (request_document_id);

CREATE TABLE IF NOT EXISTS public."project_change_steps" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "change_id" uuid NOT NULL,
    "round" integer NOT NULL,
    "seq" integer NOT NULL,
    "kind" text NOT NULL,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "decided_by" uuid,
    "decided_at" timestamp with time zone,
    "notes" text,
    "document_id" uuid,
    "meeting_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_change_steps_kind_check" CHECK (kind = ANY (ARRAY['PME_VETTING'::text, 'FINANCE'::text, 'REVIEW_COMMITTEE'::text, 'RESEARCH_COUNCIL'::text, 'DIRECTOR_APPROVAL'::text, 'DIRECTOR_FORWARD'::text, 'MONITORING_COMMITTEE'::text, 'REVISED_COST_COMMITTEE'::text, 'COMPETENT_AUTHORITY'::text])),
    CONSTRAINT "project_change_steps_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'DONE'::text, 'RETURNED'::text, 'REJECTED'::text, 'SKIPPED'::text])),
    CONSTRAINT "project_change_steps_pkey" PRIMARY KEY (id),
    CONSTRAINT "project_change_steps_change_id_round_seq_key" UNIQUE (change_id, round, seq)
);
CREATE INDEX project_change_steps_decided_by_fk_idx ON public.project_change_steps USING btree (decided_by);
CREATE INDEX project_change_steps_document_id_fk_idx ON public.project_change_steps USING btree (document_id);
CREATE INDEX project_change_steps_meeting_id_fk_idx ON public.project_change_steps USING btree (meeting_id);

CREATE TABLE IF NOT EXISTS public."project_completion_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_id" text NOT NULL,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "round" integer DEFAULT 0 NOT NULL,
    "summary" text DEFAULT ''::text NOT NULL,
    "objectives_status" text,
    "objectives_reason" text DEFAULT ''::text NOT NULL,
    "what_worked" text DEFAULT ''::text NOT NULL,
    "what_did_not" text DEFAULT ''::text NOT NULL,
    "reusable_assets" text DEFAULT ''::text NOT NULL,
    "trl_target" integer,
    "trl_reached" integer,
    "recommendations" text DEFAULT ''::text NOT NULL,
    "follow_on_ideas" text DEFAULT ''::text NOT NULL,
    "financial_statement" jsonb,
    "annexures" jsonb,
    "document_id" uuid,
    "decision_note" text,
    "published_document_id" uuid,
    "created_by" uuid DEFAULT auth.uid() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "submitted_at" timestamp with time zone,
    "decided_at" timestamp with time zone,
    CONSTRAINT "project_completion_reports_objectives_status_check" CHECK (objectives_status = ANY (ARRAY['MET'::text, 'PARTLY_MET'::text, 'NOT_MET'::text])),
    CONSTRAINT "project_completion_reports_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'UNDER_REVIEW'::text, 'RETURNED'::text, 'APPROVED'::text])),
    CONSTRAINT "project_completion_reports_trl_reached_check" CHECK (trl_reached >= 1 AND trl_reached <= 9),
    CONSTRAINT "project_completion_reports_trl_target_check" CHECK (trl_target >= 1 AND trl_target <= 9),
    CONSTRAINT "project_completion_reports_pkey" PRIMARY KEY (id),
    CONSTRAINT "project_completion_reports_project_id_key" UNIQUE (project_id)
);
CREATE INDEX project_completion_reports_created_by_fk_idx ON public.project_completion_reports USING btree (created_by);
CREATE INDEX project_completion_reports_document_id_fk_idx ON public.project_completion_reports USING btree (document_id);
CREATE INDEX project_completion_reports_published_document_id_fk_idx ON public.project_completion_reports USING btree (published_document_id);

CREATE TABLE IF NOT EXISTS public."project_completion_steps" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "round" integer NOT NULL,
    "seq" integer NOT NULL,
    "kind" text NOT NULL,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "decided_by" uuid,
    "decided_at" timestamp with time zone,
    "notes" text,
    "document_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_completion_steps_kind_check" CHECK (kind = ANY (ARRAY['PME_VETTING'::text, 'FINANCE'::text, 'REVIEW_COMMITTEE'::text, 'RESEARCH_COUNCIL'::text, 'DIRECTOR_APPROVAL'::text, 'MONITORING_COMMITTEE'::text, 'COMPETENT_AUTHORITY'::text])),
    CONSTRAINT "project_completion_steps_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'DONE'::text, 'RETURNED'::text, 'SKIPPED'::text])),
    CONSTRAINT "project_completion_steps_pkey" PRIMARY KEY (id),
    CONSTRAINT "project_completion_steps_report_id_round_seq_key" UNIQUE (report_id, round, seq)
);
CREATE INDEX project_completion_steps_decided_by_fk_idx ON public.project_completion_steps USING btree (decided_by);
CREATE INDEX project_completion_steps_document_id_fk_idx ON public.project_completion_steps USING btree (document_id);

CREATE TABLE IF NOT EXISTS public."project_documents" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_id" text NOT NULL,
    "doc_type" text NOT NULL,
    "storage_path" text NOT NULL,
    "file_name" text NOT NULL,
    "file_size" bigint,
    "uploaded_by" uuid DEFAULT auth.uid() NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_documents_doc_type_check" CHECK (doc_type = ANY (ARRAY['receipt_order'::text, 'expenditure_statement'::text, 'milestone_evidence'::text, 'minutes'::text, 'change_request'::text, 'change_order'::text, 'completion_report'::text, 'closure_order'::text, 'sanction_order'::text, 'stage_deliverable'::text, 'other'::text])),
    CONSTRAINT "project_documents_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_documents_project_idx ON public.project_documents USING btree (project_id);
CREATE INDEX project_documents_uploaded_by_fk_idx ON public.project_documents USING btree (uploaded_by);

CREATE TABLE IF NOT EXISTS public."project_events" (
    "id" bigserial NOT NULL,
    "project_id" text NOT NULL,
    "at" timestamp with time zone DEFAULT now() NOT NULL,
    "actor" uuid,
    "kind" text NOT NULL,
    "summary" text NOT NULL,
    "ref_id" text,
    CONSTRAINT "project_events_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_events_project_idx ON public.project_events USING btree (project_id, at DESC);

CREATE TABLE IF NOT EXISTS public."project_ip_agreements" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_id" text NOT NULL,
    "document_id" uuid NOT NULL,
    "signed_on" date NOT NULL,
    "recorded_by" uuid,
    "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_ip_agreements_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_ip_agreements_document_id_fk_idx ON public.project_ip_agreements USING btree (document_id);
CREATE INDEX project_ip_agreements_project_id_fk_idx ON public.project_ip_agreements USING btree (project_id);
CREATE INDEX project_ip_agreements_recorded_by_fk_idx ON public.project_ip_agreements USING btree (recorded_by);

CREATE TABLE IF NOT EXISTS public."project_selections" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "project_id" text NOT NULL,
    "position_code" text NOT NULL,
    "mode" text NOT NULL,
    "advert_ncs_ref" text,
    "advert_on" date,
    "committee" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "exigency_note" text,
    "waitlist_valid_until" date,
    "minutes_document_id" uuid,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_selections_mode_check" CHECK (mode = ANY (ARRAY['SELECTION'::text, 'WAITLIST'::text, 'DIRECT'::text])),
    CONSTRAINT "project_selections_pkey" PRIMARY KEY (id)
);
CREATE INDEX project_selections_created_by_fk_idx ON public.project_selections USING btree (created_by);
CREATE INDEX project_selections_minutes_document_id_fk_idx ON public.project_selections USING btree (minutes_document_id);
CREATE INDEX project_selections_project_id_fk_idx ON public.project_selections USING btree (project_id);

CREATE TABLE IF NOT EXISTS public."project_stage_deliverables" (
    "project_id" text NOT NULL,
    "item_key" text NOT NULL,
    "document_id" uuid NOT NULL,
    "done_by" uuid,
    "done_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "project_stage_deliverables_pkey" PRIMARY KEY (project_id, item_key)
);
CREATE INDEX project_stage_deliverables_document_id_fk_idx ON public.project_stage_deliverables USING btree (document_id);
CREATE INDEX project_stage_deliverables_done_by_fk_idx ON public.project_stage_deliverables USING btree (done_by);
CREATE INDEX project_stage_deliverables_item_key_fk_idx ON public.project_stage_deliverables USING btree (item_key);

CREATE TABLE IF NOT EXISTS public."project_stage_items" (
    "item_key" text NOT NULL,
    "stage" smallint NOT NULL,
    "label" text NOT NULL,
    "sort" smallint DEFAULT 0 NOT NULL,
    CONSTRAINT "project_stage_items_stage_check" CHECK (stage >= 1 AND stage <= 6),
    CONSTRAINT "project_stage_items_pkey" PRIMARY KEY (item_key)
);

CREATE TABLE IF NOT EXISTS public."proposals" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "proposal_code" text NOT NULL,
    "title" text NOT NULL,
    "acronym" text,
    "domain_theme" text,
    "fund_type" text,
    "sponsor_type" text,
    "sponsor_name" text,
    "project_category" text,
    "proposed_start_date" date,
    "proposed_duration_months" integer,
    "requested_budget" numeric(14,2),
    "pi_user_id" uuid NOT NULL,
    "pi_name" text NOT NULL,
    "division_code" text,
    "abstract" text,
    "problem_statement" text,
    "objectives" text,
    "expected_outcomes" text,
    "current_trl" smallint,
    "target_trl" smallint,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "review_body" text,
    "review_sent_date" date,
    "revision_notes" text,
    "rejection_reason" text,
    "sanctioned_amount" numeric(14,2),
    "sanction_date" date,
    "om_number" text,
    "om_date" date,
    "linked_project_no" text,
    "archived" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "submitted_at" timestamp with time zone,
    "created_by" uuid NOT NULL,
    "last_status_change_by" uuid,
    "last_status_change_at" timestamp with time zone,
    "track" text,
    "project_id" text,
    "submitted_version_id" uuid,
    "category_code" text,
    "parent_project_id" text,
    CONSTRAINT "proposals_category_code_check" CHECK (category_code IS NULL OR (category_code = ANY (ARRAY['FIR'::text, 'FBR'::text, 'NCP'::text, 'FTT'::text, 'FTC'::text, 'MMP'::text, 'FCP'::text, 'HCP'::text, 'IST'::text]))),
    CONSTRAINT "proposals_current_trl_check" CHECK (current_trl >= 1 AND current_trl <= 9),
    CONSTRAINT "proposals_proposed_duration_months_check" CHECK (proposed_duration_months > 0),
    CONSTRAINT "proposals_requested_budget_check" CHECK (requested_budget >= 0::numeric),
    CONSTRAINT "proposals_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'UNDER_REVIEW'::text, 'REVISION_REQUESTED'::text, 'REJECTED'::text, 'RECOMMENDED'::text, 'APPROVED'::text, 'OM_ISSUED'::text, 'ARCHIVED'::text, 'LINKED'::text])),
    CONSTRAINT "proposals_target_trl_check" CHECK (target_trl >= 1 AND target_trl <= 9),
    CONSTRAINT "proposals_pkey" PRIMARY KEY (id),
    CONSTRAINT "proposals_proposal_code_key" UNIQUE (proposal_code)
);
CREATE INDEX proposals_created_at_idx ON public.proposals USING btree (created_at DESC);
CREATE INDEX proposals_created_by_status_fk_idx ON public.proposals USING btree (created_by, status);
CREATE INDEX proposals_division_code_idx ON public.proposals USING btree (division_code);
CREATE INDEX proposals_last_status_change_by_fk_idx ON public.proposals USING btree (last_status_change_by);
CREATE INDEX proposals_parent_project_idx ON public.proposals USING btree (parent_project_id) WHERE (parent_project_id IS NOT NULL);
CREATE INDEX proposals_pi_user_id_idx ON public.proposals USING btree (pi_user_id);
CREATE INDEX proposals_project_id_idx ON public.proposals USING btree (project_id);
CREATE INDEX proposals_status_idx ON public.proposals USING btree (status);
CREATE INDEX proposals_submitted_version_id_fk_idx ON public.proposals USING btree (submitted_version_id);
CREATE INDEX proposals_track_fk_idx ON public.proposals USING btree (track);

CREATE TABLE IF NOT EXISTS public."proposal_budget_lines" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "proposal_id" uuid NOT NULL,
    "fiscal_year" text NOT NULL,
    "head" text NOT NULL,
    "item" text DEFAULT ''::text NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "proposal_budget_lines_amount_check" CHECK (amount >= 0::numeric),
    CONSTRAINT "proposal_budget_lines_fiscal_year_check" CHECK (fiscal_year ~ '^\d{4}-\d{2}$'::text),
    CONSTRAINT "proposal_budget_lines_head_check" CHECK (head = ANY (ARRAY['EQUIPMENT'::text, 'WORKS'::text, 'MANPOWER'::text, 'CONSUMABLES'::text, 'TA_INDIA'::text, 'TA_ABROAD'::text, 'CONTINGENCY'::text, 'OUTSOURCING'::text, 'OTHER'::text])),
    CONSTRAINT "proposal_budget_lines_pkey" PRIMARY KEY (id)
);
CREATE INDEX proposal_budget_lines_proposal_idx ON public.proposal_budget_lines USING btree (proposal_id);

CREATE TABLE IF NOT EXISTS public."proposal_copis" (
    "proposal_id" uuid NOT NULL,
    "staff_id" text NOT NULL,
    "staff_name" text NOT NULL,
    CONSTRAINT "proposal_copis_pkey" PRIMARY KEY (proposal_id, staff_id)
);
CREATE INDEX proposal_copis_staff_idx ON public.proposal_copis USING btree (staff_id);

CREATE TABLE IF NOT EXISTS public."proposal_documents" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "proposal_id" uuid NOT NULL,
    "doc_type" text NOT NULL,
    "storage_path" text NOT NULL,
    "file_name" text NOT NULL,
    "file_size" integer,
    "uploaded_at" timestamp with time zone DEFAULT now(),
    "uploaded_by" uuid NOT NULL,
    CONSTRAINT "proposal_documents_doc_type_check" CHECK (doc_type = ANY (ARRAY['signed_proposal'::text, 'om_document'::text, 'quotation'::text, 'step_scan'::text, 'sanction_order'::text])),
    CONSTRAINT "proposal_documents_pkey" PRIMARY KEY (id)
);
CREATE INDEX proposal_documents_proposal_id_idx ON public.proposal_documents USING btree (proposal_id);
CREATE INDEX proposal_documents_uploaded_by_fk_idx ON public.proposal_documents USING btree (uploaded_by);

CREATE TABLE IF NOT EXISTS public."proposal_notes" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "proposal_id" uuid NOT NULL,
    "author_id" uuid DEFAULT auth.uid() NOT NULL,
    "body" text NOT NULL,
    "used_in" text,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "proposal_notes_body_check" CHECK (length(btrim(body)) > 0),
    CONSTRAINT "proposal_notes_used_in_check" CHECK (used_in = ANY (ARRAY['abstract'::text, 'problem_statement'::text, 'objectives'::text, 'expected_outcomes'::text])),
    CONSTRAINT "proposal_notes_pkey" PRIMARY KEY (id)
);
CREATE INDEX proposal_notes_author_id_fk_idx ON public.proposal_notes USING btree (author_id);
CREATE INDEX proposal_notes_proposal_idx ON public.proposal_notes USING btree (proposal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public."proposal_review_comments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "proposal_id" uuid NOT NULL,
    "section" text NOT NULL,
    "body" text NOT NULL,
    "author_id" uuid DEFAULT auth.uid() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "proposal_review_comments_body_check" CHECK (length(btrim(body)) > 0),
    CONSTRAINT "proposal_review_comments_section_check" CHECK (section = ANY (ARRAY['idea'::text, 'plan'::text, 'team'::text, 'budget'::text, 'documents'::text])),
    CONSTRAINT "proposal_review_comments_pkey" PRIMARY KEY (id)
);
CREATE INDEX proposal_review_comments_author_id_fk_idx ON public.proposal_review_comments USING btree (author_id);
CREATE INDEX proposal_review_comments_proposal_idx ON public.proposal_review_comments USING btree (proposal_id, created_at);

CREATE TABLE IF NOT EXISTS public."proposal_review_steps" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "proposal_id" uuid NOT NULL,
    "round" integer NOT NULL,
    "seq" integer NOT NULL,
    "kind" text NOT NULL,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "decided_by" uuid,
    "decided_at" timestamp with time zone,
    "notes" text,
    "document_id" uuid,
    "meeting_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "proposal_review_steps_kind_check" CHECK (kind = ANY (ARRAY['PME_VETTING'::text, 'FINANCE'::text, 'REVIEW_COMMITTEE'::text, 'DIRECTOR_APPROVAL'::text, 'DIRECTOR_FORWARD'::text, 'HQ_SCREENING'::text, 'HQ_EXPERT'::text, 'COMPETENT_AUTHORITY'::text])),
    CONSTRAINT "proposal_review_steps_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'DONE'::text, 'RETURNED'::text, 'REJECTED'::text, 'SKIPPED'::text])),
    CONSTRAINT "proposal_review_steps_pkey" PRIMARY KEY (id),
    CONSTRAINT "proposal_review_steps_proposal_id_round_seq_key" UNIQUE (proposal_id, round, seq)
);
CREATE INDEX proposal_review_steps_decided_by_fk_idx ON public.proposal_review_steps USING btree (decided_by);
CREATE INDEX proposal_review_steps_document_id_fk_idx ON public.proposal_review_steps USING btree (document_id);
CREATE INDEX proposal_review_steps_meeting_id_fk_idx ON public.proposal_review_steps USING btree (meeting_id);

CREATE TABLE IF NOT EXISTS public."proposal_status_history" (
    "id" bigserial NOT NULL,
    "proposal_id" uuid NOT NULL,
    "from_status" text,
    "to_status" text NOT NULL,
    "payload" jsonb,
    "changed_by" uuid NOT NULL,
    "changed_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "proposal_status_history_pkey" PRIMARY KEY (id)
);
CREATE INDEX proposal_status_history_changed_by_fk_idx ON public.proposal_status_history USING btree (changed_by);
CREATE INDEX proposal_status_history_proposal_id_idx ON public.proposal_status_history USING btree (proposal_id);

CREATE TABLE IF NOT EXISTS public."proposal_versions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "proposal_id" uuid NOT NULL,
    "version_no" integer NOT NULL,
    "label" text NOT NULL,
    "kind" text DEFAULT 'manual'::text NOT NULL,
    "snapshot" jsonb NOT NULL,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "proposal_versions_kind_check" CHECK (kind = ANY (ARRAY['manual'::text, 'submitted'::text])),
    CONSTRAINT "proposal_versions_pkey" PRIMARY KEY (id),
    CONSTRAINT "proposal_versions_proposal_id_version_no_key" UNIQUE (proposal_id, version_no)
);
CREATE INDEX proposal_versions_created_by_fk_idx ON public.proposal_versions USING btree (created_by);

INSERT INTO public.project_schemes (code, name, leader_user_id, review_committee_id)
VALUES
    ('EFP', 'Externally funded project', NULL, NULL),
    ('HQ', 'CSIR HQ scheme', NULL, NULL),
    ('OLP', 'Lab seed / own project', NULL, NULL),
    ('ULIP', 'In-house (ULIP)', NULL, NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.project_stage_items (item_key, stage, label, sort)
VALUES
    ('bill_of_materials', 6, 'Bill of materials', 1),
    ('concept_note', 1, 'Concept note and technology gap', 1),
    ('feasibility_report', 2, 'Feasibility and design report', 1),
    ('field_validation_report', 5, 'Field trial or user validation report', 1),
    ('lab_validation_report', 3, 'Laboratory-scale validation report', 1),
    ('logistics_plan', 6, 'Logistics documents', 4),
    ('pilot_report', 4, 'Pilot / scale-up report', 1),
    ('standard_of_preparation', 6, 'Standard of preparation', 2),
    ('supply_chain_plan', 6, 'Supply-chain documents', 3)
ON CONFLICT (item_key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('project-documents', 'project-documents', false),
    ('proposal-documents', 'proposal-documents', false)
ON CONFLICT (id) DO NOTHING;


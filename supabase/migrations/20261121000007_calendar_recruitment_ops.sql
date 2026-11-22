-- ============================================================
-- Stage 07 / 08 — Calendar, Recruitment, Contribution Requests, Data Ops & Metrics
-- Depends    : Stage 01–06
-- Rerun      : NOT idempotent — fresh installs only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."calendar_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "event_date" date NOT NULL,
    "event_kind" text NOT NULL,
    "location" text DEFAULT ''::text NOT NULL,
    "teams_url" text,
    "pamphlet_url" text,
    "description" text DEFAULT ''::text NOT NULL,
    "visibility" text DEFAULT 'OrgWide'::text NOT NULL,
    "division_code" text,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "calendar_events_division_required" CHECK (visibility <> 'Division'::text OR division_code IS NOT NULL),
    CONSTRAINT "calendar_events_event_kind_check" CHECK (event_kind = ANY (ARRAY['Custom'::text, 'Pamphlet'::text, 'Announcement'::text])),
    CONSTRAINT "calendar_events_visibility_check" CHECK (visibility = ANY (ARRAY['OrgWide'::text, 'Division'::text, 'Personal'::text])),
    CONSTRAINT "calendar_events_pkey" PRIMARY KEY (id)
);
CREATE INDEX calendar_events_created_by_idx ON public.calendar_events USING btree (created_by);
CREATE INDEX calendar_events_date_idx ON public.calendar_events USING btree (event_date);
CREATE INDEX calendar_events_visibility_idx ON public.calendar_events USING btree (visibility);

CREATE TABLE IF NOT EXISTS public."holidays" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "holiday_date" date NOT NULL,
    "name" text NOT NULL,
    "holiday_type" text DEFAULT 'Gazetted'::text NOT NULL,
    "year" integer NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "holidays_holiday_type_check" CHECK (holiday_type = ANY (ARRAY['Gazetted'::text, 'Restricted'::text, 'Institute'::text])),
    CONSTRAINT "holidays_pkey" PRIMARY KEY (id),
    CONSTRAINT "holidays_holiday_date_name_key" UNIQUE (holiday_date, name)
);
CREATE INDEX holidays_created_by_fk_idx ON public.holidays USING btree (created_by);
CREATE INDEX holidays_date_idx ON public.holidays USING btree (holiday_date);
CREATE INDEX holidays_year_idx ON public.holidays USING btree (year);

CREATE TABLE IF NOT EXISTS public."vacancy_advertisements" (
    "id" text NOT NULL,
    "title" text NOT NULL,
    "advt_no" text,
    "issue_date" date,
    "division_code" text,
    "status" text DEFAULT 'Draft'::text NOT NULL,
    "description" text,
    "closing_date" date,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "staff_category" text DEFAULT 'Permanent'::text NOT NULL,
    "drive_stage" text DEFAULT 'Advertised'::text NOT NULL,
    CONSTRAINT "vacancy_advertisements_drive_stage_check" CHECK (drive_stage = ANY (ARRAY['Advertised'::text, 'Applications Closed'::text, 'Screening'::text, 'Interviews'::text, 'Selection'::text, 'Offers Issued'::text, 'Joined'::text, 'Closed'::text])),
    CONSTRAINT "vacancy_advertisements_staff_category_check" CHECK (staff_category = ANY (ARRAY['Permanent'::text, 'Project'::text])),
    CONSTRAINT "vacancy_advertisements_status_check" CHECK (status = ANY (ARRAY['Draft'::text, 'Open'::text, 'Published'::text, 'Closed'::text, 'Cancelled'::text])),
    CONSTRAINT "vacancy_advertisements_pkey" PRIMARY KEY (id)
);
CREATE INDEX vacancy_advertisements_created_by_fk_idx ON public.vacancy_advertisements USING btree (created_by);
CREATE INDEX vacancy_advertisements_status_idx ON public.vacancy_advertisements USING btree (status);

CREATE TABLE IF NOT EXISTS public."vacancy_posts" (
    "id" text NOT NULL,
    "advertisement_id" text NOT NULL,
    "post_code" text,
    "designation" text,
    "discipline" text,
    "no_of_positions" integer,
    "pay_level" text,
    "age_limit" text,
    "qualifications" text,
    "status" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "sanctioned_post_id" uuid,
    CONSTRAINT "vacancy_posts_status_check" CHECK (status IS NULL OR (status = ANY (ARRAY['Open'::text, 'Filled'::text, 'Closed'::text, 'Cancelled'::text]))),
    CONSTRAINT "vacancy_posts_pkey" PRIMARY KEY (id)
);
CREATE INDEX vacancy_posts_advertisement_id_fk_idx ON public.vacancy_posts USING btree (advertisement_id);
CREATE INDEX vacancy_posts_advertisement_id_idx ON public.vacancy_posts USING btree (advertisement_id);
CREATE INDEX vacancy_posts_sanctioned_post_id_fk_idx ON public.vacancy_posts USING btree (sanctioned_post_id);

CREATE TABLE IF NOT EXISTS public."vacancy_applications" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "advertisement_id" text NOT NULL,
    "post_id" text,
    "candidate_name" text NOT NULL,
    "email" text,
    "phone" text,
    "qualifications" text,
    "experience" text,
    "applied_on" date DEFAULT CURRENT_DATE NOT NULL,
    "status" text DEFAULT 'Received'::text NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "vacancy_applications_status_check" CHECK (status = ANY (ARRAY['Received'::text, 'Shortlisted'::text, 'Interviewed'::text, 'Selected'::text, 'Rejected'::text])),
    CONSTRAINT "vacancy_applications_pkey" PRIMARY KEY (id)
);
CREATE INDEX vacancy_applications_advertisement_idx ON public.vacancy_applications USING btree (advertisement_id);
CREATE INDEX vacancy_applications_post_idx ON public.vacancy_applications USING btree (post_id);

CREATE TABLE IF NOT EXISTS public."recruitment_events" (
    "id" bigserial NOT NULL,
    "advt_id" text NOT NULL,
    "at" timestamp with time zone DEFAULT now() NOT NULL,
    "actor" uuid,
    "from_stage" text,
    "to_stage" text NOT NULL,
    "document_id" uuid,
    "note" text,
    CONSTRAINT "recruitment_events_pkey" PRIMARY KEY (id)
);
CREATE INDEX recruitment_events_actor_fk_idx ON public.recruitment_events USING btree (actor);
CREATE INDEX recruitment_events_advt_idx ON public.recruitment_events USING btree (advt_id, at);
CREATE INDEX recruitment_events_document_id_fk_idx ON public.recruitment_events USING btree (document_id);

CREATE TABLE IF NOT EXISTS public."contribution_requests" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "domain" text NOT NULL,
    "record_ref" text,
    "division_code" text,
    "title" text NOT NULL,
    "reason" text DEFAULT ''::text NOT NULL,
    "link" text,
    "requested_by" uuid,
    "assignee_id" uuid,
    "delegate_id" uuid,
    "status" text DEFAULT 'open'::text NOT NULL,
    "due_date" date,
    "prefill" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "response" jsonb,
    "dedupe_key" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "contribution_requests_domain_check" CHECK (domain = ANY (ARRAY['divisions'::text, 'staff'::text, 'projects'::text, 'projectStaff'::text, 'phd'::text, 'equipment'::text, 'contractStaff'::text])),
    CONSTRAINT "contribution_requests_link_check" CHECK (link IS NULL OR link ~ '^/([^/\\]|$)'::text AND link !~ '[[:cntrl:]]'::text),
    CONSTRAINT "contribution_requests_status_check" CHECK (status = ANY (ARRAY['open'::text, 'prepared'::text, 'submitted'::text, 'needs_clarification'::text, 'blocked'::text, 'done'::text, 'declined'::text])),
    CONSTRAINT "contribution_requests_title_check" CHECK (btrim(title) <> ''::text),
    CONSTRAINT "contribution_requests_pkey" PRIMARY KEY (id),
    CONSTRAINT "contribution_requests_dedupe_key_key" UNIQUE (dedupe_key)
);
CREATE INDEX contribution_requests_assignee_idx ON public.contribution_requests USING btree (assignee_id, status);
CREATE INDEX contribution_requests_delegate_idx ON public.contribution_requests USING btree (delegate_id, status);
CREATE INDEX contribution_requests_domain_idx ON public.contribution_requests USING btree (domain, division_code);
CREATE INDEX contribution_requests_requested_by_fk_idx ON public.contribution_requests USING btree (requested_by);

CREATE TABLE IF NOT EXISTS public."contribution_request_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "request_id" uuid NOT NULL,
    "actor_id" uuid,
    "action" text NOT NULL,
    "from_status" text,
    "to_status" text NOT NULL,
    "note" text,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "contribution_request_events_pkey" PRIMARY KEY (id)
);
CREATE INDEX contribution_request_events_actor_id_fk_idx ON public.contribution_request_events USING btree (actor_id);
CREATE INDEX contribution_request_events_request_idx ON public.contribution_request_events USING btree (request_id, created_at);

CREATE TABLE IF NOT EXISTS public."data_stewards" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "domain" text NOT NULL,
    "division_code" text,
    "user_id" uuid NOT NULL,
    "kind" text DEFAULT 'steward'::text NOT NULL,
    "cadence_days" integer DEFAULT 90 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "data_stewards_cadence_days_check" CHECK (cadence_days > 0),
    CONSTRAINT "data_stewards_domain_check" CHECK (domain = ANY (ARRAY['divisions'::text, 'staff'::text, 'projects'::text, 'projectStaff'::text, 'phd'::text, 'equipment'::text, 'contractStaff'::text])),
    CONSTRAINT "data_stewards_kind_check" CHECK (kind = ANY (ARRAY['accountable'::text, 'steward'::text])),
    CONSTRAINT "data_stewards_pkey" PRIMARY KEY (id),
    CONSTRAINT "data_stewards_domain_division_code_user_id_key" UNIQUE NULLS NOT DISTINCT (domain, division_code, user_id)
);
CREATE INDEX data_stewards_user_id_fk_idx ON public.data_stewards USING btree (user_id);

CREATE TABLE IF NOT EXISTS public."import_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "file_type" text NOT NULL,
    "row_count" integer NOT NULL,
    "uploaded_by" uuid NOT NULL,
    "uploaded_by_email" text NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "import_events_pkey" PRIMARY KEY (id)
);
CREATE INDEX import_events_file_type_idx ON public.import_events USING btree (file_type, uploaded_at DESC);
CREATE INDEX import_events_uploaded_by_fk_idx ON public.import_events USING btree (uploaded_by);

CREATE TABLE IF NOT EXISTS public."import_field_mappings" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "file_type" text NOT NULL,
    "header_fingerprint" text NOT NULL,
    "mapping" jsonb NOT NULL,
    "confirmed_by" uuid NOT NULL,
    "confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "use_count" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "import_field_mappings_pkey" PRIMARY KEY (id)
);
CREATE INDEX import_field_mappings_confirmed_by_fk_idx ON public.import_field_mappings USING btree (confirmed_by);
CREATE UNIQUE INDEX import_field_mappings_fingerprint_idx ON public.import_field_mappings USING btree (file_type, header_fingerprint);

CREATE TABLE IF NOT EXISTS public."harvested_imports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "file_name" text NOT NULL,
    "source" text NOT NULL,
    "source_identifier" text NOT NULL,
    "division_code" text,
    "storage_bucket" text DEFAULT 'documents'::text NOT NULL,
    "storage_path" text NOT NULL,
    "file_size" bigint DEFAULT 0 NOT NULL,
    "content_hash" text NOT NULL,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "landed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "harvested_imports_source_check" CHECK (source = ANY (ARRAY['folder'::text, 'mail'::text])),
    CONSTRAINT "harvested_imports_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'discarded'::text])),
    CONSTRAINT "harvested_imports_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX harvested_imports_hash_idx ON public.harvested_imports USING btree (content_hash);
CREATE INDEX harvested_imports_pending_idx ON public.harvested_imports USING btree (landed_at) WHERE (status = 'pending'::text);
CREATE INDEX harvested_imports_reviewed_by_fk_idx ON public.harvested_imports USING btree (reviewed_by);

CREATE TABLE IF NOT EXISTS public."ingest_sender_map" (
    "email" text NOT NULL,
    "division_code" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ingest_sender_map_pkey" PRIMARY KEY (email)
);

CREATE TABLE IF NOT EXISTS public."metrics" (
    "key" text NOT NULL,
    "label" text NOT NULL,
    "definition" text NOT NULL,
    "unit" text NOT NULL,
    "scope_kinds" text[] DEFAULT '{institute,division}'::text[] NOT NULL,
    "fn" regproc NOT NULL,
    "owner_role" text NOT NULL,
    "sort" smallint DEFAULT 0 NOT NULL,
    CONSTRAINT "metrics_key_check" CHECK (key ~ '^[a-z_]+$'::text),
    CONSTRAINT "metrics_unit_check" CHECK (unit = ANY (ARRAY['count'::text, 'inr'::text, 'pct'::text])),
    CONSTRAINT "metrics_pkey" PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS public."metric_snapshots" (
    "metric_key" text NOT NULL,
    "scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "as_on" date NOT NULL,
    "value" numeric,
    "taken_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY (metric_key, scope, as_on)
);

CREATE TABLE IF NOT EXISTS public."ai_action_log" (
    "id" bigserial NOT NULL,
    "notification_id" uuid,
    "user_id" uuid NOT NULL,
    "action_kind" text NOT NULL,
    "args" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "outcome" text NOT NULL,
    "at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ai_action_log_outcome_check" CHECK (outcome = ANY (ARRAY['DONE'::text, 'OPENED'::text])),
    CONSTRAINT "ai_action_log_pkey" PRIMARY KEY (id)
);
CREATE INDEX ai_action_log_notification_id_fk_idx ON public.ai_action_log USING btree (notification_id);
CREATE INDEX ai_action_log_user_idx ON public.ai_action_log USING btree (user_id, at DESC);

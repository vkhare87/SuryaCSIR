-- ============================================================
-- Stage 05 / 08 — Committees, COI Declarations & Helpdesk
-- Depends    : Stage 01–04
-- Rerun      : NOT idempotent — fresh installs only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."committees" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "committee_type" text NOT NULL,
    "mandate" text DEFAULT ''::text NOT NULL,
    "chairperson_id" text NOT NULL,
    "secretary_id" text NOT NULL,
    "status" text DEFAULT 'Active'::text NOT NULL,
    "formed_date" date DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "committees_committee_type_check" CHECK (committee_type = ANY (ARRAY['Standing'::text, 'AdHoc'::text, 'Review'::text, 'Advisory'::text])),
    CONSTRAINT "committees_status_check" CHECK (status = ANY (ARRAY['Active'::text, 'Inactive'::text])),
    CONSTRAINT "committees_pkey" PRIMARY KEY (id)
);
CREATE INDEX committees_status_idx ON public.committees USING btree (status);

CREATE TABLE IF NOT EXISTS public."committee_members" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "committee_id" uuid NOT NULL,
    "staff_id" text NOT NULL,
    "role" text DEFAULT 'Member'::text NOT NULL,
    CONSTRAINT "committee_members_role_check" CHECK (role = ANY (ARRAY['Member'::text, 'Invitee'::text, 'ExternalExpert'::text])),
    CONSTRAINT "committee_members_pkey" PRIMARY KEY (id)
);
CREATE INDEX committee_members_committee_idx ON public.committee_members USING btree (committee_id);
CREATE INDEX committee_members_staff_idx ON public.committee_members USING btree (staff_id);

CREATE TABLE IF NOT EXISTS public."meetings" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "committee_id" uuid NOT NULL,
    "meeting_date" date NOT NULL,
    "venue" text DEFAULT ''::text NOT NULL,
    "title" text NOT NULL,
    "summary" text DEFAULT ''::text NOT NULL,
    "status" text DEFAULT 'Scheduled'::text NOT NULL,
    "teams_url" text,
    "pamphlet_url" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "meetings_status_check" CHECK (status = ANY (ARRAY['Scheduled'::text, 'Completed'::text, 'Cancelled'::text])),
    CONSTRAINT "meetings_pkey" PRIMARY KEY (id)
);
CREATE INDEX meetings_committee_idx ON public.meetings USING btree (committee_id);
CREATE INDEX meetings_date_idx ON public.meetings USING btree (meeting_date);

CREATE TABLE IF NOT EXISTS public."agenda_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "meeting_id" uuid NOT NULL,
    "sequence" integer DEFAULT 0 NOT NULL,
    "description" text NOT NULL,
    "proposed_by" text NOT NULL,
    "status" text DEFAULT 'Pending'::text NOT NULL,
    "subject_type" text,
    "subject_id" text,
    CONSTRAINT "agenda_items_status_check" CHECK (status = ANY (ARRAY['Pending'::text, 'Discussed'::text, 'Deferred'::text])),
    CONSTRAINT "agenda_items_subject_type_check" CHECK (subject_type IS NULL OR (subject_type = ANY (ARRAY['project_review'::text, 'proposal'::text]))),
    CONSTRAINT "agenda_items_pkey" PRIMARY KEY (id)
);
CREATE INDEX agenda_items_meeting_idx ON public.agenda_items USING btree (meeting_id);
CREATE INDEX agenda_items_subject_idx ON public.agenda_items USING btree (subject_type, subject_id) WHERE (subject_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS public."action_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "meeting_id" uuid,
    "source" text DEFAULT 'meeting'::text NOT NULL,
    "task" text NOT NULL,
    "assigned_to" text NOT NULL,
    "deadline" date NOT NULL,
    "status" text DEFAULT 'Pending'::text NOT NULL,
    "completed_at" timestamp with time zone,
    "notes" text DEFAULT ''::text NOT NULL,
    CONSTRAINT "action_items_source_check" CHECK (source = ANY (ARRAY['meeting'::text, 'manual'::text])),
    CONSTRAINT "action_items_status_check" CHECK (status = ANY (ARRAY['Pending'::text, 'InProgress'::text, 'Completed'::text])),
    CONSTRAINT "action_items_pkey" PRIMARY KEY (id)
);
CREATE INDEX action_items_assigned_to_idx ON public.action_items USING btree (assigned_to);
CREATE INDEX action_items_meeting_idx ON public.action_items USING btree (meeting_id);
CREATE INDEX action_items_status_idx ON public.action_items USING btree (status);

CREATE TABLE IF NOT EXISTS public."meeting_documents" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "meeting_id" uuid NOT NULL,
    "file_name" text NOT NULL,
    "storage_path" text NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "meeting_documents_pkey" PRIMARY KEY (id)
);
CREATE INDEX meeting_documents_meeting_idx ON public.meeting_documents USING btree (meeting_id);

CREATE TABLE IF NOT EXISTS public."coi_declarations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "meeting_id" uuid NOT NULL,
    "member_user_id" uuid NOT NULL,
    "format" text NOT NULL,
    "conflict_note" text,
    "chair_decision" text,
    "decided_by" uuid,
    "decided_at" timestamp with time zone,
    "declared_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "coi_declarations_chair_decision_check" CHECK (chair_decision = ANY (ARRAY['CONTINUE'::text, 'RECUSE'::text])),
    CONSTRAINT "coi_declarations_check" CHECK (format = 'F1'::text OR COALESCE(btrim(conflict_note), ''::text) <> ''::text),
    CONSTRAINT "coi_declarations_check1" CHECK (format = 'F2'::text OR chair_decision IS NULL),
    CONSTRAINT "coi_declarations_format_check" CHECK (format = ANY (ARRAY['F1'::text, 'F2'::text])),
    CONSTRAINT "coi_declarations_pkey" PRIMARY KEY (id),
    CONSTRAINT "coi_declarations_meeting_id_member_user_id_key" UNIQUE (meeting_id, member_user_id)
);
CREATE INDEX coi_declarations_decided_by_fk_idx ON public.coi_declarations USING btree (decided_by);
CREATE INDEX coi_declarations_member_user_id_fk_idx ON public.coi_declarations USING btree (member_user_id);

CREATE TABLE IF NOT EXISTS public."tickets" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "token" text NOT NULL,
    "subject" text NOT NULL,
    "category" text NOT NULL,
    "urgency" text DEFAULT 'Medium'::text NOT NULL,
    "description" text DEFAULT ''::text NOT NULL,
    "submitted_by" uuid NOT NULL,
    "assigned_to" uuid,
    "status" text DEFAULT 'Open'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "tickets_category_check" CHECK (category = ANY (ARRAY['Infrastructure'::text, 'EquipmentIT'::text, 'Administrative'::text, 'HRGrievance'::text, 'Finance'::text, 'LabResearch'::text, 'Library'::text, 'Transport'::text])),
    CONSTRAINT "tickets_status_check" CHECK (status = ANY (ARRAY['Open'::text, 'InProgress'::text, 'Resolved'::text, 'Closed'::text])),
    CONSTRAINT "tickets_urgency_check" CHECK (urgency = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text, 'Critical'::text])),
    CONSTRAINT "tickets_pkey" PRIMARY KEY (id),
    CONSTRAINT "tickets_token_key" UNIQUE (token)
);
CREATE INDEX tickets_assigned_status_idx ON public.tickets USING btree (assigned_to, status);
CREATE INDEX tickets_created_at_idx ON public.tickets USING btree (created_at DESC);
CREATE INDEX tickets_status_idx ON public.tickets USING btree (status);
CREATE INDEX tickets_submitted_by_idx ON public.tickets USING btree (submitted_by);

CREATE TABLE IF NOT EXISTS public."ticket_responses" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "ticket_id" uuid NOT NULL,
    "author_id" uuid NOT NULL,
    "message" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ticket_responses_pkey" PRIMARY KEY (id)
);
CREATE INDEX ticket_responses_author_id_fk_idx ON public.ticket_responses USING btree (author_id);
CREATE INDEX ticket_responses_ticket_idx ON public.ticket_responses USING btree (ticket_id);

CREATE TABLE IF NOT EXISTS public."ticket_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "ticket_id" uuid NOT NULL,
    "event_type" text NOT NULL,
    "actor_id" uuid,
    "details" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ticket_events_event_type_check" CHECK (event_type = ANY (ARRAY['Created'::text, 'Assigned'::text, 'StatusChanged'::text, 'Resolved'::text, 'Closed'::text, 'Reopened'::text])),
    CONSTRAINT "ticket_events_pkey" PRIMARY KEY (id)
);
CREATE INDEX ticket_events_actor_id_fk_idx ON public.ticket_events USING btree (actor_id);
CREATE INDEX ticket_events_ticket_idx ON public.ticket_events USING btree (ticket_id);

CREATE TABLE IF NOT EXISTS public."helpdesk_routing" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "category" text NOT NULL,
    "target_type" text NOT NULL,
    "target_id" text NOT NULL,
    CONSTRAINT "helpdesk_routing_category_check" CHECK (category = ANY (ARRAY['Infrastructure'::text, 'EquipmentIT'::text, 'Administrative'::text, 'HRGrievance'::text, 'Finance'::text, 'LabResearch'::text, 'Library'::text, 'Transport'::text])),
    CONSTRAINT "helpdesk_routing_target_type_check" CHECK (target_type = ANY (ARRAY['division'::text, 'role'::text])),
    CONSTRAINT "helpdesk_routing_pkey" PRIMARY KEY (id),
    CONSTRAINT "helpdesk_routing_category_key" UNIQUE (category)
);

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('committee-docs', 'committee-docs', false)
ON CONFLICT (id) DO NOTHING;


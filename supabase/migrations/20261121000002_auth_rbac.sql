-- ============================================================
-- Stage 02 / 08 — Identity, RBAC, Feature Controls & Audit Core
-- Depends    : Stage 01
-- Rerun      : NOT idempotent — fresh installs only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."user_roles" (
    "user_id" uuid NOT NULL,
    "role" text NOT NULL,
    "division_code" text,
    "must_change_password" boolean DEFAULT true NOT NULL,
    CONSTRAINT "user_roles_role_check" CHECK (role = ANY (ARRAY['Director'::text, 'DivisionHead'::text, 'Scientist'::text, 'Technician'::text, 'HRAdmin'::text, 'FinanceAdmin'::text, 'SystemAdmin'::text, 'MasterAdmin'::text, 'DefaultUser'::text, 'HOD'::text, 'Student'::text, 'ProjectStaff'::text, 'Guest'::text, 'EmpoweredCommittee'::text, 'PME'::text])),
    CONSTRAINT "user_roles_pkey" PRIMARY KEY (user_id, role)
);
CREATE INDEX user_roles_division_code_idx ON public.user_roles USING btree (division_code);

CREATE TABLE IF NOT EXISTS public."user_profiles" (
    "user_id" uuid NOT NULL,
    "email" text,
    "must_change_password" boolean DEFAULT true NOT NULL,
    "active_role" text,
    "last_seen_at" timestamp with time zone,
    "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "password_fingerprint" text,
    CONSTRAINT "user_profiles_pkey" PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS public."acting_assignments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "role" text NOT NULL,
    "division_code" text,
    "principal_user_id" uuid,
    "acting_user_id" uuid NOT NULL,
    "from_on" date NOT NULL,
    "to_on" date NOT NULL,
    "order_ref" text NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "acting_assignments_check" CHECK (to_on >= from_on),
    CONSTRAINT "acting_assignments_check1" CHECK ((role = 'Director'::text) = (division_code IS NULL)),
    CONSTRAINT "acting_assignments_order_ref_check" CHECK (btrim(order_ref) <> ''::text),
    CONSTRAINT "acting_assignments_role_check" CHECK (role = ANY (ARRAY['HOD'::text, 'DivisionHead'::text, 'Director'::text])),
    CONSTRAINT "acting_assignments_pkey" PRIMARY KEY (id)
);
CREATE INDEX acting_assignments_acting_idx ON public.acting_assignments USING btree (acting_user_id, from_on, to_on);
CREATE INDEX acting_assignments_created_by_fk_idx ON public.acting_assignments USING btree (created_by);
CREATE INDEX acting_assignments_division_code_fk_idx ON public.acting_assignments USING btree (division_code);
CREATE INDEX acting_assignments_principal_user_id_fk_idx ON public.acting_assignments USING btree (principal_user_id);

CREATE TABLE IF NOT EXISTS public."access_requests" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "email" text,
    "requested_roles" text[] NOT NULL,
    "requested_division" text,
    "justification" text DEFAULT ''::text NOT NULL,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "review_note" text,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "access_requests_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])),
    CONSTRAINT "access_requests_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX access_requests_one_pending ON public.access_requests USING btree (user_id) WHERE (status = 'PENDING'::text);
CREATE INDEX access_requests_pending_created_idx ON public.access_requests USING btree (created_at) WHERE (status = 'PENDING'::text);
CREATE INDEX access_requests_reviewed_by_fk_idx ON public.access_requests USING btree (reviewed_by);

CREATE TABLE IF NOT EXISTS public."feature_controls" (
    "feature_key" text NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "disabled_roles" text[] DEFAULT '{}'::text[] NOT NULL,
    "note" text,
    "updated_by" uuid,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "feature_controls_pkey" PRIMARY KEY (feature_key)
);
CREATE INDEX feature_controls_updated_by_fk_idx ON public.feature_controls USING btree (updated_by);

CREATE TABLE IF NOT EXISTS public."feature_grants" (
    "user_id" uuid NOT NULL,
    "feature_key" text NOT NULL,
    "note" text,
    "granted_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "feature_grants_pkey" PRIMARY KEY (user_id, feature_key)
);
CREATE INDEX feature_grants_granted_by_fk_idx ON public.feature_grants USING btree (granted_by);

CREATE TABLE IF NOT EXISTS public."notifications" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "kind" text NOT NULL,
    "severity" text DEFAULT 'info'::text NOT NULL,
    "title" text NOT NULL,
    "body" text DEFAULT ''::text NOT NULL,
    "link" text,
    "source" text DEFAULT 'rule'::text NOT NULL,
    "dedupe_key" text NOT NULL,
    "status" text DEFAULT 'open'::text NOT NULL,
    "proposed_action" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "notifications_severity_check" CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])),
    CONSTRAINT "notifications_source_check" CHECK (source = ANY (ARRAY['rule'::text, 'agent'::text])),
    CONSTRAINT "notifications_status_check" CHECK (status = ANY (ARRAY['open'::text, 'read'::text, 'accepted'::text, 'dismissed'::text])),
    CONSTRAINT "notifications_pkey" PRIMARY KEY (id),
    CONSTRAINT "notifications_user_id_dedupe_key_key" UNIQUE (user_id, dedupe_key)
);
CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX notifications_user_open_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (status = 'open'::text);

CREATE TABLE IF NOT EXISTS public."audit_log" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "entity_type" text NOT NULL,
    "entity_id" uuid NOT NULL,
    "action" text NOT NULL,
    "actor_id" text NOT NULL,
    "changes" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "audit_log_action_check" CHECK (action = ANY (ARRAY['created'::text, 'updated'::text, 'deleted'::text, 'status_changed'::text])),
    CONSTRAINT "audit_log_entity_type_check" CHECK (entity_type = ANY (ARRAY['committee'::text, 'meeting'::text, 'action_item'::text, 'ticket'::text, 'ticket_response'::text, 'calendar_event'::text, 'holiday'::text])),
    CONSTRAINT "audit_log_pkey" PRIMARY KEY (id)
);
CREATE INDEX audit_log_created_at_idx ON public.audit_log USING btree (created_at DESC, id);
CREATE INDEX audit_log_created_idx ON public.audit_log USING btree (created_at);
CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity_type, entity_id);

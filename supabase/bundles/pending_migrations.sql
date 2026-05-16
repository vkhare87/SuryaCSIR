-- ════════════════════════════════════════════════════════════════════
-- SURYA — Pending Migrations (delta against current Supabase state)
-- ════════════════════════════════════════════════════════════════════
-- Apply: paste this entire file into Supabase Studio SQL Editor
-- as the postgres role. Idempotent — uses IF NOT EXISTS / OR REPLACE.
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260502000000_instruments_extension.sql
-- ════════════════════════════════════════════════════════════════════
-- =============================================================
-- SURYA — Instruments Extension
-- Adds: labs table, 9 new columns on equipment, RLS, indexes
-- =============================================================

-- 1. Labs table
CREATE TABLE IF NOT EXISTS public.labs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_code   text UNIQUE NOT NULL,
  lab_name   text NOT NULL,
  div_code   text REFERENCES public.divisions("divCode"),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;

CREATE POLICY labs_read_authenticated ON public.labs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY labs_admin_write ON public.labs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('SystemAdmin', 'MasterAdmin')
    )
  );

-- 2. Extend equipment with 9 new columns
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS instrument_code     text,
  ADD COLUMN IF NOT EXISTS serial_number       text,
  ADD COLUMN IF NOT EXISTS manufacturer        text,
  ADD COLUMN IF NOT EXISTS year_of_manufacture integer,
  ADD COLUMN IF NOT EXISTS lab_id              uuid REFERENCES public.labs(id),
  ADD COLUMN IF NOT EXISTS owner_user_id       uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS amc_end_date        date,
  ADD COLUMN IF NOT EXISTS purchase_cost       numeric(14, 2),
  ADD COLUMN IF NOT EXISTS procurement_date    date;

-- 3. RLS write policy for admin add/edit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'equipment' AND policyname = 'equipment_admin_write'
  ) THEN
    CREATE POLICY equipment_admin_write ON public.equipment
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid()
            AND role IN ('SystemAdmin', 'MasterAdmin', 'HRAdmin')
        )
      );
  END IF;
END$$;

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS equipment_owner_idx ON public.equipment(owner_user_id);
CREATE INDEX IF NOT EXISTS equipment_lab_idx   ON public.equipment(lab_id);
CREATE INDEX IF NOT EXISTS equipment_amc_idx   ON public.equipment(amc_end_date);

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260507000000_committees_helpdesk.sql
-- ════════════════════════════════════════════════════════════════════
-- Migration: committees + helpdesk + audit_log + helpdesk_routing
-- 11 tables with RLS, 3 RPCs, 1 storage bucket for meeting documents.
-- Decision D-01: Shallow RLS. SELECT = all authenticated. ALL = admin roles.
-- Decision D-02: No RPC write gates for committee tables.
-- Decision D-03: No minutes lock (RLS or app-level).
-- Decision D-06/D-07/D-08: route_ticket() with per-category config, fallback chain.

-- ══════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.committees (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    committee_type  text NOT NULL CHECK (committee_type IN ('Standing','AdHoc','Review','Advisory')),
    mandate         text NOT NULL DEFAULT '',
    chairperson_id  text NOT NULL,  -- -> staff."ID"
    secretary_id    text NOT NULL,  -- -> staff."ID"
    status          text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
    formed_date     date NOT NULL DEFAULT CURRENT_DATE,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.committee_members (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    committee_id    uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
    staff_id        text NOT NULL,  -- -> staff."ID"
    role            text NOT NULL DEFAULT 'Member' CHECK (role IN ('Member','Invitee','ExternalExpert'))
);

CREATE TABLE IF NOT EXISTS public.meetings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    committee_id    uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
    meeting_date    date NOT NULL,
    venue           text NOT NULL DEFAULT '',
    title           text NOT NULL,
    summary         text NOT NULL DEFAULT '',
    status          text NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','Completed','Cancelled')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agenda_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id      uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    sequence        integer NOT NULL DEFAULT 0,
    description     text NOT NULL,
    proposed_by     text NOT NULL,  -- -> staff."ID"
    status          text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Discussed','Deferred'))
);

CREATE TABLE IF NOT EXISTS public.action_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id      uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
    source          text NOT NULL DEFAULT 'meeting' CHECK (source IN ('meeting','manual')),
    task            text NOT NULL,
    assigned_to     text NOT NULL,  -- -> staff."ID"
    deadline        date NOT NULL,
    status          text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','InProgress','Completed')),
    completed_at    timestamptz,
    notes           text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.meeting_documents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id      uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    file_name       text NOT NULL,
    storage_path    text NOT NULL,
    uploaded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tickets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token           text NOT NULL UNIQUE,
    subject         text NOT NULL,
    category        text NOT NULL CHECK (category IN ('Infrastructure','EquipmentIT','Administrative','HRGrievance','Finance','LabResearch','Library','Transport')),
    urgency         text NOT NULL DEFAULT 'Medium' CHECK (urgency IN ('Low','Medium','High','Critical')),
    description     text NOT NULL DEFAULT '',
    submitted_by    text NOT NULL,  -- -> staff."ID"
    assigned_to     text,           -- -> staff."ID", nullable, auto-routed on create
    status          text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','InProgress','Resolved','Closed')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz
);

CREATE TABLE IF NOT EXISTS public.ticket_responses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    author_id       text NOT NULL,  -- -> staff."ID"
    message         text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    event_type      text NOT NULL CHECK (event_type IN ('Created','Assigned','StatusChanged','Resolved','Closed','Reopened')),
    actor_id        text NOT NULL,  -- -> staff."ID"
    details         jsonb DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.helpdesk_routing (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category        text NOT NULL UNIQUE CHECK (category IN ('Infrastructure','EquipmentIT','Administrative','HRGrievance','Finance','LabResearch','Library','Transport')),
    target_type     text NOT NULL CHECK (target_type IN ('division','role')),
    target_id       text NOT NULL  -- division.divCode or role name
);

CREATE TABLE IF NOT EXISTS public.audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     text NOT NULL CHECK (entity_type IN ('committee','meeting','action_item','ticket','ticket_response')),
    entity_id       uuid NOT NULL,
    action          text NOT NULL CHECK (action IN ('created','updated','deleted','status_changed')),
    actor_id        text NOT NULL,  -- -> staff."ID"
    changes         jsonb DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════
-- 2. INDEXES
-- ══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS committees_status_idx ON public.committees(status);
CREATE INDEX IF NOT EXISTS committee_members_committee_idx ON public.committee_members(committee_id);
CREATE INDEX IF NOT EXISTS committee_members_staff_idx ON public.committee_members(staff_id);
CREATE INDEX IF NOT EXISTS meetings_committee_idx ON public.meetings(committee_id);
CREATE INDEX IF NOT EXISTS meetings_date_idx ON public.meetings(meeting_date);
CREATE INDEX IF NOT EXISTS agenda_items_meeting_idx ON public.agenda_items(meeting_id);
CREATE INDEX IF NOT EXISTS action_items_meeting_idx ON public.action_items(meeting_id);
CREATE INDEX IF NOT EXISTS action_items_assigned_to_idx ON public.action_items(assigned_to);
CREATE INDEX IF NOT EXISTS action_items_status_idx ON public.action_items(status);
CREATE INDEX IF NOT EXISTS meeting_documents_meeting_idx ON public.meeting_documents(meeting_id);
CREATE INDEX IF NOT EXISTS tickets_submitted_by_idx ON public.tickets(submitted_by);
CREATE INDEX IF NOT EXISTS tickets_assigned_to_idx ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON public.tickets(status);
CREATE INDEX IF NOT EXISTS tickets_token_idx ON public.tickets(token);
CREATE INDEX IF NOT EXISTS ticket_responses_ticket_idx ON public.ticket_responses(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_events_ticket_idx ON public.ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS helpdesk_routing_category_idx ON public.helpdesk_routing(category);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log(created_at);

-- ══════════════════════════════════════════════════════════════════
-- 3. TRIGGERS
-- ══════════════════════════════════════════════════════════════════

-- pms_set_updated_at() already exists from init migration.
-- Apply to tickets.updated_at:
CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

-- ══════════════════════════════════════════════════════════════════
-- 4. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════

-- Decision D-01: Shallow RLS. All authenticated = SELECT. Admin roles = ALL.

ALTER TABLE public.committees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helpdesk_routing   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log          ENABLE ROW LEVEL SECURITY;

-- SELECT policies: all authenticated users can read all tables
CREATE POLICY "committees_select"        ON public.committees         FOR SELECT TO authenticated USING (true);
CREATE POLICY "committee_members_select" ON public.committee_members  FOR SELECT TO authenticated USING (true);
CREATE POLICY "meetings_select"          ON public.meetings           FOR SELECT TO authenticated USING (true);
CREATE POLICY "agenda_items_select"      ON public.agenda_items       FOR SELECT TO authenticated USING (true);
CREATE POLICY "action_items_select"      ON public.action_items       FOR SELECT TO authenticated USING (true);
CREATE POLICY "meeting_documents_select" ON public.meeting_documents  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tickets_select"           ON public.tickets            FOR SELECT TO authenticated USING (true);
CREATE POLICY "ticket_responses_select"  ON public.ticket_responses   FOR SELECT TO authenticated USING (true);
CREATE POLICY "ticket_events_select"     ON public.ticket_events      FOR SELECT TO authenticated USING (true);
CREATE POLICY "helpdesk_routing_select"  ON public.helpdesk_routing   FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_log_select"         ON public.audit_log          FOR SELECT TO authenticated USING (true);

-- WRITE policies: only Director, SystemAdmin, MasterAdmin
CREATE POLICY "committees_write"
    ON public.committees FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "committee_members_write"
    ON public.committee_members FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "meetings_write"
    ON public.meetings FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "agenda_items_write"
    ON public.agenda_items FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "action_items_write"
    ON public.action_items FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "meeting_documents_write"
    ON public.meeting_documents FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "tickets_write"
    ON public.tickets FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "ticket_responses_write"
    ON public.ticket_responses FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "ticket_events_write"
    ON public.ticket_events FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "helpdesk_routing_write"
    ON public.helpdesk_routing FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "audit_log_write"
    ON public.audit_log FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

-- ══════════════════════════════════════════════════════════════════
-- 5. RPCs (helpdesk ticket operations)
-- ══════════════════════════════════════════════════════════════════

-- route_ticket: resolves category + submitter to a handler.
-- Priority: helpdesk_routing override → submitter's DivisionHead → HRAdmin → SystemAdmin
-- Decision D-06: default = submitter's DivisionHead
-- Decision D-07: fallback = DivisionHead → HRAdmin → SystemAdmin
-- Decision D-08: one row per category in helpdesk_routing
CREATE OR REPLACE FUNCTION public.route_ticket(
    p_category text,
    p_submitter_id text
) RETURNS text AS $$
DECLARE
    v_target_type text;
    v_target_id text;
    v_result_id text;
    v_div_code text;
BEGIN
    -- Step 1: Check helpdesk_routing for explicit override
    SELECT target_type, target_id INTO v_target_type, v_target_id
    FROM public.helpdesk_routing
    WHERE category = p_category;

    IF FOUND THEN
        IF v_target_type = 'role' THEN
            -- Find any user with this role
            SELECT up.user_id INTO v_result_id
            FROM public.user_roles ur
            JOIN public.user_profiles up ON up.user_id = ur.user_id
            WHERE ur.role = v_target_id
            LIMIT 1;
        ELSIF v_target_type = 'division' THEN
            -- Find the HoD of this division
            SELECT sf."ID" INTO v_result_id
            FROM public.staff sf
            WHERE sf."Division" = v_target_id AND sf."ReportingID" = 'D001'
            LIMIT 1;
        END IF;
        IF v_result_id IS NOT NULL THEN
            RETURN v_result_id;
        END IF;
    END IF;

    -- Step 2: Fallback to submitter's DivisionHead
    SELECT sf2."Division" INTO v_div_code
    FROM public.staff sf2
    WHERE sf2."ID" = p_submitter_id;

    IF v_div_code IS NOT NULL THEN
        SELECT sf3."ID" INTO v_result_id
        FROM public.staff sf3
        JOIN public.divisions d ON d."divCode" = sf3."Division"
        WHERE sf3."Division" = v_div_code AND d."divHoDID" = sf3."ID"
        LIMIT 1;
        IF v_result_id IS NOT NULL THEN
            RETURN v_result_id;
        END IF;
    END IF;

    -- Step 3: Fallback to HRAdmin
    SELECT up.user_id INTO v_result_id
    FROM public.user_roles ur
    WHERE ur.role = 'HRAdmin'
    LIMIT 1;
    IF v_result_id IS NOT NULL THEN
        RETURN v_result_id;
    END IF;

    -- Step 4: Last resort — SystemAdmin
    SELECT up.user_id INTO v_result_id
    FROM public.user_roles ur
    WHERE ur.role = 'SystemAdmin'
    LIMIT 1;
    RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- helpdesk_create_ticket: creates ticket with auto-generated token and routing
CREATE OR REPLACE FUNCTION public.helpdesk_create_ticket(
    p_subject text,
    p_category text,
    p_urgency text,
    p_description text,
    p_submitted_by text
) RETURNS uuid AS $$
DECLARE
    v_ticket_id uuid;
    v_token text;
    v_seq integer;
    v_assigned_to text;
BEGIN
    -- Generate token: AMPRI-YYMMDD-XXX
    SELECT COALESCE(MAX(SUBSTRING(token FROM 'AMPRI-\d{6}-(\d{3})')::integer), 0) + 1
    INTO v_seq FROM public.tickets
    WHERE token LIKE 'AMPRI-' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-%';

    v_token := 'AMPRI-' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-' || LPAD(v_seq::text, 3, '0');

    -- Route assignment
    v_assigned_to := public.route_ticket(p_category, p_submitted_by);

    -- Insert ticket
    INSERT INTO public.tickets (token, subject, category, urgency, description, submitted_by, assigned_to, status)
    VALUES (v_token, p_subject, p_category, p_urgency, p_description, p_submitted_by, v_assigned_to, 'Open')
    RETURNING id INTO v_ticket_id;

    -- Log Created event
    INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
    VALUES (v_ticket_id, 'Created', p_submitted_by,
            jsonb_build_object('token', v_token, 'category', p_category, 'assigned_to', v_assigned_to));

    -- Log Assigned event if routing produced a handler
    IF v_assigned_to IS NOT NULL THEN
        INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
        VALUES (v_ticket_id, 'Assigned', 'system',
                jsonb_build_object('assigned_to', v_assigned_to));
    END IF;

    RETURN v_ticket_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- helpdesk_update_status: validates state transitions and logs events
CREATE OR REPLACE FUNCTION public.helpdesk_update_status(
    p_ticket_id uuid,
    p_new_status text,
    p_actor_id text
) RETURNS void AS $$
DECLARE
    v_current_status text;
BEGIN
    SELECT status INTO v_current_status FROM public.tickets WHERE id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Validate transitions
    IF v_current_status = 'Open' AND p_new_status NOT IN ('InProgress', 'Closed') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    ELSIF v_current_status = 'InProgress' AND p_new_status NOT IN ('Resolved', 'Closed') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    ELSIF v_current_status = 'Resolved' AND p_new_status NOT IN ('Closed', 'InProgress') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    ELSIF v_current_status = 'Closed' AND p_new_status NOT IN ('InProgress') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    END IF;

    -- Update status
    UPDATE public.tickets
    SET status = p_new_status,
        resolved_at = CASE WHEN p_new_status = 'Resolved' THEN now() ELSE resolved_at END,
        updated_at = now()
    WHERE id = p_ticket_id;

    -- Determine event type from transition
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════
-- 6. STORAGE BUCKET (meeting documents)
-- ══════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('committee-docs', 'committee-docs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: all authenticated can read (download)
CREATE POLICY "committee_docs_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'committee-docs');

-- RLS: admin roles can upload
CREATE POLICY "committee_docs_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'committee-docs'
        AND (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    );

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260510000000_committee_minutes_lock.sql
-- ════════════════════════════════════════════════════════════════════
-- Migration: Add minutes lock RLS policy + admin unlock RPC
-- Overrides Phase 1 Decision D-03 per CONTEXT.md D-19:
--   Minutes auto-lock 7 days after meeting completion.
--   RLS prevents UPDATE/DELETE on meetings when locked.
--   SELECT remains open to all authenticated users.
--   Admin roles (Director, SystemAdmin, MasterAdmin) can bypass via unlock RPC.

-- 1. Drop the existing all-in-one meetings_write policy
DROP POLICY IF EXISTS "meetings_write" ON public.meetings;

-- 2. SELECT policy — all authenticated users can read meetings (no lock guard)
CREATE POLICY "meetings_select"
    ON public.meetings FOR SELECT TO authenticated
    USING (true);

-- 3. INSERT policy — admin roles only; lock condition applies to new rows
CREATE POLICY "meetings_insert"
    ON public.meetings FOR INSERT TO authenticated
    WITH CHECK (
        public.user_has_role('Director')
        OR public.user_has_role('SystemAdmin')
        OR public.user_has_role('MasterAdmin')
    );

-- 4. UPDATE policy — role check + lock guard prevents editing locked meetings
--    A meeting is "locked" when status = 'Completed' AND
--    meeting_date < CURRENT_DATE - INTERVAL '7 days'.
--    MasterAdmin can always override the lock.
CREATE POLICY "meetings_update"
    ON public.meetings FOR UPDATE TO authenticated
    USING (
        (public.user_has_role('Director')
         OR public.user_has_role('SystemAdmin')
         OR public.user_has_role('MasterAdmin'))
        AND (
            status != 'Completed'
            OR meeting_date >= CURRENT_DATE - INTERVAL '7 days'
            OR public.user_has_role('MasterAdmin')
        )
    )
    WITH CHECK (
        (public.user_has_role('Director')
         OR public.user_has_role('SystemAdmin')
         OR public.user_has_role('MasterAdmin'))
        AND (
            status != 'Completed'
            OR meeting_date >= CURRENT_DATE - INTERVAL '7 days'
            OR public.user_has_role('MasterAdmin')
        )
    );

-- 5. DELETE policy — role check + lock guard prevents deleting locked meetings
CREATE POLICY "meetings_delete"
    ON public.meetings FOR DELETE TO authenticated
    USING (
        (public.user_has_role('Director')
         OR public.user_has_role('SystemAdmin')
         OR public.user_has_role('MasterAdmin'))
        AND (
            status != 'Completed'
            OR meeting_date >= CURRENT_DATE - INTERVAL '7 days'
            OR public.user_has_role('MasterAdmin')
        )
    );

-- 6. SECURITY DEFINER function: resets meeting_date to "unlock" minutes
--    Moves meeting_date to today so the lock window resets.
CREATE OR REPLACE FUNCTION public.unlock_meeting_minutes(
    p_meeting_id uuid
) RETURNS void AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260510000000_helpdesk_phase3_rpcs.sql
-- ════════════════════════════════════════════════════════════════════
-- Migration: Phase 3 helpdesk RPCs — assign_ticket + add_response
-- Adds two SECURITY DEFINER RPCs required for Phase 3 helpdesk operations:
--   helpdesk_assign_ticket  — admin reassignment with event logging (Pitfall 2)
--   helpdesk_add_response   — response insertion bypassing RLS for non-admin users (Pitfall 1)
--
-- Existing RPCs (helpdesk_create_ticket, helpdesk_update_status, route_ticket) live in
-- 20260507000000_committees_helpdesk.sql — DO NOT EDIT that file.
--
-- Decision: SECURITY DEFINER pattern mirrors existing helpdesk RPCs.
-- Decision: helpdesk_add_response enforces p_author_id = auth.uid() to prevent spoofing (STRIDE T-03-05).
-- Decision: helpdesk_assign_ticket logs Assigned event with old→new handler in details.

-- ══════════════════════════════════════════════════════════════════
-- 1. helpdesk_assign_ticket — reassign ticket to a new handler
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.helpdesk_assign_ticket(
    p_ticket_id uuid,
    p_new_handler_id text,
    p_actor_id text
) RETURNS void AS $$
DECLARE
    v_old_handler_id text;
BEGIN
    -- Get current handler
    SELECT assigned_to INTO v_old_handler_id FROM public.tickets WHERE id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Update assigned_to and updated_at atomically
    UPDATE public.tickets
    SET assigned_to = p_new_handler_id,
        updated_at = now()
    WHERE id = p_ticket_id;

    -- Log Assigned event with old→new handler
    INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
    VALUES (p_ticket_id, 'Assigned', p_actor_id,
            jsonb_build_object(
                'from', v_old_handler_id,
                'to', p_new_handler_id
            ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════
-- 2. helpdesk_add_response — insert response bypassing RLS
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.helpdesk_add_response(
    p_ticket_id uuid,
    p_author_id text,
    p_message text
) RETURNS uuid AS $$
DECLARE
    v_response_id uuid;
BEGIN
    -- Verify ticket exists
    IF NOT EXISTS (SELECT 1 FROM public.tickets WHERE id = p_ticket_id) THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Verify author_id matches the authenticated user (spoofing prevention)
    -- SECURITY DEFINER context so auth.uid() is the caller's Supabase Auth UID
    IF p_author_id != auth.uid()::text THEN
        RAISE EXCEPTION 'Author ID must match authenticated user';
    END IF;

    -- Insert response
    INSERT INTO public.ticket_responses (ticket_id, author_id, message)
    VALUES (p_ticket_id, p_author_id, p_message)
    RETURNING id INTO v_response_id;

    RETURN v_response_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260516000000_audit_log_triggers.sql
-- ════════════════════════════════════════════════════════════════════
-- Migration: audit_log triggers for committees + helpdesk
-- Fulfills INT-03 — audit log captures changes to committees, meetings,
-- action_items, tickets, ticket_responses via row-level triggers.

-- ══════════════════════════════════════════════════════════════════
-- 1. Trigger function (SECURITY DEFINER to bypass audit_log_write RLS)
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ══════════════════════════════════════════════════════════════════
-- 2. Triggers on each audited table
-- ══════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS committees_audit         ON public.committees;
DROP TRIGGER IF EXISTS meetings_audit           ON public.meetings;
DROP TRIGGER IF EXISTS action_items_audit       ON public.action_items;
DROP TRIGGER IF EXISTS tickets_audit            ON public.tickets;
DROP TRIGGER IF EXISTS ticket_responses_audit   ON public.ticket_responses;

CREATE TRIGGER committees_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.committees
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('committee');

CREATE TRIGGER meetings_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.meetings
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('meeting');

CREATE TRIGGER action_items_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.action_items
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('action_item');

CREATE TRIGGER tickets_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('ticket');

CREATE TRIGGER ticket_responses_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.ticket_responses
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('ticket_response');

-- ══════════════════════════════════════════════════════════════════
-- 3. Allow authenticated SELECT on audit_log (admin gate is at UI)
-- ══════════════════════════════════════════════════════════════════
-- The existing audit_log_select policy already allows any authenticated user
-- to SELECT; the AuditLog page enforces admin-only at the UI layer (same
-- pattern as pms_audit_logs). No policy change required here.

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260516000001_admin_write_policies.sql
-- ════════════════════════════════════════════════════════════════════
-- Migration: admin write policies for HR tables that lack them
--
-- The init.sql migration shipped SELECT-everyone + write-admin policies for
-- staff, divisions, contract_staff, scientific_outputs, ip_intelligence.
-- It missed projects, phd_students, project_staff. Those tables have RLS
-- enabled but no write policy at all → admin attempts return permission
-- denied.
--
-- Adds matching policies. Idempotent via DROP POLICY IF EXISTS.

DROP POLICY IF EXISTS "projects_write"       ON public.projects;
DROP POLICY IF EXISTS "project_staff_write"  ON public.project_staff;
DROP POLICY IF EXISTS "phd_students_write"   ON public.phd_students;

CREATE POLICY "projects_write"
    ON public.projects FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "project_staff_write"
    ON public.project_staff FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "phd_students_write"
    ON public.phd_students FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

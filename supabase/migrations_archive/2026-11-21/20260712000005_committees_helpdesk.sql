-- ============================================================
-- Stage 05 / 08 — Committees & Helpdesk
-- Contains : committees, meetings (+ 7-day minutes lock), agenda/action
--            items, meeting documents, helpdesk tickets + routing,
--            shared audit_log + row-change triggers.
-- Depends  : 01 extensions_helpers, 02 auth_rbac
-- Rerun    : NOT idempotent — fresh installs only. Changes go in
--            new timestamped migrations, never edits here.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLES
-- ──────────────────────────────────────────────────────────────

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
    teams_url       text,
    pamphlet_url    text,
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
    entity_type     text NOT NULL CHECK (entity_type IN (
                        'committee','meeting','action_item','ticket','ticket_response',
                        'calendar_event','holiday'
                    )),
    entity_id       uuid NOT NULL,
    action          text NOT NULL CHECK (action IN ('created','updated','deleted','status_changed')),
    actor_id        text NOT NULL,  -- -> staff."ID"
    changes         jsonb DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 2. INDEXES
-- ──────────────────────────────────────────────────────────────

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

-- ──────────────────────────────────────────────────────────────
-- 3. TRIGGERS
-- ──────────────────────────────────────────────────────────────

CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

-- Row-change audit trail (SECURITY DEFINER so it bypasses audit_log RLS)
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

-- ──────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────

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

-- SELECT: all authenticated users can read every table (admin gate is UI-side)
CREATE POLICY "committees_select"        ON public.committees         FOR SELECT TO authenticated USING (true);
CREATE POLICY "committee_members_select" ON public.committee_members  FOR SELECT TO authenticated USING (true);
CREATE POLICY "agenda_items_select"      ON public.agenda_items       FOR SELECT TO authenticated USING (true);
CREATE POLICY "action_items_select"      ON public.action_items       FOR SELECT TO authenticated USING (true);
CREATE POLICY "meeting_documents_select" ON public.meeting_documents  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tickets_select"           ON public.tickets            FOR SELECT TO authenticated USING (true);
CREATE POLICY "ticket_responses_select"  ON public.ticket_responses   FOR SELECT TO authenticated USING (true);
CREATE POLICY "ticket_events_select"     ON public.ticket_events      FOR SELECT TO authenticated USING (true);
CREATE POLICY "helpdesk_routing_select"  ON public.helpdesk_routing   FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_log_select"         ON public.audit_log          FOR SELECT TO authenticated USING (true);

-- WRITE: only Director, SystemAdmin, MasterAdmin
CREATE POLICY "committees_write"
    ON public.committees FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "committee_members_write"
    ON public.committee_members FOR ALL TO authenticated
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

-- meetings: SELECT open to all; write is role-gated AND blocked once a
-- meeting is "locked" (status = 'Completed' AND meeting_date older than 7
-- days). MasterAdmin can always override the lock via unlock_meeting_minutes.
CREATE POLICY "meetings_select"
    ON public.meetings FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "meetings_insert"
    ON public.meetings FOR INSERT TO authenticated
    WITH CHECK (
        public.user_has_role('Director')
        OR public.user_has_role('SystemAdmin')
        OR public.user_has_role('MasterAdmin')
    );

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

-- Admin unlock: resets meeting_date to today so the 7-day lock window resets.
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

-- ──────────────────────────────────────────────────────────────
-- 5. RPCs — helpdesk ticket operations
-- ──────────────────────────────────────────────────────────────

-- route_ticket: resolves category + submitter to a handler.
-- Priority: helpdesk_routing override → submitter's DivisionHead → HRAdmin → SystemAdmin
CREATE OR REPLACE FUNCTION public.route_ticket(
    p_category     text,
    p_submitter_id text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_target_type text;
    v_target_id   text;
    v_result_id   text;
    v_div_code    text;
BEGIN
    -- Step 1: explicit override from helpdesk_routing
    SELECT target_type, target_id
      INTO v_target_type, v_target_id
      FROM public.helpdesk_routing
     WHERE category = p_category;

    IF FOUND THEN
        IF v_target_type = 'role' THEN
            SELECT ur.user_id::text INTO v_result_id
              FROM public.user_roles ur
             WHERE ur.role = v_target_id
             LIMIT 1;
        ELSIF v_target_type = 'division' THEN
            -- Resolve to the division's HoD as recorded on divisions
            SELECT d."divHoDID" INTO v_result_id
              FROM public.divisions d
             WHERE d."divCode" = v_target_id
             LIMIT 1;
        END IF;
        IF v_result_id IS NOT NULL THEN
            RETURN v_result_id;
        END IF;
    END IF;

    -- Step 2: submitter's DivisionHead via divisions.divHoDID
    SELECT sf."Division" INTO v_div_code
      FROM public.staff sf
     WHERE sf."ID" = p_submitter_id;

    IF v_div_code IS NOT NULL THEN
        SELECT d."divHoDID" INTO v_result_id
          FROM public.divisions d
         WHERE d."divCode" = v_div_code
         LIMIT 1;
        IF v_result_id IS NOT NULL THEN
            RETURN v_result_id;
        END IF;
    END IF;

    -- Step 3: any HRAdmin
    SELECT ur.user_id::text INTO v_result_id
      FROM public.user_roles ur
     WHERE ur.role = 'HRAdmin'
     LIMIT 1;
    IF v_result_id IS NOT NULL THEN
        RETURN v_result_id;
    END IF;

    -- Step 4: last resort — any SystemAdmin
    SELECT ur.user_id::text INTO v_result_id
      FROM public.user_roles ur
     WHERE ur.role = 'SystemAdmin'
     LIMIT 1;
    RETURN v_result_id;
END;
$$;

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

    v_assigned_to := public.route_ticket(p_category, p_submitted_by);

    INSERT INTO public.tickets (token, subject, category, urgency, description, submitted_by, assigned_to, status)
    VALUES (v_token, p_subject, p_category, p_urgency, p_description, p_submitted_by, v_assigned_to, 'Open')
    RETURNING id INTO v_ticket_id;

    INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
    VALUES (v_ticket_id, 'Created', p_submitted_by,
            jsonb_build_object('token', v_token, 'category', p_category, 'assigned_to', v_assigned_to));

    IF v_assigned_to IS NOT NULL THEN
        INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
        VALUES (v_ticket_id, 'Assigned', 'system',
                jsonb_build_object('assigned_to', v_assigned_to));
    END IF;

    RETURN v_ticket_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.helpdesk_assign_ticket(
    p_ticket_id uuid,
    p_new_handler_id text,
    p_actor_id text
) RETURNS void AS $$
DECLARE
    v_old_handler_id text;
BEGIN
    SELECT assigned_to INTO v_old_handler_id FROM public.tickets WHERE id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    UPDATE public.tickets
    SET assigned_to = p_new_handler_id,
        updated_at = now()
    WHERE id = p_ticket_id;

    INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
    VALUES (p_ticket_id, 'Assigned', p_actor_id,
            jsonb_build_object(
                'from', v_old_handler_id,
                'to', p_new_handler_id
            ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert bypassing RLS; enforces p_author_id = auth.uid() to prevent spoofing.
CREATE OR REPLACE FUNCTION public.helpdesk_add_response(
    p_ticket_id uuid,
    p_author_id text,
    p_message text
) RETURNS uuid AS $$
DECLARE
    v_response_id uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.tickets WHERE id = p_ticket_id) THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    IF p_author_id != auth.uid()::text THEN
        RAISE EXCEPTION 'Author ID must match authenticated user';
    END IF;

    INSERT INTO public.ticket_responses (ticket_id, author_id, message)
    VALUES (p_ticket_id, p_author_id, p_message)
    RETURNING id INTO v_response_id;

    RETURN v_response_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────
-- 6. STORAGE BUCKET (meeting documents)
-- ──────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('committee-docs', 'committee-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "committee_docs_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'committee-docs');

CREATE POLICY "committee_docs_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'committee-docs'
        AND (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    );

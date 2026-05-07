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

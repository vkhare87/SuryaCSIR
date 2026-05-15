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

-- ============================================================
-- 20261102000003_helpdesk_integrity
-- BUG-06: ticket tokens raced (SELECT MAX+1 then INSERT, no lock) and the
-- (\d{3}) capture stopped MAX at 999 and LPAD(.., 3) cut 1000 to '100', so the
-- 1000th ticket of a day collided forever.
-- Status/assign RPCs read the ticket without FOR UPDATE, so two handlers
-- could both pass the transition gate.
-- Bodies are 20260725000004 plus only the lock, the (\d+) capture, the LPAD
-- width and the two FOR UPDATEs.
-- Tests: scripts/db/helpdesk.db.test.ts.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.helpdesk_create_ticket(
    p_subject text, p_category text, p_urgency text,
    p_description text, p_submitted_by uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.helpdesk_update_status(
    p_ticket_id uuid, p_new_status text, p_actor_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.helpdesk_assign_ticket(
    p_ticket_id uuid, p_new_handler_id uuid, p_actor_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

COMMIT;

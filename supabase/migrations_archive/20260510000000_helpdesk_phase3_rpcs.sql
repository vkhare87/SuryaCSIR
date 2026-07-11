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

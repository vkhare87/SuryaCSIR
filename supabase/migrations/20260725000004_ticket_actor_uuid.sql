-- ═══════════════════════════════════════════════════════════════════════
-- 20260725000004_ticket_actor_uuid
-- A4 — make the identity convention a constraint instead of a comment.
--
-- 20260725000002 normalised every ticket actor column to an auth.users id
-- and recorded that in COMMENT ON COLUMN. A comment is not enforcement: the
-- columns are still `text` with no foreign key, which is precisely how B1
-- happened (route_ticket returned an auth uuid from one branch and a
-- staff."ID" from another, into the same column, and nothing objected).
-- Typed columns make that class of bug a write-time error.
--
-- ⚠ PRECONDITION-GUARDED. This migration ABORTS rather than converting on
-- dirty data. Nulling out unconvertible values would silently destroy
-- ticket attribution — an audit trail is exactly the wrong place to guess.
-- If it aborts, link the named staff rows (staff.user_id) or fix the rows
-- by hand, then re-run.
--
-- Rerun: idempotent — the guard and the ALTERs are all no-ops once applied.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Retire the 'system' sentinel ────────────────────────────────────
-- helpdesk_create_ticket writes actor_id = 'system' for the auto-assignment
-- event. NULL is the honest representation of "no human did this", and it
-- is the only one a uuid column can hold.
ALTER TABLE public.ticket_events ALTER COLUMN actor_id DROP NOT NULL;

UPDATE public.ticket_events
   SET actor_id = NULL
 WHERE actor_id = 'system';

-- ── 2. Refuse to proceed on data that would lose attribution ───────────
DO $$
DECLARE
    v_bad text := '';
    v_n   int;
BEGIN
    -- A regex check, not a cast: a cast would raise 22P02 with no useful
    -- detail about which table or how many rows.
    SELECT count(*) INTO v_n FROM public.tickets
     WHERE submitted_by !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$';
    IF v_n > 0 THEN v_bad := v_bad || format('  tickets.submitted_by: %s row(s)%s', v_n, E'\n'); END IF;

    SELECT count(*) INTO v_n FROM public.tickets
     WHERE assigned_to IS NOT NULL
       AND assigned_to !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$';
    IF v_n > 0 THEN v_bad := v_bad || format('  tickets.assigned_to: %s row(s)%s', v_n, E'\n'); END IF;

    SELECT count(*) INTO v_n FROM public.ticket_responses
     WHERE author_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$';
    IF v_n > 0 THEN v_bad := v_bad || format('  ticket_responses.author_id: %s row(s)%s', v_n, E'\n'); END IF;

    SELECT count(*) INTO v_n FROM public.ticket_events
     WHERE actor_id IS NOT NULL
       AND actor_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$';
    IF v_n > 0 THEN v_bad := v_bad || format('  ticket_events.actor_id: %s row(s)%s', v_n, E'\n'); END IF;

    IF v_bad <> '' THEN
        RAISE EXCEPTION E'Cannot convert ticket actor columns to uuid — non-uuid values remain:\n%\nThese are almost certainly staff."ID" values whose staff row has no user_id link (see 20260725000002). Link them, or correct the rows by hand, then re-run. This migration will not null them: that would erase who did what.', v_bad;
    END IF;

    -- Orphans would fail the FK below with a less legible error.
    SELECT count(*) INTO v_n
      FROM public.tickets t
     WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = t.submitted_by);
    IF v_n > 0 THEN
        RAISE EXCEPTION 'tickets.submitted_by has % row(s) referencing a deleted account. Reassign or delete them first.', v_n;
    END IF;
END $$;

-- ── 3. Convert ────────────────────────────────────────────────────────
-- Policies referencing these columns must be dropped first: Postgres
-- refuses ALTER COLUMN TYPE while a policy depends on the column.
DROP POLICY IF EXISTS "tickets_select" ON public.tickets;
DROP POLICY IF EXISTS "tickets_write"  ON public.tickets;

ALTER TABLE public.tickets
    ALTER COLUMN submitted_by TYPE uuid USING submitted_by::uuid,
    ALTER COLUMN assigned_to  TYPE uuid USING assigned_to::uuid;

ALTER TABLE public.ticket_responses
    ALTER COLUMN author_id TYPE uuid USING author_id::uuid;

ALTER TABLE public.ticket_events
    ALTER COLUMN actor_id TYPE uuid USING actor_id::uuid;

-- RESTRICT on the audit-grade columns: deleting a user must not silently
-- erase who raised or answered a grievance. assigned_to is a work queue,
-- not a record of fact, so it may be emptied.
ALTER TABLE public.tickets
    ADD CONSTRAINT tickets_submitted_by_fkey
        FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE RESTRICT,
    ADD CONSTRAINT tickets_assigned_to_fkey
        FOREIGN KEY (assigned_to)  REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ticket_responses
    ADD CONSTRAINT ticket_responses_author_id_fkey
        FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.ticket_events
    ADD CONSTRAINT ticket_events_actor_id_fkey
        FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- ── 4. Restore the policies, now comparing uuid to uuid ────────────────
CREATE POLICY "tickets_select" ON public.tickets FOR SELECT TO authenticated
USING (
    submitted_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.caller_is_admin()
    OR public.caller_has_role('Director')
);

CREATE POLICY "tickets_write" ON public.tickets FOR ALL TO authenticated
USING (
    public.user_has_role('Director')
    OR public.user_has_role('SystemAdmin')
    OR public.user_has_role('MasterAdmin')
)
WITH CHECK (
    public.user_has_role('Director')
    OR public.user_has_role('SystemAdmin')
    OR public.user_has_role('MasterAdmin')
);

-- ── 5. RPCs: uuid parameters ───────────────────────────────────────────
-- CREATE OR REPLACE cannot change a parameter's type — it would create an
-- overload and leave the text version callable, which is the whole problem.
-- Drop, then recreate. PostgREST casts the JSON string the client already
-- sends, so src/lib/helpdesk/ticketRPCs.ts needs no change.
DROP FUNCTION IF EXISTS public.helpdesk_create_ticket(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.helpdesk_update_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.helpdesk_assign_ticket(uuid, text, text);
DROP FUNCTION IF EXISTS public.helpdesk_add_response(uuid, text, text);
DROP FUNCTION IF EXISTS public.route_ticket(text, text);

CREATE OR REPLACE FUNCTION public.route_ticket(
    p_category     text,
    p_submitter_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_target_type text;
    v_target_id   text;
    v_result_id   uuid;
    v_div_code    text;
BEGIN
    SELECT target_type, target_id INTO v_target_type, v_target_id
      FROM public.helpdesk_routing WHERE category = p_category;

    IF FOUND THEN
        IF v_target_type = 'role' THEN
            SELECT ur.user_id INTO v_result_id
              FROM public.user_roles ur
             WHERE ur.role = v_target_id
             ORDER BY ur.user_id
             LIMIT 1;
        ELSIF v_target_type = 'division' THEN
            SELECT s.user_id INTO v_result_id
              FROM public.divisions d
              JOIN public.staff s ON s."ID" = d."divHoDID"
             WHERE d."divCode" = v_target_id AND s.user_id IS NOT NULL
             LIMIT 1;
        END IF;
        IF v_result_id IS NOT NULL THEN RETURN v_result_id; END IF;
    END IF;

    SELECT s."Division" INTO v_div_code
      FROM public.staff s WHERE s.user_id = p_submitter_id LIMIT 1;

    IF v_div_code IS NOT NULL THEN
        SELECT hod.user_id INTO v_result_id
          FROM public.divisions d
          JOIN public.staff hod ON hod."ID" = d."divHoDID"
         WHERE d."divCode" = v_div_code AND hod.user_id IS NOT NULL
         LIMIT 1;
        IF v_result_id IS NOT NULL THEN RETURN v_result_id; END IF;
    END IF;

    SELECT ur.user_id INTO v_result_id FROM public.user_roles ur
     WHERE ur.role = 'HRAdmin' ORDER BY ur.user_id LIMIT 1;
    IF v_result_id IS NOT NULL THEN RETURN v_result_id; END IF;

    SELECT ur.user_id INTO v_result_id FROM public.user_roles ur
     WHERE ur.role = 'SystemAdmin' ORDER BY ur.user_id LIMIT 1;
    RETURN v_result_id;
END;
$$;

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

    SELECT COALESCE(MAX(SUBSTRING(token FROM 'AMPRI-\d{6}-(\d{3})')::integer), 0) + 1
    INTO v_seq FROM public.tickets
    WHERE token LIKE 'AMPRI-' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-%';

    v_token := 'AMPRI-' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-' || LPAD(v_seq::text, 3, '0');
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
      FROM public.tickets WHERE id = p_ticket_id;
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

    SELECT assigned_to INTO v_old_handler_id FROM public.tickets WHERE id = p_ticket_id;
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

CREATE OR REPLACE FUNCTION public.helpdesk_add_response(
    p_ticket_id uuid, p_author_id uuid, p_message text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_response_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
    IF p_author_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Author ID must match authenticated user';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tickets WHERE id = p_ticket_id) THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    INSERT INTO public.ticket_responses (ticket_id, author_id, message)
    VALUES (p_ticket_id, p_author_id, p_message)
    RETURNING id INTO v_response_id;

    RETURN v_response_id;
END;
$$;

-- route_ticket stays internal (20260725000003).
REVOKE EXECUTE ON FUNCTION public.route_ticket(text, uuid) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.route_ticket(text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.helpdesk_create_ticket(text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helpdesk_update_status(uuid, text, uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.helpdesk_assign_ticket(uuid, uuid, uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.helpdesk_add_response(uuid, uuid, text)               TO authenticated;

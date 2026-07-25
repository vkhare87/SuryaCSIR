-- ═══════════════════════════════════════════════════════════════════════
-- 20260725000002_helpdesk_identity_authz
-- Second half of the 2026-07-25 security audit fixes.
--
--   A3      staff had no link to auth.users. Every self-scoping RLS
--           predicate resolved the caller by matching an unconstrained,
--           HRAdmin-editable email text column and then comparing display
--           NAMES — so two staff sharing a name saw each other's rows.
--   B1      route_ticket returned an auth uuid from its role branch and a
--           staff."ID" from its division branch, into the same
--           tickets.assigned_to column. Tickets routed via a DivisionHead
--           were assigned to an id that could never match anyone, locking
--           the handler out of their own queue.
--   B4      route_ticket picked handlers with LIMIT 1 and no ORDER BY.
--   HIGH-2  helpdesk_create_ticket / _update_status / _assign_ticket are
--           SECURITY DEFINER with NO authorization check and a
--           client-supplied actor id — any authenticated user could drive
--           any ticket's status, reassign it, and forge the actor written
--           into ticket_events. helpdesk_add_response already had the
--           correct check; the other three simply omitted it.
--   HIGH-3  tickets / ticket_responses / ticket_events were USING(true).
--
-- Identity convention settled here: every actor column holds an
-- auth.users.id as text. That is the only identifier the database can
-- verify (auth.uid()); staff."ID" cannot be authenticated.
--
-- Rerun: idempotent.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. A3: link the HR roster to auth accounts ─────────────────────────

ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill only unambiguous matches: a staff email that maps to exactly one
-- account, and an account email that maps to exactly one staff row. Rows
-- with duplicate or missing emails are left NULL for HR to reconcile —
-- silently linking a guessed match is how the name-collision bug started.
WITH unique_staff AS (
    SELECT lower("Email") AS email, min("ID") AS staff_id
      FROM public.staff
     WHERE "Email" IS NOT NULL AND length(trim("Email")) > 0
     GROUP BY lower("Email")
    HAVING count(*) = 1
), unique_accounts AS (
    SELECT lower(email) AS email, min(user_id) AS user_id
      FROM public.user_profiles
     WHERE email IS NOT NULL AND length(trim(email)) > 0
     GROUP BY lower(email)
    HAVING count(*) = 1
)
UPDATE public.staff s
   SET user_id = ua.user_id
  FROM unique_staff us
  JOIN unique_accounts ua ON ua.email = us.email
 WHERE s."ID" = us.staff_id
   AND s.user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_user_id_key
    ON public.staff (user_id) WHERE user_id IS NOT NULL;

-- Resolve the caller's staff row by the verified link first, falling back
-- to the email match for accounts HR has not reconciled yet.
CREATE OR REPLACE FUNCTION public.caller_staff_name()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT "Name" FROM public.staff
     WHERE user_id = auth.uid()
        OR (user_id IS NULL AND lower("Email") = public.caller_email())
     ORDER BY (user_id = auth.uid()) DESC NULLS LAST
     LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.caller_staff_name() TO authenticated;

-- MED-9: self-scope `staff` on the verified link, not a name string.
-- (The relational predicates in 20260718000001 — projects."PrincipalInvestigator",
-- phd_students."SupervisorName" — still compare display names because those
-- COLUMNS store names; converting them to FKs is tracked as A3b.)
DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select" ON public.staff FOR SELECT TO authenticated
USING (
  public.caller_sees_all_personnel()
  OR public.caller_in_division("Division")
  OR user_id = auth.uid()
  OR (user_id IS NULL AND lower("Email") = public.caller_email())
);

-- ── 2. B1 + B4: route_ticket speaks one identifier, deterministically ───

CREATE OR REPLACE FUNCTION public.route_ticket(
    p_category     text,
    p_submitter_id text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_target_type text;
    v_target_id   text;
    v_result_id   text;
    v_div_code    text;
BEGIN
    -- Step 1: explicit override from helpdesk_routing.
    SELECT target_type, target_id
      INTO v_target_type, v_target_id
      FROM public.helpdesk_routing
     WHERE category = p_category;

    IF FOUND THEN
        IF v_target_type = 'role' THEN
            SELECT ur.user_id::text INTO v_result_id
              FROM public.user_roles ur
             WHERE ur.role = v_target_id
             ORDER BY ur.user_id
             LIMIT 1;
        ELSIF v_target_type = 'division' THEN
            -- divisions."divHoDID" references staff."ID"; resolve through the
            -- staff↔auth link so this branch returns the same kind of id as
            -- every other branch.
            SELECT s.user_id::text INTO v_result_id
              FROM public.divisions d
              JOIN public.staff s ON s."ID" = d."divHoDID"
             WHERE d."divCode" = v_target_id
               AND s.user_id IS NOT NULL
             LIMIT 1;
        END IF;
        IF v_result_id IS NOT NULL THEN
            RETURN v_result_id;
        END IF;
    END IF;

    -- Step 2: the submitter's own division head. p_submitter_id is an
    -- auth uuid, so find the submitter's staff row through the link.
    SELECT s."Division" INTO v_div_code
      FROM public.staff s
     WHERE s.user_id::text = p_submitter_id
     LIMIT 1;

    IF v_div_code IS NOT NULL THEN
        SELECT hod.user_id::text INTO v_result_id
          FROM public.divisions d
          JOIN public.staff hod ON hod."ID" = d."divHoDID"
         WHERE d."divCode" = v_div_code
           AND hod.user_id IS NOT NULL
         LIMIT 1;
        IF v_result_id IS NOT NULL THEN
            RETURN v_result_id;
        END IF;
    END IF;

    -- Steps 3-4: any HRAdmin, else any SystemAdmin. ORDER BY makes the
    -- choice reproducible instead of planner-dependent.
    SELECT ur.user_id::text INTO v_result_id
      FROM public.user_roles ur
     WHERE ur.role = 'HRAdmin'
     ORDER BY ur.user_id
     LIMIT 1;
    IF v_result_id IS NOT NULL THEN
        RETURN v_result_id;
    END IF;

    SELECT ur.user_id::text INTO v_result_id
      FROM public.user_roles ur
     WHERE ur.role = 'SystemAdmin'
     ORDER BY ur.user_id
     LIMIT 1;
    RETURN v_result_id;
END;
$$;

-- Migrate rows written under the old mixed convention: anything that is a
-- staff."ID" with a linked account becomes that account's uuid. Values that
-- are already uuids are left alone.
UPDATE public.tickets t
   SET submitted_by = s.user_id::text
  FROM public.staff s
 WHERE s."ID" = t.submitted_by AND s.user_id IS NOT NULL;

UPDATE public.tickets t
   SET assigned_to = s.user_id::text
  FROM public.staff s
 WHERE s."ID" = t.assigned_to AND s.user_id IS NOT NULL;

UPDATE public.ticket_responses r
   SET author_id = s.user_id::text
  FROM public.staff s
 WHERE s."ID" = r.author_id AND s.user_id IS NOT NULL;

UPDATE public.ticket_events e
   SET actor_id = s.user_id::text
  FROM public.staff s
 WHERE s."ID" = e.actor_id AND s.user_id IS NOT NULL;

COMMENT ON COLUMN public.tickets.submitted_by  IS 'auth.users.id as text';
COMMENT ON COLUMN public.tickets.assigned_to   IS 'auth.users.id as text';
COMMENT ON COLUMN public.ticket_responses.author_id IS 'auth.users.id as text';
COMMENT ON COLUMN public.ticket_events.actor_id     IS 'auth.users.id as text (or ''system'')';

-- ── 3. HIGH-2: authorization inside the SECURITY DEFINER RPCs ──────────
-- These bypass RLS by definition, so they are the authorization boundary.
-- Rules mirror src/lib/helpdesk/permissions.ts, which until now was the
-- ONLY place they existed.

CREATE OR REPLACE FUNCTION public.helpdesk_create_ticket(
    p_subject text,
    p_category text,
    p_urgency text,
    p_description text,
    p_submitted_by text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ticket_id uuid;
    v_token text;
    v_seq integer;
    v_assigned_to text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;
    IF p_submitted_by IS DISTINCT FROM auth.uid()::text THEN
        RAISE EXCEPTION 'submitter must be the authenticated user';
    END IF;

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
$$;

CREATE OR REPLACE FUNCTION public.helpdesk_update_status(
    p_ticket_id uuid,
    p_new_status text,
    p_actor_id text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_current_status text;
    v_submitted_by   text;
    v_assigned_to    text;
    v_caller         text := auth.uid()::text;
    v_allowed        boolean := false;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;
    IF p_actor_id IS DISTINCT FROM v_caller THEN
        RAISE EXCEPTION 'actor must be the authenticated user';
    END IF;

    SELECT status, submitted_by, assigned_to
      INTO v_current_status, v_submitted_by, v_assigned_to
      FROM public.tickets WHERE id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Authorization, mirroring canTransitionStatus / canReopenTicket:
    --   admin      : any valid transition
    --   handler    : Open→InProgress, InProgress→Resolved, Closed→InProgress
    --   submitter  : Resolved→Closed
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
    p_ticket_id uuid,
    p_new_handler_id text,
    p_actor_id text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_old_handler_id text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;
    IF p_actor_id IS DISTINCT FROM auth.uid()::text THEN
        RAISE EXCEPTION 'actor must be the authenticated user';
    END IF;
    -- canReassign(): admin roles only.
    IF NOT public.caller_is_admin() THEN
        RAISE EXCEPTION 'not authorized to reassign tickets';
    END IF;
    IF p_new_handler_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id::text = p_new_handler_id) THEN
        RAISE EXCEPTION 'handler is not a known user';
    END IF;

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
            jsonb_build_object('from', v_old_handler_id, 'to', p_new_handler_id));
END;
$$;

-- ── 4. HIGH-3: helpdesk rows are not institute-readable ────────────────
-- Helpdesk is where HRGrievance, Finance and personal complaints land, and
-- /helpdesk is an ALL_ROLES page — so USING(true) meant a Guest or Student
-- read every grievance in the institute.

DROP POLICY IF EXISTS "tickets_select" ON public.tickets;
CREATE POLICY "tickets_select" ON public.tickets FOR SELECT TO authenticated
USING (
    submitted_by = auth.uid()::text
    OR assigned_to = auth.uid()::text
    OR public.caller_is_admin()
    OR public.caller_has_role('Director')
);

DROP POLICY IF EXISTS "ticket_responses_select" ON public.ticket_responses;
CREATE POLICY "ticket_responses_select" ON public.ticket_responses FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_responses.ticket_id));

DROP POLICY IF EXISTS "ticket_events_select" ON public.ticket_events;
CREATE POLICY "ticket_events_select" ON public.ticket_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_events.ticket_id));

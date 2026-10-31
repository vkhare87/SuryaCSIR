-- ═══════════════════════════════════════════════════════════════════════
-- 20261101000001_contribution_requests
-- Operating Model Phase 1 — contribution requests and data stewards.
-- Plan: docs/superpowers/plans/2026-11-01-om-phase1-contribution-requests.md
--
--   1. `data_stewards` — who owns each data domain (optionally per division).
--   2. `contribution_requests` — a small owned ask: "confirm / fill this".
--      Status moves only through contribution_request_act(); the table is
--      read-only to clients. Requests never write canonical tables: an
--      accepted response is applied by the client through the same RLS-gated
--      write the edit modal uses.
--   3. `contribution_request_events` — append-only audit of every action.
--   4. `contribution_requests_sweep()` — daily cron raising "refresh" asks
--      for domains whose latest import is older than the steward's cadence.
--
-- Rerun: idempotent.
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 1. Tables ─────────────────────────────────────────────────────────────
-- Domains are exactly the client FileType keys.

CREATE TABLE IF NOT EXISTS public.data_stewards (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    domain        text NOT NULL CHECK (domain IN
                  ('divisions','staff','projects','projectStaff','phd','equipment','contractStaff')),
    division_code text,
    user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind          text NOT NULL DEFAULT 'steward' CHECK (kind IN ('accountable','steward')),
    cadence_days  integer NOT NULL DEFAULT 90 CHECK (cadence_days > 0),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (domain, division_code, user_id)
);

-- People on a request are SET NULL, not CASCADE: deleting a login must not
-- erase the audit trail of what was asked and answered.
CREATE TABLE IF NOT EXISTS public.contribution_requests (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    domain        text NOT NULL CHECK (domain IN
                  ('divisions','staff','projects','projectStaff','phd','equipment','contractStaff')),
    record_ref    text,
    division_code text,
    title         text NOT NULL CHECK (btrim(title) <> ''),
    reason        text NOT NULL DEFAULT '',
    -- Relative app path only: '/x' yes; '//x', '/\x', 'https://x' no.
    link          text CHECK (link IS NULL OR link ~ '^/([^/\\]|$)'),
    requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL = raised by the sweep
    assignee_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL = unowned
    delegate_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    status        text NOT NULL DEFAULT 'open' CHECK (status IN
                  ('open','prepared','submitted','needs_clarification','blocked','done','declined')),
    due_date      date,
    prefill       jsonb NOT NULL DEFAULT '{}',
    response      jsonb,
    dedupe_key    text UNIQUE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    resolved_at   timestamptz
);

CREATE TABLE IF NOT EXISTS public.contribution_request_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  uuid NOT NULL REFERENCES public.contribution_requests(id) ON DELETE CASCADE,
    actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL = the sweep
    action      text NOT NULL,
    from_status text,
    to_status   text NOT NULL,
    note        text,
    payload     jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contribution_requests_assignee_idx
    ON public.contribution_requests (assignee_id, status);
CREATE INDEX IF NOT EXISTS contribution_requests_delegate_idx
    ON public.contribution_requests (delegate_id, status);
CREATE INDEX IF NOT EXISTS contribution_requests_domain_idx
    ON public.contribution_requests (domain, division_code);
CREATE INDEX IF NOT EXISTS contribution_request_events_request_idx
    ON public.contribution_request_events (request_id, created_at);

DROP TRIGGER IF EXISTS contribution_requests_set_updated_at ON public.contribution_requests;
CREATE TRIGGER contribution_requests_set_updated_at
    BEFORE UPDATE ON public.contribution_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. Reviewer helper (used by RLS, so defined before the policies) ─────
-- Requester, admin, or a steward covering the request's domain/division.
-- INVOKER: data_stewards is institute-readable, so no elevation is needed.
CREATE OR REPLACE FUNCTION public.contribution_is_reviewer(r public.contribution_requests)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(r.requested_by = auth.uid(), false)
        OR public.caller_is_admin()
        OR EXISTS (
            SELECT 1 FROM public.data_stewards ds
             WHERE ds.user_id = auth.uid()
               AND ds.domain = r.domain
               AND (ds.division_code IS NULL OR ds.division_code = r.division_code)
        );
$$;

-- ── 3. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.data_stewards               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_request_events ENABLE ROW LEVEL SECURITY;

-- Ownership is non-PII operational metadata, same tier as import_events.
DROP POLICY IF EXISTS "data_stewards_select" ON public.data_stewards;
CREATE POLICY "data_stewards_select" ON public.data_stewards
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "contribution_requests_select" ON public.contribution_requests;
CREATE POLICY "contribution_requests_select" ON public.contribution_requests
    FOR SELECT TO authenticated
    USING (
        requested_by = auth.uid()
        OR assignee_id = auth.uid()
        OR delegate_id = auth.uid()
        OR public.contribution_is_reviewer(contribution_requests)
        OR public.caller_is_director()
        OR (public.caller_is_div_manager() AND public.caller_in_division(division_code))
    );

-- Readable exactly when the parent request is (the sub-select applies its RLS).
DROP POLICY IF EXISTS "contribution_request_events_select" ON public.contribution_request_events;
CREATE POLICY "contribution_request_events_select" ON public.contribution_request_events
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.contribution_requests r WHERE r.id = request_id));

-- ── 4. Table grants ───────────────────────────────────────────────────────
-- Default privileges (20260726000004) GRANT ALL on new tables. Narrow to
-- SELECT: every write goes through the SECURITY DEFINER RPCs below.
REVOKE ALL ON public.data_stewards, public.contribution_requests, public.contribution_request_events
    FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.data_stewards, public.contribution_requests, public.contribution_request_events
    TO authenticated;
GRANT  ALL ON public.data_stewards, public.contribution_requests, public.contribution_request_events
    TO service_role;

-- ── 5. Internal resolver ──────────────────────────────────────────────────
-- Division row before domain-wide; 'steward' before 'accountable'; oldest.
-- EXECUTE revoked from client roles; EXEMPT in check_security_definer.py.
CREATE OR REPLACE FUNCTION public.contribution_steward_for(p_domain text, p_division text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT ds.user_id
      FROM data_stewards ds
     WHERE ds.domain = p_domain
       AND (ds.division_code IS NULL OR ds.division_code = p_division)
     ORDER BY (ds.division_code IS NULL), (ds.kind <> 'steward'), ds.created_at
     LIMIT 1;
$$;

-- ── 6. RPCs ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.contribution_request_create(
    p_domain text, p_record_ref text, p_division text, p_title text, p_reason text,
    p_link text, p_due date, p_prefill jsonb, p_assignee uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_id    uuid;
    v_to    uuid;
    v_event uuid;
BEGIN
    -- Authorization: admin, Director, the division's manager, or a steward
    -- covering this domain/division.
    IF NOT COALESCE(
           public.caller_is_admin()
        OR public.caller_is_director()
        OR (public.caller_is_div_manager() AND public.caller_in_division(p_division))
        OR EXISTS (SELECT 1 FROM data_stewards ds
                    WHERE ds.user_id = v_uid AND ds.domain = p_domain
                      AND (ds.division_code IS NULL OR ds.division_code = p_division)),
        false) OR v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    IF p_domain IS NULL OR p_domain NOT IN
       ('divisions','staff','projects','projectStaff','phd','equipment','contractStaff') THEN
        RAISE EXCEPTION 'invalid_domain: %', p_domain;
    END IF;
    IF btrim(coalesce(p_title, '')) = '' THEN
        RAISE EXCEPTION 'title_required';
    END IF;
    IF p_link IS NOT NULL AND p_link !~ '^/([^/\\]|$)' THEN
        RAISE EXCEPTION 'invalid_link';
    END IF;
    IF p_prefill IS NOT NULL AND jsonb_typeof(p_prefill) <> 'object' THEN
        RAISE EXCEPTION 'invalid_prefill';
    END IF;

    v_to := coalesce(p_assignee, contribution_steward_for(p_domain, p_division));

    INSERT INTO contribution_requests
        (domain, record_ref, division_code, title, reason, link, requested_by,
         assignee_id, due_date, prefill)
    VALUES (p_domain, p_record_ref, p_division, btrim(p_title), coalesce(p_reason, ''),
            p_link, v_uid, v_to, p_due, coalesce(p_prefill, '{}'))
    RETURNING id INTO v_id;

    INSERT INTO contribution_request_events (request_id, actor_id, action, from_status, to_status, payload)
    VALUES (v_id, v_uid, 'created', NULL, 'open', coalesce(p_prefill, '{}'))
    RETURNING id INTO v_event;

    IF v_to IS NOT NULL THEN
        INSERT INTO notifications (user_id, kind, title, body, link, dedupe_key)
        VALUES (v_to, 'contribution', 'Data update requested', btrim(p_title),
                '/work?r=' || v_id, 'contribution:' || v_id || ':' || v_event)
        ON CONFLICT (user_id, dedupe_key) DO NOTHING;
    END IF;

    RETURN v_id;
END;
$$;

-- The transition table. Any (action, status) pair not listed raises
-- invalid_action; an action the caller's role on the request does not allow
-- raises not_authorized.
CREATE OR REPLACE FUNCTION public.contribution_request_act(
    p_id uuid, p_action text, p_note text, p_target uuid, p_response jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid      uuid := auth.uid();
    r          contribution_requests;
    v_from     text;
    v_to       text;
    v_note     text := nullif(btrim(p_note), '');
    v_assignee boolean;
    v_delegate boolean;
    v_reviewer boolean;
    v_steward  boolean;
    v_notify   uuid;
    v_title    text;
    v_event    uuid;
BEGIN
    SELECT * INTO r FROM contribution_requests WHERE id = p_id FOR UPDATE;

    -- Authorization block. Every operand is COALESCEd: on an unowned request
    -- assignee_id = auth.uid() is NULL, and NULL must deny, not allow.
    v_assignee := COALESCE(r.assignee_id = v_uid, false);
    v_delegate := COALESCE(r.delegate_id = v_uid, false);
    v_steward  := COALESCE(public.caller_is_admin() OR EXISTS (
                      SELECT 1 FROM data_stewards ds
                       WHERE ds.user_id = v_uid AND ds.domain = r.domain
                         AND (ds.division_code IS NULL OR ds.division_code = r.division_code)), false);
    v_reviewer := COALESCE(public.contribution_is_reviewer(r), false);
    IF v_uid IS NULL OR r.id IS NULL
       OR NOT (v_assignee OR v_delegate OR v_reviewer) THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    v_from := r.status;

    CASE p_action
    WHEN 'delegate' THEN
        IF NOT v_assignee THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'open' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        IF p_target IS NULL OR p_target = r.assignee_id THEN RAISE EXCEPTION 'invalid_target'; END IF;
        r.delegate_id := p_target;
        v_to := 'open';
        v_notify := p_target; v_title := 'Data update delegated to you';

    WHEN 'submit' THEN
        IF NOT (v_assignee OR v_delegate) THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from NOT IN ('open','needs_clarification') THEN
            RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
        END IF;
        IF p_response IS NULL OR jsonb_typeof(p_response) <> 'object' THEN
            RAISE EXCEPTION 'response_required';
        END IF;
        r.response := p_response;
        v_to := CASE WHEN v_assignee THEN 'submitted' ELSE 'prepared' END;

    WHEN 'confirm' THEN
        IF NOT v_assignee THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'prepared' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        v_to := 'submitted';

    WHEN 'confirm_unchanged' THEN
        IF NOT v_assignee THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'open' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        r.response := '{}';
        r.resolved_at := now();
        v_to := 'done';

    WHEN 'clarify' THEN
        IF NOT (v_assignee OR v_delegate) THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from NOT IN ('open','prepared') THEN
            RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
        END IF;
        IF v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;
        v_to := 'needs_clarification';
        v_notify := r.requested_by; v_title := 'Question on your data request';

    WHEN 'answer' THEN
        IF NOT v_reviewer THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'needs_clarification' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        IF v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;
        v_to := 'open';
        v_notify := r.assignee_id; v_title := 'Your question was answered';

    WHEN 'not_mine' THEN
        IF NOT v_assignee THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from NOT IN ('open','needs_clarification') THEN
            RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
        END IF;
        r.assignee_id := contribution_steward_for(r.domain, r.division_code);
        -- The domain's only steward saying "not mine" leaves it unowned
        -- (Unowned tab) rather than bouncing it back to them.
        IF r.assignee_id = v_uid THEN r.assignee_id := NULL; END IF;
        r.delegate_id := NULL;
        v_to := 'open';
        v_notify := r.assignee_id; v_title := 'Data update routed to you';

    WHEN 'cannot_provide' THEN
        IF NOT v_assignee THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from NOT IN ('open','needs_clarification') THEN
            RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
        END IF;
        IF v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;
        v_to := 'blocked';
        v_notify := r.requested_by; v_title := 'Data request cannot be provided';

    WHEN 'accept' THEN
        IF NOT v_reviewer THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'submitted' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        r.resolved_at := now();
        v_to := 'done';
        v_notify := r.assignee_id; v_title := 'Your update was accepted';

    WHEN 'return' THEN
        IF NOT v_reviewer THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'submitted' THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        IF v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;
        v_to := 'open';
        v_notify := r.assignee_id; v_title := 'Your update was returned';

    WHEN 'withdraw' THEN
        IF NOT v_reviewer THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from IN ('done','declined') THEN RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from; END IF;
        IF v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;
        r.resolved_at := now();
        v_to := 'declined';

    WHEN 'claim' THEN
        IF NOT v_steward THEN RAISE EXCEPTION 'not_authorized'; END IF;
        IF v_from <> 'open' OR r.assignee_id IS NOT NULL THEN
            RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
        END IF;
        r.assignee_id := coalesce(p_target, v_uid);
        v_to := 'open';
        IF r.assignee_id <> v_uid THEN
            v_notify := r.assignee_id; v_title := 'Data update assigned to you';
        END IF;

    ELSE
        RAISE EXCEPTION 'invalid_action: % from %', p_action, v_from;
    END CASE;

    UPDATE contribution_requests
       SET status      = v_to,
           assignee_id = r.assignee_id,
           delegate_id = r.delegate_id,
           response    = r.response,
           resolved_at = r.resolved_at
     WHERE id = p_id;

    INSERT INTO contribution_request_events (request_id, actor_id, action, from_status, to_status, note, payload)
    VALUES (p_id, v_uid, p_action, v_from, v_to, v_note, coalesce(p_response, '{}'))
    RETURNING id INTO v_event;

    IF v_notify IS NOT NULL THEN
        INSERT INTO notifications (user_id, kind, title, body, link, dedupe_key)
        VALUES (v_notify, 'contribution', v_title, r.title,
                '/work?r=' || p_id, 'contribution:' || p_id || ':' || v_event)
        ON CONFLICT (user_id, dedupe_key) DO NOTHING;
    END IF;

    RETURN v_to;
END;
$$;

CREATE OR REPLACE FUNCTION public.data_steward_set(
    p_domain text, p_division text, p_user uuid, p_kind text, p_cadence int
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT COALESCE(public.caller_is_admin(), false) THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    INSERT INTO data_stewards (domain, division_code, user_id, kind, cadence_days)
    VALUES (p_domain, p_division, p_user, coalesce(p_kind, 'steward'), coalesce(p_cadence, 90))
    ON CONFLICT (domain, division_code, user_id) DO UPDATE
        SET kind = EXCLUDED.kind, cadence_days = EXCLUDED.cadence_days
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.data_steward_remove(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT COALESCE(public.caller_is_admin(), false) THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;
    DELETE FROM data_stewards WHERE id = p_id;
END;
$$;

-- ── 7. The sweep ──────────────────────────────────────────────────────────
-- One "refresh" request per (domain, division) that has a 'steward' row and
-- whose latest import is missing or older than the shortest cadence there.
-- The latest import id is in the dedupe key, so a re-run is a no-op and a
-- new request appears only once a newer import has itself gone stale.
-- import_events is not division-scoped, so a division steward's staleness
-- follows the domain-wide latest import.
-- Cron-only: EXECUTE revoked from client roles; EXEMPT in
-- check_security_definer.py. Returns the number of requests raised.
CREATE OR REPLACE FUNCTION public.contribution_requests_sweep()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    s       record;
    v_n     integer := 0;
    v_id    uuid;
    v_to    uuid;
    v_event uuid;
BEGIN
    FOR s IN
        SELECT g.domain, g.division_code, li.id AS import_id
          FROM (SELECT domain, division_code, min(cadence_days) AS cadence_days
                  FROM data_stewards
                 WHERE kind = 'steward'
                 GROUP BY domain, division_code) g
          LEFT JOIN LATERAL (
                SELECT ie.id, ie.uploaded_at
                  FROM import_events ie
                 WHERE ie.file_type = g.domain
                 ORDER BY ie.uploaded_at DESC
                 LIMIT 1) li ON true
         WHERE li.id IS NULL
            OR li.uploaded_at < now() - make_interval(days => g.cadence_days)
    LOOP
        v_id := NULL;
        v_to := contribution_steward_for(s.domain, s.division_code);

        INSERT INTO contribution_requests
            (domain, division_code, title, reason, link, requested_by, assignee_id, dedupe_key)
        VALUES (s.domain, s.division_code,
                'Refresh ' || s.domain || ' data',
                CASE WHEN s.import_id IS NULL THEN 'No import has been recorded for this domain'
                     ELSE 'The latest import is older than the agreed refresh cadence' END,
                '/data', NULL, v_to,
                'stale:' || s.domain || ':' || coalesce(s.division_code, '*') || ':'
                    || coalesce(s.import_id::text, 'none'))
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id INTO v_id;

        IF v_id IS NOT NULL THEN
            v_n := v_n + 1;
            INSERT INTO contribution_request_events (request_id, actor_id, action, from_status, to_status)
            VALUES (v_id, NULL, 'created', NULL, 'open')
            RETURNING id INTO v_event;

            IF v_to IS NOT NULL THEN
                INSERT INTO notifications (user_id, kind, severity, title, body, link, dedupe_key)
                VALUES (v_to, 'contribution', 'warning', 'Data refresh due',
                        'Refresh ' || s.domain || ' data',
                        '/work?r=' || v_id, 'contribution:' || v_id || ':' || v_event)
                ON CONFLICT (user_id, dedupe_key) DO NOTHING;
            END IF;
        END IF;
    END LOOP;

    RETURN v_n;
END;
$$;

-- ── 8. Function grants ────────────────────────────────────────────────────
-- Default privileges hand authenticated EXECUTE on new functions, so the
-- internal ones are revoked explicitly.
REVOKE EXECUTE ON FUNCTION
    public.contribution_steward_for(text, text),
    public.contribution_requests_sweep()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contribution_requests_sweep() TO service_role;

REVOKE EXECUTE ON FUNCTION
    public.contribution_is_reviewer(public.contribution_requests),
    public.contribution_request_create(text, text, text, text, text, text, date, jsonb, uuid),
    public.contribution_request_act(uuid, text, text, uuid, jsonb),
    public.data_steward_set(text, text, uuid, text, int),
    public.data_steward_remove(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
    public.contribution_is_reviewer(public.contribution_requests),
    public.contribution_request_create(text, text, text, text, text, text, date, jsonb, uuid),
    public.contribution_request_act(uuid, text, text, uuid, jsonb),
    public.data_steward_set(text, text, uuid, text, int),
    public.data_steward_remove(uuid)
TO authenticated;

-- ── 9. Schedule ───────────────────────────────────────────────────────────
-- 01:45 UTC = 07:15 IST, after notifications-sweep. Upserts by job name.
SELECT cron.schedule('contribution-requests-sweep', '45 1 * * *',
                     'select public.contribution_requests_sweep()');

-- ── 10. Assert the outcome ────────────────────────────────────────────────
DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.contribution_requests', 'INSERT')
       OR has_table_privilege('authenticated', 'public.contribution_requests', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated can write contribution_requests — status could be patched from the client';
    END IF;

    IF has_table_privilege('authenticated', 'public.contribution_request_events', 'INSERT')
       OR has_table_privilege('authenticated', 'public.data_stewards', 'INSERT') THEN
        RAISE EXCEPTION 'authenticated can write contribution_request_events or data_stewards';
    END IF;

    IF has_function_privilege('authenticated', 'public.contribution_requests_sweep()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.contribution_steward_for(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can EXECUTE an internal contribution function';
    END IF;

    RAISE NOTICE 'contribution_requests: tables read-only to clients, sweep cron-only';
END $$;

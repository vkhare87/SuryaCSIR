-- ============================================================
-- 20261113000004_recruitment_and_acting
-- Enterprise P5 / EH2 permanent recruitment file · EG1 acting charge.
--
-- EH2: a drive's stage moves only by recruitment_advance() — one step
-- forward, or to Closed — and each move is an event with its order. The
-- browser can no longer write drive_stage. Posts in a drive point at the
-- sanctioned post they fill. Recruitment-rule checks stay OFF until the
-- recruitment rules are supplied (enterprise plan §7).
--
-- EG1: acting_assignments — "X acts as HoD of D1 from … to …", by office
-- order. While an assignment runs, caller_has_role() and
-- caller_in_division() treat the acting officer as holding the role (and
-- division); the day after it ends they do not. Only HOD, DivisionHead and
-- Director can be held in acting charge. entity_timeline gains acted_as:
-- the capacity the actor held on that day.
-- These two helpers decide RLS across the app: security review before merge.
-- Tests: scripts/db/people.db.test.ts.
-- ============================================================
BEGIN;

-- ── EH2 ────────────────────────────────────────────────────────────────
ALTER TABLE public.vacancy_posts
    ADD COLUMN IF NOT EXISTS sanctioned_post_id uuid REFERENCES public.sanctioned_posts(id) ON DELETE SET NULL;

-- advt_id copies the type of vacancy_advertisements.id: text in the repo
-- baseline, uuid on the live project (drift from before the baseline; the
-- first push of this file failed on it). Same approach as 20261102000007.
DO $$
DECLARE
    v_adv_type text;
BEGIN
    SELECT format_type(atttypid, atttypmod) INTO v_adv_type
      FROM pg_attribute WHERE attrelid = 'public.vacancy_advertisements'::regclass AND attname = 'id';
    EXECUTE format($sql$
        CREATE TABLE IF NOT EXISTS public.recruitment_events (
            id          bigserial PRIMARY KEY,
            advt_id     %s NOT NULL REFERENCES public.vacancy_advertisements(id) ON DELETE CASCADE,
            at          timestamptz NOT NULL DEFAULT now(),
            actor       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
            from_stage  text,
            to_stage    text NOT NULL,
            document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
            note        text
        )$sql$, v_adv_type);
END $$;
CREATE INDEX IF NOT EXISTS recruitment_events_advt_idx ON public.recruitment_events (advt_id, at);
ALTER TABLE public.recruitment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recruitment_events_select" ON public.recruitment_events;
CREATE POLICY "recruitment_events_select" ON public.recruitment_events FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.vacancy_advertisements a WHERE a.id = recruitment_events.advt_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.recruitment_events FROM authenticated, anon;
REVOKE ALL ON public.recruitment_events FROM anon;
GRANT SELECT ON public.recruitment_events TO authenticated;

-- The browser never moves a drive.
CREATE OR REPLACE FUNCTION public.vacancy_advertisements_guard_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'INSERT' THEN
            NEW.drive_stage := 'Advertised';
        ELSIF NEW.drive_stage IS DISTINCT FROM OLD.drive_stage THEN
            RAISE EXCEPTION 'A drive moves stage only through recruitment_advance';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_vacancy_advertisements_stage ON public.vacancy_advertisements;
CREATE TRIGGER trg_vacancy_advertisements_stage BEFORE INSERT OR UPDATE ON public.vacancy_advertisements
    FOR EACH ROW EXECUTE FUNCTION public.vacancy_advertisements_guard_stage();

CREATE OR REPLACE FUNCTION public.recruitment_advance(p_advt_id text, p_stage text, p_document_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_stages text[] := ARRAY['Advertised', 'Applications Closed', 'Screening', 'Interviews', 'Selection', 'Offers Issued', 'Joined', 'Closed'];
    v_from   text;
    v_advt   public.vacancy_advertisements%ROWTYPE;
BEGIN
    IF NOT coalesce(public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only HR moves a recruitment drive';
    END IF;
    SELECT * INTO v_advt FROM public.vacancy_advertisements WHERE id::text = p_advt_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Advertisement not found'; END IF;
    v_from := v_advt.drive_stage;
    IF NOT (p_stage = ANY (v_stages)) THEN RAISE EXCEPTION 'Unknown stage: %', p_stage; END IF;
    IF v_from = 'Closed' THEN RAISE EXCEPTION 'The drive is closed'; END IF;
    IF p_stage <> 'Closed' AND array_position(v_stages, p_stage) <> array_position(v_stages, v_from) + 1 THEN
        RAISE EXCEPTION 'From % the next stage is %', v_from, v_stages[array_position(v_stages, v_from) + 1];
    END IF;
    UPDATE public.vacancy_advertisements SET drive_stage = p_stage WHERE id = v_advt.id;
    INSERT INTO public.recruitment_events (advt_id, actor, from_stage, to_stage, document_id, note)
    VALUES (v_advt.id, auth.uid(), v_from, p_stage, p_document_id, nullif(btrim(p_note), ''));
END;
$$;

-- ── EG1 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acting_assignments (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role              text NOT NULL CHECK (role IN ('HOD', 'DivisionHead', 'Director')),
    division_code     text REFERENCES public.divisions("divCode") ON DELETE SET NULL,
    principal_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    acting_user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    from_on           date NOT NULL,
    to_on             date NOT NULL CHECK (to_on >= from_on),
    order_ref         text NOT NULL CHECK (btrim(order_ref) <> ''),
    created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CHECK ((role = 'Director') = (division_code IS NULL))
);
CREATE INDEX IF NOT EXISTS acting_assignments_acting_idx ON public.acting_assignments (acting_user_id, from_on, to_on);
ALTER TABLE public.acting_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acting_assignments_select" ON public.acting_assignments;
-- Office orders: everyone signed in and verified may see who acts for whom.
CREATE POLICY "acting_assignments_select" ON public.acting_assignments FOR SELECT TO authenticated
    USING (public.caller_is_verified());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.acting_assignments FROM authenticated, anon;
REVOKE ALL ON public.acting_assignments FROM anon;
GRANT SELECT ON public.acting_assignments TO authenticated;

-- Does the caller hold this role in acting charge today (and, if given,
-- for this division)? Keyed on auth.uid(); answers only about the caller.
CREATE OR REPLACE FUNCTION public.caller_acting_as(p_role text, p_division text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.acting_assignments a
     WHERE a.acting_user_id = (SELECT auth.uid())
       AND a.role = p_role
       AND public.ist_today() BETWEEN a.from_on AND a.to_on
       AND (p_division IS NULL OR a.division_code = p_division));
$$;
REVOKE ALL ON FUNCTION public.caller_acting_as(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_acting_as(text, text) TO authenticated, service_role;

-- Body is 20260718000004 plus the acting branch.
CREATE OR REPLACE FUNCTION public.caller_has_role(p_role text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.proposals_caller_has_role(p_role)
      OR (p_role IN ('HOD', 'DivisionHead', 'Director') AND public.caller_acting_as(p_role));
$$;

-- Body is 20260718000001 plus the acting branch.
CREATE OR REPLACE FUNCTION public.caller_in_division(p_div text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (public.caller_is_div_manager()
          AND public.caller_division() IS NOT NULL
          AND p_div = public.caller_division())
      OR (p_div IS NOT NULL AND (public.caller_acting_as('HOD', p_div) OR public.caller_acting_as('DivisionHead', p_div)));
$$;

-- The Director (or HR / MasterAdmin on the order) records an acting charge.
CREATE OR REPLACE FUNCTION public.acting_assign(
    p_role text, p_division text, p_principal uuid, p_acting uuid, p_from date, p_to date, p_order_ref text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT coalesce(public.proposals_caller_has_role('Director') OR public.caller_has_role('HRAdmin')
                    OR public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only the Director or HR records an acting charge';
    END IF;
    IF p_role = 'Director' AND NOT coalesce(public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'An acting Director is recorded by HR from the DG''s order';
    END IF;
    IF p_acting IS NULL OR p_acting = p_principal THEN RAISE EXCEPTION 'Name the acting officer'; END IF;
    IF p_acting = auth.uid() THEN RAISE EXCEPTION 'No one records their own acting charge'; END IF;
    INSERT INTO public.acting_assignments (role, division_code, principal_user_id, acting_user_id, from_on, to_on, order_ref, created_by)
    VALUES (p_role, CASE WHEN p_role = 'Director' THEN NULL ELSE nullif(btrim(p_division), '') END, p_principal, p_acting,
            p_from, p_to, btrim(p_order_ref), auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    VALUES (p_acting, 'acting-charge', 'info', 'Acting charge: ' || p_role || coalesce(' of ' || nullif(btrim(p_division), ''), ''),
            'From ' || to_char(p_from, 'DD Mon YYYY') || ' to ' || to_char(p_to, 'DD Mon YYYY') || ' (' || btrim(p_order_ref) || ')',
            '/', 'rule', 'acting:' || v_id);
    RETURN v_id;
END;
$$;

-- Ends a charge early (the principal returns). Never extends it.
CREATE OR REPLACE FUNCTION public.acting_end(p_id uuid, p_last_day date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT coalesce(public.proposals_caller_has_role('Director') OR public.caller_has_role('HRAdmin')
                    OR public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only the Director or HR ends an acting charge';
    END IF;
    UPDATE public.acting_assignments SET to_on = greatest(from_on, least(to_on, p_last_day)) WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found'; END IF;
END;
$$;

-- The capacity a user held on a day ("Acting HOD of D1"), for the record.
-- Office orders are not confidential within the institute.
CREATE OR REPLACE FUNCTION public.acting_capacity(p_user uuid, p_on date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'Acting ' || a.role || coalesce(' of ' || a.division_code, '') || ' (' || a.order_ref || ')'
    FROM public.acting_assignments a
   WHERE a.acting_user_id = p_user AND p_on BETWEEN a.from_on AND a.to_on
   ORDER BY a.from_on DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.acting_capacity(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acting_capacity(uuid, date) TO authenticated, service_role;

-- The record says in what capacity each actor acted: entity_timeline gains
-- acted_as (body is 20261113000002 plus the column).
CREATE OR REPLACE VIEW public.entity_timeline WITH (security_invoker = true) AS
SELECT t.*, public.acting_capacity(t.actor_user_id, (t.at AT TIME ZONE 'Asia/Kolkata')::date) AS acted_as
  FROM (
    SELECT 'project'::text AS entity_type, e.project_id AS entity_id, e.at, e.actor AS actor_user_id,
           e.kind, e.summary, 'project_events'::text AS source
      FROM public.project_events e
    UNION ALL
    SELECT lower(a.entity_type), a.entity_id::text, a.created_at, a.user_id, a.action, a.action, 'pms_audit_logs'
      FROM public.pms_audit_logs a
    UNION ALL
    SELECT 'contribution_request', c.request_id::text, c.created_at, c.actor_id,
           c.action, coalesce(c.note, coalesce(c.from_status || ' → ', '') || c.to_status), 'contribution_request_events'
      FROM public.contribution_request_events c
    UNION ALL
    SELECT l.entity_type, l.entity_id::text, l.created_at,
           CASE WHEN l.actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN l.actor_id::uuid END,
           l.action, l.entity_type || ' ' || l.action, 'audit_log'
      FROM public.audit_log l
    UNION ALL
    SELECT 'staff', p.staff_id, p.changed_at, p.user_id,
           'profile', 'Profile updated: ' || (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(p.changes) k),
           'staff_profile_changes'
      FROM public.staff_profile_changes p
    UNION ALL
    SELECT 'staff', c.staff_id, c.effective_on::timestamptz, c.created_by,
           lower(c.kind), initcap(lower(c.kind)) || coalesce(' — ' || nullif(c.detail ->> 'summary', ''), '')
               || coalesce(' (' || c.order_ref || ')', ''), 'staff_career_events'
      FROM public.staff_career_events c
    UNION ALL
    SELECT 'recruitment', r.advt_id::text, r.at, r.actor, 'stage', coalesce(r.from_stage || ' → ', '') || r.to_stage, 'recruitment_events'
      FROM public.recruitment_events r
  ) t;

REVOKE ALL ON FUNCTION public.recruitment_advance(text, text, uuid, text)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.acting_assign(text, text, uuid, uuid, date, date, text)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.acting_end(uuid, date)                                             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recruitment_advance(text, text, uuid, text)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acting_assign(text, text, uuid, uuid, date, date, text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acting_end(uuid, date)                                          TO authenticated, service_role;

COMMIT;

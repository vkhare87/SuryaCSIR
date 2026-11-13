-- ============================================================
-- 20261112000017_equipment_usage_log
-- Enterprise P3 / EP3 — usage logbook for major project instruments (§3.1),
-- and the PME desk counts for P3.
--
-- Required for an instrument bought on a project (equipment.project_id set)
-- whose cost is above csir_rule('project.major_equipment_threshold_inr').
-- Entries are only ever added: no update, no delete. Logged by the
-- scientist-in-charge (equipment.owner_user_id), the project's PI, or PME.
-- pme_compliance_counts() gives the desk three counts without exposing the
-- confidential declarations themselves.
-- Tests: scripts/db/compliance.db.test.ts.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.equipment_usage_log (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id  text NOT NULL REFERENCES public.equipment("UInsID") ON DELETE CASCADE,
    used_on       date NOT NULL,
    hours         numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    user_staff_id text REFERENCES public.staff("ID") ON DELETE SET NULL,
    project_id    text REFERENCES public.projects("ProjectID") ON DELETE SET NULL,
    purpose       text NOT NULL CHECK (btrim(purpose) <> ''),
    logged_by     uuid NOT NULL REFERENCES auth.users(id),
    logged_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equipment_usage_log_equipment_idx ON public.equipment_usage_log (equipment_id, used_on DESC);

ALTER TABLE public.equipment_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_usage_log_select" ON public.equipment_usage_log;
CREATE POLICY "equipment_usage_log_select" ON public.equipment_usage_log FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.equipment e WHERE e."UInsID" = equipment_usage_log.equipment_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.equipment_usage_log FROM authenticated, anon;
REVOKE ALL ON public.equipment_usage_log FROM anon;
GRANT SELECT ON public.equipment_usage_log TO authenticated;

-- Does this instrument need a logbook?
CREATE OR REPLACE FUNCTION public.equipment_logbook_required(p_equipment_id text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce((SELECT e.project_id IS NOT NULL
                          AND e.purchase_cost > public.csir_rule('project.major_equipment_threshold_inr')::numeric
                     FROM public.equipment e WHERE e."UInsID" = p_equipment_id), false);
$$;

CREATE OR REPLACE FUNCTION public.equipment_log_usage(
    p_equipment_id text, p_used_on date, p_hours numeric, p_user_staff_id text, p_purpose text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_e  public.equipment%ROWTYPE;
    v_id uuid;
BEGIN
    SELECT * INTO v_e FROM public.equipment WHERE "UInsID" = p_equipment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;
    IF NOT coalesce(v_e.owner_user_id = auth.uid()
                    OR public.caller_is_pme()
                    OR (v_e.project_id IS NOT NULL AND public.project_caller_is_pi(v_e.project_id)), false) THEN
        RAISE EXCEPTION 'Only the scientist-in-charge, the project''s PI or PME keeps this logbook';
    END IF;
    IF p_used_on IS NULL OR p_used_on > public.ist_today() THEN RAISE EXCEPTION 'Give the date it was used, today or earlier'; END IF;
    IF p_hours IS NULL OR p_hours <= 0 OR p_hours > 24 THEN RAISE EXCEPTION 'Hours must be above 0 and at most 24'; END IF;
    IF coalesce(btrim(p_purpose), '') = '' THEN RAISE EXCEPTION 'Say what it was used for'; END IF;
    INSERT INTO public.equipment_usage_log (equipment_id, used_on, hours, user_staff_id, project_id, purpose, logged_by)
    VALUES (p_equipment_id, p_used_on, p_hours, nullif(btrim(p_user_staff_id), ''), v_e.project_id, btrim(p_purpose), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Three counts for the PME desk. Definer so the desk sees how many
-- declarations are missing without reading any declaration.
CREATE OR REPLACE FUNCTION public.pme_compliance_counts()
RETURNS TABLE (declarations_missing integer, transfers_missing_docs integer, logbooks_idle integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT coalesce(public.caller_is_pme() OR public.caller_is_admin() OR public.caller_has_role('Director'), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN QUERY SELECT
        -- Meetings from 30 days back to 14 days ahead with a member yet to declare.
        (SELECT count(*)::int FROM public.meetings m
          WHERE m.status <> 'Cancelled'
            AND m.meeting_date BETWEEN public.ist_today() - 30 AND public.ist_today() + 14
            AND EXISTS (
                SELECT 1 FROM public.staff s
                 WHERE s.user_id IS NOT NULL
                   AND (s."ID" IN (SELECT c.chairperson_id FROM public.committees c WHERE c.id = m.committee_id
                                   UNION SELECT c.secretary_id FROM public.committees c WHERE c.id = m.committee_id
                                   UNION SELECT cm.staff_id FROM public.committee_members cm WHERE cm.committee_id = m.committee_id))
                   AND NOT EXISTS (SELECT 1 FROM public.coi_declarations d
                                    WHERE d.meeting_id = m.id AND d.member_user_id = s.user_id))),
        (SELECT count(DISTINCT g.project_id)::int FROM public.project_transfer_gaps() g),
        -- Logbook instruments with no entry in the last 30 days.
        (SELECT count(*)::int FROM public.equipment e
          WHERE public.equipment_logbook_required(e."UInsID")
            AND NOT EXISTS (SELECT 1 FROM public.equipment_usage_log l
                             WHERE l.equipment_id = e."UInsID" AND l.used_on >= public.ist_today() - 30));
END;
$$;

REVOKE ALL ON FUNCTION public.equipment_logbook_required(text)                           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipment_log_usage(text, date, numeric, text, text)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pme_compliance_counts()                                    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipment_logbook_required(text)                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_log_usage(text, date, numeric, text, text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pme_compliance_counts()                                 TO authenticated, service_role;

COMMIT;

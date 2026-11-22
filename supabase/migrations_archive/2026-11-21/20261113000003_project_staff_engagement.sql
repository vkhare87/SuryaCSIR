-- ============================================================
-- 20261113000003_project_staff_engagement
-- Enterprise P5 / EH3 — project staff engaged by the rules of §3.3
-- (CSIR OM 33/GIM&FGP/2025-CPD). Values come from csir_rules
-- (20261112000004): tenure cap, age relaxation, quorum, waitlist and
-- direct-engagement limits, leave.
--
--   project_staff_persons   one row per person (not per engagement)
--   project_selections      how they were chosen: SELECTION (NCS posting,
--                           committee with quorum), WAITLIST (valid 12
--                           months, project of 18+ months), or DIRECT
--                           (project under 12 months, reason recorded)
--   project_engagements     who worked on which project, when
--   project_staff_leave     leave per engagement (paid 12 a year;
--                           maternity 180; paternity 15)
-- Rules are read for the day of the decision (today), not the engagement
-- dates. project_engagement_check() lists every rule with ok / not ok / unknown;
-- project_engage() refuses when any is not ok. A rule whose data is missing
-- (no date of birth) is NOT ok — never assumed. The position catalogue
-- (max age per position) is not loaded yet: the age limit is then "unknown"
-- and does not block, and says so.
-- Tenure counts every engagement, less the PhD window (registration to
-- thesis submission). The legacy project_staff table stays for the importer;
-- its rows are brought in by project_staff_link_legacy (one person, or a
-- desk list where a name is on more than one row).
-- Tests: scripts/db/people.db.test.ts.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.project_staff_persons (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                   text NOT NULL CHECK (btrim(name) <> ''),
    born_on                date,
    category               text CHECK (category IN ('GEN', 'SC', 'ST', 'OBC', 'EWS', 'PwBD')),
    gender                 text,
    phd_registered_on      date,
    thesis_submitted_on    date,
    abroad_last_5y         boolean NOT NULL DEFAULT false,
    antecedents_verified_on date,
    created_at             timestamptz NOT NULL DEFAULT now(),
    CHECK (thesis_submitted_on IS NULL OR phd_registered_on IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.project_selections (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    position_code       text NOT NULL,
    mode                text NOT NULL CHECK (mode IN ('SELECTION', 'WAITLIST', 'DIRECT')),
    advert_ncs_ref      text,
    advert_on           date,
    committee           jsonb NOT NULL DEFAULT '[]',   -- [{name, role: 'CHAIR'|'MEMBER'}]
    exigency_note       text,
    waitlist_valid_until date,
    minutes_document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
    created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_engagements (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id     uuid NOT NULL REFERENCES public.project_staff_persons(id) ON DELETE CASCADE,
    project_id    text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    position_code text NOT NULL,
    from_on       date NOT NULL,
    to_on         date NOT NULL CHECK (to_on >= from_on),
    emoluments    numeric(12,2),
    selection_id  uuid REFERENCES public.project_selections(id) ON DELETE SET NULL,
    legacy_project_staff_id text,
    created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_engagements_person_idx ON public.project_engagements (person_id, from_on);

CREATE TABLE IF NOT EXISTS public.project_staff_leave (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id uuid NOT NULL REFERENCES public.project_engagements(id) ON DELETE CASCADE,
    kind          text NOT NULL CHECK (kind IN ('PAID', 'MATERNITY', 'PATERNITY', 'OTHER')),
    from_on       date NOT NULL,
    to_on         date NOT NULL CHECK (to_on >= from_on),
    recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    recorded_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_staff ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.project_staff_persons(id) ON DELETE SET NULL;

-- Who keeps this register: PME and HR (and MasterAdmin).
CREATE OR REPLACE FUNCTION public.project_staff_caller_keeps()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin'), false);
$$;

-- Personal data: keepers and institute-wide readers; a PI sees the people on
-- their own projects.
ALTER TABLE public.project_staff_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_staff_leave ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_engagements_select" ON public.project_engagements;
CREATE POLICY "project_engagements_select" ON public.project_engagements FOR SELECT TO authenticated
    USING (public.project_staff_caller_keeps() OR public.caller_sees_all_personnel() OR public.project_caller_is_party(project_id));
DROP POLICY IF EXISTS "project_selections_select" ON public.project_selections;
CREATE POLICY "project_selections_select" ON public.project_selections FOR SELECT TO authenticated
    USING (public.project_staff_caller_keeps() OR public.caller_sees_all_personnel() OR public.project_caller_is_party(project_id));
DROP POLICY IF EXISTS "project_staff_persons_select" ON public.project_staff_persons;
CREATE POLICY "project_staff_persons_select" ON public.project_staff_persons FOR SELECT TO authenticated
    USING (public.project_staff_caller_keeps() OR public.caller_sees_all_personnel()
           OR EXISTS (SELECT 1 FROM public.project_engagements e WHERE e.person_id = project_staff_persons.id));
DROP POLICY IF EXISTS "project_staff_leave_select" ON public.project_staff_leave;
CREATE POLICY "project_staff_leave_select" ON public.project_staff_leave FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.project_engagements e WHERE e.id = project_staff_leave.engagement_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.project_staff_persons, public.project_selections,
       public.project_engagements, public.project_staff_leave FROM authenticated, anon;
REVOKE ALL ON public.project_staff_persons, public.project_selections, public.project_engagements, public.project_staff_leave FROM anon;
GRANT SELECT ON public.project_staff_persons, public.project_selections, public.project_engagements, public.project_staff_leave TO authenticated;

-- ── Tenure ─────────────────────────────────────────────────────────────
-- Days engaged on any project up to p_on (plus an optional proposed
-- engagement), counted once where engagements overlap, less the PhD window.
CREATE OR REPLACE FUNCTION public.project_staff_tenure_days(
    p_person_id uuid, p_on date, p_extra_from date DEFAULT NULL, p_extra_to date DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$
  WITH spans AS (
      SELECT from_on, least(to_on, p_on) AS to_on FROM public.project_engagements
       WHERE person_id = p_person_id AND from_on <= p_on
      UNION ALL
      SELECT p_extra_from, p_extra_to WHERE p_extra_from IS NOT NULL
  ), days AS (
      SELECT DISTINCT d::date AS d FROM spans, generate_series(spans.from_on, spans.to_on, interval '1 day') d
  )
  SELECT count(*)::int FROM days, public.project_staff_persons p
   WHERE p.id = p_person_id
     AND NOT (p.phd_registered_on IS NOT NULL
              AND days.d >= p.phd_registered_on
              AND days.d <= coalesce(p.thesis_submitted_on, days.d));
$$;

-- ── The rules ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_engagement_check(
    p_person_id uuid, p_project_id text, p_position_code text, p_from date, p_to date, p_selection_id uuid DEFAULT NULL)
RETURNS TABLE (rule text, ok boolean, detail text)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
#variable_conflict use_column
DECLARE
    v_person  public.project_staff_persons%ROWTYPE;
    v_sel     public.project_selections%ROWTYPE;
    v_pr      public.projects%ROWTYPE;
    v_max_age integer;
    v_relax   integer;
    v_age     integer;
    v_cap     integer := public.csir_rule('project_staff.tenure_cap_years')::int;
    v_days    integer;
    v_months  integer;
    v_quorum  jsonb := public.csir_rule('project_staff.selection_quorum');
BEGIN
    SELECT * INTO v_person FROM public.project_staff_persons WHERE id = p_person_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Person not found'; END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Give the engagement dates'; END IF;
    IF p_selection_id IS NOT NULL THEN SELECT * INTO v_sel FROM public.project_selections WHERE id = p_selection_id; END IF;
    v_months := CASE WHEN v_pr.start_date IS NOT NULL AND v_pr.end_date IS NOT NULL
                     THEN (extract(year FROM age(v_pr.end_date, v_pr.start_date)) * 12 + extract(month FROM age(v_pr.end_date, v_pr.start_date)))::int END;

    -- Age, with relaxation by category (a woman candidate also gets the
    -- women's relaxation where the OM gives one).
    v_max_age := (public.csir_rules_value_or_null('project_staff.positions', public.ist_today()) -> p_position_code ->> 'max_age')::int;
    v_relax := greatest(coalesce((public.csir_rule('project_staff.age_relaxation_years') ->> v_person.category)::int, 0),
                        CASE WHEN lower(coalesce(v_person.gender, '')) IN ('f', 'female', 'woman')
                             THEN coalesce((public.csir_rule('project_staff.age_relaxation_years') ->> 'Women')::int, 0) ELSE 0 END);
    rule := 'age';
    IF v_person.born_on IS NULL THEN
        ok := false; detail := 'Date of birth missing';
    ELSIF v_max_age IS NULL THEN
        ok := NULL; detail := 'Position catalogue not loaded — enter project_staff.positions from the OM; age not checked';
    ELSE
        v_age := extract(year FROM age(coalesce(v_sel.advert_on, p_from), v_person.born_on))::int;
        ok := v_age <= v_max_age + v_relax;
        detail := 'Age ' || v_age || ', limit ' || v_max_age || CASE WHEN v_relax > 0 THEN ' + ' || v_relax || ' relaxation' ELSE '' END;
    END IF;
    RETURN NEXT;

    v_days := public.project_staff_tenure_days(p_person_id, p_to, p_from, p_to);
    rule := 'tenure'; ok := v_days <= floor(v_cap * 365.25);
    detail := round(v_days / 365.25, 1) || ' years on projects with this engagement (PhD period excluded); cap ' || v_cap || ' years';
    RETURN NEXT;

    rule := 'selection';
    IF p_selection_id IS NULL THEN
        ok := false; detail := 'Record how the person was selected';
    ELSIF v_sel.project_id <> p_project_id THEN
        ok := false; detail := 'A move to another project needs a fresh selection for that project';
    ELSE
        ok := true; detail := initcap(lower(v_sel.mode));
    END IF;
    RETURN NEXT;

    IF v_sel.mode IN ('SELECTION', 'WAITLIST') THEN
        rule := 'quorum';
        ok := (SELECT count(*) FROM jsonb_array_elements(v_sel.committee) c WHERE c ->> 'role' = 'CHAIR') >= (v_quorum ->> 'chair')::int
          AND (SELECT count(*) FROM jsonb_array_elements(v_sel.committee) c WHERE c ->> 'role' = 'MEMBER') >= (v_quorum ->> 'members')::int;
        detail := 'Committee: chair + ' || (v_quorum ->> 'members') || ' members needed';
        RETURN NEXT;
    END IF;
    IF v_sel.mode = 'SELECTION' THEN
        rule := 'ncs_posting'; ok := coalesce(btrim(v_sel.advert_ncs_ref), '') <> '';
        detail := CASE WHEN ok THEN 'Posted on the NCS portal: ' || v_sel.advert_ncs_ref ELSE 'Record the NCS portal posting' END;
        RETURN NEXT;
    ELSIF v_sel.mode = 'WAITLIST' THEN
        rule := 'waitlist';
        ok := v_sel.waitlist_valid_until >= p_from
          AND coalesce(v_months, 0) >= public.csir_rule('project_staff.waitlist_min_project_months')::int;
        detail := 'Waitlist valid until ' || coalesce(v_sel.waitlist_valid_until::text, '—') || '; project of '
            || coalesce(v_months::text, '?') || ' months (needs ' || public.csir_rule('project_staff.waitlist_min_project_months')::text || '+)';
        RETURN NEXT;
    ELSIF v_sel.mode = 'DIRECT' THEN
        rule := 'direct';
        ok := v_months IS NOT NULL AND v_months < public.csir_rule('project_staff.direct_engagement_max_project_months')::int
          AND coalesce(btrim(v_sel.exigency_note), '') <> '';
        detail := 'Direct engagement needs a project under '
            || public.csir_rule('project_staff.direct_engagement_max_project_months')::text || ' months ('
            || coalesce(v_months::text, 'dates missing') || ') and the reason recorded';
        RETURN NEXT;
    END IF;

    rule := 'antecedents';
    ok := NOT v_person.abroad_last_5y OR v_person.antecedents_verified_on IS NOT NULL;
    detail := CASE WHEN NOT v_person.abroad_last_5y THEN 'Not abroad in the last 5 years'
                   WHEN ok THEN 'Antecedents verified ' || v_person.antecedents_verified_on
                   ELSE 'Abroad in the last 5 years: verify antecedents first' END;
    RETURN NEXT;
END;
$$;

-- A rule value, or NULL where none is on record (for an optional catalogue).
CREATE OR REPLACE FUNCTION public.csir_rules_value_or_null(p_key text, p_on date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT r.value FROM public.csir_rules r
   WHERE r.rule_key = p_key AND r.effective_from <= p_on AND (r.effective_to IS NULL OR r.effective_to >= p_on)
   ORDER BY r.effective_from DESC LIMIT 1;
$$;

-- ── Writes ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_staff_person_save(p_id uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid := p_id;
BEGIN
    IF NOT (public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only PME or HR keeps project staff records';
    END IF;
    IF coalesce(btrim(p ->> 'name'), '') = '' THEN RAISE EXCEPTION 'Give the name'; END IF;
    IF v_id IS NULL THEN
        INSERT INTO public.project_staff_persons (name) VALUES (btrim(p ->> 'name')) RETURNING id INTO v_id;
    END IF;
    UPDATE public.project_staff_persons SET
        name = btrim(p ->> 'name'),
        born_on = (p ->> 'born_on')::date,
        category = nullif(p ->> 'category', ''),
        gender = nullif(p ->> 'gender', ''),
        phd_registered_on = (p ->> 'phd_registered_on')::date,
        thesis_submitted_on = (p ->> 'thesis_submitted_on')::date,
        abroad_last_5y = coalesce((p ->> 'abroad_last_5y')::boolean, false),
        antecedents_verified_on = (p ->> 'antecedents_verified_on')::date
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Person not found'; END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_selection_create(
    p_project_id text, p_position_code text, p_mode text, p_advert_ncs_ref text, p_advert_on date,
    p_committee jsonb, p_exigency_note text, p_waitlist_valid_until date, p_minutes_document_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT (public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only PME or HR records a selection';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE "ProjectID" = p_project_id) THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF p_mode NOT IN ('SELECTION', 'WAITLIST', 'DIRECT') THEN RAISE EXCEPTION 'Selection, waitlist or direct engagement'; END IF;
    IF coalesce(btrim(p_position_code), '') = '' THEN RAISE EXCEPTION 'Give the position'; END IF;
    INSERT INTO public.project_selections (project_id, position_code, mode, advert_ncs_ref, advert_on, committee, exigency_note,
                                           waitlist_valid_until, minutes_document_id, created_by)
    VALUES (p_project_id, btrim(p_position_code), p_mode, nullif(btrim(p_advert_ncs_ref), ''), p_advert_on,
            coalesce(p_committee, '[]'), nullif(btrim(p_exigency_note), ''), p_waitlist_valid_until, p_minutes_document_id, auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_engage(
    p_selection_id uuid, p_person_id uuid, p_from date, p_to date, p_emoluments numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sel  public.project_selections%ROWTYPE;
    v_fail text;
    v_id   uuid;
BEGIN
    IF NOT (public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only PME or HR engages project staff';
    END IF;
    SELECT * INTO v_sel FROM public.project_selections WHERE id = p_selection_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Selection not found'; END IF;
    SELECT string_agg(c.detail, '; ') INTO v_fail
      FROM public.project_engagement_check(p_person_id, v_sel.project_id, v_sel.position_code, p_from, p_to, p_selection_id) c
     WHERE c.ok = false;
    IF v_fail IS NOT NULL THEN RAISE EXCEPTION 'Cannot engage: %', v_fail; END IF;
    INSERT INTO public.project_engagements (person_id, project_id, position_code, from_on, to_on, emoluments, selection_id, created_by)
    VALUES (p_person_id, v_sel.project_id, v_sel.position_code, p_from, p_to, p_emoluments, p_selection_id, auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
    VALUES (v_sel.project_id, auth.uid(), 'staff',
            'Engaged ' || (SELECT name FROM public.project_staff_persons WHERE id = p_person_id) || ' as ' || v_sel.position_code
                || ' from ' || to_char(p_from, 'DD Mon YYYY') || ' to ' || to_char(p_to, 'DD Mon YYYY'), v_id::text);
    RETURN v_id;
END;
$$;

-- Leave within the yearly / per-event limits.
CREATE OR REPLACE FUNCTION public.project_staff_leave_add(p_engagement_id uuid, p_kind text, p_from date, p_to date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_days  integer := p_to - p_from + 1;
    v_limit integer;
    v_used  integer;
    v_id    uuid;
BEGIN
    IF NOT (public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only PME or HR records leave';
    END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Give the leave dates'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_engagements WHERE id = p_engagement_id AND p_from >= from_on AND p_to <= to_on) THEN
        RAISE EXCEPTION 'Leave must fall within the engagement';
    END IF;
    IF p_kind = 'PAID' THEN
        v_limit := public.csir_rule('project_staff.paid_leave_days_per_year')::int;
        SELECT coalesce(sum(to_on - from_on + 1), 0) INTO v_used FROM public.project_staff_leave
         WHERE engagement_id = p_engagement_id AND kind = 'PAID' AND public.fiscal_year_of(from_on) = public.fiscal_year_of(p_from);
        IF v_used + v_days > v_limit THEN RAISE EXCEPTION 'Paid leave: % of % days used this year', v_used, v_limit; END IF;
    ELSIF p_kind IN ('MATERNITY', 'PATERNITY') THEN
        v_limit := public.csir_rule(CASE p_kind WHEN 'MATERNITY' THEN 'project_staff.maternity_leave_days' ELSE 'project_staff.paternity_leave_days' END)::int;
        IF v_days > v_limit THEN RAISE EXCEPTION '% leave is up to % days', initcap(lower(p_kind)), v_limit; END IF;
    ELSIF p_kind <> 'OTHER' THEN
        RAISE EXCEPTION 'Paid, maternity, paternity or other';
    END IF;
    INSERT INTO public.project_staff_leave (engagement_id, kind, from_on, to_on, recorded_by)
    VALUES (p_engagement_id, p_kind, p_from, p_to, auth.uid()) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ── Legacy rows ────────────────────────────────────────────────────────
-- Names on more than one legacy row, for PME to decide: one person or several.
CREATE OR REPLACE FUNCTION public.project_staff_legacy_pending()
RETURNS TABLE (name_key text, legacy_ids text[], names text[], projects text[])
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.person_name_key(ps."StaffName"), array_agg(ps.id ORDER BY ps.id), array_agg(DISTINCT ps."StaffName"),
         array_agg(DISTINCT coalesce(ps.project_id, ps."ProjectNo"))
    FROM public.project_staff ps
   WHERE ps.person_id IS NULL AND public.person_name_key(ps."StaffName") IS NOT NULL
   GROUP BY 1
  HAVING count(*) > 1
   ORDER BY 1;
$$;

-- Bring legacy rows in as one person (new, or p_person_id) with an
-- engagement per row that has a project and a joining date. The rules are
-- not run on legacy engagements: they record what happened.
-- Internal: one person (new or given) for these legacy rows, with an
-- engagement per row that has a project and a joining date. The rules are
-- not run on legacy engagements: they record what happened.
CREATE OR REPLACE FUNCTION public.project_staff_link_rows(p_legacy_ids text[], p_person_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_person uuid := p_person_id;
    r        record;
BEGIN
    IF v_person IS NULL THEN
        INSERT INTO public.project_staff_persons (name)
        SELECT btrim(ps."StaffName") FROM public.project_staff ps WHERE ps.id = p_legacy_ids[1]
        RETURNING id INTO v_person;
        IF v_person IS NULL THEN RAISE EXCEPTION 'Legacy row % not found', p_legacy_ids[1]; END IF;
    END IF;
    FOR r IN SELECT * FROM public.project_staff ps WHERE ps.id = ANY (p_legacy_ids) AND ps.person_id IS NULL LOOP
        IF r.project_id IS NOT NULL AND r.joined_on IS NOT NULL THEN
            INSERT INTO public.project_engagements (person_id, project_id, position_code, from_on, to_on, legacy_project_staff_id, created_by)
            VALUES (v_person, r.project_id, coalesce(nullif(btrim(r."Designation"), ''), 'UNSPECIFIED'), r.joined_on,
                    greatest(coalesce(r.project_ends_on, (SELECT end_date FROM public.projects WHERE "ProjectID" = r.project_id), r.joined_on), r.joined_on),
                    r.id, auth.uid());
        END IF;
        UPDATE public.project_staff SET person_id = v_person WHERE id = r.id;
    END LOOP;
    RETURN v_person;
END;
$$;
REVOKE ALL ON FUNCTION public.project_staff_link_rows(text[], uuid) FROM PUBLIC, anon, authenticated;

-- PME decides a name on the desk list: these rows are one person.
CREATE OR REPLACE FUNCTION public.project_staff_link_legacy(p_legacy_ids text[], p_person_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT (public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only PME or HR brings legacy project staff in';
    END IF;
    IF coalesce(cardinality(p_legacy_ids), 0) = 0 THEN RAISE EXCEPTION 'Choose the legacy rows'; END IF;
    RETURN public.project_staff_link_rows(p_legacy_ids, p_person_id);
END;
$$;

-- Every unlinked legacy row whose name appears once becomes its own person.
-- Run now, and again by PME after an import. Names on several rows stay on
-- the desk list (project_staff_legacy_pending).
CREATE OR REPLACE FUNCTION public.project_staff_backfill()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r   record;
    v_n integer := 0;
BEGIN
    IF auth.uid() IS NOT NULL
       AND NOT (public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only PME or HR brings legacy project staff in';
    END IF;
    FOR r IN
        SELECT min(ps.id) AS id FROM public.project_staff ps
         WHERE ps.person_id IS NULL AND public.person_name_key(ps."StaffName") IS NOT NULL
         GROUP BY public.person_name_key(ps."StaffName") HAVING count(*) = 1
    LOOP
        PERFORM public.project_staff_link_rows(ARRAY[r.id], NULL);
        v_n := v_n + 1;
    END LOOP;
    RETURN v_n;
END;
$$;

SELECT public.project_staff_backfill();

REVOKE ALL ON FUNCTION public.project_staff_caller_keeps()                                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_staff_tenure_days(uuid, date, date, date)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.csir_rules_value_or_null(text, date)                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_engagement_check(uuid, text, text, date, date, uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_staff_person_save(uuid, jsonb)                             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_selection_create(text, text, text, text, date, jsonb, text, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_engage(uuid, uuid, date, date, numeric)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_staff_leave_add(uuid, text, date, date)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_staff_legacy_pending()                                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_staff_link_legacy(text[], uuid)                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_staff_backfill()                                           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_staff_caller_keeps()                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_tenure_days(uuid, date, date, date)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.csir_rules_value_or_null(text, date)                            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_engagement_check(uuid, text, text, date, date, uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_person_save(uuid, jsonb)                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_selection_create(text, text, text, text, date, jsonb, text, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_engage(uuid, uuid, date, date, numeric)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_leave_add(uuid, text, date, date)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_legacy_pending()                                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_link_legacy(text[], uuid)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_staff_backfill()                                        TO authenticated, service_role;

COMMIT;

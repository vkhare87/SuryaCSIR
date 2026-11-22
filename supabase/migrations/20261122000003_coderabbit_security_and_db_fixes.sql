-- ============================================================
-- 20261122000003_coderabbit_security_and_db_fixes
-- Fixes 13 security and data-integrity defects surfaced by CodeRabbit review
-- across existing migrations without modifying already-applied migration files:
--   1. Break recursive RLS evaluation between publication_files and
--      publication_author_consents via caller_consents_to_file().
--   2. Reconsider orphaned automatic identity links (link_source = 'auto'
--      after ON DELETE SET NULL) while still respecting manual clears.
--   3. Align proposal_save_copis() with proposals.status & proposal_copis RLS.
--   4. Filter project_cpd_halfyearly() expenditure by covered period end date.
--   5. Prevent acting_end() from leaving authority active on future start dates.
--   6. Reject WAITLIST selections with NULL waitlist_valid_until.
--   7. Enforce the 12-month WAITLIST lifetime using waitlist_valid_from.
--   8. Count later booked engagements in project_engagement_check() tenure cap.
--   9. Allocate PAID leave across every fiscal year the leave range covers.
--  10. Enforce chair_decision IS NULL atomically inside coi_declare() upsert.
--  11. Pass snapshot as_on year to year-dependent metrics in metric_table().
--  12. Verify current author/inventor name still matches staff_id in
--      notification_accept() before calling identity_set_link().
--  13. Restrict equipment deletion while equipment_usage_log entries exist.
-- ============================================================
BEGIN;

-- ── 1. Break publication RLS mutual recursion (42P17) ──────────────────────
CREATE OR REPLACE FUNCTION public.caller_consents_to_file(p_file_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.publication_author_consents c
         WHERE c.file_id = p_file_id
           AND c.staff_id = public.caller_staff_id()
    );
$$;
REVOKE ALL ON FUNCTION public.caller_consents_to_file(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_consents_to_file(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS publication_files_select ON public.publication_files;
CREATE POLICY publication_files_select ON public.publication_files
    FOR SELECT TO authenticated
    USING (
        created_by = (SELECT auth.uid())
        OR public.caller_is_publication_clearer(division_code)
        OR public.caller_consents_to_file(publication_files.id)
    );

-- ── 2. Reconsider orphaned automatic identity links ────────────────────────
CREATE OR REPLACE FUNCTION public.identity_autolink(p_kind text, p_record_id text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n integer;
BEGIN
    IF p_kind = 'OUTPUT' THEN
        UPDATE public.output_authors a SET staff_id = m.staff_id, link_source = 'auto'
          FROM (SELECT public.person_name_key("Name") AS k, min("ID") AS staff_id
                  FROM public.staff GROUP BY 1 HAVING count(*) = 1) m
         WHERE m.k = public.person_name_key(a.author_name)
           AND a.staff_id IS NULL
           AND (a.link_source IS NULL OR a.link_source = 'auto')
           AND (p_record_id IS NULL OR a.output_id = p_record_id);
    ELSIF p_kind = 'IP' THEN
        UPDATE public.ip_inventors a SET staff_id = m.staff_id, link_source = 'auto'
          FROM (SELECT public.person_name_key("Name") AS k, min("ID") AS staff_id
                  FROM public.staff GROUP BY 1 HAVING count(*) = 1) m
         WHERE m.k = public.person_name_key(a.author_name)
           AND a.staff_id IS NULL
           AND (a.link_source IS NULL OR a.link_source = 'auto')
           AND (p_record_id IS NULL OR a.ip_id = p_record_id);
    ELSE
        RAISE EXCEPTION 'Unknown kind: %', p_kind;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.identity_autolink(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.identity_link_gaps()
RETURNS TABLE (kind text, record_id text, name text, candidates integer, pos integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT coalesce(public.caller_is_admin() OR public.caller_has_role('Director'), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN QUERY
    WITH names AS (
        SELECT 'OUTPUT'::text AS kind, a.output_id AS record_id, a.author_name AS name, a.pos
          FROM public.output_authors a
         WHERE a.staff_id IS NULL AND (a.link_source IS NULL OR a.link_source = 'auto')
        UNION ALL
        SELECT 'IP', i.ip_id, i.author_name, i.pos
          FROM public.ip_inventors i
         WHERE i.staff_id IS NULL AND (i.link_source IS NULL OR i.link_source = 'auto')
    ), scored AS (
        SELECT n.*, (SELECT count(*)::int FROM public.staff s
                      WHERE length(public.person_name_key(n.name)) >= 3
                        AND (public.person_name_key(s."Name") = public.person_name_key(n.name)
                             OR strpos(public.person_name_key(s."Name"), public.person_name_key(n.name)) > 0
                             OR strpos(public.person_name_key(n.name), public.person_name_key(s."Name")) > 0)) AS c
          FROM names n
    )
    SELECT s.kind, s.record_id, s.name, s.c, s.pos FROM scored s WHERE s.c > 0
    UNION ALL
    SELECT g.table_name || '.' || g.name_column, g.row_key, g.unresolved_name,
           (SELECT count(*)::int FROM public.staff s
             WHERE public.person_name_key(s."Name") = public.person_name_key(g.unresolved_name)),
           NULL::integer
      FROM public.staff_link_gaps g
    ORDER BY 1, 2, 5;
END;
$$;
REVOKE ALL ON FUNCTION public.identity_link_gaps() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_link_gaps() TO authenticated, service_role;

-- ── 3. Align proposal_save_copis() with proposals.status & RLS policies ────
CREATE OR REPLACE FUNCTION public.proposal_save_copis(
    p_proposal_id uuid,
    p_copis       jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_p public.proposals%ROWTYPE;
BEGIN
    SELECT * INTO v_p FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proposal not found';
    END IF;
    IF v_p.created_by <> (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'Not your proposal';
    END IF;
    IF v_p.status NOT IN ('DRAFT', 'REVISION_REQUESTED') THEN
        RAISE EXCEPTION 'Co-PIs can only be modified while DRAFT or REVISION_REQUESTED';
    END IF;
    IF p_copis IS NOT NULL AND jsonb_typeof(p_copis) <> 'array' THEN
        RAISE EXCEPTION 'p_copis must be a JSON array';
    END IF;

    DELETE FROM public.proposal_copis WHERE proposal_id = p_proposal_id;

    IF jsonb_array_length(coalesce(p_copis, '[]'::jsonb)) > 0 THEN
        INSERT INTO public.proposal_copis (proposal_id, staff_id, staff_name)
        SELECT p_proposal_id, x.staff_id, x.staff_name
          FROM jsonb_to_recordset(p_copis) AS x(staff_id text, staff_name text);
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.proposal_save_copis(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_save_copis(uuid, jsonb) TO authenticated, service_role;

-- ── 4. Exclude post-cutoff expenditure statements in project_cpd_halfyearly ─
CREATE OR REPLACE FUNCTION public.project_cpd_halfyearly(p_period_end date)
RETURNS TABLE (project_id text, project_no text, title text, pi text, category text, stage text,
               start_date date, end_date date,
               reviews_due integer, reviews_held integer, reviews_missed integer, last_review_on date,
               received numeric, spent numeric, milestones_achieved integer, milestones_total integer,
               reports_submitted integer)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH period AS (SELECT (p_period_end - interval '6 months' + interval '1 day')::date AS from_on, p_period_end AS to_on),
review_slots AS (
    SELECT s.* FROM public.project_review_slots s, period
     WHERE s.kind <> 'PROGRESS_REPORT' AND s.status <> 'CANCELLED'
       AND s.due_date BETWEEN period.from_on AND period.to_on
)
SELECT p."ProjectID", p."ProjectNo", p."ProjectName",
       coalesce((SELECT pr.pi_name FROM public.proposals pr WHERE pr.id = p.proposal_id),
                (SELECT st."Name" FROM public.staff st WHERE st."ID" = p.pi_staff_id), p."PrincipalInvestigator"),
       public.project_category(p."ProjectID"),
       p.stage, p.start_date, p.end_date,
       (SELECT count(*)::int FROM review_slots s WHERE s.project_id = p."ProjectID"),
       (SELECT count(*)::int FROM review_slots s WHERE s.project_id = p."ProjectID" AND s.status = 'DONE'),
       (SELECT count(*)::int FROM review_slots s WHERE s.project_id = p."ProjectID" AND s.status = 'PENDING'
                                                  AND s.due_date < public.ist_today()),
       (SELECT max(s.held_on) FROM public.project_review_slots s WHERE s.project_id = p."ProjectID"
                                                                 AND s.status = 'DONE' AND s.held_on <= p_period_end),
       (SELECT coalesce(sum(r.amount), 0) FROM public.project_fund_receipts r WHERE r.project_id = p."ProjectID" AND r.received_on <= p_period_end),
       (SELECT coalesce(sum(e.amount), 0)
          FROM public.project_expenditure e
         WHERE e.project_id = p."ProjectID"
           AND CASE e.period
                   WHEN 'Q1' THEN make_date(left(e.fiscal_year, 4)::int, 6, 30)
                   WHEN 'Q2' THEN make_date(left(e.fiscal_year, 4)::int, 9, 30)
                   WHEN 'H1' THEN make_date(left(e.fiscal_year, 4)::int, 9, 30)
                   WHEN 'Q3' THEN make_date(left(e.fiscal_year, 4)::int, 12, 31)
                   ELSE make_date(left(e.fiscal_year, 4)::int + 1, 3, 31)
               END <= p_period_end),
       (SELECT count(*)::int FROM public.project_milestones m WHERE m.project_id = p."ProjectID" AND m.status = 'ACHIEVED' AND m.achieved_on <= p_period_end),
       (SELECT count(*)::int FROM public.project_milestones m WHERE m.project_id = p."ProjectID" AND m.status <> 'DROPPED'),
       (SELECT count(*)::int FROM public.project_reports r, period WHERE r.project_id = p."ProjectID"
                                                                 AND r.submitted_at::date BETWEEN period.from_on AND period.to_on)
  FROM public.projects p, period
 WHERE p.track = 'HQ'
   AND p.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING', 'CLOSED', 'FORECLOSED', 'ARCHIVED')
   AND (p.start_date IS NULL OR p.start_date <= period.to_on)
   AND (p.end_date IS NULL OR p.end_date >= period.from_on)
 ORDER BY p."ProjectNo";
$$;

-- ── 5. Prevent acting_end() from keeping authority active on future start ──
CREATE OR REPLACE FUNCTION public.acting_end(p_id uuid, p_last_day date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_row public.acting_assignments%ROWTYPE;
BEGIN
    IF NOT coalesce(public.proposals_caller_has_role('Director') OR public.caller_has_role('HRAdmin')
                    OR public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only the Director or HR ends an acting charge';
    END IF;
    IF p_last_day IS NULL THEN
        RAISE EXCEPTION 'Give the last day';
    END IF;
    SELECT * INTO v_row FROM public.acting_assignments WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assignment not found';
    END IF;
    IF p_last_day < v_row.from_on THEN
        IF v_row.from_on > public.ist_today() THEN
            DELETE FROM public.acting_assignments WHERE id = p_id;
        ELSE
            RAISE EXCEPTION 'Last day (%) cannot be before start date (%) once the assignment has begun',
                p_last_day, v_row.from_on;
        END IF;
    ELSE
        UPDATE public.acting_assignments SET to_on = least(to_on, p_last_day) WHERE id = p_id;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.acting_end(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acting_end(uuid, date) TO authenticated, service_role;

-- ── 6, 7, 8, 9. Project staff waitlist lifetime/null, tenure cap & leave ─
ALTER TABLE public.project_selections
    ADD COLUMN IF NOT EXISTS waitlist_valid_from date;

UPDATE public.project_selections
   SET waitlist_valid_from = coalesce(advert_on, (created_at AT TIME ZONE 'Asia/Kolkata')::date)
 WHERE mode = 'WAITLIST'
   AND waitlist_valid_from IS NULL;

CREATE OR REPLACE FUNCTION public.project_selection_create(
    p_project_id text, p_position_code text, p_mode text, p_advert_ncs_ref text, p_advert_on date,
    p_committee jsonb, p_exigency_note text, p_waitlist_valid_until date, p_minutes_document_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id              uuid;
    v_waitlist_months integer := public.csir_rule('project_staff.waitlist_validity_months')::int;
    v_valid_from      date;
BEGIN
    IF NOT (public.caller_is_pme() OR public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only PME or HR records a selection';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE "ProjectID" = p_project_id) THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF p_mode NOT IN ('SELECTION', 'WAITLIST', 'DIRECT') THEN RAISE EXCEPTION 'Selection, waitlist or direct engagement'; END IF;
    IF coalesce(btrim(p_position_code), '') = '' THEN RAISE EXCEPTION 'Give the position'; END IF;
    IF p_mode = 'WAITLIST' THEN
        v_valid_from := coalesce(p_advert_on, public.ist_today());
        IF p_waitlist_valid_until IS NOT NULL THEN
            IF p_waitlist_valid_until < v_valid_from THEN
                RAISE EXCEPTION 'Waitlist validity end date (%) cannot be before %', p_waitlist_valid_until, v_valid_from;
            END IF;
            IF p_waitlist_valid_until > (v_valid_from + make_interval(months => v_waitlist_months))::date THEN
                RAISE EXCEPTION 'Waitlist cannot stay valid past % months from %', v_waitlist_months, v_valid_from;
            END IF;
        END IF;
    END IF;
    INSERT INTO public.project_selections (project_id, position_code, mode, advert_ncs_ref, advert_on, committee, exigency_note,
                                           waitlist_valid_from, waitlist_valid_until, minutes_document_id, created_by)
    VALUES (p_project_id, btrim(p_position_code), p_mode, nullif(btrim(p_advert_ncs_ref), ''), p_advert_on,
            coalesce(p_committee, '[]'), nullif(btrim(p_exigency_note), ''),
            v_valid_from, p_waitlist_valid_until, p_minutes_document_id, auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.project_selection_create(text, text, text, text, date, jsonb, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_selection_create(text, text, text, text, date, jsonb, text, date, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.project_engagement_check(
    p_person_id uuid, p_project_id text, p_position_code text, p_from date, p_to date, p_selection_id uuid DEFAULT NULL)
RETURNS TABLE (rule text, ok boolean, detail text)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
#variable_conflict use_column
DECLARE
    v_person          public.project_staff_persons%ROWTYPE;
    v_sel             public.project_selections%ROWTYPE;
    v_pr              public.projects%ROWTYPE;
    v_max_age         integer;
    v_relax           integer;
    v_age             integer;
    v_cap             integer := public.csir_rule('project_staff.tenure_cap_years')::int;
    v_days            integer;
    v_months          integer;
    v_quorum          jsonb := public.csir_rule('project_staff.selection_quorum');
    v_wl_months       integer := public.csir_rule('project_staff.waitlist_validity_months')::int;
    v_wl_from         date;
    v_wl_cap          date;
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

    v_days := public.project_staff_tenure_days(
        p_person_id,
        greatest(p_to, coalesce((SELECT max(e.to_on) FROM public.project_engagements e WHERE e.person_id = p_person_id), p_to)),
        p_from,
        p_to
    );
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
        v_wl_from := coalesce(v_sel.waitlist_valid_from, v_sel.advert_on, (v_sel.created_at AT TIME ZONE 'Asia/Kolkata')::date);
        v_wl_cap := (v_wl_from + make_interval(months => v_wl_months))::date;
        ok := v_sel.waitlist_valid_until IS NOT NULL
          AND v_sel.waitlist_valid_until >= p_from
          AND v_sel.waitlist_valid_until <= v_wl_cap
          AND coalesce(v_months, 0) >= public.csir_rule('project_staff.waitlist_min_project_months')::int;
        detail := 'Waitlist valid until ' || coalesce(v_sel.waitlist_valid_until::text, '—') || ' (max ' || v_wl_cap || '); project of '
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

CREATE OR REPLACE FUNCTION public.project_staff_leave_add(p_engagement_id uuid, p_kind text, p_from date, p_to date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_days  integer := p_to - p_from + 1;
    v_limit integer;
    v_used  integer;
    v_fy    text;
    v_id    uuid;
BEGIN
    IF NOT public.project_staff_caller_keeps() THEN
        RAISE EXCEPTION 'Only PME or HR records leave';
    END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Give the leave dates'; END IF;
    PERFORM 1 FROM public.project_engagements WHERE id = p_engagement_id AND p_from >= from_on AND p_to <= to_on FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Leave must fall within the engagement'; END IF;
    IF p_kind = 'PAID' THEN
        v_limit := public.csir_rule('project_staff.paid_leave_days_per_year')::int;
        WITH proposed_days AS (
            SELECT public.fiscal_year_of(d::date) AS fy, count(*)::int AS new_days
              FROM generate_series(p_from, p_to, interval '1 day') d
             GROUP BY 1
        ), existing_days AS (
            SELECT public.fiscal_year_of(d::date) AS fy, count(*)::int AS old_days
              FROM public.project_staff_leave l
              CROSS JOIN LATERAL generate_series(l.from_on, l.to_on, interval '1 day') d
             WHERE l.engagement_id = p_engagement_id
               AND l.kind = 'PAID'
             GROUP BY 1
        )
        SELECT coalesce(e.old_days, 0), p.new_days, p.fy
          INTO v_used, v_days, v_fy
          FROM proposed_days p
          LEFT JOIN existing_days e ON e.fy = p.fy
         WHERE coalesce(e.old_days, 0) + p.new_days > v_limit
         ORDER BY p.fy
         LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'Paid leave: % of % days used this year (%)', v_used, v_limit, v_fy;
        END IF;
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
REVOKE ALL ON FUNCTION public.project_staff_leave_add(uuid, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_staff_leave_add(uuid, text, date, date) TO authenticated, service_role;

-- ── 10. Atomic chair_decision IS NULL guard in coi_declare() upsert ────────
CREATE OR REPLACE FUNCTION public.coi_declare(p_meeting_id uuid, p_format text, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me  text := public.caller_staff_id();
    v_id  uuid;
BEGIN
    IF auth.uid() IS NULL OR v_me IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.meetings m JOIN public.committees c ON c.id = m.committee_id
         WHERE m.id = p_meeting_id
           AND (v_me IN (c.chairperson_id, c.secretary_id)
                OR EXISTS (SELECT 1 FROM public.committee_members cm WHERE cm.committee_id = c.id AND cm.staff_id = v_me)))
    THEN
        RAISE EXCEPTION 'Only a member of this committee can declare for its meeting';
    END IF;
    IF p_format NOT IN ('F1', 'F2') THEN RAISE EXCEPTION 'Choose Format 1 (no conflict) or Format 2 (a conflict)'; END IF;
    IF p_format = 'F2' AND coalesce(btrim(p_note), '') = '' THEN
        RAISE EXCEPTION 'Describe the conflict for Format 2';
    END IF;
    IF EXISTS (SELECT 1 FROM public.coi_declarations
                WHERE meeting_id = p_meeting_id AND member_user_id = auth.uid() AND chair_decision IS NOT NULL) THEN
        RAISE EXCEPTION 'The chair has already decided on your declaration';
    END IF;

    INSERT INTO public.coi_declarations (meeting_id, member_user_id, format, conflict_note)
    VALUES (p_meeting_id, auth.uid(), p_format, CASE WHEN p_format = 'F2' THEN btrim(p_note) END)
    ON CONFLICT (meeting_id, member_user_id) DO UPDATE
       SET format = EXCLUDED.format, conflict_note = EXCLUDED.conflict_note, declared_at = now()
     WHERE coi_declarations.chair_decision IS NULL
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'The chair has already decided on your declaration';
    END IF;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.coi_declare(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coi_declare(uuid, text, text) TO authenticated, service_role;

-- ── 11. Pass snapshot as_on year into year-dependent metrics ──────────────
DROP FUNCTION IF EXISTS public.metric_table();

CREATE OR REPLACE FUNCTION public.metric_table(p_as_on date DEFAULT NULL)
RETURNS TABLE (metric_key text, division text, value numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT m.key, NULL::text,
           public.metric_value(
               m.key,
               CASE WHEN p_as_on IS NOT NULL AND m.key = 'outputs_per_year'
                    THEN jsonb_build_object('year', extract(year FROM p_as_on)::int)
                    ELSE '{}'::jsonb END
           )
      FROM public.metrics m
    UNION ALL
    SELECT m.key, d."divCode",
           public.metric_value(
               m.key,
               CASE WHEN p_as_on IS NOT NULL AND m.key = 'outputs_per_year'
                    THEN jsonb_build_object('year', extract(year FROM p_as_on)::int, 'division', d."divCode")
                    ELSE jsonb_build_object('division', d."divCode") END
           )
      FROM public.metrics m CROSS JOIN public.divisions d
     WHERE 'division' = ANY (m.scope_kinds);
$$;
REVOKE ALL ON FUNCTION public.metric_table(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metric_table(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.metric_snapshot_run(p_as_on date DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_as_on date := coalesce(p_as_on, public.ist_today() - 1);
    v_n     integer;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT coalesce(public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only MasterAdmin takes a snapshot';
    END IF;
    INSERT INTO public.metric_snapshots (metric_key, scope, as_on, value)
    SELECT t.metric_key,
           CASE WHEN t.division IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('division', t.division) END,
           v_as_on,
           t.value
      FROM public.metric_table(v_as_on) t
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.metric_snapshot_run(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metric_snapshot_run(date) TO authenticated, service_role;

-- ── 12. Verify current author/inventor name in notification_accept() ───────
CREATE OR REPLACE FUNCTION public.notification_accept(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_action      jsonb;
    v_kind        text;
    v_args        jsonb;
    v_rec_kind    text;
    v_rec_id      text;
    v_pos         integer;
    v_staff_id    text;
    v_author_name text;
    v_staff_name  text;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    UPDATE public.notifications SET status = 'accepted'
     WHERE id = p_id AND user_id = auth.uid() AND status IN ('open', 'read') AND proposed_action IS NOT NULL
    RETURNING proposed_action INTO v_action;
    IF NOT FOUND THEN RAISE EXCEPTION 'Nothing to accept'; END IF;

    v_kind := v_action->>'kind';
    v_args := coalesce(v_action->'args', '{}'::jsonb);
    IF v_kind = 'identity_link' THEN
        v_rec_kind := v_args->>'record_kind';
        v_rec_id := v_args->>'record_id';
        v_pos := (v_args->>'pos')::int;
        v_staff_id := v_args->>'staff_id';
        IF v_rec_kind = 'OUTPUT' THEN
            SELECT a.author_name INTO v_author_name
              FROM public.output_authors a
             WHERE a.output_id = v_rec_id AND a.pos = v_pos;
        ELSIF v_rec_kind = 'IP' THEN
            SELECT i.author_name INTO v_author_name
              FROM public.ip_inventors i
             WHERE i.ip_id = v_rec_id AND i.pos = v_pos;
        END IF;
        SELECT s."Name" INTO v_staff_name FROM public.staff s WHERE s."ID" = v_staff_id;
        IF v_author_name IS NULL OR v_staff_name IS NULL
           OR public.person_name_key(v_author_name) IS NULL
           OR public.person_name_key(v_author_name) IS DISTINCT FROM public.person_name_key(v_staff_name) THEN
            RAISE EXCEPTION 'The name at this position no longer matches the suggested staff member';
        END IF;
        PERFORM public.identity_set_link(v_rec_kind, v_rec_id, v_pos, v_staff_id);
    ELSIF v_kind = 'expertise_confirm' THEN
        IF (v_args->>'staff_id') IS DISTINCT FROM public.caller_staff_id() THEN
            RAISE EXCEPTION 'Only the person confirms their own expertise';
        END IF;
        INSERT INTO public.staff_expertise (staff_id, term_id, source, confirmed_at, added_by)
        VALUES (v_args->>'staff_id', (v_args->>'term_id')::uuid, 'SUGGESTED', now(), auth.uid())
        ON CONFLICT (staff_id, term_id) DO UPDATE SET confirmed_at = now();
    ELSIF v_kind = 'open' THEN
        NULL;
    ELSE
        RAISE EXCEPTION 'Action % is not allowed', coalesce(v_kind, '(none)');
    END IF;

    INSERT INTO public.ai_action_log (notification_id, user_id, action_kind, args, outcome)
    VALUES (p_id, auth.uid(), v_kind, v_args, CASE WHEN v_kind = 'open' THEN 'OPENED' ELSE 'DONE' END);
    RETURN v_action->>'link';
END;
$$;
REVOKE ALL ON FUNCTION public.notification_accept(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_accept(uuid) TO authenticated, service_role;

-- ── 13. Restrict equipment deletion while usage log entries exist ──────────
ALTER TABLE public.equipment_usage_log
    DROP CONSTRAINT IF EXISTS equipment_usage_log_equipment_id_fkey,
    ADD CONSTRAINT equipment_usage_log_equipment_id_fkey
        FOREIGN KEY (equipment_id) REFERENCES public.equipment("UInsID") ON DELETE RESTRICT;

COMMIT;

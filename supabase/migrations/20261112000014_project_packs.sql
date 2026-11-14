-- ============================================================
-- 20261112000014_project_packs
-- Enterprise P3 / EP6 — fund release and rephasing packs (§4.1.5, §7.1,
-- §7.2, Checklist B).
--
-- project_pack() returns, as one jsonb, everything the paper pack prints:
-- the project, a head-wise and year-wise statement (sanctioned · received ·
-- spent), the earlier release orders, the demand, the change asked for, and
-- the four-signatory block (PI, Head PME, F&AO / CoFA, Director). The PDF in
-- src/lib/projects/packPdf.tsx prints this and nothing else.
-- Release demand: FIRST_RELEASE asks for the first year's sanction;
-- NEXT_YEAR_RELEASE asks for the next year's sanction less the unspent cash
-- in hand (received − spent), never below zero.
-- project_checklist_b() runs before a rephasing or re-appropriation pack
-- prints; each item is ok or not, with the reason — it does not raise.
-- Both are invoker: the project's RLS decides who may print.
-- Tests: scripts/db/compliance.db.test.ts.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.project_checklist_b(p_change_request_id uuid)
RETURNS TABLE (item text, ok boolean, detail text)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
#variable_conflict use_column
DECLARE
    v_cr  public.project_change_requests%ROWTYPE;
    v_pr  public.projects%ROWTYPE;
    v_m   record;
    v_bad text;
    v_err text;
BEGIN
    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = p_change_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found'; END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = v_cr.project_id;

    item := 'kind'; ok := v_cr.kind IN ('REPHASING', 'REAPPROPRIATION');
    detail := CASE WHEN ok THEN initcap(lower(v_cr.kind)) ELSE 'Checklist B covers rephasing and re-appropriation only' END;
    RETURN NEXT;

    item := 'project_running'; ok := v_pr.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD');
    detail := 'Project stage: ' || coalesce(v_pr.stage, 'not set');
    RETURN NEXT;

    -- §7.2: unspent travel and manpower are never rephased; travel is never
    -- augmented by re-appropriation.
    v_bad := NULL;
    IF v_cr.kind = 'REPHASING' THEN
        SELECT string_agg(DISTINCT m.head, ', ') INTO v_bad
          FROM jsonb_to_recordset(coalesce(v_cr.payload->'moves', '[]')) AS m(head text)
         WHERE m.head IN ('TA_INDIA', 'TA_ABROAD', 'MANPOWER');
    ELSIF v_cr.kind = 'REAPPROPRIATION' THEN
        SELECT string_agg(DISTINCT m.to_head, ', ') INTO v_bad
          FROM jsonb_to_recordset(coalesce(v_cr.payload->'moves', '[]')) AS m(to_head text)
         WHERE m.to_head IN ('TA_INDIA', 'TA_ABROAD');
    END IF;
    item := 'travel_manpower'; ok := v_bad IS NULL;
    detail := CASE WHEN ok THEN 'No travel or manpower money moved' ELSE 'Moves ' || v_bad || ' (not allowed, §7.2)' END;
    RETURN NEXT;

    -- Each amount moved is no more than what is unspent under that head and year.
    v_bad := NULL;
    FOR v_m IN
        SELECT coalesce(m.head, m.from_head) AS head, coalesce(m.from_year, m.fiscal_year) AS fy, m.amount
          FROM jsonb_to_recordset(coalesce(v_cr.payload->'moves', '[]'))
               AS m(head text, from_head text, from_year text, fiscal_year text, amount numeric)
    LOOP
        IF v_m.amount > coalesce((SELECT hp.sanctioned - hp.spent FROM public.project_head_position(v_cr.project_id) hp
                                   WHERE hp.fiscal_year = v_m.fy AND hp.head = v_m.head), 0) THEN
            v_bad := coalesce(v_bad || '; ', '') || v_m.head || ' ' || v_m.fy;
        END IF;
    END LOOP;
    item := 'within_unspent'; ok := v_bad IS NULL;
    detail := CASE WHEN ok THEN 'Every amount is within the unspent balance' ELSE 'More than is unspent: ' || v_bad END;
    RETURN NEXT;

    -- The request passes the same rules the approval applies.
    v_err := NULL;
    BEGIN
        PERFORM 1 FROM public.project_change_deltas(v_cr.project_id, v_cr.kind, v_cr.payload);
    EXCEPTION WHEN others THEN
        v_err := SQLERRM;
    END;
    item := 'rules'; ok := v_err IS NULL;
    detail := coalesce(v_err, 'Passes the rephasing and re-appropriation rules');
    RETURN NEXT;

    item := 'signed_request'; ok := v_cr.request_document_id IS NOT NULL;
    detail := CASE WHEN ok THEN 'Signed request on file' ELSE 'Attach the request signed by the PI' END;
    RETURN NEXT;

    item := 'justification'; ok := coalesce(btrim(v_cr.justification), '') <> '';
    detail := CASE WHEN ok THEN 'Justification given' ELSE 'Write why the change is needed' END;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_pack(p_project_id text, p_kind text, p_change_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
    v_pr       public.projects%ROWTYPE;
    v_cr       public.project_change_requests%ROWTYPE;
    v_pi       text;
    v_fy       text := public.fiscal_year_of(public.ist_today());
    v_year     text;
    v_received numeric;
    v_spent    numeric;
    v_year_sanction numeric;
    v_pack     jsonb;
BEGIN
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF p_kind NOT IN ('FIRST_RELEASE', 'NEXT_YEAR_RELEASE', 'REPHASING', 'REAPPROPRIATION') THEN
        RAISE EXCEPTION 'Unknown pack: %', p_kind;
    END IF;

    v_pi := coalesce((SELECT pr.pi_name FROM public.proposals pr WHERE pr.id = v_pr.proposal_id),
                     (SELECT s."Name" FROM public.staff s WHERE s."ID" = v_pr.pi_staff_id),
                     v_pr."PrincipalInvestigator");
    SELECT coalesce(sum(amount), 0) INTO v_received FROM public.project_fund_receipts WHERE project_id = p_project_id;
    SELECT coalesce(sum(amount), 0) INTO v_spent    FROM public.project_expenditure   WHERE project_id = p_project_id;

    v_pack := jsonb_build_object(
        'kind', p_kind,
        'as_on', public.ist_today(),
        'project', jsonb_build_object(
            'project_id', v_pr."ProjectID", 'project_no', v_pr."ProjectNo", 'title', v_pr."ProjectName",
            'pi', v_pi, 'division', v_pr."DivisionCode", 'track', v_pr.track, 'stage', v_pr.stage,
            'start_date', v_pr.start_date, 'end_date', v_pr.end_date, 'sanctioned_cost', v_pr.sanctioned_cost,
            'sanction_ref', v_pr.sanction_ref, 'sanction_date', v_pr.sanction_date),
        'heads', coalesce((
            SELECT jsonb_agg(jsonb_build_object('head', head, 'sanctioned', s, 'spent', e, 'balance', s - e) ORDER BY head)
              FROM (SELECT hp.head, sum(hp.sanctioned) s, sum(hp.spent) e
                      FROM public.project_head_position(p_project_id) hp GROUP BY hp.head) h), '[]'::jsonb),
        'years', coalesce((
            SELECT jsonb_agg(jsonb_build_object('fiscal_year', y.fy, 'sanctioned', y.s, 'received', y.r, 'spent', y.e) ORDER BY y.fy)
              FROM (SELECT k.fy,
                           (SELECT coalesce(sum(b.amount), 0) FROM public.project_budget_lines b WHERE b.project_id = p_project_id AND b.fiscal_year = k.fy) s,
                           (SELECT coalesce(sum(r.amount), 0) FROM public.project_fund_receipts r WHERE r.project_id = p_project_id AND r.fiscal_year = k.fy) r,
                           (SELECT coalesce(sum(x.amount), 0) FROM public.project_expenditure x WHERE x.project_id = p_project_id AND x.fiscal_year = k.fy) e
                      FROM (SELECT fiscal_year fy FROM public.project_budget_lines WHERE project_id = p_project_id
                            UNION SELECT fiscal_year FROM public.project_fund_receipts WHERE project_id = p_project_id
                            UNION SELECT fiscal_year FROM public.project_expenditure WHERE project_id = p_project_id) k) y), '[]'::jsonb),
        'totals', jsonb_build_object(
            'sanctioned', (SELECT coalesce(sum(amount), 0) FROM public.project_budget_lines WHERE project_id = p_project_id),
            'received', v_received, 'spent', v_spent, 'unspent_cash', v_received - v_spent),
        'orders', coalesce((
            SELECT jsonb_agg(jsonb_build_object('received_on', r.received_on, 'fiscal_year', r.fiscal_year, 'amount', r.amount,
                                                'order_no', r.order_no, 'order_date', r.order_date,
                                                'ifd_file_no', r.ifd_file_no, 'ifd_date', r.ifd_date) ORDER BY r.received_on)
              FROM public.project_fund_receipts r WHERE r.project_id = p_project_id), '[]'::jsonb),
        'signatories', jsonb_build_array(
            jsonb_build_object('role', 'Principal Investigator', 'name', v_pi),
            jsonb_build_object('role', 'Head, PME', 'name', NULL),
            jsonb_build_object('role', 'F&AO / CoFA', 'name', NULL),
            jsonb_build_object('role', 'Director', 'name', NULL)));

    IF p_kind IN ('FIRST_RELEASE', 'NEXT_YEAR_RELEASE') THEN
        v_year := CASE WHEN p_kind = 'FIRST_RELEASE'
                       THEN (SELECT min(fiscal_year) FROM public.project_budget_lines WHERE project_id = p_project_id)
                       ELSE (SELECT min(fiscal_year) FROM public.project_budget_lines
                              WHERE project_id = p_project_id AND fiscal_year > v_fy) END;
        IF v_year IS NULL THEN
            RAISE EXCEPTION 'No sanctioned budget for % on this project', CASE WHEN p_kind = 'FIRST_RELEASE' THEN 'any year' ELSE 'a year after ' || v_fy END;
        END IF;
        SELECT coalesce(sum(amount), 0) INTO v_year_sanction FROM public.project_budget_lines
         WHERE project_id = p_project_id AND fiscal_year = v_year;
        v_pack := v_pack || jsonb_build_object('release', jsonb_build_object(
            'fiscal_year', v_year,
            'sanctioned_for_year', v_year_sanction,
            'unspent_cash', CASE WHEN p_kind = 'FIRST_RELEASE' THEN 0 ELSE v_received - v_spent END,
            'demand', CASE WHEN p_kind = 'FIRST_RELEASE' THEN v_year_sanction
                           ELSE greatest(0, v_year_sanction - (v_received - v_spent)) END,
            'by_head', coalesce((SELECT jsonb_agg(jsonb_build_object('head', head, 'amount', a) ORDER BY head)
                                   FROM (SELECT head, sum(amount) a FROM public.project_budget_lines
                                          WHERE project_id = p_project_id AND fiscal_year = v_year GROUP BY head) h), '[]'::jsonb)));
    ELSE
        SELECT * INTO v_cr FROM public.project_change_requests
         WHERE id = p_change_request_id AND project_id = p_project_id AND kind = p_kind;
        IF NOT FOUND THEN RAISE EXCEPTION 'Choose a % request of this project', lower(p_kind); END IF;
        v_pack := v_pack || jsonb_build_object(
            'change', jsonb_build_object('id', v_cr.id, 'status', v_cr.status, 'justification', v_cr.justification,
                                         'payload', v_cr.payload, 'submitted_at', v_cr.submitted_at),
            'checklist_b', (SELECT jsonb_agg(jsonb_build_object('item', c.item, 'ok', c.ok, 'detail', c.detail))
                              FROM public.project_checklist_b(v_cr.id) c));
    END IF;
    RETURN v_pack;
END;
$$;

REVOKE ALL ON FUNCTION public.project_checklist_b(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_pack(text, text, uuid)     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_checklist_b(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_pack(text, text, uuid)  TO authenticated, service_role;

COMMIT;

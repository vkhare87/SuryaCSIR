-- ============================================================
-- Project lifecycle PL5 — change requests
-- Plan: docs/roadmap/sources/PROJECT-LIFECYCLE-PLAN.md §5.5, §6.3
-- Guidelines (April 2025): §6.4 foreclosure, time and cost overrun;
-- §7.2 rephasing, re-appropriation, reallocation.
--
--   1. project_change_requests — six kinds; the PI (or PME) drafts and
--      submits with a signed request; private to its author while a draft.
--   2. project_change_steps    — the route per kind and track, one signed
--      scan per step; recorded by the step's owner, never by a party.
--   3. Prohibitions            — checked when the request is submitted and
--      again when it is approved, against the ledger as it then stands.
--   4. Effects                 — applied atomically by the last approval:
--      signed adjustment lines on project_budget_lines (the sanction is
--      never edited in place), a new end date, or foreclosure.
--
-- Rerun: idempotent.
-- ============================================================

-- ── 1. Who is the PI ───────────────────────────────────────────────────
-- The PI (staff key, or the proposal's PI or author) — not a co-PI, who only
-- reads (decision 6). SECURITY DEFINER: the answer must not depend on what the
-- caller can see of the proposal.
CREATE OR REPLACE FUNCTION public.project_caller_is_pi(p_project_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects pr
      LEFT JOIN public.proposals p ON p.id = pr.proposal_id
     WHERE pr."ProjectID" = p_project_id
       AND ((pr.pi_staff_id IS NOT NULL AND pr.pi_staff_id = public.caller_staff_id())
            OR p.pi_user_id = (SELECT auth.uid())
            OR p.created_by = (SELECT auth.uid())));
$$;
REVOKE ALL ON FUNCTION public.project_caller_is_pi(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_caller_is_pi(text) TO authenticated, service_role;

-- Co-PIs read the file (decision 6), but projects_select (20260725000005)
-- predates them: a co-PI outside the division's managers could not open the
-- project at all, nor a PI known only from the proposal. Permissive policies
-- OR together, so this adds readers and takes none away.
DROP POLICY IF EXISTS "projects_select_parties" ON public.projects;
CREATE POLICY "projects_select_parties" ON public.projects FOR SELECT TO authenticated
USING (proposal_id IS NOT NULL
       AND (public.proposal_caller_is_copi(proposal_id)
            OR EXISTS (SELECT 1 FROM public.proposals p
                        WHERE p.id = projects.proposal_id AND p.pi_user_id = (SELECT auth.uid()))));

-- ── 2. Documents: the signed request and each step's signed scan ──────
ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_doc_type_check;
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_doc_type_check CHECK (
    doc_type IN ('receipt_order', 'expenditure_statement', 'milestone_evidence', 'minutes',
                 'change_request', 'change_order', 'other'));

-- Finance and the Director sign steps of a change request, so they file
-- that step's scan; the PI files the signed request.
CREATE OR REPLACE FUNCTION public.project_caller_may_file(p_project_id text, p_doc_type text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.project_caller_is_office(p_project_id)
      OR (p_doc_type = 'milestone_evidence' AND public.project_caller_is_party(p_project_id))
      OR (p_doc_type = 'change_request' AND public.project_caller_is_pi(p_project_id))
      OR (p_doc_type = 'change_order' AND NOT public.project_caller_is_party(p_project_id)
          AND (public.caller_has_role('FinanceAdmin') OR public.caller_has_role('Director')
               OR EXISTS (SELECT 1 FROM public.projects pr JOIN public.project_schemes s ON s.code = pr.track
                           WHERE pr."ProjectID" = p_project_id AND s.leader_user_id = (SELECT auth.uid()))));
$$;

DROP POLICY IF EXISTS "project_documents_insert" ON public.project_documents;
CREATE POLICY "project_documents_insert" ON public.project_documents
    FOR INSERT TO authenticated
    WITH CHECK (uploaded_by = (SELECT auth.uid()) AND public.project_caller_may_file(project_id, doc_type));

DROP POLICY IF EXISTS project_docs_storage_insert ON storage.objects;
CREATE POLICY project_docs_storage_insert ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'project-documents'
        AND public.project_caller_may_file(split_part(name, '/', 1), split_part(name, '/', 2)));

-- ── 3. Requests and their steps ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_change_requests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    kind                text NOT NULL CHECK (kind IN ('TIME_OVERRUN', 'RCE', 'REPHASING', 'REAPPROPRIATION',
                                                      'REALLOCATION', 'FORECLOSURE')),
    status              text NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED',
                                          'APPROVED', 'REJECTED', 'WITHDRAWN')),
    round               int  NOT NULL DEFAULT 0,
    justification       text NOT NULL DEFAULT '',
    -- TIME_OVERRUN    {new_end_date}
    -- RCE             {lines: [{fiscal_year, head, amount}] — the whole revised budget, new_end_date?}
    -- REPHASING       {moves: [{head, from_year, to_year, amount}]}
    -- REAPPROPRIATION {moves: [{fiscal_year, from_head, to_head, amount}]}
    -- REALLOCATION    {lab, direction: OUT|IN, lines: [{fiscal_year, head, amount}]}
    -- FORECLOSURE     {effective_date, cost_benefit}
    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- RCE only: the rise over the sanction when submitted; decides the route (§6.4).
    increase_pct        numeric(7,2),
    request_document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
    order_no            text,
    order_date          date,
    ifd_file_no         text,
    ifd_date            date,
    decision_note       text,
    created_by          uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    submitted_at        timestamptz,
    decided_at          timestamptz
);
CREATE INDEX IF NOT EXISTS project_change_requests_project_idx ON public.project_change_requests (project_id, created_at);

CREATE TABLE IF NOT EXISTS public.project_change_steps (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    change_id   uuid NOT NULL REFERENCES public.project_change_requests(id) ON DELETE CASCADE,
    round       int  NOT NULL,
    seq         int  NOT NULL,
    kind        text NOT NULL CHECK (kind IN ('PME_VETTING', 'FINANCE', 'REVIEW_COMMITTEE', 'RESEARCH_COUNCIL',
                                              'DIRECTOR_APPROVAL', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE',
                                              'REVISED_COST_COMMITTEE', 'COMPETENT_AUTHORITY')),
    status      text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'RETURNED', 'REJECTED', 'SKIPPED')),
    decided_by  uuid REFERENCES auth.users(id),
    decided_at  timestamptz,
    notes       text,
    document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
    meeting_id  uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (change_id, round, seq)
);

ALTER TABLE public.project_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_change_steps    ENABLE ROW LEVEL SECURITY;

-- A draft is its author's alone; from submission on, whoever may see the project.
DROP POLICY IF EXISTS "project_change_requests_select" ON public.project_change_requests;
CREATE POLICY "project_change_requests_select" ON public.project_change_requests
    FOR SELECT TO authenticated
    USING (created_by = (SELECT auth.uid())
           OR (status NOT IN ('DRAFT', 'WITHDRAWN')
               AND EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_change_requests.project_id)));

DROP POLICY IF EXISTS "project_change_steps_select" ON public.project_change_steps;
CREATE POLICY "project_change_steps_select" ON public.project_change_steps
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.project_change_requests r WHERE r.id = project_change_steps.change_id));

REVOKE INSERT, UPDATE, DELETE ON public.project_change_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_change_steps    FROM authenticated;
GRANT SELECT ON public.project_change_requests TO authenticated, service_role;
GRANT SELECT ON public.project_change_steps    TO authenticated, service_role;

-- The sanction is revised by adding signed lines that name the change.
ALTER TABLE public.project_budget_lines
    ADD COLUMN IF NOT EXISTS change_request_id uuid REFERENCES public.project_change_requests(id);
ALTER TABLE public.project_budget_lines DROP CONSTRAINT IF EXISTS project_budget_lines_amount_check;
ALTER TABLE public.project_budget_lines ADD CONSTRAINT project_budget_lines_amount_check
    CHECK (amount >= 0 OR change_request_id IS NOT NULL);

-- ── 4. Routes ──────────────────────────────────────────────────────────
-- ULIP is decided in the institute: PME, the review committee, the Director.
-- HQ follows §6.4 / §7.2; HQ decisions are recorded here, never performed.
CREATE OR REPLACE FUNCTION public.project_change_step_kinds(p_track text, p_kind text, p_increase_pct numeric)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_track = 'ULIP' THEN ARRAY['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']
    WHEN p_kind = 'TIME_OVERRUN' THEN
         ARRAY['PME_VETTING', 'RESEARCH_COUNCIL', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'RCE' AND coalesce(p_increase_pct, 0) <= 20 THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'RCE' THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE',
               'REVISED_COST_COMMITTEE', 'COMPETENT_AUTHORITY']
    WHEN p_kind IN ('REPHASING', 'REAPPROPRIATION', 'REALLOCATION') THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY']
    -- Recommended by the Monitoring Committee, approved by the Research Council.
    WHEN p_kind = 'FORECLOSURE' THEN ARRAY['PME_VETTING', 'MONITORING_COMMITTEE', 'RESEARCH_COUNCIL']
  END;
$$;

-- Who records a step: its owner, and never the PI, author or a co-PI.
CREATE OR REPLACE FUNCTION public.project_change_caller_may_act(p_project_id text, p_kind text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT NOT public.project_caller_is_party(p_project_id)
     AND (public.caller_has_role('MasterAdmin')
          OR CASE p_kind
               WHEN 'FINANCE'           THEN public.caller_has_role('FinanceAdmin')
               WHEN 'REVIEW_COMMITTEE'  THEN public.caller_is_pme()
                                          OR EXISTS (SELECT 1 FROM public.projects pr JOIN public.project_schemes s ON s.code = pr.track
                                                      WHERE pr."ProjectID" = p_project_id AND s.leader_user_id = (SELECT auth.uid()))
               WHEN 'DIRECTOR_APPROVAL' THEN public.caller_has_role('Director') OR public.caller_is_pme()
               WHEN 'DIRECTOR_FORWARD'  THEN public.caller_has_role('Director') OR public.caller_is_pme()
               ELSE public.caller_is_pme()
             END);
$$;
REVOKE ALL ON FUNCTION public.project_change_caller_may_act(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_change_caller_may_act(text, text) TO authenticated, service_role;

-- ── 5. Prohibitions and effect ─────────────────────────────────────────
-- The sanction, spend and unspent balance per year and head, as of now.
CREATE OR REPLACE FUNCTION public.project_head_position(p_project_id text)
RETURNS TABLE (fiscal_year text, head text, sanctioned numeric, spent numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT k.fiscal_year, k.head,
         coalesce((SELECT sum(b.amount) FROM public.project_budget_lines b
                    WHERE b.project_id = p_project_id AND b.fiscal_year = k.fiscal_year AND b.head = k.head), 0),
         coalesce((SELECT sum(e.amount) FROM public.project_expenditure e
                    WHERE e.project_id = p_project_id AND e.fiscal_year = k.fiscal_year AND e.head = k.head), 0)
    FROM (SELECT b.fiscal_year, b.head FROM public.project_budget_lines b WHERE b.project_id = p_project_id
          UNION
          SELECT e.fiscal_year, e.head FROM public.project_expenditure e WHERE e.project_id = p_project_id) k;
$$;

-- Validates a change against the guidelines and the ledger, and returns the
-- adjustment per year and head it makes to the sanction. Raises on any
-- prohibition. Called on submit and again on approval.
CREATE OR REPLACE FUNCTION public.project_change_deltas(p_project_id text, p_kind text, p_payload jsonb)
RETURNS TABLE (fiscal_year text, head text, delta numeric)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
#variable_conflict use_column
DECLARE
    v_pr     public.projects%ROWTYPE;
    v_heads  text[] := ARRAY['EQUIPMENT', 'WORKS', 'MANPOWER', 'CONSUMABLES', 'TA_INDIA', 'TA_ABROAD',
                             'CONTINGENCY', 'OUTSOURCING', 'OTHER'];
    v_fy     text := '^[0-9]{4}-[0-9]{2}$';
    v_d      jsonb := '[]'::jsonb;
    v_m      record;
    v_bad    record;
    v_old    numeric;
    v_new    numeric;
BEGIN
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    p_payload := coalesce(p_payload, '{}'::jsonb);

    IF p_kind = 'TIME_OVERRUN' THEN
        IF (p_payload->>'new_end_date') IS NULL THEN RAISE EXCEPTION 'Give the new end date'; END IF;
        IF v_pr.end_date IS NOT NULL AND (p_payload->>'new_end_date')::date <= v_pr.end_date THEN
            RAISE EXCEPTION 'The new end date must be after the current one (%)', v_pr.end_date;
        END IF;

    ELSIF p_kind = 'FORECLOSURE' THEN
        IF (p_payload->>'effective_date') IS NULL THEN RAISE EXCEPTION 'Give the date the project is to close'; END IF;
        IF coalesce(btrim(p_payload->>'cost_benefit'), '') = '' THEN
            RAISE EXCEPTION 'A foreclosure needs a cost-benefit analysis of continuing against stopping (§6.4)';
        END IF;

    ELSIF p_kind = 'REPHASING' THEN
        IF jsonb_array_length(coalesce(p_payload->'moves', '[]')) = 0 THEN RAISE EXCEPTION 'Add at least one amount to carry forward'; END IF;
        FOR v_m IN SELECT * FROM jsonb_to_recordset(p_payload->'moves') AS x(head text, from_year text, to_year text, amount numeric) LOOP
            IF v_m.head IS NULL OR NOT (v_m.head = ANY (v_heads)) THEN RAISE EXCEPTION 'Unknown budget head: %', v_m.head; END IF;
            IF v_m.head IN ('TA_INDIA', 'TA_ABROAD', 'MANPOWER') THEN
                RAISE EXCEPTION 'Unspent travel and project manpower cannot be rephased under any circumstances (§7.2)';
            END IF;
            IF coalesce(v_m.from_year, '') !~ v_fy OR coalesce(v_m.to_year, '') !~ v_fy THEN RAISE EXCEPTION 'Give both financial years'; END IF;
            IF v_m.to_year <= v_m.from_year THEN
                RAISE EXCEPTION 'Rephasing carries unspent money forward to a later year';
            END IF;
            IF coalesce(v_m.amount, 0) <= 0 THEN RAISE EXCEPTION 'Each amount must be above zero'; END IF;
            v_d := v_d || jsonb_build_array(
                jsonb_build_object('fiscal_year', v_m.from_year, 'head', v_m.head, 'delta', -v_m.amount),
                jsonb_build_object('fiscal_year', v_m.to_year,   'head', v_m.head, 'delta',  v_m.amount));
        END LOOP;

    ELSIF p_kind = 'REAPPROPRIATION' THEN
        IF jsonb_array_length(coalesce(p_payload->'moves', '[]')) = 0 THEN RAISE EXCEPTION 'Add at least one amount to move'; END IF;
        FOR v_m IN SELECT * FROM jsonb_to_recordset(p_payload->'moves') AS x(fiscal_year text, from_head text, to_head text, amount numeric) LOOP
            IF v_m.from_head IS NULL OR v_m.to_head IS NULL
               OR NOT (v_m.from_head = ANY (v_heads)) OR NOT (v_m.to_head = ANY (v_heads)) THEN
                RAISE EXCEPTION 'Choose the heads to move money from and to';
            END IF;
            IF v_m.from_head = v_m.to_head THEN RAISE EXCEPTION 'Choose two different heads'; END IF;
            IF public.budget_head_is_capital(v_m.from_head) <> public.budget_head_is_capital(v_m.to_head) THEN
                RAISE EXCEPTION 'Capital cannot be re-appropriated to Revenue, nor Revenue to Capital (§7.2)';
            END IF;
            IF v_m.to_head IN ('TA_INDIA', 'TA_ABROAD') THEN
                RAISE EXCEPTION 'The travel provision cannot be augmented by re-appropriation (§7.2)';
            END IF;
            IF coalesce(v_m.fiscal_year, '') !~ v_fy THEN RAISE EXCEPTION 'Give the financial year'; END IF;
            IF coalesce(v_m.amount, 0) <= 0 THEN RAISE EXCEPTION 'Each amount must be above zero'; END IF;
            v_d := v_d || jsonb_build_array(
                jsonb_build_object('fiscal_year', v_m.fiscal_year, 'head', v_m.from_head, 'delta', -v_m.amount),
                jsonb_build_object('fiscal_year', v_m.fiscal_year, 'head', v_m.to_head,   'delta',  v_m.amount));
        END LOOP;

    ELSIF p_kind = 'REALLOCATION' THEN
        IF v_pr.track IS DISTINCT FROM 'HQ' THEN
            RAISE EXCEPTION 'Reallocation moves money between participating laboratories of an HQ project';
        END IF;
        IF coalesce(btrim(p_payload->>'lab'), '') = '' THEN RAISE EXCEPTION 'Name the other laboratory'; END IF;
        IF coalesce(p_payload->>'direction', '') NOT IN ('OUT', 'IN') THEN RAISE EXCEPTION 'Say whether money goes out or comes in'; END IF;
        IF jsonb_array_length(coalesce(p_payload->'lines', '[]')) = 0 THEN RAISE EXCEPTION 'Add at least one amount'; END IF;
        FOR v_m IN SELECT * FROM jsonb_to_recordset(p_payload->'lines') AS x(fiscal_year text, head text, amount numeric) LOOP
            IF v_m.head IS NULL OR NOT (v_m.head = ANY (v_heads)) THEN RAISE EXCEPTION 'Unknown budget head: %', v_m.head; END IF;
            IF coalesce(v_m.fiscal_year, '') !~ v_fy THEN RAISE EXCEPTION 'Give the financial year'; END IF;
            IF coalesce(v_m.amount, 0) <= 0 THEN RAISE EXCEPTION 'Each amount must be above zero'; END IF;
            IF p_payload->>'direction' = 'IN' AND NOT EXISTS (
                SELECT 1 FROM public.project_head_position(p_project_id) hp WHERE hp.head = v_m.head AND hp.sanctioned > 0) THEN
                RAISE EXCEPTION 'Reallocated money can be used only for items approved under the project; % is not (§7.2)',
                    lower(replace(v_m.head, '_', ' '));
            END IF;
            v_d := v_d || jsonb_build_array(jsonb_build_object('fiscal_year', v_m.fiscal_year, 'head', v_m.head,
                'delta', CASE WHEN p_payload->>'direction' = 'OUT' THEN -v_m.amount ELSE v_m.amount END));
        END LOOP;

    ELSIF p_kind = 'RCE' THEN
        IF jsonb_array_length(coalesce(p_payload->'lines', '[]')) = 0 THEN RAISE EXCEPTION 'Enter the revised budget'; END IF;
        FOR v_m IN SELECT * FROM jsonb_to_recordset(p_payload->'lines') AS x(fiscal_year text, head text, amount numeric) LOOP
            IF v_m.head IS NULL OR NOT (v_m.head = ANY (v_heads)) THEN RAISE EXCEPTION 'Unknown budget head: %', v_m.head; END IF;
            IF coalesce(v_m.fiscal_year, '') !~ v_fy THEN RAISE EXCEPTION 'Give the financial year'; END IF;
            IF v_m.amount IS NULL OR v_m.amount < 0 THEN RAISE EXCEPTION 'Amounts cannot be negative'; END IF;
        END LOOP;
        IF (p_payload->>'new_end_date') IS NOT NULL AND v_pr.end_date IS NOT NULL
           AND (p_payload->>'new_end_date')::date <= v_pr.end_date THEN
            RAISE EXCEPTION 'The new end date must be after the current one (%)', v_pr.end_date;
        END IF;
        SELECT coalesce(sum(amount), 0) INTO v_old FROM public.project_budget_lines WHERE project_id = p_project_id;
        v_old := greatest(v_old, coalesce(v_pr.sanctioned_cost, 0));
        SELECT coalesce(sum(x.amount), 0) INTO v_new FROM jsonb_to_recordset(p_payload->'lines') AS x(amount numeric);
        IF v_new <= v_old THEN
            RAISE EXCEPTION 'A revised cost estimate raises the cost above % ; to move money between heads or years, use re-appropriation or rephasing', v_old;
        END IF;
        -- The revised budget replaces the current one, cell by cell.
        SELECT coalesce(jsonb_agg(jsonb_build_object('fiscal_year', c.fiscal_year, 'head', c.head, 'delta', c.n - c.o)), '[]')
          INTO v_d
          FROM (SELECT k.fiscal_year, k.head,
                       coalesce((SELECT sum(x.amount) FROM jsonb_to_recordset(p_payload->'lines') AS x(fiscal_year text, head text, amount numeric)
                                  WHERE x.fiscal_year = k.fiscal_year AND x.head = k.head), 0) AS n,
                       coalesce((SELECT sum(b.amount) FROM public.project_budget_lines b
                                  WHERE b.project_id = p_project_id AND b.fiscal_year = k.fiscal_year AND b.head = k.head), 0) AS o
                  FROM (SELECT x.fiscal_year, x.head FROM jsonb_to_recordset(p_payload->'lines') AS x(fiscal_year text, head text)
                        UNION
                        SELECT b.fiscal_year, b.head FROM public.project_budget_lines b WHERE b.project_id = p_project_id) k) c
         WHERE c.n <> c.o;
    ELSE
        RAISE EXCEPTION 'Unknown kind of change: %', p_kind;
    END IF;

    -- Only unspent money moves: no year and head may end up with less
    -- sanctioned than has already been spent in it.
    SELECT d.fiscal_year, d.head, coalesce(hp.sanctioned, 0) AS sanctioned, coalesce(hp.spent, 0) AS spent, d.delta
      INTO v_bad
      FROM (SELECT x.fiscal_year, x.head, sum(x.delta) AS delta
              FROM jsonb_to_recordset(v_d) AS x(fiscal_year text, head text, delta numeric)
             GROUP BY 1, 2) d
      LEFT JOIN public.project_head_position(p_project_id) hp ON hp.fiscal_year = d.fiscal_year AND hp.head = d.head
     WHERE d.delta < 0 AND coalesce(hp.sanctioned, 0) + d.delta < greatest(coalesce(hp.spent, 0), 0)
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Only unspent money can move: % in % has ₹% sanctioned and ₹% spent',
            lower(replace(v_bad.head, '_', ' ')), v_bad.fiscal_year,
            to_char(v_bad.sanctioned, 'FM99,99,99,99,990'), to_char(v_bad.spent, 'FM99,99,99,99,990');
    END IF;

    RETURN QUERY
        SELECT x.fiscal_year, x.head, sum(x.delta)
          FROM jsonb_to_recordset(v_d) AS x(fiscal_year text, head text, delta numeric)
         GROUP BY 1, 2
        HAVING sum(x.delta) <> 0
         ORDER BY 1, 2;
END;
$$;

-- ── 6. RPCs ────────────────────────────────────────────────────────────
-- The PI (or PME) drafts a request. Saved as often as they like.
CREATE OR REPLACE FUNCTION public.project_change_save(
    p_id            uuid,
    p_project_id    text,
    p_kind          text,
    p_justification text,
    p_payload       jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cr public.project_change_requests%ROWTYPE;
    v_id uuid;
BEGIN
    IF p_id IS NULL THEN
        IF NOT (public.project_caller_is_pi(p_project_id) OR public.project_caller_is_office(p_project_id)) THEN
            RAISE EXCEPTION 'Only the PI or PME can raise a change request on this project';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.projects WHERE "ProjectID" = p_project_id
                                                      AND stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING')) THEN
            RAISE EXCEPTION 'A change can be requested only on a running project';
        END IF;
        IF p_kind NOT IN ('TIME_OVERRUN', 'RCE', 'REPHASING', 'REAPPROPRIATION', 'REALLOCATION', 'FORECLOSURE') THEN
            RAISE EXCEPTION 'Unknown kind of change: %', p_kind;
        END IF;
        INSERT INTO public.project_change_requests (project_id, kind, justification, payload, created_by)
        VALUES (p_project_id, p_kind, coalesce(p_justification, ''), coalesce(p_payload, '{}'::jsonb), auth.uid())
        RETURNING id INTO v_id;
        RETURN v_id;
    END IF;

    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_cr.created_by <> auth.uid() THEN RAISE EXCEPTION 'Change request not found'; END IF;
    IF v_cr.status NOT IN ('DRAFT', 'RETURNED') THEN RAISE EXCEPTION 'A submitted request cannot be edited'; END IF;
    IF p_kind NOT IN ('TIME_OVERRUN', 'RCE', 'REPHASING', 'REAPPROPRIATION', 'REALLOCATION', 'FORECLOSURE') THEN
        RAISE EXCEPTION 'Unknown kind of change: %', p_kind;
    END IF;
    UPDATE public.project_change_requests
       SET kind = p_kind, justification = coalesce(p_justification, ''), payload = coalesce(p_payload, '{}'::jsonb),
           updated_at = now()
     WHERE id = p_id;
    RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_change_submit(p_id uuid, p_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cr    public.project_change_requests%ROWTYPE;
    v_pr    public.projects%ROWTYPE;
    v_pct   numeric;
    v_old   numeric;
    v_new   numeric;
    v_kinds text[];
BEGIN
    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_cr.created_by <> auth.uid() THEN RAISE EXCEPTION 'Change request not found'; END IF;
    IF NOT (public.project_caller_is_pi(v_cr.project_id) OR public.project_caller_is_office(v_cr.project_id)) THEN
        RAISE EXCEPTION 'Only the PI or PME can submit a change request on this project';
    END IF;
    IF v_cr.status NOT IN ('DRAFT', 'RETURNED') THEN RAISE EXCEPTION 'This request has already been submitted'; END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = v_cr.project_id FOR UPDATE;
    IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING') THEN
        RAISE EXCEPTION 'A change can be requested only on a running project';
    END IF;
    IF v_pr.track IS NULL THEN RAISE EXCEPTION 'PME must classify this project as ULIP or HQ first'; END IF;
    IF coalesce(btrim(v_cr.justification), '') = '' THEN RAISE EXCEPTION 'Give the justification'; END IF;
    IF EXISTS (SELECT 1 FROM public.project_change_requests
                WHERE project_id = v_cr.project_id AND id <> p_id AND status IN ('SUBMITTED', 'UNDER_REVIEW')) THEN
        RAISE EXCEPTION 'Another change request on this project is still in review; one at a time';
    END IF;
    PERFORM public.project_assert_document(v_cr.project_id, p_document_id, 'change_request');
    PERFORM 1 FROM public.project_change_deltas(v_cr.project_id, v_cr.kind, v_cr.payload);

    IF v_cr.kind = 'RCE' THEN
        SELECT coalesce(sum(amount), 0) INTO v_old FROM public.project_budget_lines WHERE project_id = v_cr.project_id;
        v_old := greatest(v_old, coalesce(v_pr.sanctioned_cost, 0));
        SELECT coalesce(sum(x.amount), 0) INTO v_new FROM jsonb_to_recordset(v_cr.payload->'lines') AS x(amount numeric);
        v_pct := CASE WHEN v_old > 0 THEN round((v_new - v_old) * 100 / v_old, 2) END;
    END IF;

    v_kinds := public.project_change_step_kinds(v_pr.track, v_cr.kind, v_pct);
    UPDATE public.project_change_requests
       SET status = 'SUBMITTED', round = round + 1, increase_pct = v_pct, request_document_id = p_document_id,
           submitted_at = now(), updated_at = now(), decision_note = NULL
     WHERE id = p_id;
    INSERT INTO public.project_change_steps (change_id, round, seq, kind)
    SELECT p_id, v_cr.round + 1, s.n, s.k FROM unnest(v_kinds) WITH ORDINALITY AS s(k, n);
END;
$$;

-- Withdrawn by its author before anyone has acted on this round.
CREATE OR REPLACE FUNCTION public.project_change_withdraw(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cr public.project_change_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_cr.created_by <> auth.uid() THEN RAISE EXCEPTION 'Change request not found'; END IF;
    IF v_cr.status NOT IN ('DRAFT', 'RETURNED', 'SUBMITTED') THEN
        RAISE EXCEPTION 'Review has started; this request can no longer be withdrawn';
    END IF;
    UPDATE public.project_change_steps SET status = 'SKIPPED' WHERE change_id = p_id AND status = 'PENDING';
    UPDATE public.project_change_requests SET status = 'WITHDRAWN', updated_at = now() WHERE id = p_id;
END;
$$;

-- Applies an approved change. Internal: called by the last step only.
CREATE OR REPLACE FUNCTION public.project_change_apply(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cr    public.project_change_requests%ROWTYPE;
    v_end   date;
    v_total numeric;
BEGIN
    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = p_id;

    INSERT INTO public.project_budget_lines (project_id, fiscal_year, head, item, amount, source, change_request_id)
    SELECT v_cr.project_id, d.fiscal_year, d.head,
           CASE v_cr.kind WHEN 'REALLOCATION' THEN coalesce(v_cr.payload->>'lab', '') ELSE '' END,
           d.delta, 'CHANGE', p_id
      FROM public.project_change_deltas(v_cr.project_id, v_cr.kind, v_cr.payload) d;

    IF v_cr.kind IN ('RCE', 'REALLOCATION') THEN
        SELECT sum(amount) INTO v_total FROM public.project_budget_lines WHERE project_id = v_cr.project_id;
        UPDATE public.projects SET sanctioned_cost = v_total, "SanctionedCost" = v_total::text
         WHERE "ProjectID" = v_cr.project_id;
    END IF;

    v_end := CASE WHEN v_cr.kind IN ('TIME_OVERRUN', 'RCE') THEN (v_cr.payload->>'new_end_date')::date
                  WHEN v_cr.kind = 'FORECLOSURE' THEN (v_cr.payload->>'effective_date')::date END;
    IF v_end IS NOT NULL THEN
        UPDATE public.projects SET end_date = v_end, "CompletioDate" = v_end::text WHERE "ProjectID" = v_cr.project_id;
    END IF;

    IF v_cr.kind = 'FORECLOSURE' THEN
        UPDATE public.projects SET stage = 'FORECLOSED' WHERE "ProjectID" = v_cr.project_id;
        UPDATE public.project_review_slots SET status = 'CANCELLED'
         WHERE project_id = v_cr.project_id AND status = 'PENDING';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.project_change_apply(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.project_change_record_step(
    p_step_id     uuid,
    p_decision    text,
    p_notes       text,
    p_document_id uuid,
    p_meeting_id  uuid DEFAULT NULL,
    p_order_no    text DEFAULT NULL,
    p_order_date  date DEFAULT NULL,
    p_ifd_file_no text DEFAULT NULL,
    p_ifd_date    date DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_step public.project_change_steps%ROWTYPE;
    v_cr   public.project_change_requests%ROWTYPE;
    v_pr   public.projects%ROWTYPE;
    v_last boolean;
    v_note text := nullif(btrim(p_notes), '');
    v_word text;
BEGIN
    SELECT * INTO v_step FROM public.project_change_steps WHERE id = p_step_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Step not found'; END IF;
    SELECT * INTO v_cr FROM public.project_change_requests WHERE id = v_step.change_id FOR UPDATE;
    IF NOT public.project_change_caller_may_act(v_cr.project_id, v_step.kind) THEN
        RAISE EXCEPTION 'You cannot record this step on this change request';
    END IF;
    IF v_cr.status NOT IN ('SUBMITTED', 'UNDER_REVIEW') THEN RAISE EXCEPTION 'This change request is not in review'; END IF;
    IF v_step.status <> 'PENDING' OR v_step.round <> v_cr.round THEN RAISE EXCEPTION 'This step has already been recorded'; END IF;
    IF EXISTS (SELECT 1 FROM public.project_change_steps s
                WHERE s.change_id = v_cr.id AND s.round = v_step.round AND s.seq < v_step.seq AND s.status = 'PENDING') THEN
        RAISE EXCEPTION 'An earlier step is still pending';
    END IF;
    IF p_meeting_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.meetings WHERE id = p_meeting_id) THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = v_cr.project_id FOR UPDATE;

    IF p_decision = 'APPROVE' THEN
        PERFORM public.project_assert_document(v_cr.project_id, p_document_id, 'change_order');
        v_last := NOT EXISTS (SELECT 1 FROM public.project_change_steps s
                               WHERE s.change_id = v_cr.id AND s.round = v_step.round AND s.seq > v_step.seq);
        IF v_last AND v_pr.track = 'HQ' AND v_cr.kind <> 'FORECLOSURE'
           AND (coalesce(btrim(p_order_no), '') = '' OR p_order_date IS NULL
                OR coalesce(btrim(p_ifd_file_no), '') = '' OR p_ifd_date IS NULL) THEN
            RAISE EXCEPTION 'The order must state its number and date and the IFD concurrence file number and date; an OM without them is invalid (§7.2)';
        END IF;
        UPDATE public.project_change_steps
           SET status = 'DONE', decided_by = auth.uid(), decided_at = now(), notes = v_note,
               document_id = p_document_id, meeting_id = p_meeting_id
         WHERE id = v_step.id;
        IF v_last THEN
            IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING') THEN
                RAISE EXCEPTION 'The project is no longer running';
            END IF;
            PERFORM public.project_change_apply(v_cr.id);
            UPDATE public.project_change_requests
               SET status = 'APPROVED', decided_at = now(), updated_at = now(), decision_note = v_note,
                   order_no = nullif(btrim(p_order_no), ''), order_date = p_order_date,
                   ifd_file_no = nullif(btrim(p_ifd_file_no), ''), ifd_date = p_ifd_date
             WHERE id = v_cr.id;
            v_word := 'approved';
        ELSE
            UPDATE public.project_change_requests SET status = 'UNDER_REVIEW', updated_at = now() WHERE id = v_cr.id;
        END IF;

    ELSIF p_decision IN ('RETURN', 'REJECT') THEN
        IF v_note IS NULL THEN
            RAISE EXCEPTION '%', CASE p_decision WHEN 'RETURN' THEN 'Say what needs to change' ELSE 'Give the reason for rejection' END;
        END IF;
        UPDATE public.project_change_steps
           SET status = CASE p_decision WHEN 'RETURN' THEN 'RETURNED' ELSE 'REJECTED' END,
               decided_by = auth.uid(), decided_at = now(), notes = v_note,
               document_id = p_document_id, meeting_id = p_meeting_id
         WHERE id = v_step.id;
        UPDATE public.project_change_steps SET status = 'SKIPPED'
         WHERE change_id = v_cr.id AND round = v_step.round AND status = 'PENDING';
        UPDATE public.project_change_requests
           SET status = CASE p_decision WHEN 'RETURN' THEN 'RETURNED' ELSE 'REJECTED' END,
               decision_note = v_note, updated_at = now(),
               decided_at = CASE p_decision WHEN 'REJECT' THEN now() END
         WHERE id = v_cr.id;
        v_word := CASE p_decision WHEN 'RETURN' THEN 'returned for changes' ELSE 'rejected' END;
    ELSE
        RAISE EXCEPTION 'Unknown decision: %', p_decision;
    END IF;

    IF v_word IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
        VALUES (v_cr.created_by, 'project_change_decided',
                CASE WHEN v_word = 'approved' THEN 'info' ELSE 'warning' END,
                'Change request ' || v_word || ': ' || v_pr."ProjectNo",
                initcap(lower(replace(v_cr.kind, '_', ' '))) || ' on ' || coalesce(v_pr."ProjectName", v_pr."ProjectNo")
                    || ' was ' || v_word || coalesce('. ' || v_note, '.'),
                '/projects/' || v_cr.project_id || '?tab=changes', 'rule',
                'change:' || v_cr.id || ':' || v_step.id)
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;

-- Steps waiting on the caller, for My Actions and the PME desk.
CREATE OR REPLACE FUNCTION public.my_change_steps()
RETURNS TABLE (step_id uuid, change_id uuid, project_id text, project_no text, change_kind text, step_kind text, submitted_at timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT s.id, r.id, r.project_id, p."ProjectNo", r.kind, s.kind, r.submitted_at
    FROM public.project_change_steps s
    JOIN public.project_change_requests r ON r.id = s.change_id AND s.round = r.round
    JOIN public.projects p ON p."ProjectID" = r.project_id
   WHERE s.status = 'PENDING' AND r.status IN ('SUBMITTED', 'UNDER_REVIEW')
     AND NOT EXISTS (SELECT 1 FROM public.project_change_steps e
                      WHERE e.change_id = s.change_id AND e.round = s.round AND e.seq < s.seq AND e.status = 'PENDING')
     AND public.project_change_caller_may_act(r.project_id, s.kind)
   ORDER BY r.submitted_at;
$$;

-- ── 7. Timeline ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_change_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED', 'WITHDRAWN')
       AND NOT (NEW.status = 'WITHDRAWN' AND OLD.status IN ('DRAFT', 'RETURNED') AND NEW.round = 0) THEN
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'change',
                'Change request (' || lower(replace(NEW.kind, '_', ' ')) || ') ' ||
                CASE NEW.status WHEN 'SUBMITTED' THEN 'submitted'
                                WHEN 'RETURNED'  THEN 'returned for changes'
                                WHEN 'APPROVED'  THEN 'approved' || coalesce(' (' || NEW.order_no || ')', '')
                                WHEN 'REJECTED'  THEN 'rejected'
                                ELSE 'withdrawn' END
                || coalesce(' — ' || NEW.decision_note, ''), NEW.id::text);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.project_change_log() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_project_change_requests_log ON public.project_change_requests;
CREATE TRIGGER trg_project_change_requests_log AFTER UPDATE OF status ON public.project_change_requests
    FOR EACH ROW EXECUTE FUNCTION public.project_change_log();

-- ── 8. Grants and assertions ───────────────────────────────────────────
REVOKE ALL ON FUNCTION public.project_change_deltas(text, text, jsonb)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_head_position(text)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_change_save(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_change_submit(uuid, uuid)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_change_withdraw(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_change_record_step(uuid, text, text, uuid, uuid, text, date, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_change_steps()                              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_change_deltas(text, text, jsonb)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_head_position(text)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_save(uuid, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_submit(uuid, uuid)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_withdraw(uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_change_record_step(uuid, text, text, uuid, uuid, text, date, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_change_steps()                              TO authenticated, service_role;

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.project_change_requests', 'INSERT')
       OR has_table_privilege('authenticated', 'public.project_change_steps', 'UPDATE') THEN
        RAISE EXCEPTION 'change requests are writable by clients — they must go through the RPCs';
    END IF;
    IF has_function_privilege('authenticated', 'public.project_change_apply(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can apply a change directly';
    END IF;
    IF has_table_privilege('authenticated', 'public.project_budget_lines', 'INSERT') THEN
        RAISE EXCEPTION 'the sanction is writable by clients';
    END IF;
END $$;

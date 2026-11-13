-- P9 Project breadth: EP10 externally funded and seed schemes, EP1 multi-lab
-- projects, EP12 publication file. EP7 (finance import) and ES5
-- (assessment-promotion file) wait for their inputs; nothing is built for them.
--
-- EP10  project_schemes gains EFP (externally funded) and OLP (lab seed /
--       own). Review steps: OLP as ULIP; EFP vetting → Director forwards →
--       sponsor decides. No EFP rule checks until the 2017 guidelines come.
--       proposal_set_track and project_legacy_complete accept any scheme row
--       (bodies copied from 20261111000001 / 20261112000003, only that check
--       changed).
-- EP1   project_labs (NODAL / PARTICIPATING, RC approval); lab_code on budget,
--       receipt and expenditure rows (default AMPRI); a reversal keeps its
--       original's lab; project_lab_money per lab; project_ip_agreements, and
--       a multi-lab ACTIVE project without one is flagged (§6.2).
-- EP12  publication_files DRAFT → ETHICS_CHECK → CLEARED (communication
--       number issued) → SUBMITTED (every staff author consented) → ACCEPTED
--       → PUBLISHED (creates the scientific_outputs row, authors linked).

BEGIN;

-- ── EP10 ───────────────────────────────────────────────────────────────
INSERT INTO public.project_schemes (code, name) VALUES
    ('EFP', 'Externally funded project'),
    ('OLP', 'Lab seed / own project')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.proposal_step_kinds(p_track text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_track
    WHEN 'ULIP' THEN ARRAY['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']
    WHEN 'OLP'  THEN ARRAY['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']
    WHEN 'HQ'   THEN ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD',
                           'HQ_SCREENING', 'HQ_EXPERT', 'COMPETENT_AUTHORITY']
    WHEN 'EFP'  THEN ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY']
  END;
$$;

CREATE OR REPLACE FUNCTION public.project_change_step_kinds(p_track text, p_kind text, p_increase_pct numeric)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_track IN ('ULIP', 'OLP') THEN ARRAY['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']
    WHEN p_track = 'EFP' THEN ARRAY['PME_VETTING', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'TIME_OVERRUN' THEN
         ARRAY['PME_VETTING', 'RESEARCH_COUNCIL', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'RCE' AND coalesce(p_increase_pct, 0) <= public.csir_rule('project.cost_overrun_dg_limit_pct')::numeric THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'RCE' THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE',
               'REVISED_COST_COMMITTEE', 'COMPETENT_AUTHORITY']
    WHEN p_kind IN ('REPHASING', 'REAPPROPRIATION', 'REALLOCATION') THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'FORECLOSURE' THEN ARRAY['PME_VETTING', 'MONITORING_COMMITTEE', 'RESEARCH_COUNCIL']
  END;
$$;

CREATE OR REPLACE FUNCTION public.project_slot_plan(p_track text, p_category text)
RETURNS TABLE (kind text, body text, months int[], minutes_days int)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT v.kind, v.body, v.months, v.minutes_days FROM (VALUES
    ('PROGRESS_REPORT',      'Progress report',                 ARRAY[3, 9],        NULL::int, true),
    ('REVIEW_COMMITTEE',     'ULIP review committee',           ARRAY[3, 9],        NULL,      p_track IN ('ULIP', 'OLP')),
    ('RESEARCH_COUNCIL',     'Research Council',                ARRAY[3, 9],        NULL,      p_track = 'HQ'),
    ('TASK_FORCE',           'Task Force',                      ARRAY[3, 6, 9, 12], 7,         p_track = 'HQ' AND p_category IN ('MMP','FBR','NCP','FIR','FTT','FTC')),
    ('TASK_FORCE',           'Task Force (FCP)',                ARRAY[3, 9],        7,         p_track = 'HQ' AND p_category = 'FCP'),
    ('MONITORING_COMMITTEE', 'External Monitoring Committee',   ARRAY[3, 9],        NULL,      p_track = 'HQ' AND p_category IN ('FBR','NCP','FIR')),
    ('STAGE_GATE',           'Stage-gate review',               ARRAY[3, 9],        NULL,      p_track = 'HQ' AND p_category IN ('MMP','FTT','FTC'))
  ) v(kind, body, months, minutes_days, applies)
  WHERE applies;
$$;

-- proposal_sanction names the authority for ULIP and HQ only.
CREATE OR REPLACE FUNCTION public.projects_default_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW."ApprovalAuthority" IS NULL THEN
        NEW."ApprovalAuthority" := CASE NEW.track
            WHEN 'OLP' THEN 'Director, CSIR-AMPRI'
            WHEN 'EFP' THEN coalesce(nullif(btrim(NEW."SponsorerName"), ''), 'Sponsor')
        END;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_projects_default_authority ON public.projects;
CREATE TRIGGER trg_projects_default_authority BEFORE INSERT ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.projects_default_authority();

CREATE OR REPLACE FUNCTION public.proposal_set_track(p_id uuid, p_track text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_row public.proposals%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.proposals WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
    IF NOT public.proposal_caller_may_act(v_row, 'PME_VETTING') THEN
        RAISE EXCEPTION 'Only PME can set the track of a submitted proposal';
    END IF;
    IF v_row.status NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED', 'APPROVED', 'OM_ISSUED') THEN
        RAISE EXCEPTION 'The track can be set by PME only on a proposal in review';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_schemes WHERE code = p_track) THEN RAISE EXCEPTION 'Unknown track: %', p_track; END IF;
    IF EXISTS (SELECT 1 FROM public.proposal_review_steps
                WHERE proposal_id = p_id AND status IN ('DONE', 'RETURNED', 'REJECTED')
                  AND round = (SELECT max(round) FROM public.proposal_review_steps WHERE proposal_id = p_id)) THEN
        RAISE EXCEPTION 'Review has already started on this track';
    END IF;

    DELETE FROM public.proposal_review_steps
     WHERE proposal_id = p_id
       AND round = (SELECT max(round) FROM public.proposal_review_steps WHERE proposal_id = p_id);
    UPDATE public.proposals SET track = p_track, updated_at = now() WHERE id = p_id;
    PERFORM public.proposal_open_round(p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.project_legacy_complete(
    p_project_id    text,
    p_track         text,
    p_category      text,
    p_start         date,
    p_end           date,
    p_sanction_ref  text,
    p_sanction_date date,
    p_document_id   uuid,
    p_lines         jsonb,
    p_received      jsonb,
    p_spent         jsonb,
    p_as_of         date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pr    public.projects%ROWTYPE;
    v_heads text[] := ARRAY['EQUIPMENT', 'WORKS', 'MANPOWER', 'CONSUMABLES', 'TA_INDIA', 'TA_ABROAD',
                            'CONTINGENCY', 'OUTSOURCING', 'OTHER'];
    v_fy    text := '^[0-9]{4}-[0-9]{2}$';
    v_bad   record;
    v_total numeric;
BEGIN
    IF NOT public.project_caller_is_office(p_project_id) THEN
        RAISE EXCEPTION 'Only PME brings a legacy project in, and not one of their own';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.proposal_id IS NOT NULL THEN RAISE EXCEPTION 'This project came through SURYA; it has its own record'; END IF;
    IF v_pr.legacy_completed_at IS NOT NULL THEN RAISE EXCEPTION 'This project has already been brought in'; END IF;
    IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING') THEN
        RAISE EXCEPTION 'Only a running project is brought in; a closed one is archived';
    END IF;
    IF EXISTS (SELECT 1 FROM public.project_budget_lines WHERE project_id = p_project_id)
       OR EXISTS (SELECT 1 FROM public.project_fund_receipts WHERE project_id = p_project_id)
       OR EXISTS (SELECT 1 FROM public.project_expenditure WHERE project_id = p_project_id) THEN
        RAISE EXCEPTION 'This project already has money on record';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_schemes WHERE code = p_track) THEN RAISE EXCEPTION 'Choose the scheme'; END IF;
    IF p_track = 'HQ' AND coalesce(p_category, '') NOT IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP','IST') THEN
        RAISE EXCEPTION 'Choose the HQ category';
    END IF;
    IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN RAISE EXCEPTION 'Give the start and end dates'; END IF;
    IF coalesce(btrim(p_sanction_ref), '') = '' OR p_sanction_date IS NULL THEN
        RAISE EXCEPTION 'Give the sanction order number and date';
    END IF;
    IF p_as_of IS NULL OR p_as_of > public.ist_today() THEN RAISE EXCEPTION 'Give the date the figures are up to'; END IF;
    PERFORM public.project_assert_document(p_project_id, p_document_id, 'sanction_order');
    IF jsonb_array_length(coalesce(p_lines, '[]')) = 0 THEN RAISE EXCEPTION 'Enter the sanction by year and head'; END IF;

    SELECT x.* INTO v_bad FROM jsonb_to_recordset(p_lines) AS x(fiscal_year text, head text, amount numeric)
     WHERE x.head IS NULL OR NOT (x.head = ANY (v_heads)) OR coalesce(x.fiscal_year, '') !~ v_fy OR x.amount IS NULL OR x.amount < 0
     LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Each sanction line needs a financial year, a head and an amount'; END IF;
    SELECT x.* INTO v_bad FROM jsonb_to_recordset(coalesce(p_received, '[]')) AS x(fiscal_year text, amount numeric)
     WHERE coalesce(x.fiscal_year, '') !~ v_fy OR coalesce(x.amount, 0) <= 0 LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Each receipt needs a financial year and an amount above zero'; END IF;
    SELECT x.* INTO v_bad FROM jsonb_to_recordset(coalesce(p_spent, '[]')) AS x(fiscal_year text, head text, amount numeric)
     WHERE x.head IS NULL OR NOT (x.head = ANY (v_heads)) OR coalesce(x.fiscal_year, '') !~ v_fy OR coalesce(x.amount, 0) <= 0
     LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Each expenditure line needs a financial year, a head and an amount above zero'; END IF;

    SELECT sum(x.amount) INTO v_total FROM jsonb_to_recordset(p_lines) AS x(amount numeric);
    UPDATE public.projects SET
        track = p_track,
        "ProjectCategory" = CASE WHEN p_track = 'HQ' THEN p_category ELSE "ProjectCategory" END,
        "StartDate" = p_start::text, "CompletioDate" = p_end::text,
        "SanctionedCost" = trim_scale(v_total)::text,
        sanction_ref = btrim(p_sanction_ref), sanction_date = p_sanction_date,
        legacy_completed_at = now(), legacy_completed_by = auth.uid()
     WHERE "ProjectID" = p_project_id;

    INSERT INTO public.project_budget_lines (project_id, fiscal_year, head, item, amount, source)
    SELECT p_project_id, x.fiscal_year, x.head, '', x.amount, 'LEGACY'
      FROM jsonb_to_recordset(p_lines) AS x(fiscal_year text, head text, amount numeric)
     WHERE x.amount > 0;

    -- Dated at the end of their financial year, or the as-of date if earlier.
    INSERT INTO public.project_fund_receipts (project_id, received_on, fiscal_year, amount, source, order_no,
                                              document_id, notes, opening_balance, recorded_by)
    SELECT p_project_id,
           least(p_as_of, make_date(substr(x.fiscal_year, 1, 4)::int + 1, 3, 31)), x.fiscal_year, x.amount,
           'Opening balance', 'Opening balance', p_document_id,
           'Received before the project was brought into SURYA, to ' || to_char(p_as_of, 'DD Mon YYYY'), true, auth.uid()
      FROM jsonb_to_recordset(coalesce(p_received, '[]')) AS x(fiscal_year text, amount numeric);

    INSERT INTO public.project_expenditure (project_id, fiscal_year, period, head, amount, document_id, notes,
                                            opening_balance, recorded_by)
    SELECT p_project_id, x.fiscal_year, 'FY', x.head, x.amount, p_document_id,
           'Spent before the project was brought into SURYA, to ' || to_char(p_as_of, 'DD Mon YYYY'), true, auth.uid()
      FROM jsonb_to_recordset(coalesce(p_spent, '[]')) AS x(fiscal_year text, head text, amount numeric);

    UPDATE public.projects
       SET "UtilizedAmount" = trim_scale(coalesce((SELECT sum(amount) FROM public.project_expenditure WHERE project_id = p_project_id), 0))::text,
           stage = CASE WHEN stage = 'SANCTIONED' AND EXISTS (SELECT 1 FROM public.project_fund_receipts WHERE project_id = p_project_id)
                        THEN 'ACTIVE' ELSE stage END
     WHERE "ProjectID" = p_project_id;

    -- Reviews and reports that fell due before SURYA are not overdue.
    UPDATE public.project_review_slots
       SET status = 'CANCELLED', notes = 'Due before the project was brought into SURYA'
     WHERE project_id = p_project_id AND generated AND status = 'PENDING' AND due_date < p_as_of;

    INSERT INTO public.project_events (project_id, actor, kind, summary)
    VALUES (p_project_id, auth.uid(), 'legacy',
            'Brought into SURYA: sanction ₹' || to_char(v_total, 'FM99,99,99,99,990') || ' by head, money to '
                || to_char(p_as_of, 'DD Mon YYYY') || ' as opening balances');
END;
$$;

-- ── EP1 multi-lab ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_labs (
    project_id text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    lab_code   text NOT NULL CHECK (lab_code ~ '^[A-Z][A-Z0-9-]{1,15}$'),
    role       text NOT NULL CHECK (role IN ('NODAL', 'PARTICIPATING')),
    rc_approval_document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
    added_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    added_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, lab_code)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_labs_one_nodal ON public.project_labs (project_id) WHERE role = 'NODAL';

CREATE TABLE IF NOT EXISTS public.project_ip_agreements (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES public.project_documents(id),
    signed_on   date NOT NULL,
    recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_budget_lines  ADD COLUMN IF NOT EXISTS lab_code text NOT NULL DEFAULT 'AMPRI';
ALTER TABLE public.project_fund_receipts ADD COLUMN IF NOT EXISTS lab_code text NOT NULL DEFAULT 'AMPRI';
ALTER TABLE public.project_expenditure   ADD COLUMN IF NOT EXISTS lab_code text NOT NULL DEFAULT 'AMPRI';

ALTER TABLE public.project_labs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ip_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_labs_select ON public.project_labs;
CREATE POLICY project_labs_select ON public.project_labs FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_labs.project_id));
DROP POLICY IF EXISTS project_ip_agreements_select ON public.project_ip_agreements;
CREATE POLICY project_ip_agreements_select ON public.project_ip_agreements FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_ip_agreements.project_id));
REVOKE ALL ON public.project_labs, public.project_ip_agreements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.project_labs, public.project_ip_agreements TO authenticated;
GRANT ALL ON public.project_labs, public.project_ip_agreements TO service_role;

-- A reversal books against the same lab as the entry it reverses.
CREATE OR REPLACE FUNCTION public.project_money_reversal_lab()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.reverses_id IS NOT NULL THEN
        IF TG_TABLE_NAME = 'project_fund_receipts' THEN
            SELECT lab_code INTO NEW.lab_code FROM public.project_fund_receipts WHERE id = NEW.reverses_id;
        ELSE
            SELECT lab_code INTO NEW.lab_code FROM public.project_expenditure WHERE id = NEW.reverses_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_receipts_reversal_lab ON public.project_fund_receipts;
CREATE TRIGGER trg_receipts_reversal_lab BEFORE INSERT ON public.project_fund_receipts
    FOR EACH ROW EXECUTE FUNCTION public.project_money_reversal_lab();
DROP TRIGGER IF EXISTS trg_expenditure_reversal_lab ON public.project_expenditure;
CREATE TRIGGER trg_expenditure_reversal_lab BEFORE INSERT ON public.project_expenditure
    FOR EACH ROW EXECUTE FUNCTION public.project_money_reversal_lab();

CREATE OR REPLACE FUNCTION public.project_lab_set(p_project_id text, p_lab_code text, p_role text, p_rc_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT coalesce(public.project_caller_is_office(p_project_id), false) THEN
        RAISE EXCEPTION 'Only PME records the labs, and not on a project of their own';
    END IF;
    IF p_rc_document_id IS NOT NULL THEN
        PERFORM public.project_assert_document(p_project_id, p_rc_document_id, 'other');
    END IF;
    INSERT INTO public.project_labs (project_id, lab_code, role, rc_approval_document_id, added_by)
    VALUES (p_project_id, upper(btrim(p_lab_code)), p_role, p_rc_document_id, auth.uid())
    ON CONFLICT (project_id, lab_code) DO UPDATE
       SET role = EXCLUDED.role, rc_approval_document_id = coalesce(EXCLUDED.rc_approval_document_id, project_labs.rc_approval_document_id);
END;
$$;

-- Book an entry or a budget line to a lab on the project. Not a reversal;
-- moving an entry moves its reversal too.
CREATE OR REPLACE FUNCTION public.project_entry_set_lab(p_kind text, p_id uuid, p_lab_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_project text;
    v_lab     text := upper(btrim(p_lab_code));
BEGIN
    IF p_kind = 'receipt' THEN
        SELECT project_id INTO v_project FROM public.project_fund_receipts WHERE id = p_id AND reverses_id IS NULL;
    ELSIF p_kind = 'expenditure' THEN
        SELECT project_id INTO v_project FROM public.project_expenditure WHERE id = p_id AND reverses_id IS NULL;
    ELSIF p_kind = 'budget' THEN
        SELECT project_id INTO v_project FROM public.project_budget_lines WHERE id = p_id;
    ELSE
        RAISE EXCEPTION 'Unknown entry kind: %', p_kind;
    END IF;
    IF v_project IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
    IF NOT coalesce(public.project_caller_is_office(v_project), false) THEN
        RAISE EXCEPTION 'Only PME books entries to a lab, and not on a project of their own';
    END IF;
    IF v_lab <> 'AMPRI' AND NOT EXISTS (SELECT 1 FROM public.project_labs WHERE project_id = v_project AND lab_code = v_lab) THEN
        RAISE EXCEPTION 'Add % to the project''s labs first', v_lab;
    END IF;
    IF p_kind = 'receipt' THEN
        UPDATE public.project_fund_receipts SET lab_code = v_lab WHERE id = p_id OR reverses_id = p_id;
    ELSIF p_kind = 'expenditure' THEN
        UPDATE public.project_expenditure SET lab_code = v_lab WHERE id = p_id OR reverses_id = p_id;
    ELSE
        UPDATE public.project_budget_lines SET lab_code = v_lab WHERE id = p_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_ip_agreement_add(p_project_id text, p_document_id uuid, p_signed_on date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT coalesce(public.project_caller_is_office(p_project_id), false) THEN
        RAISE EXCEPTION 'Only PME records the IP agreement, and not on a project of their own';
    END IF;
    IF p_signed_on IS NULL THEN RAISE EXCEPTION 'Give the date it was signed'; END IF;
    PERFORM public.project_assert_document(p_project_id, p_document_id, 'other');
    INSERT INTO public.project_ip_agreements (project_id, document_id, signed_on, recorded_by)
    VALUES (p_project_id, p_document_id, p_signed_on, auth.uid()) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Per lab: sanctioned (budget lines) · received · spent · balance. Invoker.
CREATE OR REPLACE FUNCTION public.project_lab_money(p_project_id text)
RETURNS TABLE (lab_code text, role text, sanctioned numeric, received numeric, spent numeric, balance numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
    WITH labs AS (
        SELECT l.lab_code, l.role FROM public.project_labs l WHERE l.project_id = p_project_id
        UNION SELECT 'AMPRI', NULL WHERE NOT EXISTS (SELECT 1 FROM public.project_labs l WHERE l.project_id = p_project_id AND l.lab_code = 'AMPRI')
        UNION SELECT b.lab_code, NULL FROM public.project_budget_lines b WHERE b.project_id = p_project_id
              AND NOT EXISTS (SELECT 1 FROM public.project_labs l WHERE l.project_id = p_project_id AND l.lab_code = b.lab_code)
              AND b.lab_code <> 'AMPRI'
    )
    SELECT l.lab_code, l.role, s.v, r.v, e.v, r.v - e.v
      FROM labs l
      CROSS JOIN LATERAL (SELECT coalesce(sum(amount), 0) v FROM public.project_budget_lines  WHERE project_id = p_project_id AND lab_code = l.lab_code) s
      CROSS JOIN LATERAL (SELECT coalesce(sum(amount), 0) v FROM public.project_fund_receipts WHERE project_id = p_project_id AND lab_code = l.lab_code) r
      CROSS JOIN LATERAL (SELECT coalesce(sum(amount), 0) v FROM public.project_expenditure   WHERE project_id = p_project_id AND lab_code = l.lab_code) e
     ORDER BY (l.role = 'NODAL') DESC NULLS LAST, l.lab_code;
$$;

-- §6.2: a multi-lab project running without a signed IP agreement.
CREATE OR REPLACE FUNCTION public.project_ip_agreement_missing(p_project_id text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = p_project_id AND p.stage = 'ACTIVE')
       AND EXISTS (SELECT 1 FROM public.project_labs l WHERE l.project_id = p_project_id AND l.lab_code <> 'AMPRI')
       AND NOT EXISTS (SELECT 1 FROM public.project_ip_agreements a WHERE a.project_id = p_project_id);
$$;

-- ── EP12 publication file ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.publication_files (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    output_id        text REFERENCES public.scientific_outputs(id) ON DELETE SET NULL,
    title            text NOT NULL CHECK (btrim(title) <> ''),
    division_code    text NOT NULL,
    communication_no text UNIQUE,
    similarity_pct   numeric(5,2) CHECK (similarity_pct BETWEEN 0 AND 100),
    similarity_report_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
    journal          text,
    year             integer,
    doi              text,
    status           text NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT', 'ETHICS_CHECK', 'CLEARED', 'SUBMITTED', 'ACCEPTED', 'PUBLISHED')),
    created_by       uuid NOT NULL REFERENCES auth.users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    cleared_by       uuid REFERENCES auth.users(id),
    cleared_at       timestamptz,
    submitted_at     timestamptz,
    published_at     timestamptz
);

CREATE TABLE IF NOT EXISTS public.publication_author_consents (
    file_id      uuid NOT NULL REFERENCES public.publication_files(id) ON DELETE CASCADE,
    pos          integer NOT NULL CHECK (pos > 0),
    name         text NOT NULL CHECK (btrim(name) <> ''),
    staff_id     text REFERENCES public.staff("ID") ON DELETE SET NULL,
    contribution text,
    consented_at timestamptz,
    PRIMARY KEY (file_id, pos)
);

-- Who may clear a paper of a division: its HoD / Division Head, the Director, MasterAdmin.
CREATE OR REPLACE FUNCTION public.caller_is_publication_clearer(p_division text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT public.caller_has_role('Director') OR public.caller_has_role('MasterAdmin')
        OR ((public.caller_has_role('HOD') OR public.caller_has_role('DivisionHead')) AND public.caller_in_division(p_division));
$$;

ALTER TABLE public.publication_files           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_author_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS publication_files_select ON public.publication_files;
CREATE POLICY publication_files_select ON public.publication_files FOR SELECT TO authenticated
    USING (created_by = (SELECT auth.uid())
        OR public.caller_is_publication_clearer(division_code)
        OR EXISTS (SELECT 1 FROM public.publication_author_consents c
                    WHERE c.file_id = publication_files.id AND c.staff_id = public.caller_staff_id()));
DROP POLICY IF EXISTS publication_author_consents_select ON public.publication_author_consents;
CREATE POLICY publication_author_consents_select ON public.publication_author_consents FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.publication_files f WHERE f.id = publication_author_consents.file_id));
REVOKE ALL ON public.publication_files, public.publication_author_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.publication_files, public.publication_author_consents TO authenticated;
GRANT ALL ON public.publication_files, public.publication_author_consents TO service_role;

-- p_authors: [{"name": "...", "staff_id": "S-1" | null}, ...] in author order.
CREATE OR REPLACE FUNCTION public.publication_file_create(p_title text, p_division text, p_authors jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id  uuid;
    v_div text;
BEGIN
    IF public.caller_staff_id() IS NULL THEN RAISE EXCEPTION 'Only staff open a publication file'; END IF;
    -- The division decides who clears the paper, so it is the author's own, never the caller's choice.
    SELECT s."Division" INTO v_div FROM public.staff s WHERE s."ID" = public.caller_staff_id();
    IF v_div IS NULL THEN RAISE EXCEPTION 'No division on record for you'; END IF;
    IF p_division IS DISTINCT FROM v_div THEN RAISE EXCEPTION 'A paper is filed in your own division (%)', v_div; END IF;
    IF coalesce(jsonb_array_length(p_authors), 0) = 0 THEN RAISE EXCEPTION 'List the authors'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_authors) a WHERE a->>'staff_id' = public.caller_staff_id()) THEN
        RAISE EXCEPTION 'You must be one of the authors';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_authors) a
                WHERE a->>'staff_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s."ID" = a->>'staff_id')) THEN
        RAISE EXCEPTION 'Unknown staff ID among the authors';
    END IF;
    INSERT INTO public.publication_files (title, division_code, created_by)
    VALUES (btrim(p_title), v_div, auth.uid()) RETURNING id INTO v_id;
    INSERT INTO public.publication_author_consents (file_id, pos, name, staff_id)
    SELECT v_id, o, btrim(a->>'name'), nullif(a->>'staff_id', '')
      FROM jsonb_array_elements(p_authors) WITH ORDINALITY x(a, o);
    RETURN v_id;
END;
$$;

-- An in-house author records their contribution and consent.
CREATE OR REPLACE FUNCTION public.publication_consent(p_file_id uuid, p_contribution text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL OR public.caller_staff_id() IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    IF coalesce(btrim(p_contribution), '') = '' THEN RAISE EXCEPTION 'State your contribution'; END IF;
    UPDATE public.publication_author_consents c SET contribution = btrim(p_contribution), consented_at = now()
     WHERE c.file_id = p_file_id
       AND c.staff_id IN (SELECT s."ID" FROM public.staff s WHERE s.user_id = auth.uid())
       AND EXISTS (SELECT 1 FROM public.publication_files f WHERE f.id = p_file_id AND f.status IN ('DRAFT', 'ETHICS_CHECK', 'CLEARED'));
    IF NOT FOUND THEN RAISE EXCEPTION 'You are not an author of this file, or it is already submitted'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.publication_move(p_file_id uuid, p_to text, p_details jsonb DEFAULT '{}')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_f     public.publication_files%ROWTYPE;
    v_owner boolean;
    v_no    text;
    v_out   text;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    SELECT * INTO v_f FROM public.publication_files WHERE id = p_file_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Publication file not found'; END IF;
    v_owner := v_f.created_by = auth.uid();

    IF v_f.status = 'DRAFT' AND p_to = 'ETHICS_CHECK' THEN
        IF NOT v_owner THEN RAISE EXCEPTION 'Only the corresponding author sends it for the ethics check'; END IF;
        UPDATE public.publication_files SET status = p_to,
               similarity_pct = coalesce((p_details->>'similarity_pct')::numeric, similarity_pct),
               similarity_report_document_id = coalesce((p_details->>'similarity_report_document_id')::uuid, similarity_report_document_id)
         WHERE id = p_file_id;
    ELSIF v_f.status = 'ETHICS_CHECK' AND p_to IN ('CLEARED', 'DRAFT') THEN
        IF NOT coalesce(public.caller_is_publication_clearer(v_f.division_code), false) OR v_owner THEN
            RAISE EXCEPTION 'The HoD, Division Head or Director clears a paper, and not their own';
        END IF;
        IF p_to = 'CLEARED' THEN
            IF v_f.similarity_pct IS NULL THEN RAISE EXCEPTION 'The similarity check result is missing'; END IF;
            -- Communication number: AMPRI/<year>/<serial in that year>.
            PERFORM pg_advisory_xact_lock(hashtext('publication_communication_no'));
            SELECT 'AMPRI/' || extract(year FROM public.ist_today())::int || '/'
                   || lpad((count(*) + 1)::text, 4, '0')
              INTO v_no FROM public.publication_files
             WHERE communication_no LIKE 'AMPRI/' || extract(year FROM public.ist_today())::int || '/%';
            UPDATE public.publication_files SET status = 'CLEARED', communication_no = v_no, cleared_by = auth.uid(), cleared_at = now()
             WHERE id = p_file_id;
            v_out := v_no;
        ELSE
            UPDATE public.publication_files SET status = 'DRAFT' WHERE id = p_file_id;
        END IF;
    ELSIF v_f.status = 'CLEARED' AND p_to = 'SUBMITTED' THEN
        IF NOT v_owner THEN RAISE EXCEPTION 'Only the corresponding author records the submission'; END IF;
        IF v_f.communication_no IS NULL THEN RAISE EXCEPTION 'The paper has no communication number'; END IF;
        IF EXISTS (SELECT 1 FROM public.publication_author_consents
                    WHERE file_id = p_file_id AND staff_id IS NOT NULL AND consented_at IS NULL) THEN
            RAISE EXCEPTION 'Every in-house author must consent before submission';
        END IF;
        UPDATE public.publication_files SET status = 'SUBMITTED', submitted_at = now(),
               journal = coalesce(nullif(btrim(p_details->>'journal'), ''), journal)
         WHERE id = p_file_id;
    ELSIF v_f.status = 'SUBMITTED' AND p_to = 'ACCEPTED' THEN
        IF NOT v_owner THEN RAISE EXCEPTION 'Only the corresponding author records the acceptance'; END IF;
        UPDATE public.publication_files SET status = 'ACCEPTED' WHERE id = p_file_id;
    ELSIF v_f.status = 'ACCEPTED' AND p_to = 'PUBLISHED' THEN
        IF NOT v_owner THEN RAISE EXCEPTION 'Only the corresponding author records the publication'; END IF;
        v_f.journal := coalesce(nullif(btrim(p_details->>'journal'), ''), v_f.journal);
        v_f.year := coalesce((p_details->>'year')::int, v_f.year);
        v_f.doi := coalesce(nullif(btrim(p_details->>'doi'), ''), v_f.doi);
        IF v_f.journal IS NULL OR v_f.year IS NULL THEN RAISE EXCEPTION 'Give the journal and the year'; END IF;
        v_out := coalesce(v_f.output_id, 'PF-' || v_f.communication_no);
        INSERT INTO public.scientific_outputs (id, title, authors, journal, year, doi, division_code)
        SELECT v_out, v_f.title, array_agg(c.name ORDER BY c.pos), v_f.journal, v_f.year, v_f.doi, v_f.division_code
          FROM public.publication_author_consents c WHERE c.file_id = p_file_id
        ON CONFLICT (id) DO NOTHING;
        UPDATE public.output_authors a SET staff_id = c.staff_id, link_source = 'manual', confirmed_by = auth.uid(), confirmed_at = now()
          FROM public.publication_author_consents c
         WHERE c.file_id = p_file_id AND c.staff_id IS NOT NULL AND a.output_id = v_out AND a.pos = c.pos;
        UPDATE public.publication_files SET status = 'PUBLISHED', published_at = now(), output_id = v_out,
               journal = v_f.journal, year = v_f.year, doi = v_f.doi
         WHERE id = p_file_id;
    ELSE
        RAISE EXCEPTION 'A paper at % cannot move to %', v_f.status, p_to;
    END IF;
    RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.project_lab_set(text, text, text, uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_entry_set_lab(text, uuid, text)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_ip_agreement_add(text, uuid, date)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_lab_money(text)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_ip_agreement_missing(text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publication_file_create(text, text, jsonb)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publication_consent(uuid, text)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publication_move(uuid, text, jsonb)            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_lab_set(text, text, text, uuid)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_entry_set_lab(text, uuid, text)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_ip_agreement_add(text, uuid, date)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_lab_money(text)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_ip_agreement_missing(text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publication_file_create(text, text, jsonb)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publication_consent(uuid, text)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publication_move(uuid, text, jsonb)         TO authenticated, service_role;

COMMIT;

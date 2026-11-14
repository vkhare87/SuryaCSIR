-- ============================================================
-- Project lifecycle PL7 — bringing existing projects in, and rollout
-- Plan: docs/roadmap/sources/PROJECT-LIFECYCLE-PLAN.md §10
--
--   1. Track inferred for legacy projects from the project number or the
--      category (HQ codes, §2.2) or an in-house marker; anything unclear
--      stays NULL and is listed on the PME desk.
--   2. project_legacy_complete — PME's one-time form for a running project
--      that predates SURYA: track, category, dates, sanction by head, and
--      money received and spent to date as opening-balance entries. Reviews
--      that fell due before then are marked as before SURYA, not overdue.
--   3. project_legacy_lessons — an optional lessons note on a project closed
--      before SURYA; no approval chain is demanded retroactively.
--   4. Project records become PME's: the original HRAdmin / SystemAdmin /
--      MasterAdmin write policy on projects is replaced by MasterAdmin only
--      (PME has its own since 20261110000002).
--
-- Before applying in production: give at least one person the PME role, or
-- nobody but MasterAdmin can edit a project record afterwards.
-- Rerun: idempotent.
-- ============================================================

-- ── 1. Track for legacy projects ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_infer_track(p_no text, p_category text, p_fund_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN coalesce(p_no, '') ~* '^(FIR|FBR|NCP|FTT|FTC|MMP|FCP|HCP|IST)[0-9]{6}$'
      OR upper(btrim(coalesce(p_category, ''))) IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP','IST') THEN 'HQ'
    WHEN coalesce(p_no, '') ~* '^ULIP' OR coalesce(p_category, '') ~* '(ULIP|in[- ]?house)'
      OR coalesce(p_fund_type, '') ~* '(ULIP|in[- ]?house)' THEN 'ULIP'
  END;
$$;

UPDATE public.projects
   SET track = public.project_infer_track("ProjectNo", "ProjectCategory", "FundType")
 WHERE track IS NULL AND stage IS DISTINCT FROM 'ARCHIVED'
   AND public.project_infer_track("ProjectNo", "ProjectCategory", "FundType") IS NOT NULL;

-- ── 2. Opening balances and the sanction scan ──────────────────────────
ALTER TABLE public.project_fund_receipts ADD COLUMN IF NOT EXISTS opening_balance boolean NOT NULL DEFAULT false;
ALTER TABLE public.project_expenditure   ADD COLUMN IF NOT EXISTS opening_balance boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS legacy_completed_at timestamptz,
    ADD COLUMN IF NOT EXISTS legacy_completed_by uuid REFERENCES auth.users(id);

ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_doc_type_check;
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_doc_type_check CHECK (
    doc_type IN ('receipt_order', 'expenditure_statement', 'milestone_evidence', 'minutes',
                 'change_request', 'change_order', 'completion_report', 'closure_order', 'sanction_order', 'other'));

-- ── 3. Bringing a running legacy project in ────────────────────────────
-- p_lines    [{fiscal_year, head, amount}]  the sanction by year and head
-- p_received [{fiscal_year, amount}]        money received to p_as_of
-- p_spent    [{fiscal_year, head, amount}]  money spent to p_as_of
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
    IF p_track NOT IN ('ULIP', 'HQ') THEN RAISE EXCEPTION 'Choose ULIP or HQ'; END IF;
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

-- ── 4. Lessons for a project closed before SURYA ───────────────────────
CREATE OR REPLACE FUNCTION public.project_legacy_lessons(p_project_id text, p_fields jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pr public.projects%ROWTYPE;
    v_f  jsonb := coalesce(p_fields, '{}'::jsonb);
    v_id uuid;
BEGIN
    IF NOT (public.project_caller_is_pi(p_project_id) OR public.project_caller_is_office(p_project_id)) THEN
        RAISE EXCEPTION 'Only the PI or PME records the lessons of a project';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.proposal_id IS NOT NULL OR v_pr.stage NOT IN ('CLOSED', 'FORECLOSED') THEN
        RAISE EXCEPTION 'A lessons note is for a project closed before SURYA; others write a completion report';
    END IF;
    IF EXISTS (SELECT 1 FROM public.project_completion_reports WHERE project_id = p_project_id) THEN
        RAISE EXCEPTION 'Lessons are already on record for this project';
    END IF;
    IF coalesce(btrim(v_f->>'summary'), '') = '' THEN RAISE EXCEPTION 'Say in a line what the project did'; END IF;
    IF coalesce(btrim(v_f->>'what_worked'), '') = '' AND coalesce(btrim(v_f->>'what_did_not'), '') = ''
       AND coalesce(btrim(v_f->>'recommendations'), '') = '' THEN
        RAISE EXCEPTION 'Add at least one lesson: what worked, what did not, or advice to a future team';
    END IF;
    IF nullif(v_f->>'objectives_status', '') NOT IN ('MET', 'PARTLY_MET', 'NOT_MET') THEN
        RAISE EXCEPTION 'Objectives are met, partly met or not met';
    END IF;

    INSERT INTO public.project_completion_reports (
        project_id, status, round, summary, objectives_status, objectives_reason, what_worked, what_did_not,
        reusable_assets, recommendations, follow_on_ideas, decision_note, created_by, submitted_at, decided_at)
    VALUES (p_project_id, 'APPROVED', 0, btrim(v_f->>'summary'), nullif(v_f->>'objectives_status', ''),
            coalesce(v_f->>'objectives_reason', ''), coalesce(v_f->>'what_worked', ''), coalesce(v_f->>'what_did_not', ''),
            coalesce(v_f->>'reusable_assets', ''), coalesce(v_f->>'recommendations', ''), coalesce(v_f->>'follow_on_ideas', ''),
            'Recorded for a project closed before SURYA; no approval chain', auth.uid(), now(), now())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ── 5. Project records are PME's ───────────────────────────────────────
-- 20260712000003 let HRAdmin, SystemAdmin and MasterAdmin write any project
-- row. PME has its own policy (20261110000002); MasterAdmin keeps everything
-- PME can (plan §2.4). HRAdmin and SystemAdmin lose project writes.
DROP POLICY IF EXISTS "projects_write" ON public.projects;
-- Same rule under its pre-2026-07-12 Dashboard name; the live project still
-- carried it, so the assertion below refused the first push. This file had
-- never applied there (it rolled back whole); a no-op everywhere else.
-- The rest of that drift is removed in 20261112000009.
DROP POLICY IF EXISTS "Admins can write projects" ON public.projects;
DROP POLICY IF EXISTS "projects_write_master" ON public.projects;
CREATE POLICY "projects_write_master" ON public.projects
    FOR ALL TO authenticated
    USING (public.user_has_role('MasterAdmin')) WITH CHECK (public.user_has_role('MasterAdmin'));

-- Legacy projects still to bring in, for the PME desk and the rollout check.
CREATE OR REPLACE FUNCTION public.project_legacy_pending()
RETURNS TABLE (project_id text, project_no text, project_name text, stage text, track text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p."ProjectID", p."ProjectNo", p."ProjectName", p.stage, p.track
    FROM public.projects p
   WHERE p.proposal_id IS NULL AND p.legacy_completed_at IS NULL
     AND p.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING')
   ORDER BY p."ProjectNo";
$$;

REVOKE ALL ON FUNCTION public.project_legacy_complete(text, text, text, date, date, text, date, uuid, jsonb, jsonb, jsonb, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_legacy_lessons(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_legacy_pending()            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_legacy_complete(text, text, text, date, date, text, date, uuid, jsonb, jsonb, jsonb, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_legacy_lessons(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_legacy_pending()            TO authenticated, service_role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects'
                AND cmd <> 'SELECT' AND (qual ILIKE '%HRAdmin%' OR qual ILIKE '%SystemAdmin%')) THEN
        RAISE EXCEPTION 'HRAdmin or SystemAdmin can still write project records';
    END IF;
END $$;

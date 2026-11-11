-- ============================================================
-- 20261111000002_project_execution
-- Project lifecycle PL3 — funds and execution
-- (docs/roadmap/sources/PROJECT-LIFECYCLE-PLAN.md §5.2, §5.3, §8.2).
--
--   1. project_documents   — scans for a project: receipt orders,
--                            expenditure statements, milestone evidence.
--   2. Funds ledger        — receipts and expenditure, entered by PME,
--                            append-only: a mistake is a reversal entry.
--   3. Milestones          — PI proposes and reports; PME confirms.
--   4. project_events      — the timeline, written by triggers so no
--                            path can change a project without a trace.
--   5. Output links        — publications, patents and equipment gain
--                            project_id; PME or the PI links them.
--
-- Rerun: idempotent.
-- ============================================================

-- ── 1. Who is a party to a project ─────────────────────────────────────
-- PI (by staff key, or as the proposal's PI or author) or a co-PI named on
-- the proposal it was sanctioned from. These may never record its money or
-- confirm its milestones (plan §4.2). SECURITY DEFINER: the answer must not
-- depend on what the caller can see of the proposal.
CREATE OR REPLACE FUNCTION public.project_caller_is_party(p_project_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects pr
      LEFT JOIN public.proposals p ON p.id = pr.proposal_id
     WHERE pr."ProjectID" = p_project_id
       AND (
         (pr.pi_staff_id IS NOT NULL AND pr.pi_staff_id = public.caller_staff_id())
         OR p.pi_user_id = (SELECT auth.uid())
         OR p.created_by = (SELECT auth.uid())
         OR (p.id IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.proposal_copis c
                WHERE c.proposal_id = p.id AND c.staff_id = public.caller_staff_id()))
       ));
$$;
REVOKE ALL ON FUNCTION public.project_caller_is_party(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_caller_is_party(text) TO authenticated, service_role;

-- The project office for this project: PME (or MasterAdmin), and not a party.
CREATE OR REPLACE FUNCTION public.project_caller_is_office(p_project_id text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (public.caller_is_pme() OR public.caller_has_role('MasterAdmin'))
     AND NOT public.project_caller_is_party(p_project_id);
$$;

-- Indian financial year of a date: 2027-04-01 → '2027-28'.
CREATE OR REPLACE FUNCTION public.fiscal_year_of(p_date date)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT to_char(y, 'FM0000') || '-' || to_char((y + 1) % 100, 'FM00')
    FROM (SELECT CASE WHEN extract(month FROM p_date) >= 4
                      THEN extract(year FROM p_date)::int
                      ELSE extract(year FROM p_date)::int - 1 END AS y) s;
$$;

-- ── 2. Project documents ───────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.project_documents (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    doc_type     text NOT NULL CHECK (doc_type IN ('receipt_order', 'expenditure_statement', 'milestone_evidence', 'other')),
    storage_path text NOT NULL,
    file_name    text NOT NULL,
    file_size    bigint,
    uploaded_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
    uploaded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_documents_project_idx ON public.project_documents (project_id);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

-- Whoever may see the project (projects RLS applies inside the subquery).
DROP POLICY IF EXISTS "project_documents_select" ON public.project_documents;
CREATE POLICY "project_documents_select" ON public.project_documents
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_documents.project_id));

-- The project office files money and general documents; the PI files
-- evidence for their own milestones.
DROP POLICY IF EXISTS "project_documents_insert" ON public.project_documents;
CREATE POLICY "project_documents_insert" ON public.project_documents
    FOR INSERT TO authenticated
    WITH CHECK (
        uploaded_by = (SELECT auth.uid())
        AND (public.project_caller_is_office(project_id)
             OR (doc_type = 'milestone_evidence' AND public.project_caller_is_party(project_id))));

REVOKE UPDATE, DELETE ON public.project_documents FROM authenticated;
GRANT SELECT, INSERT ON public.project_documents TO authenticated, service_role;

-- Object name layout: {project_id}/{doc_type}/{epoch_ms}_{filename}
DROP POLICY IF EXISTS project_docs_storage_select ON storage.objects;
CREATE POLICY project_docs_storage_select ON storage.objects
    FOR SELECT USING (
        bucket_id = 'project-documents'
        AND EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = split_part(name, '/', 1)));

DROP POLICY IF EXISTS project_docs_storage_insert ON storage.objects;
CREATE POLICY project_docs_storage_insert ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'project-documents'
        AND (public.project_caller_is_office(split_part(name, '/', 1))
             OR (split_part(name, '/', 2) = 'milestone_evidence'
                 AND public.project_caller_is_party(split_part(name, '/', 1)))));

-- ── 3. Funds ledger ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_fund_receipts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    received_on  date NOT NULL,
    fiscal_year  text NOT NULL,
    -- Negative only on a reversal entry.
    amount       numeric(14,2) NOT NULL CHECK (amount <> 0),
    head         text CHECK (head IS NULL OR head IN ('EQUIPMENT', 'WORKS', 'MANPOWER', 'CONSUMABLES',
                             'TA_INDIA', 'TA_ABROAD', 'CONTINGENCY', 'OUTSOURCING', 'OTHER')),
    source       text NOT NULL DEFAULT '',
    order_no     text NOT NULL DEFAULT '',
    order_date   date,
    ifd_file_no  text,
    ifd_date     date,
    document_id  uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
    notes        text,
    reverses_id  uuid UNIQUE REFERENCES public.project_fund_receipts(id),
    recorded_by  uuid NOT NULL REFERENCES auth.users(id),
    recorded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_fund_receipts_project_idx ON public.project_fund_receipts (project_id, received_on);

CREATE TABLE IF NOT EXISTS public.project_expenditure (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    fiscal_year  text NOT NULL CHECK (fiscal_year ~ '^\d{4}-\d{2}$'),
    -- What the statement covers: 'Q1'..'Q4', 'H1', 'H2' or 'FY'.
    period       text NOT NULL CHECK (period IN ('Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'FY')),
    head         text NOT NULL CHECK (head IN ('EQUIPMENT', 'WORKS', 'MANPOWER', 'CONSUMABLES',
                             'TA_INDIA', 'TA_ABROAD', 'CONTINGENCY', 'OUTSOURCING', 'OTHER')),
    amount       numeric(14,2) NOT NULL CHECK (amount <> 0),
    document_id  uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
    notes        text,
    reverses_id  uuid UNIQUE REFERENCES public.project_expenditure(id),
    recorded_by  uuid NOT NULL REFERENCES auth.users(id),
    recorded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_expenditure_project_idx ON public.project_expenditure (project_id, fiscal_year);

ALTER TABLE public.project_fund_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_expenditure   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_fund_receipts_select" ON public.project_fund_receipts;
CREATE POLICY "project_fund_receipts_select" ON public.project_fund_receipts
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_fund_receipts.project_id));
DROP POLICY IF EXISTS "project_expenditure_select" ON public.project_expenditure;
CREATE POLICY "project_expenditure_select" ON public.project_expenditure
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_expenditure.project_id));

-- Append-only for every client: the RPCs below are the only writers.
REVOKE INSERT, UPDATE, DELETE ON public.project_fund_receipts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_expenditure   FROM authenticated;
GRANT SELECT ON public.project_fund_receipts TO authenticated, service_role;
GRANT SELECT ON public.project_expenditure   TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.project_assert_document(p_project_id text, p_document_id uuid, p_type text)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
    IF p_document_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.project_documents d
         WHERE d.id = p_document_id AND d.project_id = p_project_id AND d.doc_type = p_type) THEN
        RAISE EXCEPTION 'Upload the signed scan first';
    END IF;
END;
$$;

-- Money received. HQ-track receipts need the IFD concurrence reference
-- (guidelines §7.2). A project created by sanction cannot receive more than
-- it was sanctioned; a revised cost comes with a change request (PL5).
CREATE OR REPLACE FUNCTION public.project_record_receipt(
    p_project_id  text,
    p_received_on date,
    p_amount      numeric,
    p_head        text,
    p_source      text,
    p_order_no    text,
    p_order_date  date,
    p_ifd_file_no text,
    p_ifd_date    date,
    p_document_id uuid,
    p_notes       text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pr       public.projects%ROWTYPE;
    v_received numeric;
    v_id       uuid;
BEGIN
    IF NOT public.project_caller_is_office(p_project_id) THEN
        RAISE EXCEPTION 'Only PME records money received, and not on a project of their own';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING') THEN
        RAISE EXCEPTION 'Money can be recorded only on a sanctioned or running project';
    END IF;
    IF p_received_on IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Enter the date and an amount above zero';
    END IF;
    IF coalesce(btrim(p_order_no), '') = '' THEN RAISE EXCEPTION 'Enter the release order number'; END IF;
    IF v_pr.track = 'HQ' AND (coalesce(btrim(p_ifd_file_no), '') = '' OR p_ifd_date IS NULL) THEN
        RAISE EXCEPTION 'An HQ release must state the IFD concurrence file number and date';
    END IF;
    PERFORM public.project_assert_document(p_project_id, p_document_id, 'receipt_order');

    IF v_pr.proposal_id IS NOT NULL AND v_pr.sanctioned_cost IS NOT NULL THEN
        SELECT coalesce(sum(amount), 0) INTO v_received FROM public.project_fund_receipts WHERE project_id = p_project_id;
        IF v_received + p_amount > v_pr.sanctioned_cost THEN
            RAISE EXCEPTION 'This would bring receipts to % against a sanction of %. A higher cost needs a revised cost estimate.',
                v_received + p_amount, v_pr.sanctioned_cost;
        END IF;
    END IF;

    INSERT INTO public.project_fund_receipts (project_id, received_on, fiscal_year, amount, head, source,
        order_no, order_date, ifd_file_no, ifd_date, document_id, notes, recorded_by)
    VALUES (p_project_id, p_received_on, public.fiscal_year_of(p_received_on), p_amount, p_head,
        coalesce(btrim(p_source), ''), btrim(p_order_no), p_order_date, nullif(btrim(p_ifd_file_no), ''), p_ifd_date,
        p_document_id, nullif(btrim(p_notes), ''), auth.uid())
    RETURNING id INTO v_id;

    -- The first money in starts the project.
    IF v_pr.stage = 'SANCTIONED' THEN
        UPDATE public.projects SET stage = 'ACTIVE' WHERE "ProjectID" = p_project_id;
    END IF;
    RETURN v_id;
END;
$$;

-- Money spent, from a signed statement. Spending above a year's sanction
-- for a head is recorded, not refused: the overspend is shown and is the
-- trigger for a re-appropriation request (PL5).
CREATE OR REPLACE FUNCTION public.project_record_expenditure(
    p_project_id  text,
    p_fiscal_year text,
    p_period      text,
    p_head        text,
    p_amount      numeric,
    p_document_id uuid,
    p_notes       text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pr public.projects%ROWTYPE;
    v_id uuid;
BEGIN
    IF NOT public.project_caller_is_office(p_project_id) THEN
        RAISE EXCEPTION 'Only PME records expenditure, and not on a project of their own';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.stage NOT IN ('ACTIVE', 'ON_HOLD', 'CLOSING') THEN
        RAISE EXCEPTION 'Expenditure can be recorded only on a running project';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Enter an amount above zero'; END IF;
    PERFORM public.project_assert_document(p_project_id, p_document_id, 'expenditure_statement');

    INSERT INTO public.project_expenditure (project_id, fiscal_year, period, head, amount, document_id, notes, recorded_by)
    VALUES (p_project_id, p_fiscal_year, p_period, p_head, p_amount, p_document_id, nullif(btrim(p_notes), ''), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Undo an entry by recording its opposite. The original is never changed.
CREATE OR REPLACE FUNCTION public.project_reverse_entry(p_kind text, p_entry_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_project text;
    v_id      uuid;
BEGIN
    IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'Say why the entry is being reversed'; END IF;
    IF p_kind = 'receipt' THEN
        SELECT project_id INTO v_project FROM public.project_fund_receipts WHERE id = p_entry_id;
    ELSIF p_kind = 'expenditure' THEN
        SELECT project_id INTO v_project FROM public.project_expenditure WHERE id = p_entry_id;
    ELSE
        RAISE EXCEPTION 'Unknown entry kind: %', p_kind;
    END IF;
    IF v_project IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
    IF NOT public.project_caller_is_office(v_project) THEN
        RAISE EXCEPTION 'Only PME reverses entries, and not on a project of their own';
    END IF;

    IF p_kind = 'receipt' THEN
        IF EXISTS (SELECT 1 FROM public.project_fund_receipts WHERE id = p_entry_id AND reverses_id IS NOT NULL) THEN
            RAISE EXCEPTION 'A reversal cannot itself be reversed; record the entry again';
        END IF;
        IF EXISTS (SELECT 1 FROM public.project_fund_receipts WHERE reverses_id = p_entry_id) THEN
            RAISE EXCEPTION 'This entry has already been reversed';
        END IF;
        INSERT INTO public.project_fund_receipts (project_id, received_on, fiscal_year, amount, head, source,
            order_no, order_date, ifd_file_no, ifd_date, document_id, notes, reverses_id, recorded_by)
        SELECT project_id, current_date, fiscal_year, -amount, head, source, order_no, order_date, ifd_file_no, ifd_date,
               document_id, 'Reversal: ' || btrim(p_reason), id, auth.uid()
          FROM public.project_fund_receipts WHERE id = p_entry_id
        RETURNING id INTO v_id;
    ELSE
        IF EXISTS (SELECT 1 FROM public.project_expenditure WHERE id = p_entry_id AND reverses_id IS NOT NULL) THEN
            RAISE EXCEPTION 'A reversal cannot itself be reversed; record the entry again';
        END IF;
        IF EXISTS (SELECT 1 FROM public.project_expenditure WHERE reverses_id = p_entry_id) THEN
            RAISE EXCEPTION 'This entry has already been reversed';
        END IF;
        INSERT INTO public.project_expenditure (project_id, fiscal_year, period, head, amount, document_id, notes,
            reverses_id, recorded_by)
        SELECT project_id, fiscal_year, period, head, -amount, document_id, 'Reversal: ' || btrim(p_reason), id, auth.uid()
          FROM public.project_expenditure WHERE id = p_entry_id
        RETURNING id INTO v_id;
    END IF;
    RETURN v_id;
END;
$$;

-- A project created by sanction keeps its text "UtilizedAmount" equal to the
-- ledger, so the existing dashboards and budget watch read the same number.
-- Legacy rows (no proposal) are left alone: their figures came from Excel,
-- possibly in lakhs, and are reconciled at rollout (PL7).
CREATE OR REPLACE FUNCTION public.project_expenditure_sync_utilized()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.projects
       SET "UtilizedAmount" = (SELECT coalesce(sum(amount), 0)::text FROM public.project_expenditure
                                WHERE project_id = NEW.project_id)
     WHERE "ProjectID" = NEW.project_id AND proposal_id IS NOT NULL;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_project_expenditure_utilized ON public.project_expenditure;
CREATE TRIGGER trg_project_expenditure_utilized
    AFTER INSERT ON public.project_expenditure
    FOR EACH ROW EXECUTE FUNCTION public.project_expenditure_sync_utilized();

-- ── 4. Milestones ──────────────────────────────────────────────────────
--   PROPOSED  → the PI suggested it; PME accepts (PLANNED) or drops it
--   PLANNED   → agreed; the PI reports it done with evidence (REPORTED)
--   REPORTED  → PME confirms (ACHIEVED) or sends it back (PLANNED)
CREATE TABLE IF NOT EXISTS public.project_milestones (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    title        text NOT NULL CHECK (length(btrim(title)) > 0),
    target_date  date NOT NULL,
    status       text NOT NULL DEFAULT 'PROPOSED'
                 CHECK (status IN ('PROPOSED', 'PLANNED', 'REPORTED', 'ACHIEVED', 'DROPPED')),
    achieved_on  date,
    report_note  text,
    document_id  uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
    decision_note text,
    created_by   uuid NOT NULL REFERENCES auth.users(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_milestones_project_idx ON public.project_milestones (project_id, target_date);

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_milestones_select" ON public.project_milestones;
CREATE POLICY "project_milestones_select" ON public.project_milestones
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_milestones.project_id));
REVOKE INSERT, UPDATE, DELETE ON public.project_milestones FROM authenticated;
GRANT SELECT ON public.project_milestones TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.project_milestone_add(p_project_id text, p_title text, p_target_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_office boolean := public.project_caller_is_office(p_project_id);
    v_id     uuid;
BEGIN
    IF NOT (v_office OR public.project_caller_is_party(p_project_id)) THEN
        RAISE EXCEPTION 'Only the project''s PI or PME can add a milestone';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE "ProjectID" = p_project_id
                    AND stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING')) THEN
        RAISE EXCEPTION 'Milestones can be added only on a sanctioned or running project';
    END IF;
    IF coalesce(btrim(p_title), '') = '' OR p_target_date IS NULL THEN
        RAISE EXCEPTION 'Give the milestone a title and a target date';
    END IF;
    INSERT INTO public.project_milestones (project_id, title, target_date, status, created_by)
    VALUES (p_project_id, btrim(p_title), p_target_date,
            CASE WHEN v_office THEN 'PLANNED' ELSE 'PROPOSED' END, auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_milestone_report(p_id uuid, p_achieved_on date, p_note text, p_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_m public.project_milestones%ROWTYPE;
BEGIN
    SELECT * INTO v_m FROM public.project_milestones WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone not found'; END IF;
    IF NOT public.project_caller_is_party(v_m.project_id) THEN
        RAISE EXCEPTION 'Only the project''s PI or co-PIs report a milestone';
    END IF;
    IF v_m.status <> 'PLANNED' THEN RAISE EXCEPTION 'Only a planned milestone can be reported done'; END IF;
    IF p_achieved_on IS NULL THEN RAISE EXCEPTION 'Give the date it was achieved'; END IF;
    PERFORM public.project_assert_document(v_m.project_id, p_document_id, 'milestone_evidence');
    UPDATE public.project_milestones
       SET status = 'REPORTED', achieved_on = p_achieved_on, report_note = nullif(btrim(p_note), ''),
           document_id = p_document_id, updated_at = now()
     WHERE id = p_id;
END;
$$;

-- PME: ACCEPT a proposed one, CONFIRM a reported one, RETURN a report,
-- or DROP a milestone that is no longer part of the plan.
CREATE OR REPLACE FUNCTION public.project_milestone_decide(p_id uuid, p_decision text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_m    public.project_milestones%ROWTYPE;
    v_next text;
BEGIN
    SELECT * INTO v_m FROM public.project_milestones WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone not found'; END IF;
    IF NOT public.project_caller_is_office(v_m.project_id) THEN
        RAISE EXCEPTION 'Only PME decides on a milestone, and not on a project of their own';
    END IF;
    v_next := CASE
        WHEN p_decision = 'ACCEPT'  AND v_m.status = 'PROPOSED' THEN 'PLANNED'
        WHEN p_decision = 'CONFIRM' AND v_m.status = 'REPORTED' THEN 'ACHIEVED'
        WHEN p_decision = 'RETURN'  AND v_m.status = 'REPORTED' THEN 'PLANNED'
        WHEN p_decision = 'DROP'    AND v_m.status IN ('PROPOSED', 'PLANNED') THEN 'DROPPED'
    END;
    IF v_next IS NULL THEN
        RAISE EXCEPTION 'Cannot % a milestone that is %', lower(p_decision), lower(v_m.status);
    END IF;
    IF p_decision IN ('RETURN', 'DROP') AND coalesce(btrim(p_note), '') = '' THEN
        RAISE EXCEPTION 'Say why';
    END IF;
    UPDATE public.project_milestones
       SET status = v_next, decision_note = nullif(btrim(p_note), ''), updated_at = now(),
           achieved_on = CASE WHEN v_next = 'PLANNED' THEN NULL ELSE achieved_on END
     WHERE id = p_id;
END;
$$;

-- ── 5. Timeline ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_events (
    id         bigserial PRIMARY KEY,
    project_id text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    at         timestamptz NOT NULL DEFAULT now(),
    actor      uuid,
    kind       text NOT NULL,
    summary    text NOT NULL,
    ref_id     text
);
CREATE INDEX IF NOT EXISTS project_events_project_idx ON public.project_events (project_id, at DESC);

ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_events_select" ON public.project_events;
CREATE POLICY "project_events_select" ON public.project_events
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_events.project_id));
REVOKE INSERT, UPDATE, DELETE ON public.project_events FROM authenticated;
GRANT SELECT ON public.project_events TO authenticated, service_role;

-- The one writer. Triggers call it, so a change made by any path — RPC,
-- the Excel importer, a direct edit — leaves a line.
CREATE OR REPLACE FUNCTION public.project_log_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_amount text;
BEGIN
    IF TG_TABLE_NAME = 'projects' THEN
        IF TG_OP = 'INSERT' THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary)
            VALUES (NEW."ProjectID", auth.uid(), 'created',
                    CASE WHEN NEW.proposal_id IS NOT NULL
                         THEN 'Sanctioned (' || coalesce(NEW.sanction_ref, 'no order number') || ') and created from proposal'
                         ELSE 'Project record created' END);
        ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary)
            VALUES (NEW."ProjectID", auth.uid(), 'stage',
                    'Stage: ' || coalesce(public.project_stage_label(OLD.stage), 'not set') || ' → '
                              || coalesce(public.project_stage_label(NEW.stage), 'not set'));
        END IF;
    ELSIF TG_TABLE_NAME = 'project_fund_receipts' THEN
        v_amount := '₹' || to_char(abs(NEW.amount), 'FM99,99,99,99,990');
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'receipt',
                CASE WHEN NEW.reverses_id IS NULL THEN 'Received ' || v_amount || ' (' || NEW.order_no || ')'
                     ELSE 'Receipt of ' || v_amount || ' reversed' END, NEW.id::text);
    ELSIF TG_TABLE_NAME = 'project_expenditure' THEN
        v_amount := '₹' || to_char(abs(NEW.amount), 'FM99,99,99,99,990');
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'expenditure',
                CASE WHEN NEW.reverses_id IS NULL
                     THEN 'Spent ' || v_amount || ' on ' || lower(replace(NEW.head, '_', ' ')) || ', ' || NEW.fiscal_year || ' ' || NEW.period
                     ELSE 'Expenditure of ' || v_amount || ' reversed' END, NEW.id::text);
    ELSIF TG_TABLE_NAME = 'project_milestones' THEN
        IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
            VALUES (NEW.project_id, auth.uid(), 'milestone',
                    'Milestone "' || NEW.title || '": ' || lower(NEW.status), NEW.id::text);
        END IF;
    ELSIF TG_TABLE_NAME = 'project_documents' THEN
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'document',
                'Filed ' || replace(NEW.doc_type, '_', ' ') || ': ' || NEW.file_name, NEW.id::text);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.project_log_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_projects_log ON public.projects;
CREATE TRIGGER trg_projects_log AFTER INSERT OR UPDATE OF stage ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.project_log_event();
DROP TRIGGER IF EXISTS trg_project_fund_receipts_log ON public.project_fund_receipts;
CREATE TRIGGER trg_project_fund_receipts_log AFTER INSERT ON public.project_fund_receipts
    FOR EACH ROW EXECUTE FUNCTION public.project_log_event();
DROP TRIGGER IF EXISTS trg_project_expenditure_log ON public.project_expenditure;
CREATE TRIGGER trg_project_expenditure_log AFTER INSERT ON public.project_expenditure
    FOR EACH ROW EXECUTE FUNCTION public.project_log_event();
DROP TRIGGER IF EXISTS trg_project_milestones_log ON public.project_milestones;
CREATE TRIGGER trg_project_milestones_log AFTER INSERT OR UPDATE OF status ON public.project_milestones
    FOR EACH ROW EXECUTE FUNCTION public.project_log_event();
DROP TRIGGER IF EXISTS trg_project_documents_log ON public.project_documents;
CREATE TRIGGER trg_project_documents_log AFTER INSERT ON public.project_documents
    FOR EACH ROW EXECUTE FUNCTION public.project_log_event();

-- Projects sanctioned before this migration start their timeline at the sanction.
INSERT INTO public.project_events (project_id, at, kind, summary)
SELECT p."ProjectID", coalesce(p.sanction_date::timestamptz, now()), 'created',
       'Sanctioned (' || coalesce(p.sanction_ref, 'no order number') || ') and created from proposal'
  FROM public.projects p
 WHERE p.proposal_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.project_events e WHERE e.project_id = p."ProjectID");

-- ── 6. Outputs linked to a project ─────────────────────────────────────
ALTER TABLE public.scientific_outputs
    ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public.ip_intelligence
    ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public.equipment
    ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.projects("ProjectID") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS scientific_outputs_project_idx ON public.scientific_outputs (project_id);
CREATE INDEX IF NOT EXISTS ip_intelligence_project_idx    ON public.ip_intelligence (project_id);
CREATE INDEX IF NOT EXISTS equipment_project_idx          ON public.equipment (project_id);

-- Link (or unlink, with NULL) an output to a project. PME, or the project's
-- own PI — the person who knows which paper came out of which project.
-- Unlinking checks the project it is currently linked to.
CREATE OR REPLACE FUNCTION public.project_link_output(p_kind text, p_output_id text, p_project_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_current text;
    v_target  text;
BEGIN
    IF p_kind = 'publication' THEN
        SELECT project_id INTO v_current FROM public.scientific_outputs WHERE id = p_output_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Publication not found'; END IF;
    ELSIF p_kind = 'patent' THEN
        SELECT project_id INTO v_current FROM public.ip_intelligence WHERE id = p_output_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'IP record not found'; END IF;
    ELSIF p_kind = 'equipment' THEN
        SELECT project_id INTO v_current FROM public.equipment WHERE "UInsID" = p_output_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;
    ELSE
        RAISE EXCEPTION 'Unknown output kind: %', p_kind;
    END IF;

    v_target := coalesce(p_project_id, v_current);
    IF v_target IS NULL THEN RETURN; END IF;
    IF NOT (public.caller_is_pme() OR public.caller_has_role('MasterAdmin')
            OR public.project_caller_is_party(v_target)) THEN
        RAISE EXCEPTION 'Only PME or the project''s PI can link outputs to it';
    END IF;
    -- Moving an output away from another project needs rights on that one too.
    IF p_project_id IS NOT NULL AND v_current IS NOT NULL AND v_current <> p_project_id
       AND NOT (public.caller_is_pme() OR public.caller_has_role('MasterAdmin')
                OR public.project_caller_is_party(v_current)) THEN
        RAISE EXCEPTION 'This is already linked to another project';
    END IF;
    IF p_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE "ProjectID" = p_project_id) THEN
        RAISE EXCEPTION 'Project not found';
    END IF;

    IF p_kind = 'publication' THEN
        UPDATE public.scientific_outputs SET project_id = p_project_id WHERE id = p_output_id;
    ELSIF p_kind = 'patent' THEN
        UPDATE public.ip_intelligence SET project_id = p_project_id WHERE id = p_output_id;
    ELSE
        UPDATE public.equipment SET project_id = p_project_id WHERE "UInsID" = p_output_id;
    END IF;
    INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
    VALUES (v_target, auth.uid(), 'output',
            CASE WHEN p_project_id IS NULL THEN 'Unlinked ' ELSE 'Linked ' END || p_kind || ' ' || p_output_id, p_output_id);
END;
$$;

-- ── 7. Grants ──────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.project_record_receipt(text, date, numeric, text, text, text, date, text, date, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_record_expenditure(text, text, text, text, numeric, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_reverse_entry(text, uuid, text)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_milestone_add(text, text, date)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_milestone_report(uuid, date, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_milestone_decide(uuid, text, text)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_link_output(text, text, text)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_expenditure_sync_utilized()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_assert_document(text, uuid, text)        FROM PUBLIC, anon, authenticated;

-- ── 8. Assert the outcome ──────────────────────────────────────────────
DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.project_fund_receipts', 'INSERT')
       OR has_table_privilege('authenticated', 'public.project_expenditure', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.project_expenditure', 'DELETE') THEN
        RAISE EXCEPTION 'the funds ledger is writable by clients — it must be append-only through the RPCs';
    END IF;
    IF has_table_privilege('authenticated', 'public.project_events', 'INSERT') THEN
        RAISE EXCEPTION 'project_events is writable by clients';
    END IF;
END $$;

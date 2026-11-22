-- ============================================================
-- 20261112000016_stage_gate_pack
-- Enterprise P3 / EP2 — stage-gate deliverables for FTT / FTC / MMP (§4.2).
--
-- project_stage_items is the fixed list of what each stage (I–VI) must
-- leave on file; project_stage_deliverables records which are on file,
-- each with its document. Stage VI holds the four papers §4.2 wants before
-- a technology is transferred: bill of materials, standard of preparation,
-- supply chain and logistics. A transfer on such a project without them is
-- FLAGGED (project_transfer_gaps, the PME desk), not refused.
-- Item labels follow the guideline summary; check them against the OM.
-- Tests: scripts/db/compliance.db.test.ts.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.project_stage_items (
    item_key text PRIMARY KEY,
    stage    smallint NOT NULL CHECK (stage BETWEEN 1 AND 6),
    label    text NOT NULL,
    sort     smallint NOT NULL DEFAULT 0
);
ALTER TABLE public.project_stage_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_stage_items_select" ON public.project_stage_items;
CREATE POLICY "project_stage_items_select" ON public.project_stage_items FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.project_stage_items FROM authenticated, anon;
REVOKE ALL ON public.project_stage_items FROM anon;
GRANT SELECT ON public.project_stage_items TO authenticated;

INSERT INTO public.project_stage_items (item_key, stage, label, sort) VALUES
    ('concept_note',            1, 'Concept note and technology gap',             1),
    ('feasibility_report',      2, 'Feasibility and design report',               1),
    ('lab_validation_report',   3, 'Laboratory-scale validation report',          1),
    ('pilot_report',            4, 'Pilot / scale-up report',                     1),
    ('field_validation_report', 5, 'Field trial or user validation report',       1),
    ('bill_of_materials',       6, 'Bill of materials',                           1),
    ('standard_of_preparation', 6, 'Standard of preparation',                     2),
    ('supply_chain_plan',       6, 'Supply-chain documents',                      3),
    ('logistics_plan',          6, 'Logistics documents',                         4)
ON CONFLICT (item_key) DO NOTHING;

ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_doc_type_check;
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_doc_type_check CHECK (
    doc_type IN ('receipt_order', 'expenditure_statement', 'milestone_evidence', 'minutes',
                 'change_request', 'change_order', 'completion_report', 'closure_order', 'sanction_order',
                 'stage_deliverable', 'other'));

CREATE TABLE IF NOT EXISTS public.project_stage_deliverables (
    project_id  text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    item_key    text NOT NULL REFERENCES public.project_stage_items(item_key),
    document_id uuid NOT NULL REFERENCES public.project_documents(id),
    done_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    done_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, item_key)
);
ALTER TABLE public.project_stage_deliverables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_stage_deliverables_select" ON public.project_stage_deliverables;
CREATE POLICY "project_stage_deliverables_select" ON public.project_stage_deliverables FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_stage_deliverables.project_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.project_stage_deliverables FROM authenticated, anon;
REVOKE ALL ON public.project_stage_deliverables FROM anon;
GRANT SELECT ON public.project_stage_deliverables TO authenticated;

-- The project's HQ category (FTT, FTC, MMP …), from its proposal or the import.
CREATE OR REPLACE FUNCTION public.project_category(p_project_id text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT upper(btrim(coalesce((SELECT pr.category_code FROM public.proposals pr WHERE pr.id = p.proposal_id),
                              p."ProjectCategory")))
    FROM public.projects p WHERE p."ProjectID" = p_project_id;
$$;

-- The PI or PME puts a stage deliverable on file (a later one replaces it).
CREATE OR REPLACE FUNCTION public.project_stage_deliverable_record(p_project_id text, p_item_key text, p_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT coalesce(public.caller_is_pme() OR public.caller_has_role('MasterAdmin')
                    OR public.project_caller_is_pi(p_project_id), false) THEN
        RAISE EXCEPTION 'Only the PI or PME records a stage deliverable';
    END IF;
    IF coalesce(public.project_category(p_project_id), '') NOT IN ('FTT', 'FTC', 'MMP') THEN
        RAISE EXCEPTION 'Stage gates apply to FTT, FTC and MMP projects';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_stage_items WHERE item_key = p_item_key) THEN
        RAISE EXCEPTION 'Unknown deliverable: %', p_item_key;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_documents d
                    WHERE d.id = p_document_id AND d.project_id = p_project_id AND d.doc_type = 'stage_deliverable') THEN
        RAISE EXCEPTION 'Attach the deliverable to this project first';
    END IF;
    INSERT INTO public.project_stage_deliverables (project_id, item_key, document_id, done_by)
    VALUES (p_project_id, p_item_key, p_document_id, auth.uid())
    ON CONFLICT (project_id, item_key) DO UPDATE
       SET document_id = EXCLUDED.document_id, done_by = EXCLUDED.done_by, done_at = now();
    INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
    VALUES (p_project_id, auth.uid(), 'stage_gate',
            'Stage ' || (SELECT stage FROM public.project_stage_items WHERE item_key = p_item_key) || ' deliverable on file: '
                || (SELECT label FROM public.project_stage_items WHERE item_key = p_item_key), p_item_key);
END;
$$;

-- FTT / FTC / MMP projects with a technology transfer on record and any of
-- the four stage-VI papers missing. Invoker: RLS decides what is listed.
CREATE OR REPLACE FUNCTION public.project_transfer_gaps()
RETURNS TABLE (project_id text, project_no text, transfer_title text, missing text[])
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p."ProjectID", p."ProjectNo", t.technology_title,
         ARRAY(SELECT i.label FROM public.project_stage_items i
                WHERE i.stage = 6
                  AND NOT EXISTS (SELECT 1 FROM public.project_stage_deliverables d
                                   WHERE d.project_id = p."ProjectID" AND d.item_key = i.item_key)
                ORDER BY i.sort)
    FROM public.tech_transfers t
    JOIN public.projects p ON p."ProjectID" = t.project_id
                           OR (t.project_id IS NULL AND t.linked_project_no = p."ProjectNo")
   WHERE public.project_category(p."ProjectID") IN ('FTT', 'FTC', 'MMP')
     AND t.status <> 'Terminated'
     AND EXISTS (SELECT 1 FROM public.project_stage_items i
                  WHERE i.stage = 6 AND NOT EXISTS (SELECT 1 FROM public.project_stage_deliverables d
                                                     WHERE d.project_id = p."ProjectID" AND d.item_key = i.item_key))
   ORDER BY p."ProjectNo";
$$;

REVOKE ALL ON FUNCTION public.project_category(text)                                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_stage_deliverable_record(text, text, uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_transfer_gaps()                                 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_category(text)                               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_stage_deliverable_record(text, text, uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_transfer_gaps()                              TO authenticated, service_role;

COMMIT;

-- ============================================================
-- 20261112000021_pms_report_items
-- Enterprise P4 / ES2 — the self-appraisal opens filled from the records.
--
-- pms_prefill_from_profile(report) copies the scientist's projects, papers,
-- patents, transfers, students and committees for the reporting period from
-- staff_profile_facts (20261112000010) into pms_report_items, each with a
-- link to its record. A pre-filled line is a SUGGESTION: only the scientist
-- confirming, editing or adding it makes it a claim, and only claims are
-- visible to the committees. A re-run refreshes untouched suggestions and
-- adds new ones; it never changes a line the scientist touched.
-- Tests: scripts/db/pmsAssessment.db.test.ts.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.pms_report_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id           uuid NOT NULL REFERENCES public.pms_reports(id) ON DELETE CASCADE,
    section             text NOT NULL CHECK (section IN ('PROJECT', 'OUTPUT', 'IP', 'TECH_TRANSFER', 'STUDENT', 'COMMITTEE', 'OTHER')),
    source_record_type  text,
    source_record_id    text,
    link                text CHECK (link IS NULL OR link ~ '^(/|https://)'),
    text                text NOT NULL CHECK (btrim(text) <> ''),
    state               text NOT NULL DEFAULT 'PREFILLED' CHECK (state IN ('PREFILLED', 'CONFIRMED', 'EDITED', 'ADDED', 'REMOVED')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (report_id, section, source_record_type, source_record_id)
);
CREATE INDEX IF NOT EXISTS pms_report_items_report_idx ON public.pms_report_items (report_id, section);

ALTER TABLE public.pms_report_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pms_report_items_select" ON public.pms_report_items;
CREATE POLICY "pms_report_items_select" ON public.pms_report_items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pms_reports r WHERE r.id = pms_report_items.report_id
                     AND (r.scientist_id = (SELECT auth.uid()) OR pms_report_items.state IN ('CONFIRMED', 'EDITED', 'ADDED'))));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pms_report_items FROM authenticated, anon;
REVOKE ALL ON public.pms_report_items FROM anon;
GRANT SELECT ON public.pms_report_items TO authenticated;
DROP TRIGGER IF EXISTS trg_lock_pms_report_items ON public.pms_report_items;
CREATE TRIGGER trg_lock_pms_report_items BEFORE INSERT OR UPDATE OR DELETE ON public.pms_report_items
    FOR EACH ROW EXECUTE FUNCTION public.pms_block_locked_cycle_children();

-- The caller's own DRAFT report, or an error.
CREATE OR REPLACE FUNCTION public.pms_own_draft(p_report_id uuid)
RETURNS public.pms_reports LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v public.pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v FROM public.pms_reports WHERE id = p_report_id AND scientist_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Only the scientist works on their own report'; END IF;
    IF v.status <> 'DRAFT' THEN RAISE EXCEPTION 'The report is no longer a draft'; END IF;
    RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.pms_own_draft(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pms_prefill_from_profile(p_report_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
    v_staff  text;
    v_from   date;
    v_to     date;
    v_n      integer;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    v_report := public.pms_own_draft(p_report_id);
    SELECT "ID" INTO v_staff FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
    IF v_staff IS NULL THEN RAISE EXCEPTION 'Your login is not linked to a staff record. Ask HR to link it.'; END IF;
    SELECT coalesce(v_report.period_from, c.start_date), coalesce(v_report.period_to, c.end_date)
      INTO v_from, v_to FROM public.appraisal_cycles c WHERE c.id = v_report.cycle_id;

    INSERT INTO public.pms_report_items (report_id, section, source_record_type, source_record_id, link, text)
    SELECT p_report_id, f.section, f.record_type, f.record_id, f.link,
           f.title || coalesce(' — ' || nullif(f.role, ''), '')
      FROM public.staff_profile_facts(v_staff, v_from, v_to) f
     WHERE f.section IN ('PROJECT', 'OUTPUT', 'IP', 'TECH_TRANSFER', 'STUDENT', 'COMMITTEE')
    ON CONFLICT (report_id, section, source_record_type, source_record_id) DO UPDATE
       SET text = EXCLUDED.text, link = EXCLUDED.link, updated_at = now()
     WHERE pms_report_items.state = 'PREFILLED' AND pms_report_items.text IS DISTINCT FROM EXCLUDED.text;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- Confirm, edit or remove a line.
CREATE OR REPLACE FUNCTION public.pms_report_item_set(p_item_id uuid, p_state text, p_text text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_item public.pms_report_items%ROWTYPE;
BEGIN
    SELECT * INTO v_item FROM public.pms_report_items WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.pms_reports WHERE id = v_item.report_id AND scientist_id = auth.uid()) THEN
        RAISE EXCEPTION 'Item not found';
    END IF;
    PERFORM public.pms_own_draft(v_item.report_id);
    IF p_state NOT IN ('CONFIRMED', 'EDITED', 'REMOVED') THEN RAISE EXCEPTION 'Confirm, edit or remove'; END IF;
    IF p_state = 'EDITED' AND coalesce(btrim(p_text), '') = '' THEN RAISE EXCEPTION 'Write the corrected text'; END IF;
    UPDATE public.pms_report_items
       SET state = CASE WHEN p_state = 'EDITED' AND v_item.state = 'ADDED' THEN 'ADDED' ELSE p_state END,
           text = CASE WHEN p_state = 'EDITED' THEN btrim(p_text) ELSE text END,
           updated_at = now()
     WHERE id = p_item_id;
END;
$$;

-- A claim the records do not hold.
CREATE OR REPLACE FUNCTION public.pms_report_item_add(p_report_id uuid, p_section text, p_text text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.pms_reports WHERE id = p_report_id AND scientist_id = auth.uid()) THEN
        RAISE EXCEPTION 'Only the scientist works on their own report';
    END IF;
    PERFORM public.pms_own_draft(p_report_id);
    IF coalesce(btrim(p_text), '') = '' THEN RAISE EXCEPTION 'Write the item'; END IF;
    INSERT INTO public.pms_report_items (report_id, section, text, state)
    VALUES (p_report_id, coalesce(p_section, 'OTHER'), btrim(p_text), 'ADDED')
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_prefill_from_profile(uuid)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_report_item_set(uuid, text, text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_report_item_add(uuid, text, text)     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_prefill_from_profile(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_report_item_set(uuid, text, text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_report_item_add(uuid, text, text)  TO authenticated, service_role;

COMMIT;

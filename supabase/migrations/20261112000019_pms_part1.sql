-- ============================================================
-- 20261112000019_pms_part1
-- Enterprise P4 / ES3 — Part I (basic information) pre-filled by
-- Establishment, checked by the scientist, verified by Establishment.
--
-- pms_part1_prefill(cycle)       HR fills every report of the cycle from the
--                                staff record. A verified row is left alone.
-- pms_part1_report_discrepancy() the scientist says what is wrong; this
--                                clears the verification.
-- pms_part1_verify(report, data) HR verifies, optionally with corrections.
-- "Establishment" = the PMS administrators (HRAdmin, SystemAdmin,
-- MasterAdmin — pms_is_admin()). Career events (EH6, P5) will add fields.
-- Tests: scripts/db/pmsAssessment.db.test.ts.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.pms_part1 (
    report_id       uuid PRIMARY KEY REFERENCES public.pms_reports(id) ON DELETE CASCADE,
    data            jsonb NOT NULL DEFAULT '{}',
    prefilled_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    prefilled_at    timestamptz,
    discrepancy     text,
    discrepancy_at  timestamptz,
    verified_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at     timestamptz
);
ALTER TABLE public.pms_part1 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pms_part1_select" ON public.pms_part1;
CREATE POLICY "pms_part1_select" ON public.pms_part1 FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pms_reports r WHERE r.id = pms_part1.report_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pms_part1 FROM authenticated, anon;
REVOKE ALL ON public.pms_part1 FROM anon;
GRANT SELECT ON public.pms_part1 TO authenticated;

DROP TRIGGER IF EXISTS trg_lock_pms_part1 ON public.pms_part1;
CREATE TRIGGER trg_lock_pms_part1 BEFORE INSERT OR UPDATE OR DELETE ON public.pms_part1
    FOR EACH ROW EXECUTE FUNCTION public.pms_block_locked_cycle_children();

-- Part I fields from the staff row of the report's scientist.
CREATE OR REPLACE FUNCTION public.pms_part1_from_staff(p_scientist uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT jsonb_strip_nulls(jsonb_build_object(
        'name', s."Name", 'employeeId', s."ID", 'designation', s."Designation", 'group', s."Group",
        'payLevel', s."Level", 'division', s."Division", 'category', s."Cat", 'gender', s."Gender",
        'dateOfBirth', s.dob_date, 'dateOfJoining', s.doj_date, 'inPresentGradeSince', s.doapp_date,
        'appointmentType', s."AppointmentType", 'highestQualification', s."HighestQualification"))
      FROM public.staff s WHERE s.user_id = p_scientist LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pms_part1_prefill(p_cycle_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n integer;
BEGIN
    IF NOT coalesce(public.pms_is_admin(), false) THEN
        RAISE EXCEPTION 'Only Establishment (PMS administrators) pre-fills Part I';
    END IF;
    INSERT INTO public.pms_part1 (report_id, data, prefilled_by, prefilled_at)
    SELECT r.id, d.data, auth.uid(), now()
      FROM public.pms_reports r
      CROSS JOIN LATERAL (SELECT public.pms_part1_from_staff(r.scientist_id) AS data) d
     WHERE r.cycle_id = p_cycle_id AND d.data IS NOT NULL
       AND NOT public.pms_cycle_locked(r.cycle_id)
    ON CONFLICT (report_id) DO UPDATE
       SET data = EXCLUDED.data, prefilled_by = EXCLUDED.prefilled_by, prefilled_at = EXCLUDED.prefilled_at
     WHERE pms_part1.verified_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_part1_report_discrepancy(p_report_id uuid, p_text text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.pms_reports WHERE id = p_report_id AND scientist_id = auth.uid()) THEN
        RAISE EXCEPTION 'Only the scientist can report a discrepancy in their Part I';
    END IF;
    IF coalesce(btrim(p_text), '') = '' THEN RAISE EXCEPTION 'Say what is wrong'; END IF;
    UPDATE public.pms_part1
       SET discrepancy = btrim(p_text), discrepancy_at = now(), verified_by = NULL, verified_at = NULL
     WHERE report_id = p_report_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Part I has not been pre-filled yet'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_part1_verify(p_report_id uuid, p_data jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT coalesce(public.pms_is_admin(), false) THEN
        RAISE EXCEPTION 'Only Establishment (PMS administrators) verifies Part I';
    END IF;
    IF p_data IS NOT NULL AND jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'Corrections must be an object'; END IF;
    UPDATE public.pms_part1
       SET data = coalesce(p_data, data), verified_by = auth.uid(), verified_at = now()
     WHERE report_id = p_report_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Part I has not been pre-filled yet'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_part1_from_staff(uuid)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pms_part1_prefill(uuid)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_part1_report_discrepancy(uuid, text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_part1_verify(uuid, jsonb)               FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_part1_prefill(uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_part1_report_discrepancy(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_part1_verify(uuid, jsonb)            TO authenticated, service_role;

COMMIT;

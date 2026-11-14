-- Legacy project_staff rows write the project number their own way
-- ("GAP-120", "SSP-76") while projects use "GAP0120", "SSP000076". The
-- exact match in 20261110000002 missed them, so 85 of 94 live rows had no
-- project and no engagement. Match on a key that drops punctuation and the
-- zeros after the letters, and link only when exactly one project has that
-- key (ProjectNo is not unique: HCP0054 is four work packages). Fellowship
-- and scheme labels ("CSIR-SRF", "DST-Wise") match nothing and stay as they are.

CREATE OR REPLACE FUNCTION public.project_no_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(regexp_replace(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')),
                               '([A-Z])0+([0-9])', '\1\2', 'g'), '');
$$;

-- Backfill now also (1) fills project_id by the key and (2) adds the missing
-- engagement for a row already linked to a person.
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

    WITH uniq AS (
        SELECT public.project_no_key(p."ProjectNo") AS k, min(p."ProjectID") AS id
          FROM public.projects p
         WHERE public.project_no_key(p."ProjectNo") IS NOT NULL
         GROUP BY 1 HAVING count(*) = 1
    )
    UPDATE public.project_staff ps SET project_id = u.id
      FROM uniq u
     WHERE ps.project_id IS NULL AND public.project_no_key(ps."ProjectNo") = u.k;

    FOR r IN
        SELECT min(ps.id) AS id FROM public.project_staff ps
         WHERE ps.person_id IS NULL AND public.person_name_key(ps."StaffName") IS NOT NULL
         GROUP BY public.person_name_key(ps."StaffName") HAVING count(*) = 1
    LOOP
        PERFORM public.project_staff_link_rows(ARRAY[r.id], NULL);
        v_n := v_n + 1;
    END LOOP;

    INSERT INTO public.project_engagements (person_id, project_id, position_code, from_on, to_on, legacy_project_staff_id, created_by)
    SELECT ps.person_id, ps.project_id, coalesce(nullif(btrim(ps."Designation"), ''), 'UNSPECIFIED'), ps.joined_on,
           greatest(coalesce(ps.project_ends_on, pr.end_date, ps.joined_on), ps.joined_on), ps.id, auth.uid()
      FROM public.project_staff ps
      JOIN public.projects pr ON pr."ProjectID" = ps.project_id
     WHERE ps.person_id IS NOT NULL AND ps.joined_on IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.project_engagements e WHERE e.legacy_project_staff_id = ps.id);

    RETURN v_n;
END;
$$;

SELECT public.project_staff_backfill();

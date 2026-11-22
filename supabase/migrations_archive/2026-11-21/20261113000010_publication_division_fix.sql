-- 20261113000009 was pushed to the live project before its security fix:
-- publication_file_create took the division from the caller, so an author
-- could file a paper under another division and have that division's HoD
-- clear it. The division is now the author's own; any other is refused.
-- Same body as the fixed 20261113000009 (fresh databases already have it).

BEGIN;

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

COMMIT;

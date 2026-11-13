-- P6 Expertise (EX3 vocabulary, EX4 finder).
--
-- expertise_terms   a managed list of materials, techniques and application
--                   areas, each in one of the nine domain themes ('01'-'09' =
--                   DOMAIN_THEMES order in src/lib/proposals/constants.ts).
--                   HR, MasterAdmin and staff-domain data stewards keep it.
-- staff_expertise   a person's tags. Only a confirmed tag (confirmed_at set,
--                   by the person) counts in ranking. A curator may propose a
--                   tag; it waits unconfirmed.
-- expertise_suggest terms whose label appears in the titles of the person's
--                   papers, IP and projects. No model call.
-- expertise_find    "who can do X?" ranked by confirmed tags, then evidence,
--                   with load and retirement date. Invoker: RLS decides who
--                   the caller sees.
-- The free-text staff."Expertise" stays as a note and counts as evidence.

BEGIN;

CREATE TABLE IF NOT EXISTS public.expertise_terms (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label       text NOT NULL CHECK (btrim(label) <> ''),
    kind        text NOT NULL CHECK (kind IN ('MATERIAL', 'TECHNIQUE', 'APPLICATION')),
    theme_code  text CHECK (theme_code ~ '^0[1-9]$'),
    parent_id   uuid REFERENCES public.expertise_terms(id) ON DELETE SET NULL,
    status      text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MERGED')),
    merged_into uuid REFERENCES public.expertise_terms(id) ON DELETE SET NULL,
    created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CHECK ((status = 'MERGED') = (merged_into IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS expertise_terms_label_key
    ON public.expertise_terms (lower(btrim(label))) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.staff_expertise (
    staff_id     text NOT NULL REFERENCES public.staff("ID") ON DELETE CASCADE ON UPDATE CASCADE,
    term_id      uuid NOT NULL REFERENCES public.expertise_terms(id) ON DELETE CASCADE,
    source       text NOT NULL CHECK (source IN ('SELF', 'SUGGESTED')),
    confirmed_at timestamptz,
    added_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    PRIMARY KEY (staff_id, term_id)
);
CREATE INDEX IF NOT EXISTS staff_expertise_term_idx ON public.staff_expertise (term_id) WHERE confirmed_at IS NOT NULL;

-- Who keeps the vocabulary.
CREATE OR REPLACE FUNCTION public.caller_is_expertise_curator()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin')
        OR EXISTS (SELECT 1 FROM public.data_stewards ds WHERE ds.user_id = auth.uid() AND ds.domain = 'staff');
$$;

ALTER TABLE public.expertise_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_expertise ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expertise_terms_select ON public.expertise_terms;
CREATE POLICY expertise_terms_select ON public.expertise_terms FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS expertise_terms_insert ON public.expertise_terms;
CREATE POLICY expertise_terms_insert ON public.expertise_terms FOR INSERT TO authenticated
    WITH CHECK (public.caller_is_expertise_curator() AND status = 'ACTIVE');
DROP POLICY IF EXISTS expertise_terms_update ON public.expertise_terms;
CREATE POLICY expertise_terms_update ON public.expertise_terms FOR UPDATE TO authenticated
    USING (public.caller_is_expertise_curator()) WITH CHECK (public.caller_is_expertise_curator() AND status = 'ACTIVE');

-- Tags are a directory, not personal data: any approved user reads them.
DROP POLICY IF EXISTS staff_expertise_select ON public.staff_expertise;
CREATE POLICY staff_expertise_select ON public.staff_expertise FOR SELECT TO authenticated USING (true);
-- The person adds and confirms their own; a curator only proposes.
DROP POLICY IF EXISTS staff_expertise_insert ON public.staff_expertise;
CREATE POLICY staff_expertise_insert ON public.staff_expertise FOR INSERT TO authenticated
    WITH CHECK (added_by = (SELECT auth.uid()) AND (
        staff_id = public.caller_staff_id()
        OR (public.caller_is_expertise_curator() AND confirmed_at IS NULL AND source = 'SUGGESTED')));
DROP POLICY IF EXISTS staff_expertise_update ON public.staff_expertise;
CREATE POLICY staff_expertise_update ON public.staff_expertise FOR UPDATE TO authenticated
    USING (staff_id = public.caller_staff_id()) WITH CHECK (staff_id = public.caller_staff_id());
DROP POLICY IF EXISTS staff_expertise_delete ON public.staff_expertise;
CREATE POLICY staff_expertise_delete ON public.staff_expertise FOR DELETE TO authenticated
    USING (staff_id = public.caller_staff_id() OR public.caller_is_expertise_curator());

REVOKE ALL ON public.expertise_terms, public.staff_expertise FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.expertise_terms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_expertise TO authenticated;
GRANT ALL ON public.expertise_terms, public.staff_expertise TO service_role;

-- A merged term's tags move to the term it was merged into.
CREATE OR REPLACE FUNCTION public.expertise_merge(p_from uuid, p_into uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT coalesce(public.caller_is_expertise_curator(), false) THEN
        RAISE EXCEPTION 'Only HR or a staff data steward keeps the vocabulary';
    END IF;
    IF p_from = p_into THEN RAISE EXCEPTION 'Choose two different terms'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.expertise_terms WHERE id = p_into AND status = 'ACTIVE') THEN
        RAISE EXCEPTION 'Merge into an active term';
    END IF;
    UPDATE public.expertise_terms SET status = 'MERGED', merged_into = p_into WHERE id = p_from AND status = 'ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Term not found or already merged'; END IF;
    -- Keep the stronger row when the person already holds both.
    INSERT INTO public.staff_expertise (staff_id, term_id, source, confirmed_at, added_by)
    SELECT staff_id, p_into, source, confirmed_at, added_by FROM public.staff_expertise WHERE term_id = p_from
    ON CONFLICT (staff_id, term_id) DO UPDATE
       SET confirmed_at = coalesce(staff_expertise.confirmed_at, EXCLUDED.confirmed_at);
    DELETE FROM public.staff_expertise WHERE term_id = p_from;
END;
$$;

-- Whole-word, case-insensitive pattern for a label.
CREATE OR REPLACE FUNCTION public.expertise_pattern(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT '\m' || regexp_replace(btrim(p_label), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M';
$$;

CREATE OR REPLACE FUNCTION public.expertise_suggest(p_staff_id text)
RETURNS TABLE (term_id uuid, label text, kind text, evidence_count integer)
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT t.id, t.label, t.kind, count(DISTINCT (f.record_type, f.record_id))::int
      FROM public.staff_profile_facts(p_staff_id) f
      JOIN public.expertise_terms t ON t.status = 'ACTIVE' AND f.title ~* public.expertise_pattern(t.label)
     WHERE f.section IN ('PROJECT', 'OUTPUT', 'IP')
       AND NOT EXISTS (SELECT 1 FROM public.staff_expertise se WHERE se.staff_id = p_staff_id AND se.term_id = t.id)
     GROUP BY t.id, t.label, t.kind
     ORDER BY 4 DESC, 2;
$$;

-- ponytail: walks staff_profile_facts for every staff row (a few hundred);
-- keep a facts table refreshed by trigger if this gets slow.
CREATE OR REPLACE FUNCTION public.expertise_find(p_term_ids uuid[] DEFAULT NULL, p_text text DEFAULT NULL)
RETURNS TABLE (staff_id text, name text, division text, designation text, confirmed_terms integer,
               evidence jsonb, evidence_count integer, active_projects integer, overload boolean, retires_on date)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH q AS (
    SELECT nullif(btrim(p_text), '') AS txt
), terms AS (
    SELECT t.id, t.label FROM public.expertise_terms t, q
     WHERE t.status = 'ACTIVE'
       AND (t.id = ANY (coalesce(p_term_ids, '{}'::uuid[]))
            OR (q.txt IS NOT NULL AND t.label ~* public.expertise_pattern(q.txt)))
), patterns AS (
    SELECT public.expertise_pattern(label) AS re FROM terms
    UNION
    SELECT public.expertise_pattern(q.txt) FROM q WHERE q.txt IS NOT NULL
), tagged AS (
    SELECT se.staff_id, count(*)::int AS n
      FROM public.staff_expertise se JOIN terms t ON t.id = se.term_id
     WHERE se.confirmed_at IS NOT NULL
     GROUP BY 1
), ev AS (
    SELECT s."ID" AS staff_id, f.record_type, f.record_id, f.title, f.link
      FROM public.staff s
     CROSS JOIN LATERAL public.staff_profile_facts(s."ID") f
     WHERE f.section IN ('PROJECT', 'OUTPUT', 'IP')
       AND EXISTS (SELECT 1 FROM patterns p WHERE f.title ~* p.re)
    UNION
    SELECT s."ID", 'note', s."ID", s."Expertise", '/staff/' || s."ID"
      FROM public.staff s
     WHERE EXISTS (SELECT 1 FROM patterns p WHERE s."Expertise" ~* p.re)
), evidence AS (
    SELECT staff_id,
           jsonb_agg(jsonb_build_object('type', record_type, 'id', record_id, 'title', title, 'link', link)
                     ORDER BY record_type, title) AS items,
           count(*)::int AS n
      FROM ev GROUP BY 1
), hits AS (
    SELECT staff_id FROM tagged UNION SELECT staff_id FROM evidence
)
SELECT s."ID", s."Name", s."Division", s."Designation",
       coalesce(tg.n, 0), coalesce(e.items, '[]'::jsonb), coalesce(e.n, 0),
       coalesce(w.active_projects, 0), coalesce(w.overload, false),
       (s.dob_date + interval '60 years')::date
  FROM hits h
  JOIN public.staff s ON s."ID" = h.staff_id
  LEFT JOIN tagged tg ON tg.staff_id = h.staff_id
  LEFT JOIN evidence e ON e.staff_id = h.staff_id
  LEFT JOIN LATERAL public.staff_workload(s."ID") w ON true
 ORDER BY 5 DESC, 7 DESC, 2;
$$;

REVOKE ALL ON FUNCTION public.caller_is_expertise_curator()        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expertise_merge(uuid, uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expertise_suggest(text)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expertise_find(uuid[], text)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_is_expertise_curator()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expertise_merge(uuid, uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expertise_suggest(text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expertise_find(uuid[], text)   TO authenticated, service_role;

COMMIT;

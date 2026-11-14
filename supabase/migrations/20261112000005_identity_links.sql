-- ============================================================
-- 20261112000005_identity_links
-- Enterprise P1 / EA1 — authors and inventors linked to the staff record.
--
-- scientific_outputs.authors and ip_intelligence.inventors are name arrays.
-- output_authors / ip_inventors hold one row per name and position (pos), with
-- the staff key when it is known. A name is linked automatically only when
-- exactly one staff member has the same normalised name; two "R. Kumar"s
-- are never guessed between — the row stays unlinked and is listed by
-- identity_link_gaps() for a person to decide. A manual decision
-- (link_source = 'manual') is never overwritten by the automatic pass.
-- phd_students.supervisor_staff_id already exists (20260725000005).
-- Tests: scripts/db/identity.db.test.ts.
-- ============================================================
BEGIN;

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS orcid text;

-- Same shape as normalizePersonName() in src/utils/analytics.ts.
CREATE OR REPLACE FUNCTION public.person_name_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(btrim(regexp_replace(regexp_replace(
           regexp_replace(lower(coalesce(p, '')), '\m(dr|prof|sh|smt|mr|mrs|ms)\M\.?', '', 'g'),
           '[^a-z0-9\s]', ' ', 'g'), '\s+', ' ', 'g')), '');
$$;
CREATE INDEX IF NOT EXISTS staff_name_key_idx ON public.staff (public.person_name_key("Name"));

CREATE TABLE IF NOT EXISTS public.output_authors (
    output_id    text NOT NULL REFERENCES public.scientific_outputs(id) ON DELETE CASCADE,
    pos     integer NOT NULL CHECK (pos > 0),
    author_name  text NOT NULL,
    staff_id     text REFERENCES public.staff("ID") ON DELETE SET NULL,
    link_source  text CHECK (link_source IN ('auto', 'manual')),
    confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    confirmed_at timestamptz,
    PRIMARY KEY (output_id, pos)
);
CREATE TABLE IF NOT EXISTS public.ip_inventors (
    ip_id        text NOT NULL REFERENCES public.ip_intelligence(id) ON DELETE CASCADE,
    pos     integer NOT NULL CHECK (pos > 0),
    author_name  text NOT NULL,
    staff_id     text REFERENCES public.staff("ID") ON DELETE SET NULL,
    link_source  text CHECK (link_source IN ('auto', 'manual')),
    confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    confirmed_at timestamptz,
    PRIMARY KEY (ip_id, pos)
);
CREATE INDEX IF NOT EXISTS output_authors_staff_idx ON public.output_authors (staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ip_inventors_staff_idx   ON public.ip_inventors (staff_id)   WHERE staff_id IS NOT NULL;

-- Readable wherever the parent record is readable. Written only by the
-- trigger and the RPCs below.
ALTER TABLE public.output_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_inventors   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "output_authors_select" ON public.output_authors;
CREATE POLICY "output_authors_select" ON public.output_authors FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.scientific_outputs o WHERE o.id = output_authors.output_id));
DROP POLICY IF EXISTS "ip_inventors_select" ON public.ip_inventors;
CREATE POLICY "ip_inventors_select" ON public.ip_inventors FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.ip_intelligence i WHERE i.id = ip_inventors.ip_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.output_authors, public.ip_inventors FROM authenticated, anon;
REVOKE ALL ON public.output_authors, public.ip_inventors FROM anon;
GRANT SELECT ON public.output_authors, public.ip_inventors TO authenticated;

-- ── Automatic pass: link only a name that one staff member alone carries ──
-- Internal. p_record_id NULL = every record of that kind.
CREATE OR REPLACE FUNCTION public.identity_autolink(p_kind text, p_record_id text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n integer;
BEGIN
    IF p_kind = 'OUTPUT' THEN
        UPDATE public.output_authors a SET staff_id = m.staff_id, link_source = 'auto'
          FROM (SELECT public.person_name_key("Name") AS k, min("ID") AS staff_id
                  FROM public.staff GROUP BY 1 HAVING count(*) = 1) m
         WHERE m.k = public.person_name_key(a.author_name)
           AND a.staff_id IS NULL AND a.link_source IS NULL
           AND (p_record_id IS NULL OR a.output_id = p_record_id);
    ELSIF p_kind = 'IP' THEN
        UPDATE public.ip_inventors a SET staff_id = m.staff_id, link_source = 'auto'
          FROM (SELECT public.person_name_key("Name") AS k, min("ID") AS staff_id
                  FROM public.staff GROUP BY 1 HAVING count(*) = 1) m
         WHERE m.k = public.person_name_key(a.author_name)
           AND a.staff_id IS NULL AND a.link_source IS NULL
           AND (p_record_id IS NULL OR a.ip_id = p_record_id);
    ELSE
        RAISE EXCEPTION 'Unknown kind: %', p_kind;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.identity_autolink(text, text) FROM PUBLIC, anon, authenticated;

-- Keeps the rows in step with the name array. A position whose name did not
-- change keeps its link; a changed name loses it and is looked up again.
CREATE OR REPLACE FUNCTION public.identity_sync_names()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_TABLE_NAME = 'scientific_outputs' THEN
        DELETE FROM public.output_authors
         WHERE output_id = NEW.id AND pos > coalesce(cardinality(NEW.authors), 0);
        INSERT INTO public.output_authors (output_id, pos, author_name)
        SELECT NEW.id, u.o, btrim(u.n) FROM unnest(NEW.authors) WITH ORDINALITY u(n, o)
        ON CONFLICT (output_id, pos) DO UPDATE
           SET author_name = EXCLUDED.author_name, staff_id = NULL, link_source = NULL,
               confirmed_by = NULL, confirmed_at = NULL
         WHERE output_authors.author_name IS DISTINCT FROM EXCLUDED.author_name;
        PERFORM public.identity_autolink('OUTPUT', NEW.id);
    ELSE
        DELETE FROM public.ip_inventors
         WHERE ip_id = NEW.id AND pos > coalesce(cardinality(NEW.inventors), 0);
        INSERT INTO public.ip_inventors (ip_id, pos, author_name)
        SELECT NEW.id, u.o, btrim(u.n) FROM unnest(NEW.inventors) WITH ORDINALITY u(n, o)
        ON CONFLICT (ip_id, pos) DO UPDATE
           SET author_name = EXCLUDED.author_name, staff_id = NULL, link_source = NULL,
               confirmed_by = NULL, confirmed_at = NULL
         WHERE ip_inventors.author_name IS DISTINCT FROM EXCLUDED.author_name;
        PERFORM public.identity_autolink('IP', NEW.id);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.identity_sync_names() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_scientific_outputs_authors ON public.scientific_outputs;
CREATE TRIGGER trg_scientific_outputs_authors AFTER INSERT OR UPDATE OF authors ON public.scientific_outputs
    FOR EACH ROW EXECUTE FUNCTION public.identity_sync_names();
DROP TRIGGER IF EXISTS trg_ip_intelligence_inventors ON public.ip_intelligence;
CREATE TRIGGER trg_ip_intelligence_inventors AFTER INSERT OR UPDATE OF inventors ON public.ip_intelligence
    FOR EACH ROW EXECUTE FUNCTION public.identity_sync_names();

-- Backfill: touching the arrays fires the trigger for every existing row.
UPDATE public.scientific_outputs SET authors = authors;
UPDATE public.ip_intelligence SET inventors = inventors;

-- ── Admin: run the automatic pass again (after a staff import) ─────────
CREATE OR REPLACE FUNCTION public.identity_link_authors()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT coalesce(public.caller_is_admin(), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN public.identity_autolink('OUTPUT') + public.identity_autolink('IP');
END;
$$;

-- What a person still has to decide. For authors and inventors, only names
-- that some staff member could be (candidates > 0): a co-author with no
-- likely match on the roster is external, not a gap. Staff-key gaps come
-- from staff_link_gaps (20260725000005) unchanged.
CREATE OR REPLACE FUNCTION public.identity_link_gaps()
RETURNS TABLE (kind text, record_id text, name text, candidates integer, pos integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT coalesce(public.caller_is_admin() OR public.caller_has_role('Director'), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN QUERY
    WITH names AS (
        SELECT 'OUTPUT'::text AS kind, a.output_id AS record_id, a.author_name AS name, a.pos
          FROM public.output_authors a WHERE a.staff_id IS NULL AND a.link_source IS NULL
        UNION ALL
        SELECT 'IP', i.ip_id, i.author_name, i.pos
          FROM public.ip_inventors i WHERE i.staff_id IS NULL AND i.link_source IS NULL
    ), scored AS (
        SELECT n.*, (SELECT count(*)::int FROM public.staff s
                      WHERE length(public.person_name_key(n.name)) >= 3
                        AND (public.person_name_key(s."Name") = public.person_name_key(n.name)
                             OR strpos(public.person_name_key(s."Name"), public.person_name_key(n.name)) > 0
                             OR strpos(public.person_name_key(n.name), public.person_name_key(s."Name")) > 0)) AS c
          FROM names n
    )
    SELECT s.kind, s.record_id, s.name, s.c, s.pos FROM scored s WHERE s.c > 0
    UNION ALL
    SELECT g.table_name || '.' || g.name_column, g.row_key, g.unresolved_name,
           (SELECT count(*)::int FROM public.staff s
             WHERE public.person_name_key(s."Name") = public.person_name_key(g.unresolved_name)),
           NULL::integer
      FROM public.staff_link_gaps g
    ORDER BY 1, 2, 5;
END;
$$;

-- Records a person's decision. Admins set or clear any link; a staff member
-- may claim an unlinked name as their own, or let go of one linked to them.
CREATE OR REPLACE FUNCTION public.identity_set_link(p_kind text, p_record_id text, p_position integer, p_staff_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me      text := public.caller_staff_id();
    v_current text;
    v_found   boolean;
BEGIN
    IF p_kind = 'OUTPUT' THEN
        SELECT staff_id, true INTO v_current, v_found FROM public.output_authors
         WHERE output_id = p_record_id AND pos = p_position FOR UPDATE;
    ELSIF p_kind = 'IP' THEN
        SELECT staff_id, true INTO v_current, v_found FROM public.ip_inventors
         WHERE ip_id = p_record_id AND pos = p_position FOR UPDATE;
    ELSE
        RAISE EXCEPTION 'Unknown kind: %', p_kind;
    END IF;
    IF NOT coalesce(v_found, false) THEN RAISE EXCEPTION 'No such name on that record'; END IF;

    IF NOT coalesce(
         public.caller_is_admin()
         OR (v_me IS NOT NULL AND p_staff_id = v_me AND (v_current IS NULL OR v_current = v_me))
         OR (v_me IS NOT NULL AND p_staff_id IS NULL AND v_current = v_me),
         false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    IF p_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff WHERE "ID" = p_staff_id) THEN
        RAISE EXCEPTION 'No staff member %', p_staff_id;
    END IF;

    IF p_kind = 'OUTPUT' THEN
        UPDATE public.output_authors
           SET staff_id = p_staff_id, link_source = 'manual', confirmed_by = auth.uid(), confirmed_at = now()
         WHERE output_id = p_record_id AND pos = p_position;
    ELSE
        UPDATE public.ip_inventors
           SET staff_id = p_staff_id, link_source = 'manual', confirmed_by = auth.uid(), confirmed_at = now()
         WHERE ip_id = p_record_id AND pos = p_position;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.identity_link_authors()                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.identity_link_gaps()                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.identity_set_link(text, text, integer, text)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.identity_link_authors()                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_link_gaps()                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_set_link(text, text, integer, text) TO authenticated, service_role;

COMMIT;

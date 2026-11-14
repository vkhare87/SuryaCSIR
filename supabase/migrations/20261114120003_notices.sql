-- 20261114120003_notices
-- Lane 1, CD4 (COMMON-DESK-PLAN.md §5.5): office orders, circulars and
-- notices, with "I have read it" where an order needs it.
--
-- Who may issue: the Director and the admin desks for anyone; a head of
-- division (held or acting) for their own division only.
-- Who reads: the audience. NULL audience = the whole institute.
-- The issuer sees how many have read; for an order that must be
-- acknowledged, also who has not. Nobody else sees who read what.

CREATE TABLE IF NOT EXISTS public.notices (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notice_no          text NOT NULL UNIQUE,
    kind               text NOT NULL CHECK (kind IN ('OFFICE_ORDER', 'CIRCULAR', 'NOTICE', 'EVENT')),
    title              text NOT NULL CHECK (btrim(title) <> ''),
    body               text NOT NULL DEFAULT '',
    issued_by          uuid NOT NULL REFERENCES auth.users(id),
    issued_on          date NOT NULL DEFAULT public.ist_today(),
    audience_divisions text[] CHECK (audience_divisions IS NULL OR cardinality(audience_divisions) > 0),
    must_ack           boolean NOT NULL DEFAULT false,
    ack_by             date,
    valid_to           date,
    supersedes         uuid REFERENCES public.notices(id),
    superseded_by      uuid REFERENCES public.notices(id),
    created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notices_issued_on_idx ON public.notices (issued_on DESC);

CREATE TABLE IF NOT EXISTS public.notice_reads (
    notice_id uuid NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
    user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at   timestamptz NOT NULL DEFAULT now(),
    acked_at  timestamptz,
    PRIMARY KEY (notice_id, user_id)
);

-- Divisions the caller belongs to: the staff row, and any division on a role.
CREATE OR REPLACE FUNCTION public.notice_caller_divisions()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT d) FILTER (WHERE d IS NOT NULL), '{}')
    FROM (SELECT "Division" AS d FROM public.staff WHERE user_id = (SELECT auth.uid())
          UNION ALL
          SELECT division_code FROM public.user_roles WHERE user_id = (SELECT auth.uid())) x;
$$;
REVOKE ALL ON FUNCTION public.notice_caller_divisions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notice_caller_divisions() TO authenticated, service_role;

-- Issuers for the whole institute.
CREATE OR REPLACE FUNCTION public.notice_caller_issues_all()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(public.caller_has_role('Director') OR public.caller_is_admin(), false);
$$;

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notices_select" ON public.notices;
CREATE POLICY "notices_select" ON public.notices FOR SELECT TO authenticated
    USING (audience_divisions IS NULL
           OR audience_divisions && public.notice_caller_divisions()
           OR issued_by = (SELECT auth.uid())
           OR public.notice_caller_issues_all());
DROP POLICY IF EXISTS "notice_reads_select" ON public.notice_reads;
CREATE POLICY "notice_reads_select" ON public.notice_reads FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.notices, public.notice_reads FROM authenticated, anon;
REVOKE ALL ON public.notices, public.notice_reads FROM anon;
GRANT SELECT ON public.notices, public.notice_reads TO authenticated;

CREATE OR REPLACE FUNCTION public.notice_issue(
    p_kind text, p_title text, p_body text, p_divisions text[] DEFAULT NULL,
    p_must_ack boolean DEFAULT false, p_ack_by date DEFAULT NULL, p_valid_to date DEFAULT NULL,
    p_supersedes uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me     uuid := (SELECT auth.uid());
    v_divs   text[] := CASE WHEN p_divisions IS NULL OR cardinality(p_divisions) = 0 THEN NULL ELSE p_divisions END;
    v_prefix text;
    v_year   text := to_char(public.ist_today(), 'YYYY');
    v_seq    integer;
    v_id     uuid;
    v_old    public.notices%ROWTYPE;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    IF NOT public.notice_caller_issues_all() THEN
        -- A head issues for their own division(s) only.
        IF v_divs IS NULL OR EXISTS (
            SELECT 1 FROM unnest(v_divs) d
             WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r
                                WHERE r.user_id = v_me AND r.role IN ('HOD', 'DivisionHead') AND r.division_code = d)
               AND NOT public.caller_acting_as('HOD', d) AND NOT public.caller_acting_as('DivisionHead', d)) THEN
            RAISE EXCEPTION 'Only the Director or an admin desk issues to the whole institute; a head issues to their own division';
        END IF;
    END IF;
    IF p_kind NOT IN ('OFFICE_ORDER', 'CIRCULAR', 'NOTICE', 'EVENT') THEN RAISE EXCEPTION 'Unknown kind: %', p_kind; END IF;
    IF coalesce(btrim(p_title), '') = '' THEN RAISE EXCEPTION 'Give the notice a title'; END IF;
    IF p_must_ack AND p_ack_by IS NOT NULL AND p_ack_by < public.ist_today() THEN RAISE EXCEPTION 'The acknowledge-by date is past'; END IF;
    IF p_supersedes IS NOT NULL THEN
        SELECT * INTO v_old FROM public.notices WHERE id = p_supersedes FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'The notice to replace was not found'; END IF;
        IF v_old.issued_by <> v_me AND NOT public.notice_caller_issues_all() THEN
            RAISE EXCEPTION 'Only its issuer, the Director or an admin desk may replace that notice';
        END IF;
    END IF;

    v_prefix := CASE p_kind WHEN 'OFFICE_ORDER' THEN 'OO' WHEN 'CIRCULAR' THEN 'CIR' WHEN 'NOTICE' THEN 'NOT' ELSE 'EVT' END;
    PERFORM pg_advisory_xact_lock(hashtext('notices:' || v_prefix || ':' || v_year));
    SELECT count(*) + 1 INTO v_seq FROM public.notices WHERE notice_no LIKE v_prefix || '/' || v_year || '/%';

    INSERT INTO public.notices (notice_no, kind, title, body, issued_by, audience_divisions, must_ack, ack_by, valid_to, supersedes)
    VALUES (v_prefix || '/' || v_year || '/' || lpad(v_seq::text, 4, '0'), p_kind, btrim(p_title), coalesce(p_body, ''),
            v_me, v_divs, coalesce(p_must_ack, false), p_ack_by, p_valid_to, p_supersedes)
    RETURNING id INTO v_id;
    IF p_supersedes IS NOT NULL THEN
        UPDATE public.notices SET superseded_by = v_id WHERE id = p_supersedes;
    END IF;

    -- One message per reader.
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT DISTINCT r.user_id, 'notice', CASE WHEN p_must_ack THEN 'warning' ELSE 'info' END,
           CASE WHEN p_must_ack THEN 'Read and acknowledge: ' ELSE 'Notice: ' END || btrim(p_title),
           '', '/', 'rule', 'notice:' || v_id
      FROM (SELECT user_id FROM public.user_roles
             WHERE v_divs IS NULL OR division_code = ANY(v_divs)
            UNION
            SELECT user_id FROM public.staff
             WHERE user_id IS NOT NULL AND (v_divs IS NULL OR "Division" = ANY(v_divs))) r
     WHERE r.user_id <> v_me
    ON CONFLICT DO NOTHING;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notice_mark_read(p_id uuid, p_ack boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me uuid := (SELECT auth.uid());
    v_n  public.notices%ROWTYPE;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    SELECT * INTO v_n FROM public.notices WHERE id = p_id;
    IF NOT FOUND OR NOT (v_n.audience_divisions IS NULL OR v_n.audience_divisions && public.notice_caller_divisions()) THEN
        RAISE EXCEPTION 'That notice is not addressed to you';
    END IF;
    INSERT INTO public.notice_reads (notice_id, user_id, acked_at)
    VALUES (p_id, v_me, CASE WHEN p_ack THEN now() END)
    ON CONFLICT (notice_id, user_id) DO UPDATE
       SET acked_at = coalesce(public.notice_reads.acked_at, EXCLUDED.acked_at);
END;
$$;

-- For the issuer (and the Director / admin desks): how many have read, and,
-- for an order that must be acknowledged, who has not.
CREATE OR REPLACE FUNCTION public.notice_read_counts(p_id uuid)
RETURNS TABLE (readers integer, read integer, acked integer, not_acked text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n public.notices%ROWTYPE;
BEGIN
    SELECT * INTO v_n FROM public.notices WHERE id = p_id;
    IF NOT FOUND OR NOT (v_n.issued_by = (SELECT auth.uid()) OR public.notice_caller_issues_all()) THEN
        RAISE EXCEPTION 'Only the issuer sees who has read a notice';
    END IF;
    RETURN QUERY
    WITH aud AS (
        SELECT DISTINCT u.user_id FROM (
            SELECT user_id FROM public.user_roles WHERE v_n.audience_divisions IS NULL OR division_code = ANY(v_n.audience_divisions)
            UNION
            SELECT user_id FROM public.staff WHERE user_id IS NOT NULL
               AND (v_n.audience_divisions IS NULL OR "Division" = ANY(v_n.audience_divisions))) u
         WHERE u.user_id <> v_n.issued_by)
    SELECT (SELECT count(*)::int FROM aud),
           (SELECT count(*)::int FROM aud JOIN public.notice_reads r ON r.user_id = aud.user_id AND r.notice_id = p_id),
           (SELECT count(*)::int FROM aud JOIN public.notice_reads r ON r.user_id = aud.user_id AND r.notice_id = p_id AND r.acked_at IS NOT NULL),
           CASE WHEN v_n.must_ack THEN
               (SELECT coalesce(array_agg(coalesce(s."Name", 'login ' || left(aud.user_id::text, 8)) ORDER BY s."Name"), '{}')
                  FROM aud
                  LEFT JOIN public.notice_reads r ON r.user_id = aud.user_id AND r.notice_id = p_id
                  LEFT JOIN public.staff s ON s.user_id = aud.user_id
                 WHERE r.acked_at IS NULL)
           ELSE '{}'::text[] END;
END;
$$;

REVOKE ALL ON FUNCTION public.notice_issue(text, text, text, text[], boolean, date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notice_mark_read(uuid, boolean)                                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notice_read_counts(uuid)                                         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notice_issue(text, text, text, text[], boolean, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notice_mark_read(uuid, boolean)                                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notice_read_counts(uuid)                                         TO authenticated, service_role;

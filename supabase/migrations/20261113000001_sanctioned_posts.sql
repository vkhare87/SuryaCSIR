-- ============================================================
-- 20261113000001_sanctioned_posts
-- Enterprise P5 / EH1 — the sanctioned post register (owner decision 2:
-- HRAdmin owns it; MasterAdmin may act too).
--
-- One row per sanctioned post: group, level, designation, discipline,
-- division, category, state and holder. Every change of state is an event
-- (append-only) with the order that made it. State moves only through
-- post_fill / post_vacate / post_set_state. division_strength gives
-- sanctioned · filled · vacant per division from the register; the two
-- integers on divisions ("divSanctionedstrength", "divCurrentStrength") are
-- no longer read by the app.
-- Recruitment-rule checks (who may hold which post) wait on the rule text
-- (enterprise plan §7); this register records, it does not judge.
-- Tests: scripts/db/people.db.test.ts.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.sanctioned_posts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_code       text NOT NULL UNIQUE CHECK (btrim(post_code) <> ''),
    staff_group     text NOT NULL,          -- Group IV (scientific), III (technical), …
    level           text,                   -- pay level
    designation     text NOT NULL,
    discipline      text,
    division_code   text REFERENCES public.divisions("divCode") ON DELETE SET NULL,
    category        text,                   -- reservation category of the post, as sanctioned
    state           text NOT NULL DEFAULT 'VACANT'
                    CHECK (state IN ('FILLED', 'VACANT', 'ADVERTISED', 'ABEYANCE', 'ABOLISHED')),
    holder_staff_id text REFERENCES public.staff("ID") ON DELETE SET NULL,
    vacant_since    date,
    sanction_ref    text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK ((state = 'FILLED') = (holder_staff_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS sanctioned_posts_one_post_per_holder
    ON public.sanctioned_posts (holder_staff_id) WHERE holder_staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sanctioned_posts_division_idx ON public.sanctioned_posts (division_code, state);

CREATE TABLE IF NOT EXISTS public.sanctioned_post_events (
    id          bigserial PRIMARY KEY,
    post_id     uuid NOT NULL REFERENCES public.sanctioned_posts(id) ON DELETE CASCADE,
    at          timestamptz NOT NULL DEFAULT now(),
    actor       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    from_state  text,
    to_state    text NOT NULL,
    staff_id    text,
    effective_on date,
    order_ref   text,
    note        text
);
CREATE INDEX IF NOT EXISTS sanctioned_post_events_post_idx ON public.sanctioned_post_events (post_id, at);

-- Readable by those who read personnel institute-wide, and by division
-- managers for their own division. Written only by the RPCs.
ALTER TABLE public.sanctioned_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctioned_post_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sanctioned_posts_select" ON public.sanctioned_posts;
CREATE POLICY "sanctioned_posts_select" ON public.sanctioned_posts FOR SELECT TO authenticated
    USING (public.caller_sees_all_personnel() OR public.caller_in_division(division_code));
DROP POLICY IF EXISTS "sanctioned_post_events_select" ON public.sanctioned_post_events;
CREATE POLICY "sanctioned_post_events_select" ON public.sanctioned_post_events FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.sanctioned_posts p WHERE p.id = sanctioned_post_events.post_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sanctioned_posts, public.sanctioned_post_events FROM authenticated, anon;
REVOKE ALL ON public.sanctioned_posts, public.sanctioned_post_events FROM anon;
GRANT SELECT ON public.sanctioned_posts, public.sanctioned_post_events TO authenticated;

-- Add a post (the register is built once from the sanction orders, then kept).
CREATE OR REPLACE FUNCTION public.post_create(
    p_post_code text, p_group text, p_level text, p_designation text, p_discipline text,
    p_division text, p_category text, p_sanction_ref text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT public.caller_has_role('HRAdmin') AND NOT public.caller_has_role('MasterAdmin') THEN
        RAISE EXCEPTION 'Only HR keeps the post register';
    END IF;
    IF coalesce(btrim(p_post_code), '') = '' OR coalesce(btrim(p_group), '') = '' OR coalesce(btrim(p_designation), '') = '' THEN
        RAISE EXCEPTION 'Give the post code, group and designation';
    END IF;
    INSERT INTO public.sanctioned_posts (post_code, staff_group, level, designation, discipline, division_code, category,
                                         state, vacant_since, sanction_ref)
    VALUES (btrim(p_post_code), btrim(p_group), nullif(btrim(p_level), ''), btrim(p_designation), nullif(btrim(p_discipline), ''),
            nullif(btrim(p_division), ''), nullif(btrim(p_category), ''), 'VACANT', public.ist_today(), nullif(btrim(p_sanction_ref), ''))
    RETURNING id INTO v_id;
    INSERT INTO public.sanctioned_post_events (post_id, actor, from_state, to_state, effective_on, order_ref, note)
    VALUES (v_id, auth.uid(), NULL, 'VACANT', public.ist_today(), nullif(btrim(p_sanction_ref), ''), 'Post entered in the register');
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_fill(p_post_id uuid, p_staff_id text, p_on date, p_order_ref text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v public.sanctioned_posts%ROWTYPE;
BEGIN
    IF NOT public.caller_has_role('HRAdmin') AND NOT public.caller_has_role('MasterAdmin') THEN
        RAISE EXCEPTION 'Only HR keeps the post register';
    END IF;
    SELECT * INTO v FROM public.sanctioned_posts WHERE id = p_post_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
    IF v.state NOT IN ('VACANT', 'ADVERTISED') THEN RAISE EXCEPTION 'Only a vacant or advertised post can be filled (it is %)', v.state; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.staff WHERE "ID" = p_staff_id) THEN RAISE EXCEPTION 'No staff member %', p_staff_id; END IF;
    IF EXISTS (SELECT 1 FROM public.sanctioned_posts WHERE holder_staff_id = p_staff_id) THEN
        RAISE EXCEPTION '% already holds a post; vacate it first', p_staff_id;
    END IF;
    IF coalesce(btrim(p_order_ref), '') = '' THEN RAISE EXCEPTION 'Name the appointment order'; END IF;
    UPDATE public.sanctioned_posts SET state = 'FILLED', holder_staff_id = p_staff_id, vacant_since = NULL WHERE id = p_post_id;
    INSERT INTO public.sanctioned_post_events (post_id, actor, from_state, to_state, staff_id, effective_on, order_ref)
    VALUES (p_post_id, auth.uid(), v.state, 'FILLED', p_staff_id, coalesce(p_on, public.ist_today()), btrim(p_order_ref));
END;
$$;

CREATE OR REPLACE FUNCTION public.post_vacate(p_post_id uuid, p_on date, p_reason text, p_order_ref text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v public.sanctioned_posts%ROWTYPE;
BEGIN
    IF NOT public.caller_has_role('HRAdmin') AND NOT public.caller_has_role('MasterAdmin') THEN
        RAISE EXCEPTION 'Only HR keeps the post register';
    END IF;
    SELECT * INTO v FROM public.sanctioned_posts WHERE id = p_post_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
    IF v.state <> 'FILLED' THEN RAISE EXCEPTION 'Only a filled post can fall vacant'; END IF;
    IF p_on IS NULL OR coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'Give the date and the reason (retirement, promotion, transfer …)'; END IF;
    UPDATE public.sanctioned_posts SET state = 'VACANT', holder_staff_id = NULL, vacant_since = p_on WHERE id = p_post_id;
    INSERT INTO public.sanctioned_post_events (post_id, actor, from_state, to_state, staff_id, effective_on, order_ref, note)
    VALUES (p_post_id, auth.uid(), 'FILLED', 'VACANT', v.holder_staff_id, p_on, nullif(btrim(p_order_ref), ''), btrim(p_reason));
END;
$$;

-- Advertise, keep in abeyance, abolish, or return to vacant.
CREATE OR REPLACE FUNCTION public.post_set_state(p_post_id uuid, p_state text, p_order_ref text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v public.sanctioned_posts%ROWTYPE;
BEGIN
    IF NOT public.caller_has_role('HRAdmin') AND NOT public.caller_has_role('MasterAdmin') THEN
        RAISE EXCEPTION 'Only HR keeps the post register';
    END IF;
    SELECT * INTO v FROM public.sanctioned_posts WHERE id = p_post_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
    IF p_state NOT IN ('VACANT', 'ADVERTISED', 'ABEYANCE', 'ABOLISHED') THEN
        RAISE EXCEPTION 'Use post_fill or post_vacate for a holder; this sets VACANT, ADVERTISED, ABEYANCE or ABOLISHED';
    END IF;
    IF v.state = 'FILLED' THEN RAISE EXCEPTION 'The post is held; vacate it first'; END IF;
    IF v.state = 'ABOLISHED' THEN RAISE EXCEPTION 'An abolished post stays abolished'; END IF;
    IF coalesce(btrim(p_order_ref), '') = '' THEN RAISE EXCEPTION 'Name the order'; END IF;
    UPDATE public.sanctioned_posts SET state = p_state,
           vacant_since = CASE WHEN p_state IN ('VACANT', 'ADVERTISED') THEN coalesce(v.vacant_since, public.ist_today()) END
     WHERE id = p_post_id;
    INSERT INTO public.sanctioned_post_events (post_id, actor, from_state, to_state, effective_on, order_ref)
    VALUES (p_post_id, auth.uid(), v.state, p_state, public.ist_today(), btrim(p_order_ref));
END;
$$;

-- Sanctioned · filled · vacant per division. ABOLISHED posts are not
-- sanctioned; ADVERTISED and ABEYANCE posts are vacant.
CREATE OR REPLACE VIEW public.division_strength WITH (security_invoker = true) AS
SELECT coalesce(division_code, '—') AS division_code,
       count(*) FILTER (WHERE state <> 'ABOLISHED')::int AS sanctioned,
       count(*) FILTER (WHERE state = 'FILLED')::int AS filled,
       count(*) FILTER (WHERE state IN ('VACANT', 'ADVERTISED', 'ABEYANCE'))::int AS vacant,
       count(*) FILTER (WHERE state = 'ADVERTISED')::int AS advertised,
       min(vacant_since) FILTER (WHERE state IN ('VACANT', 'ADVERTISED')) AS oldest_vacancy
  FROM public.sanctioned_posts
 GROUP BY 1;
REVOKE ALL ON public.division_strength FROM PUBLIC, anon;
GRANT SELECT ON public.division_strength TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.post_create(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_fill(uuid, text, date, text)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_vacate(uuid, date, text, text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_set_state(uuid, text, text)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_create(text, text, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_fill(uuid, text, date, text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_vacate(uuid, date, text, text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_set_state(uuid, text, text)     TO authenticated, service_role;

COMMIT;

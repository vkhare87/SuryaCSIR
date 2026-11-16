-- 20261114120007_home_review_fixes
-- Review fixes for the lane 1 home migrations (PR 32), as a new file so a
-- project that already applied 120002 / 120005 picks them up.
--
--   1. priority_answer binds the answer to the date the asker saw. Two
--      push-backs can replace each other while the asker's screen still shows
--      the first; the answer then refused instead of accepting a date the
--      asker never read.
--   2. delegation_issue numbers orders past 99 without truncation:
--      lpad('100', 2, '0') is '10', a duplicate order number.
--
-- Rerun: idempotent.

-- ── 1. Answer only the push-back the asker saw ────────────────────────
DROP FUNCTION IF EXISTS public.priority_answer(uuid, boolean);

CREATE OR REPLACE FUNCTION public.priority_answer(p_id uuid, p_accept boolean, p_expected_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_p public.work_priorities%ROWTYPE;
BEGIN
    SELECT * INTO v_p FROM public.work_priorities
     WHERE id = p_id AND asked_by = (SELECT auth.uid()) AND status = 'OPEN' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not an open priority you asked'; END IF;
    IF v_p.pushback_at IS NULL OR v_p.pushback_answer IS NOT NULL THEN RAISE EXCEPTION 'No new date is waiting for your answer'; END IF;
    IF p_expected_date IS NULL OR v_p.pushback_date IS DISTINCT FROM p_expected_date THEN
        RAISE EXCEPTION 'The date asked for has changed to %. Reload and answer again.', v_p.pushback_date;
    END IF;
    UPDATE public.work_priorities
       SET pushback_answer = CASE WHEN p_accept THEN 'ACCEPTED' ELSE 'KEPT' END,
           wanted_by = CASE WHEN p_accept THEN pushback_date ELSE wanted_by END
     WHERE id = p_id;
    PERFORM public.priority_notify(v_p.assignee_user_id, p_id, 'answer:' || v_p.pushback_date,
        CASE WHEN p_accept THEN 'New date accepted: ' ELSE 'Date kept: ' END || v_p.title,
        CASE WHEN p_accept THEN 'Wanted by ' || to_char(v_p.pushback_date, 'DD Mon') ELSE 'Still wanted by ' || to_char(v_p.wanted_by, 'DD Mon') END);
END;
$$;

REVOKE ALL ON FUNCTION public.priority_answer(uuid, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.priority_answer(uuid, boolean, date) TO authenticated, service_role;

-- ── 2. Order numbers keep every digit ─────────────────────────────────
-- Copied from 20261114120005 with one change: the lpad width.
CREATE OR REPLACE FUNCTION public.delegation_issue(p_preset text, p_lines jsonb, p_effective_from date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me     uuid := (SELECT auth.uid());
    v_from   date := coalesce(p_effective_from, public.ist_today());
    v_year   text := to_char(public.ist_today(), 'YYYY');
    v_seq    integer;
    v_no     text;
    v_id     uuid;
    v_line   jsonb;
    v_body   text := '';
    v_notice uuid;
BEGIN
    -- A held Director only: an acting Director works under the order in force.
    IF v_me IS NULL OR NOT public.proposals_caller_has_role('Director') THEN
        RAISE EXCEPTION 'Only the Director issues a delegation order';
    END IF;
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'Give the lines of the order'; END IF;
    -- An order takes effect the day it is issued, so ending the order before it is always right.
    IF v_from <> public.ist_today() THEN RAISE EXCEPTION 'An order takes effect the day it is issued'; END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        IF coalesce(v_line->>'mode', '') NOT IN ('SELF', 'HEAD_TELL', 'HEAD_FLAGS') THEN
            RAISE EXCEPTION 'Unknown mode for %', v_line->>'kind';
        END IF;
        IF v_line->>'mode' <> 'SELF' AND public.delegation_is_floor(v_line->>'kind') THEN
            RAISE EXCEPTION '% cannot be delegated (rule delegation.floor.%)', v_line->>'kind', v_line->>'kind';
        END IF;
        -- A kind that carries money goes to a head only with a limit.
        IF v_line->>'mode' <> 'SELF' AND v_line->>'kind' = 'INDENT'
           AND (v_line->>'limit' IS NULL OR (v_line->>'limit')::numeric < 0) THEN
            RAISE EXCEPTION 'Give a money limit for %', v_line->>'kind';
        END IF;
    END LOOP;

    PERFORM pg_advisory_xact_lock(hashtext('delegation_orders'));
    UPDATE public.delegation_orders SET ended_at = now() WHERE ended_at IS NULL;
    SELECT count(*) + 1 INTO v_seq FROM public.delegation_orders WHERE order_no LIKE 'DO/' || v_year || '/%';
    v_no := 'DO/' || v_year || '/' || lpad(v_seq::text, greatest(2, length(v_seq::text)), '0');

    INSERT INTO public.delegation_orders (order_no, director_user_id, preset, effective_from)
    VALUES (v_no, v_me, nullif(p_preset, ''), v_from)
    RETURNING id INTO v_id;

    INSERT INTO public.delegation_lines (order_id, kind, division_code, mode, amount_limit, sample_rate)
    SELECT v_id, l->>'kind', coalesce(nullif(l->>'division', ''), '*'), l->>'mode',
           (l->>'limit')::numeric, coalesce((l->>'sample')::smallint, CASE WHEN l->>'mode' = 'HEAD_FLAGS' THEN 10 ELSE 0 END)
      FROM jsonb_array_elements(p_lines) l;

    SELECT string_agg(kind || CASE WHEN division_code <> '*' THEN ' (' || division_code || ')' ELSE '' END || ': '
                      || CASE mode WHEN 'SELF' THEN 'the Director decides'
                                   WHEN 'HEAD_TELL' THEN 'the head decides; the Director is told'
                                   ELSE 'the head decides; the Director sees flags' END
                      || CASE WHEN amount_limit IS NOT NULL THEN ', up to Rs ' || amount_limit ELSE '' END,
                      E'\n' ORDER BY kind, division_code)
      INTO v_body FROM public.delegation_lines WHERE order_id = v_id;

    v_notice := public.notice_issue('OFFICE_ORDER', 'Delegation of decisions ' || v_no,
        'In force from ' || to_char(v_from, 'DD Mon YYYY') || E'.\n' || coalesce(v_body, ''), NULL);
    UPDATE public.delegation_orders SET notice_id = v_notice WHERE id = v_id;
    RETURN v_id;
END;
$$;

-- 20261114120005_delegation
-- Lane 1, DH2 (DIRECTOR-HOME-PLAN.md §1, §5): the delegation dial.
--
-- The Director sets, per kind of decision, who decides: SELF (the Director),
-- HEAD_TELL (the head decides, the Director is told), or HEAD_FLAGS (the
-- head decides, the Director sees flags only). A line may carry a money limit
-- and a division. Every change is a new dated order, published as an office
-- order (notices, 20261114120003). A held Director issues it; an acting
-- Director cannot.
--
-- The floor: kinds a Director may not delegate. They live in csir_rules as
-- delegation.floor.<kind>, so a change in CSIR's delegation of powers is a
-- data change. These rows are the plan's defaults and are marked unverified
-- until the Delegation of Powers text is entered.
--
-- decision_authority() is the one place the rule is read. Modules call it
-- when they are converted (DH3). With no order in force it answers
-- 'UNCHANGED': every module behaves exactly as before.

INSERT INTO public.csir_rules (rule_key, value, unit, effective_from, source_ref, verified, note) VALUES
    ('delegation.floor.SELECTION_RESULT',       'true', NULL, '2025-04-25', 'Plan default (DIRECTOR-HOME-PLAN §1.2); Delegation of Powers text not yet entered', false, 'Selection committee result'),
    ('delegation.floor.APPRAISAL_GRADE',        'true', NULL, '2025-04-25', 'Plan default (DIRECTOR-HOME-PLAN §1.2); Delegation of Powers text not yet entered', false, 'Final appraisal grade and representation'),
    ('delegation.floor.MOU_SIGNING',            'true', NULL, '2025-04-25', 'Plan default (DIRECTOR-HOME-PLAN §1.2); Delegation of Powers text not yet entered', false, 'MoU or agreement signing'),
    ('delegation.floor.COMMITTEE_CONSTITUTION', 'true', NULL, '2025-04-25', 'Plan default (DIRECTOR-HOME-PLAN §1.2); Delegation of Powers text not yet entered', false, 'Constituting a committee'),
    ('delegation.floor.WRITE_OFF',              'true', NULL, '2025-04-25', 'Plan default (DIRECTOR-HOME-PLAN §8.2); Delegation of Powers text not yet entered', false, 'Write-off of stores')
ON CONFLICT (rule_key, effective_from) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.delegation_orders (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no         text NOT NULL UNIQUE,
    director_user_id uuid NOT NULL REFERENCES auth.users(id),
    preset           text CHECK (preset IS NULL OR preset IN ('HANDS_ON', 'BALANCED', 'HANDS_OFF')),
    effective_from   date NOT NULL,
    ended_at         timestamptz,
    notice_id        uuid REFERENCES public.notices(id),
    issued_at        timestamptz NOT NULL DEFAULT now()
);
-- At most one order in force.
CREATE UNIQUE INDEX IF NOT EXISTS delegation_orders_one_in_force ON public.delegation_orders ((true)) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.delegation_lines (
    order_id      uuid NOT NULL REFERENCES public.delegation_orders(id) ON DELETE CASCADE,
    kind          text NOT NULL CHECK (kind ~ '^[A-Z_]+$'),
    -- '*' = every division.
    division_code text NOT NULL DEFAULT '*',
    mode          text NOT NULL CHECK (mode IN ('SELF', 'HEAD_TELL', 'HEAD_FLAGS')),
    amount_limit  numeric CHECK (amount_limit IS NULL OR amount_limit >= 0),
    sample_rate   smallint NOT NULL DEFAULT 0 CHECK (sample_rate BETWEEN 0 AND 100),
    PRIMARY KEY (order_id, kind, division_code)
);

-- The order in force is an office order: every staff member may read it.
ALTER TABLE public.delegation_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delegation_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delegation_orders_select" ON public.delegation_orders;
CREATE POLICY "delegation_orders_select" ON public.delegation_orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "delegation_lines_select" ON public.delegation_lines;
CREATE POLICY "delegation_lines_select" ON public.delegation_lines FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.delegation_orders, public.delegation_lines FROM authenticated, anon;
REVOKE ALL ON public.delegation_orders, public.delegation_lines FROM anon;
GRANT SELECT ON public.delegation_orders, public.delegation_lines TO authenticated;

CREATE OR REPLACE FUNCTION public.delegation_is_floor(p_kind text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  -- csir_rule() raises when a key is missing; a kind with no floor row is simply delegable.
  -- The newest row in force wins, as in csir_rule().
  SELECT coalesce((
    SELECT r.value = 'true'::jsonb FROM public.csir_rules r
     WHERE r.rule_key = 'delegation.floor.' || p_kind
       AND r.effective_from <= public.ist_today()
       AND (r.effective_to IS NULL OR r.effective_to >= public.ist_today())
     ORDER BY r.effective_from DESC LIMIT 1), false);
$$;

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
    IF v_from < public.ist_today() THEN RAISE EXCEPTION 'An order cannot start in the past'; END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        IF coalesce(v_line->>'mode', '') NOT IN ('SELF', 'HEAD_TELL', 'HEAD_FLAGS') THEN
            RAISE EXCEPTION 'Unknown mode for %', v_line->>'kind';
        END IF;
        IF v_line->>'mode' <> 'SELF' AND public.delegation_is_floor(v_line->>'kind') THEN
            RAISE EXCEPTION '% cannot be delegated (rule delegation.floor.%)', v_line->>'kind', v_line->>'kind';
        END IF;
    END LOOP;

    PERFORM pg_advisory_xact_lock(hashtext('delegation_orders'));
    UPDATE public.delegation_orders SET ended_at = now() WHERE ended_at IS NULL;
    SELECT count(*) + 1 INTO v_seq FROM public.delegation_orders WHERE order_no LIKE 'DO/' || v_year || '/%';
    v_no := 'DO/' || v_year || '/' || lpad(v_seq::text, 2, '0');

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

-- Who decides this item: the Director, or the head under the order in force.
-- 'UNCHANGED' when no order is in force: the module keeps its own rule.
CREATE OR REPLACE FUNCTION public.decision_authority(
    p_kind text, p_division text, p_amount numeric DEFAULT NULL, p_requester uuid DEFAULT NULL)
RETURNS TABLE (authority text, order_id uuid, mode text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_order public.delegation_orders%ROWTYPE;
    v_line  public.delegation_lines%ROWTYPE;
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    SELECT * INTO v_order FROM public.delegation_orders
     WHERE ended_at IS NULL AND effective_from <= public.ist_today();
    IF NOT FOUND THEN RETURN QUERY SELECT 'UNCHANGED'::text, NULL::uuid, NULL::text; RETURN; END IF;

    IF public.delegation_is_floor(p_kind) THEN
        RETURN QUERY SELECT 'DIRECTOR'::text, v_order.id, 'SELF'::text; RETURN;
    END IF;
    SELECT * INTO v_line FROM public.delegation_lines l
     WHERE l.order_id = v_order.id AND l.kind = p_kind AND l.division_code IN (coalesce(p_division, '*'), '*')
     ORDER BY (l.division_code = '*')
     LIMIT 1;
    IF NOT FOUND OR v_line.mode = 'SELF'
       OR (v_line.amount_limit IS NOT NULL AND coalesce(p_amount, 0) > v_line.amount_limit)
       -- No self-approval: a head never decides an item they asked for.
       OR (p_requester IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.user_roles r
             WHERE r.user_id = p_requester AND r.role IN ('HOD', 'DivisionHead') AND r.division_code = p_division)) THEN
        RETURN QUERY SELECT 'DIRECTOR'::text, v_order.id, coalesce(v_line.mode, 'SELF'); RETURN;
    END IF;
    RETURN QUERY SELECT 'HEAD'::text, v_order.id, v_line.mode;
END;
$$;

REVOKE ALL ON FUNCTION public.delegation_issue(text, jsonb, date)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decision_authority(text, text, numeric, uuid)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delegation_issue(text, jsonb, date)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decision_authority(text, text, numeric, uuid)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delegation_is_floor(text)                         TO authenticated, service_role;

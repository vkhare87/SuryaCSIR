-- P8 EI2 — suggest, accept, log.
--
-- A suggestion is a notification (source 'agent') whose proposed_action is
-- {kind, args, label}. notification_accept(id) is the only way to run one:
--   * the notification must be the caller's and still open / read;
--   * kind must be on the whitelist below — anything else cannot run;
--   * each kind re-checks the caller itself (this function is definer);
--   * the accept, the change and the caller go to ai_action_log in the same
--     transaction. A failed action rolls everything back.
-- Whitelist:
--   identity_link      identity_set_link(record_kind, record_id, pos, staff_id)
--                      — that RPC's own check: only oneself, or an admin
--   expertise_confirm  the caller's own staff_expertise row, confirmed
-- ai_suggest_sweep() writes the fixed-rule suggestions daily: "is this paper
-- yours?" to each staff member whose name matches an unlinked author or
-- inventor, and "confirm this expertise" for terms found in 2+ of a person's
-- records. Overdue progress reports already reach the PI from
-- notifications_sweep, with the link to file them.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_action_log (
    id              bigserial PRIMARY KEY,
    notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action_kind     text NOT NULL,
    args            jsonb NOT NULL DEFAULT '{}',
    outcome         text NOT NULL CHECK (outcome IN ('DONE', 'OPENED')),
    at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_action_log_user_idx ON public.ai_action_log (user_id, at DESC);
ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_action_log_select ON public.ai_action_log;
CREATE POLICY ai_action_log_select ON public.ai_action_log FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) OR public.caller_is_admin());
REVOKE ALL ON public.ai_action_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_action_log TO authenticated;
GRANT ALL ON public.ai_action_log TO service_role;

CREATE OR REPLACE FUNCTION public.notification_accept(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_action jsonb;
    v_kind   text;
    v_args   jsonb;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    UPDATE public.notifications SET status = 'accepted'
     WHERE id = p_id AND user_id = auth.uid() AND status IN ('open', 'read') AND proposed_action IS NOT NULL
    RETURNING proposed_action INTO v_action;
    IF NOT FOUND THEN RAISE EXCEPTION 'Nothing to accept'; END IF;

    v_kind := v_action->>'kind';
    v_args := coalesce(v_action->'args', '{}'::jsonb);
    IF v_kind = 'identity_link' THEN
        PERFORM public.identity_set_link(v_args->>'record_kind', v_args->>'record_id', (v_args->>'pos')::int, v_args->>'staff_id');
    ELSIF v_kind = 'expertise_confirm' THEN
        IF (v_args->>'staff_id') IS DISTINCT FROM public.caller_staff_id() THEN
            RAISE EXCEPTION 'Only the person confirms their own expertise';
        END IF;
        INSERT INTO public.staff_expertise (staff_id, term_id, source, confirmed_at, added_by)
        VALUES (v_args->>'staff_id', (v_args->>'term_id')::uuid, 'SUGGESTED', now(), auth.uid())
        ON CONFLICT (staff_id, term_id) DO UPDATE SET confirmed_at = now();
    ELSIF v_kind = 'open' THEN
        NULL;
    ELSE
        RAISE EXCEPTION 'Action % is not allowed', coalesce(v_kind, '(none)');
    END IF;

    INSERT INTO public.ai_action_log (notification_id, user_id, action_kind, args, outcome)
    VALUES (p_id, auth.uid(), v_kind, v_args, CASE WHEN v_kind = 'open' THEN 'OPENED' ELSE 'DONE' END);
    RETURN v_action->>'link';
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_suggest_sweep()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n integer;
    v_m integer;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT coalesce(public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only MasterAdmin runs the suggestion sweep';
    END IF;

    -- "Is this yours?" — unlinked author / inventor names that match a staff member with a login.
    WITH gaps AS (
        SELECT 'OUTPUT' AS record_kind, a.output_id AS record_id, a.pos, a.author_name AS name, o.title
          FROM public.output_authors a JOIN public.scientific_outputs o ON o.id = a.output_id
         WHERE a.staff_id IS NULL
        UNION ALL
        SELECT 'IP', i.ip_id, i.pos, i.author_name, ip.title
          FROM public.ip_inventors i JOIN public.ip_intelligence ip ON ip.id = i.ip_id
         WHERE i.staff_id IS NULL
    )
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key, proposed_action)
    SELECT s.user_id, 'suggest-identity-link', 'info',
           CASE g.record_kind WHEN 'OUTPUT' THEN 'Is this paper yours?' ELSE 'Is this patent yours?' END,
           '"' || g.name || '" on ' || g.title || '. Accept to add it to your profile.',
           '/me', 'agent', 'suggest-link:' || g.record_kind || ':' || g.record_id || ':' || g.pos,
           jsonb_build_object('kind', 'identity_link', 'label', 'Yes, it is mine',
               'args', jsonb_build_object('record_kind', g.record_kind, 'record_id', g.record_id, 'pos', g.pos, 'staff_id', s."ID"))
      FROM gaps g
      JOIN public.staff s ON s.user_id IS NOT NULL AND public.person_name_key(s."Name") = public.person_name_key(g.name)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;

    -- "Confirm this expertise" — a term found in two or more of the person's records.
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key, proposed_action)
    SELECT s.user_id, 'suggest-expertise', 'info', 'Confirm expertise: ' || x.label,
           '"' || x.label || '" appears in ' || x.evidence_count || ' of your records. Accept to list it on your profile.',
           '/me', 'agent', 'suggest-expertise:' || s."ID" || ':' || x.term_id,
           jsonb_build_object('kind', 'expertise_confirm', 'label', 'Confirm',
               'args', jsonb_build_object('staff_id', s."ID", 'term_id', x.term_id))
      FROM public.staff s
     CROSS JOIN LATERAL public.expertise_suggest(s."ID") x
     WHERE s.user_id IS NOT NULL AND x.evidence_count >= 2
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_m = ROW_COUNT;
    RETURN v_n + v_m;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_accept(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ai_suggest_sweep()        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_accept(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_suggest_sweep()        TO authenticated, service_role;

-- 01:30 UTC = 07:00 IST.
SELECT cron.schedule('ai-suggest-sweep', '30 1 * * *', 'select public.ai_suggest_sweep()');

COMMIT;

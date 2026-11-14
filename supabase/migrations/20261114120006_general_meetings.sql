-- 20261114120006_general_meetings
-- Lane 1, CD10 (COMMON-DESK-PLAN.md §5.11): an ordinary meeting — a PI calls
-- the team, a head calls the scientists. Not a committee meeting: no quorum,
-- no minutes book. Anyone with a login may call one.
--
-- Read: the organiser and the invitees only.
-- Find a time: the organiser may see when invitees are busy with other such
-- meetings — times only, never titles (meeting_busy).

CREATE TABLE IF NOT EXISTS public.general_meetings (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title        text NOT NULL CHECK (btrim(title) <> ''),
    organiser    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    starts_at    timestamptz NOT NULL,
    ends_at      timestamptz NOT NULL,
    place        text NOT NULL DEFAULT '',
    link         text CHECK (link IS NULL OR link ~ '^https://'),
    agenda       text NOT NULL DEFAULT '',
    cancelled_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '12 hours')
);
CREATE INDEX IF NOT EXISTS general_meetings_starts_idx ON public.general_meetings (starts_at);

CREATE TABLE IF NOT EXISTS public.general_meeting_invitees (
    meeting_id uuid NOT NULL REFERENCES public.general_meetings(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reply      text CHECK (reply IS NULL OR reply IN ('YES', 'NO', 'MAYBE')),
    replied_at timestamptz,
    PRIMARY KEY (meeting_id, user_id)
);
CREATE INDEX IF NOT EXISTS general_meeting_invitees_user_idx ON public.general_meeting_invitees (user_id);

-- Is the caller invited? Definer, so the meetings policy does not loop through the invitees policy.
CREATE OR REPLACE FUNCTION public.general_meeting_caller_invited(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.general_meeting_invitees WHERE meeting_id = p_id AND user_id = (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.general_meeting_caller_invited(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.general_meeting_caller_invited(uuid) TO authenticated, service_role;

ALTER TABLE public.general_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_meeting_invitees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "general_meetings_select" ON public.general_meetings;
CREATE POLICY "general_meetings_select" ON public.general_meetings FOR SELECT TO authenticated
    USING (organiser = (SELECT auth.uid()) OR public.general_meeting_caller_invited(id));
DROP POLICY IF EXISTS "general_meeting_invitees_select" ON public.general_meeting_invitees;
CREATE POLICY "general_meeting_invitees_select" ON public.general_meeting_invitees FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.general_meetings m WHERE m.id = meeting_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.general_meetings, public.general_meeting_invitees FROM authenticated, anon;
REVOKE ALL ON public.general_meetings, public.general_meeting_invitees FROM anon;
GRANT SELECT ON public.general_meetings, public.general_meeting_invitees TO authenticated;

CREATE OR REPLACE FUNCTION public.general_meeting_create(
    p_title text, p_starts timestamptz, p_ends timestamptz, p_place text, p_link text, p_agenda text, p_invitees uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me uuid := (SELECT auth.uid());
    v_id uuid;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    IF coalesce(btrim(p_title), '') = '' THEN RAISE EXCEPTION 'Give the meeting a title'; END IF;
    IF p_starts IS NULL OR p_ends IS NULL OR p_ends <= p_starts THEN RAISE EXCEPTION 'The meeting must end after it starts'; END IF;
    IF p_ends - p_starts > interval '12 hours' THEN RAISE EXCEPTION 'A meeting lasts at most 12 hours'; END IF;
    IF p_starts < now() - interval '1 hour' THEN RAISE EXCEPTION 'The meeting cannot start in the past'; END IF;
    IF p_invitees IS NULL OR cardinality(p_invitees) = 0 THEN RAISE EXCEPTION 'Invite at least one person'; END IF;
    IF cardinality(p_invitees) > 200 THEN RAISE EXCEPTION 'At most 200 people; issue a notice for more'; END IF;
    IF nullif(btrim(p_link), '') IS NOT NULL AND btrim(p_link) !~ '^https://' THEN RAISE EXCEPTION 'The link must start with https://'; END IF;

    INSERT INTO public.general_meetings (title, organiser, starts_at, ends_at, place, link, agenda)
    VALUES (btrim(p_title), v_me, p_starts, p_ends, coalesce(btrim(p_place), ''), nullif(btrim(p_link), ''), coalesce(p_agenda, ''))
    RETURNING id INTO v_id;
    INSERT INTO public.general_meeting_invitees (meeting_id, user_id)
    SELECT v_id, u FROM (SELECT DISTINCT unnest(p_invitees) u) x
     WHERE u <> v_me AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = x.u);

    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT i.user_id, 'general_meeting', 'info', 'Meeting: ' || btrim(p_title),
           to_char(p_starts AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH24:MI') || CASE WHEN btrim(coalesce(p_place, '')) <> '' THEN ' · ' || btrim(p_place) ELSE '' END,
           '/', 'rule', 'gmeeting:' || v_id
      FROM public.general_meeting_invitees i WHERE i.meeting_id = v_id
    ON CONFLICT DO NOTHING;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.general_meeting_reply(p_id uuid, p_reply text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_reply NOT IN ('YES', 'NO', 'MAYBE') THEN RAISE EXCEPTION 'Reply yes, no or maybe'; END IF;
    UPDATE public.general_meeting_invitees SET reply = p_reply, replied_at = now()
     WHERE meeting_id = p_id AND user_id = (SELECT auth.uid());
    IF NOT FOUND THEN RAISE EXCEPTION 'You are not invited to that meeting'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.general_meeting_cancel(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_title text;
BEGIN
    UPDATE public.general_meetings SET cancelled_at = now()
     WHERE id = p_id AND organiser = (SELECT auth.uid()) AND cancelled_at IS NULL
     RETURNING title INTO v_title;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only the organiser cancels a meeting'; END IF;
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT user_id, 'general_meeting', 'warning', 'Cancelled: ' || v_title, '', '/', 'rule', 'gmeeting-cancel:' || p_id
      FROM public.general_meeting_invitees WHERE meeting_id = p_id
    ON CONFLICT DO NOTHING;
END;
$$;

-- Find a time: when these people are in other ordinary meetings. Times only.
CREATE OR REPLACE FUNCTION public.general_meeting_busy(p_users uuid[], p_from timestamptz, p_to timestamptz)
RETURNS TABLE (user_id uuid, starts_at timestamptz, ends_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    IF p_to - p_from > interval '31 days' THEN RAISE EXCEPTION 'Look at most 31 days ahead'; END IF;
    RETURN QUERY
    SELECT DISTINCT x.u, m.starts_at, m.ends_at
      FROM public.general_meetings m
      JOIN LATERAL (SELECT m.organiser AS u UNION SELECT i.user_id FROM public.general_meeting_invitees i
                     WHERE i.meeting_id = m.id AND coalesce(i.reply, 'YES') <> 'NO') x ON true
     WHERE m.cancelled_at IS NULL AND m.starts_at < p_to AND m.ends_at > p_from
       AND x.u = ANY(p_users);
END;
$$;

REVOKE ALL ON FUNCTION public.general_meeting_create(text, timestamptz, timestamptz, text, text, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.general_meeting_reply(uuid, text)                                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.general_meeting_cancel(uuid)                                                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.general_meeting_busy(uuid[], timestamptz, timestamptz)                         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.general_meeting_create(text, timestamptz, timestamptz, text, text, text, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.general_meeting_reply(uuid, text)                                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.general_meeting_cancel(uuid)                                                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.general_meeting_busy(uuid[], timestamptz, timestamptz)                         TO authenticated, service_role;

-- ============================================================
-- 20261112000013_coi_declarations
-- Enterprise P3 / EP4 — conflict-of-interest declarations (§6.3).
--
-- Before a meeting each member records Format 1 (no conflict) or Format 2
-- (a conflict, described). The chair decides, for each Format 2, whether
-- the member continues or recuses. Annexure 3 is the list of Format 2 and
-- recused members, built from these rows.
-- Confidential (§6.3): a declaration is read by its member, and by the
-- chair and convener (secretary) of the meeting's committee — no one else.
-- A missing declaration is flagged on the PME desk; it does not block the
-- meeting's decision, because the signed scan stays the proof.
-- Tests: scripts/db/compliance.db.test.ts.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.coi_declarations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id      uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    member_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    format          text NOT NULL CHECK (format IN ('F1', 'F2')),
    conflict_note   text,
    chair_decision  text CHECK (chair_decision IN ('CONTINUE', 'RECUSE')),
    decided_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at      timestamptz,
    declared_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (meeting_id, member_user_id),
    CHECK (format = 'F1' OR coalesce(btrim(conflict_note), '') <> ''),
    CHECK (format = 'F2' OR chair_decision IS NULL)
);

-- Is the caller chair or convener of this meeting's committee?
CREATE OR REPLACE FUNCTION public.coi_caller_chairs(p_meeting_id uuid, p_convener_too boolean DEFAULT true)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings m JOIN public.committees c ON c.id = m.committee_id
     WHERE m.id = p_meeting_id
       AND public.caller_staff_id() IS NOT NULL
       AND (c.chairperson_id = public.caller_staff_id()
            OR (p_convener_too AND c.secretary_id = public.caller_staff_id())));
$$;
REVOKE ALL ON FUNCTION public.coi_caller_chairs(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coi_caller_chairs(uuid, boolean) TO authenticated, service_role;

ALTER TABLE public.coi_declarations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coi_declarations_select" ON public.coi_declarations;
CREATE POLICY "coi_declarations_select" ON public.coi_declarations FOR SELECT TO authenticated
    USING (member_user_id = (SELECT auth.uid()) OR public.coi_caller_chairs(meeting_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.coi_declarations FROM authenticated, anon;
REVOKE ALL ON public.coi_declarations FROM anon;
GRANT SELECT ON public.coi_declarations TO authenticated;

-- A member of the committee (or its chair / convener) declares for the
-- meeting. May be changed until the chair has decided on it.
CREATE OR REPLACE FUNCTION public.coi_declare(p_meeting_id uuid, p_format text, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me  text := public.caller_staff_id();
    v_id  uuid;
BEGIN
    IF auth.uid() IS NULL OR v_me IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.meetings m JOIN public.committees c ON c.id = m.committee_id
         WHERE m.id = p_meeting_id
           AND (v_me IN (c.chairperson_id, c.secretary_id)
                OR EXISTS (SELECT 1 FROM public.committee_members cm WHERE cm.committee_id = c.id AND cm.staff_id = v_me)))
    THEN
        RAISE EXCEPTION 'Only a member of this committee can declare for its meeting';
    END IF;
    IF p_format NOT IN ('F1', 'F2') THEN RAISE EXCEPTION 'Choose Format 1 (no conflict) or Format 2 (a conflict)'; END IF;
    IF p_format = 'F2' AND coalesce(btrim(p_note), '') = '' THEN
        RAISE EXCEPTION 'Describe the conflict for Format 2';
    END IF;
    IF EXISTS (SELECT 1 FROM public.coi_declarations
                WHERE meeting_id = p_meeting_id AND member_user_id = auth.uid() AND chair_decision IS NOT NULL) THEN
        RAISE EXCEPTION 'The chair has already decided on your declaration';
    END IF;

    INSERT INTO public.coi_declarations (meeting_id, member_user_id, format, conflict_note)
    VALUES (p_meeting_id, auth.uid(), p_format, CASE WHEN p_format = 'F2' THEN btrim(p_note) END)
    ON CONFLICT (meeting_id, member_user_id) DO UPDATE
       SET format = EXCLUDED.format, conflict_note = EXCLUDED.conflict_note, declared_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- The chair decides on a Format 2 — never on their own.
CREATE OR REPLACE FUNCTION public.coi_chair_decide(p_id uuid, p_decision text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_d public.coi_declarations%ROWTYPE;
BEGIN
    SELECT * INTO v_d FROM public.coi_declarations WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(public.coi_caller_chairs(v_d.meeting_id, false), false) THEN
        RAISE EXCEPTION 'Only the chair of this committee decides on a declaration';
    END IF;
    IF v_d.member_user_id = auth.uid() THEN
        RAISE EXCEPTION 'The chair does not decide on their own declaration';
    END IF;
    IF v_d.format <> 'F2' THEN RAISE EXCEPTION 'Only a Format 2 declaration needs a decision'; END IF;
    IF p_decision NOT IN ('CONTINUE', 'RECUSE') THEN RAISE EXCEPTION 'Decide CONTINUE or RECUSE'; END IF;
    UPDATE public.coi_declarations
       SET chair_decision = p_decision, decided_by = auth.uid(), decided_at = now()
     WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.coi_declare(uuid, text, text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coi_chair_decide(uuid, text)     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coi_declare(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coi_chair_decide(uuid, text)  TO authenticated, service_role;

COMMIT;

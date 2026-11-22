-- ============================================================
-- Stage 4 — Signatures, Director Delegation Dial & Institute Meetings
-- Covers Roadmap items 4.1 (CM4 + CM5), 4.2 (DH2), 4.4 (DH3),
-- 4.5 (DH4), 4.6 (CD10)
-- ============================================================

-- ── 4.1 (CM4 + CM5) Proceedings, Minutes Versions & Shared Signatures ──

CREATE TABLE IF NOT EXISTS public.meeting_proceedings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    agenda_item_id uuid NOT NULL REFERENCES public.agenda_items(id) ON DELETE CASCADE,
    discussion_notes text NOT NULL DEFAULT '',
    decision_text text NOT NULL DEFAULT '',
    decision_kind text NOT NULL DEFAULT 'APPROVED' CHECK (decision_kind IN ('APPROVED', 'DEFERRED', 'NOTED', 'REJECTED', 'ACTION')),
    dissent_note text NOT NULL DEFAULT '',
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (meeting_id, agenda_item_id)
);

CREATE TABLE IF NOT EXISTS public.minutes_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    version_no integer NOT NULL DEFAULT 1,
    body_markdown text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CIRCULATED', 'APPROVED', 'SIGNED', 'ISSUED', 'CONFIRMED')),
    pdf_hash text,
    verification_code text UNIQUE,
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at timestamptz,
    signed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (meeting_id, version_no)
);

CREATE TABLE IF NOT EXISTS public.minutes_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    minutes_version_id uuid NOT NULL REFERENCES public.minutes_versions(id) ON DELETE CASCADE,
    agenda_item_id uuid REFERENCES public.agenda_items(id) ON DELETE SET NULL,
    author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    comment text NOT NULL CHECK (length(btrim(comment)) > 0),
    resolution text,
    resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    signer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    signer_name text NOT NULL DEFAULT '',
    level text NOT NULL DEFAULT 'ATTEST' CHECK (level IN ('ATTEST', 'SCAN', 'DSC', 'ESIGN')),
    payload_hash text NOT NULL,
    prev_hash text NOT NULL DEFAULT 'GENESIS',
    chain_hash text NOT NULL,
    verification_code text NOT NULL UNIQUE,
    signed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signatures_subject_idx ON public.signatures (subject_type, subject_id, signed_at DESC);

ALTER TABLE public.meeting_proceedings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minutes_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minutes_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_proceedings_read ON public.meeting_proceedings;
CREATE POLICY meeting_proceedings_read ON public.meeting_proceedings
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings m
         WHERE m.id = meeting_proceedings.meeting_id
           AND public.committee_can_read(m.committee_id)
    ));

DROP POLICY IF EXISTS minutes_versions_read ON public.minutes_versions;
CREATE POLICY minutes_versions_read ON public.minutes_versions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings m
         WHERE m.id = minutes_versions.meeting_id
           AND public.committee_can_read(m.committee_id)
    ));

DROP POLICY IF EXISTS minutes_comments_read ON public.minutes_comments;
CREATE POLICY minutes_comments_read ON public.minutes_comments
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1
          FROM public.minutes_versions mv
          JOIN public.meetings m ON m.id = mv.meeting_id
         WHERE mv.id = minutes_comments.minutes_version_id
           AND public.committee_can_read(m.committee_id)
    ));

DROP POLICY IF EXISTS signatures_read_all ON public.signatures;
CREATE POLICY signatures_read_all ON public.signatures
    FOR SELECT TO authenticated
    USING (true);

CREATE OR REPLACE FUNCTION public.meeting_proceeding_upsert(
    p_meeting_id uuid,
    p_agenda_item_id uuid,
    p_discussion_notes text,
    p_decision_text text,
    p_decision_kind text DEFAULT 'APPROVED',
    p_dissent_note text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_committee_id uuid;
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT committee_id INTO v_committee_id FROM public.meetings WHERE id = p_meeting_id;
    IF v_committee_id IS NULL THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;

    IF NOT public.committee_can_run(v_committee_id) THEN
        RAISE EXCEPTION 'Not authorized to edit proceedings for this committee';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.minutes_versions mv
         WHERE mv.meeting_id = p_meeting_id
           AND mv.status IN ('SIGNED', 'ISSUED', 'CONFIRMED')
    ) THEN
        RAISE EXCEPTION 'Signed minutes are locked and cannot be edited';
    END IF;

    INSERT INTO public.meeting_proceedings (
        meeting_id, agenda_item_id, discussion_notes, decision_text, decision_kind, dissent_note, updated_by, updated_at
    ) VALUES (
        p_meeting_id, p_agenda_item_id, COALESCE(p_discussion_notes, ''), COALESCE(p_decision_text, ''),
        COALESCE(p_decision_kind, 'APPROVED'), COALESCE(p_dissent_note, ''), v_caller, now()
    )
    ON CONFLICT (meeting_id, agenda_item_id) DO UPDATE
       SET discussion_notes = EXCLUDED.discussion_notes,
           decision_text = EXCLUDED.decision_text,
           decision_kind = EXCLUDED.decision_kind,
           dissent_note = EXCLUDED.dissent_note,
           updated_by = v_caller,
           updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.minutes_draft_create(
    p_meeting_id uuid,
    p_body_markdown text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_committee_id uuid;
    v_version_no integer;
    v_body text := p_body_markdown;
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT committee_id INTO v_committee_id FROM public.meetings WHERE id = p_meeting_id;
    IF v_committee_id IS NULL THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;

    IF NOT public.committee_can_run(v_committee_id) THEN
        RAISE EXCEPTION 'Not authorized to draft minutes';
    END IF;

    IF v_body IS NULL OR length(btrim(v_body)) = 0 THEN
        SELECT COALESCE(
            string_agg(
                '### ' || COALESCE(NULLIF(ai.title, ''), ai.description) || E'\n'
                || COALESCE(mp.discussion_notes, '') || E'\n**Decision (' || COALESCE(mp.decision_kind, 'NOTED') || '):** '
                || COALESCE(mp.decision_text, ''),
                E'\n\n' ORDER BY ai.sequence
            ),
            'No agenda proceedings recorded.'
        )
          INTO v_body
          FROM public.agenda_items ai
          LEFT JOIN public.meeting_proceedings mp ON mp.agenda_item_id = ai.id AND mp.meeting_id = p_meeting_id
         WHERE ai.meeting_id = p_meeting_id;
    END IF;

    SELECT COALESCE(max(version_no), 0) + 1 INTO v_version_no
      FROM public.minutes_versions WHERE meeting_id = p_meeting_id;

    INSERT INTO public.minutes_versions (meeting_id, version_no, body_markdown, status, created_by)
    VALUES (p_meeting_id, v_version_no, v_body, 'DRAFT', v_caller)
    RETURNING id INTO v_id;

    UPDATE public.meetings
       SET stage = 'MINUTES_DRAFT'
     WHERE id = p_meeting_id AND stage IN ('HELD', 'PLANNED', 'AGENDA_CIRCULATED');

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.minutes_circulate(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_meeting_id uuid;
    v_committee_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT mv.meeting_id, m.committee_id
      INTO v_meeting_id, v_committee_id
      FROM public.minutes_versions mv
      JOIN public.meetings m ON m.id = mv.meeting_id
     WHERE mv.id = p_version_id;

    IF v_committee_id IS NULL OR NOT public.committee_can_run(v_committee_id) THEN
        RAISE EXCEPTION 'Not authorized to circulate minutes';
    END IF;

    UPDATE public.minutes_versions SET status = 'CIRCULATED' WHERE id = p_version_id AND status = 'DRAFT';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only DRAFT minutes can be circulated';
    END IF;

    UPDATE public.meetings SET stage = 'MINUTES_CIRCULATED' WHERE id = v_meeting_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.minutes_comment_add(
    p_version_id uuid,
    p_comment text,
    p_agenda_item_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_committee_id uuid;
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT m.committee_id INTO v_committee_id
      FROM public.minutes_versions mv
      JOIN public.meetings m ON m.id = mv.meeting_id
     WHERE mv.id = p_version_id;

    IF v_committee_id IS NULL OR NOT public.committee_can_read(v_committee_id) THEN
        RAISE EXCEPTION 'Not authorized to comment on these minutes';
    END IF;

    INSERT INTO public.minutes_comments (minutes_version_id, agenda_item_id, author_user_id, comment)
    VALUES (p_version_id, p_agenda_item_id, v_caller, btrim(p_comment))
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.minutes_approve(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_committee_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT m.committee_id INTO v_committee_id
      FROM public.minutes_versions mv
      JOIN public.meetings m ON m.id = mv.meeting_id
     WHERE mv.id = p_version_id;

    IF v_committee_id IS NULL OR NOT public.committee_can_run(v_committee_id) THEN
        RAISE EXCEPTION 'Not authorized to approve minutes';
    END IF;

    UPDATE public.minutes_versions
       SET status = 'APPROVED', approved_by = v_caller, approved_at = now()
     WHERE id = p_version_id AND status IN ('DRAFT', 'CIRCULATED');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Minutes version is not in DRAFT or CIRCULATED state';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.signature_attest(
    p_subject_type text,
    p_subject_id text,
    p_payload_hash text,
    p_level text DEFAULT 'ATTEST'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_signer_name text;
    v_prev_hash text;
    v_chain_hash text;
    v_code text;
    v_sig_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF length(btrim(COALESCE(p_payload_hash, ''))) < 8 THEN
        RAISE EXCEPTION 'Valid payload hash is required';
    END IF;

    SELECT COALESCE(s."Name", u.email, 'Member')
      INTO v_signer_name
      FROM auth.users u
      LEFT JOIN public.staff s ON s.user_id = u.id
     WHERE u.id = v_caller
     LIMIT 1;

    SELECT COALESCE(chain_hash, 'GENESIS')
      INTO v_prev_hash
      FROM public.signatures
     ORDER BY signed_at DESC, id DESC
     LIMIT 1;
    v_prev_hash := COALESCE(v_prev_hash, 'GENESIS');

    v_sig_id := gen_random_uuid();
    v_chain_hash := encode(
        sha256((v_prev_hash || '|' || p_subject_type || '|' || p_subject_id || '|' || p_payload_hash || '|' || v_caller::text)::bytea),
        'hex'
    );
    v_code := 'SURYA-' || upper(substr(replace(v_sig_id::text, '-', ''), 1, 10));

    INSERT INTO public.signatures (
        id, subject_type, subject_id, signer_user_id, signer_name, level, payload_hash, prev_hash, chain_hash, verification_code
    ) VALUES (
        v_sig_id, p_subject_type, p_subject_id, v_caller, v_signer_name, COALESCE(p_level, 'ATTEST'),
        p_payload_hash, v_prev_hash, v_chain_hash, v_code
    );

    IF p_subject_type = 'minutes_version' THEN
        UPDATE public.minutes_versions
           SET status = 'SIGNED',
               pdf_hash = p_payload_hash,
               verification_code = v_code,
               signed_at = now()
         WHERE id = p_subject_id::uuid;

        UPDATE public.meetings m
           SET stage = 'MINUTES_SIGNED'
          FROM public.minutes_versions mv
         WHERE mv.id = p_subject_id::uuid
           AND m.id = mv.meeting_id;
    END IF;

    RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.signature_verify(p_code text)
RETURNS TABLE(
    verification_code text,
    subject_type text,
    subject_id text,
    signer_name text,
    level text,
    payload_hash text,
    chain_hash text,
    signed_at timestamptz,
    valid boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT
        s.verification_code,
        s.subject_type,
        s.subject_id,
        s.signer_name,
        s.level,
        s.payload_hash,
        s.chain_hash,
        s.signed_at,
        (s.chain_hash = encode(
            sha256((s.prev_hash || '|' || s.subject_type || '|' || s.subject_id || '|' || s.payload_hash || '|' || s.signer_user_id::text)::bytea),
            'hex'
        )) AS valid
      FROM public.signatures s
     WHERE s.verification_code = upper(btrim(p_code));
$$;

-- ── 4.2 (DH2), 4.4 (DH3), 4.5 (DH4) Director Delegation Dial & Flags ──

CREATE TABLE IF NOT EXISTS public.delegation_rules (
    decision_kind text PRIMARY KEY,
    label text NOT NULL,
    mode text NOT NULL CHECK (mode IN ('SELF', 'HEAD_TELL', 'HEAD_FLAGS')),
    max_amount_inr numeric,
    non_delegable_floor boolean NOT NULL DEFAULT false,
    order_no text,
    effective_from date NOT NULL DEFAULT public.ist_today(),
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.delegation_rules (decision_kind, label, mode, max_amount_inr, non_delegable_floor, order_no) VALUES
    ('PROPOSAL_APPROVAL', 'Proposal final approval / forward', 'SELF', NULL, true, 'CSIR-DOP-FLOOR'),
    ('CLOSURE_APPROVAL', 'Project completion approval', 'SELF', NULL, true, 'CSIR-DOP-FLOOR'),
    ('PROGRESS_REPORT', 'Quarterly / half-yearly progress reports', 'HEAD_TELL', NULL, false, 'DIR-DEL-2026-01'),
    ('HIRING_EXTENSION', 'Project staff hiring & extensions', 'HEAD_TELL', 500000, false, 'DIR-DEL-2026-01'),
    ('PROJECT_CHANGE', 'Project budget / time change requests', 'HEAD_FLAGS', 1000000, false, 'DIR-DEL-2026-01'),
    ('LEAVE_TOUR', 'Staff leave & domestic tour approvals', 'HEAD_TELL', NULL, false, 'DIR-DEL-2026-01')
ON CONFLICT (decision_kind) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.director_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    flag_kind text NOT NULL CHECK (flag_kind IN ('HOLD', 'AUDIT_SAMPLE', 'CALLBACK')),
    note text NOT NULL DEFAULT '',
    flagged_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.delegation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.director_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delegation_rules_read_all ON public.delegation_rules;
CREATE POLICY delegation_rules_read_all ON public.delegation_rules
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS director_flags_read_auth ON public.director_flags;
CREATE POLICY director_flags_read_auth ON public.director_flags
    FOR SELECT TO authenticated
    USING (
        public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'HOD', 'DivisionHead'])
        OR flagged_by = (SELECT auth.uid())
    );

CREATE OR REPLACE FUNCTION public.delegation_rule_set(
    p_kind text,
    p_mode text,
    p_max_amount_inr numeric DEFAULT NULL,
    p_order_no text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_floor boolean;
    v_label text;
BEGIN
    IF v_caller IS NULL OR NOT (public.caller_has_role('Director') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only Director or MasterAdmin may update delegation dial';
    END IF;

    SELECT non_delegable_floor, label INTO v_floor, v_label
      FROM public.delegation_rules WHERE decision_kind = p_kind;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown delegation decision kind: %', p_kind;
    END IF;

    IF v_floor AND p_mode <> 'SELF' THEN
        RAISE EXCEPTION '% is on the non-delegable floor and must stay SELF', p_kind;
    END IF;

    UPDATE public.delegation_rules
       SET mode = p_mode,
           max_amount_inr = p_max_amount_inr,
           order_no = COALESCE(NULLIF(btrim(p_order_no), ''), order_no),
           effective_from = public.ist_today(),
           updated_by = v_caller,
           updated_at = now()
     WHERE decision_kind = p_kind;

    IF p_order_no IS NOT NULL AND length(btrim(p_order_no)) > 0 THEN
        INSERT INTO public.notices (notice_no, kind, title, body, issued_by, audience)
        VALUES (
            btrim(p_order_no),
            'OFFICE_ORDER',
            'Delegation Order: ' || v_label,
            'Mode set to ' || p_mode || COALESCE(' (limit INR ' || p_max_amount_inr::text || ')', '') || '.',
            v_caller,
            '{"scope":"ALL"}'::jsonb
        )
        ON CONFLICT (notice_no) DO NOTHING;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decision_authority(
    p_kind text,
    p_amount_inr numeric DEFAULT NULL
)
RETURNS TABLE(
    mode text,
    authority_label text,
    requires_director boolean,
    order_no text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT
        dr.mode,
        CASE
            WHEN dr.mode = 'SELF' OR (dr.max_amount_inr IS NOT NULL AND COALESCE(p_amount_inr, 0) > dr.max_amount_inr)
                THEN 'Director (Order ' || COALESCE(dr.order_no, 'CSIR-DOP') || ')'
            WHEN dr.mode = 'HEAD_FLAGS'
                THEN 'Head (flagged to Director · Order ' || COALESCE(dr.order_no, 'DIR-DEL') || ')'
            ELSE 'Head of Division (Order ' || COALESCE(dr.order_no, 'DIR-DEL') || ')'
        END AS authority_label,
        (dr.mode = 'SELF' OR (dr.max_amount_inr IS NOT NULL AND COALESCE(p_amount_inr, 0) > dr.max_amount_inr)) AS requires_director,
        COALESCE(dr.order_no, 'CSIR-DOP') AS order_no
      FROM public.delegation_rules dr
     WHERE dr.decision_kind = p_kind;
$$;

ALTER TABLE public.decision_audit_log
    ADD COLUMN IF NOT EXISTS decision_kind text,
    ADD COLUMN IF NOT EXISTS decision text,
    ADD COLUMN IF NOT EXISTS authority_label text,
    ADD COLUMN IF NOT EXISTS order_no text,
    ADD COLUMN IF NOT EXISTS note text;

CREATE OR REPLACE FUNCTION public.decision_record(
    p_subject_type text,
    p_subject_id text,
    p_kind text,
    p_decision text,
    p_note text DEFAULT '',
    p_amount_inr numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_auth record;
    v_is_director boolean;
    v_is_hod boolean;
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_is_director := public.caller_has_role('Director') OR public.caller_has_role('MasterAdmin');
    v_is_hod := public.has_any_role(ARRAY['HOD', 'HoD', 'DivisionHead']);

    SELECT * INTO v_auth FROM public.decision_authority(p_kind, p_amount_inr) LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown decision kind: %', p_kind;
    END IF;

    IF v_auth.requires_director AND NOT v_is_director THEN
        RAISE EXCEPTION 'Delegation dial requires Director approval for % (%)', p_kind, v_auth.order_no;
    END IF;

    IF NOT v_is_director AND NOT v_is_hod THEN
        RAISE EXCEPTION 'Only Director or Division Head may record delegated decisions';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.director_flags df
         WHERE df.subject_type = p_subject_type
           AND df.subject_id = p_subject_id
           AND df.flag_kind IN ('HOLD', 'CALLBACK')
           AND df.resolved_at IS NULL
    ) AND NOT v_is_director THEN
        RAISE EXCEPTION 'Item is held/called back by Director';
    END IF;

    INSERT INTO public.decision_audit_log (
        decided_by, subject_type, subject_id, decision_kind, decision, authority_label, order_no, note, waiting_since, decided_at
    ) VALUES (
        v_caller, p_subject_type, p_subject_id, p_kind, upper(btrim(p_decision)), v_auth.authority_label, v_auth.order_no, COALESCE(p_note, ''), now(), now()
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.director_flag_set(
    p_subject_type text,
    p_subject_id text,
    p_flag_kind text,
    p_note text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_id uuid;
BEGIN
    IF v_caller IS NULL OR NOT (public.caller_has_role('Director') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only Director or MasterAdmin may set Director flags';
    END IF;

    INSERT INTO public.director_flags (subject_type, subject_id, flag_kind, note, flagged_by)
    VALUES (p_subject_type, p_subject_id, p_flag_kind, COALESCE(p_note, ''), v_caller)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.director_flag_resolve(p_flag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
BEGIN
    IF v_caller IS NULL OR NOT (public.caller_has_role('Director') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only Director or MasterAdmin may resolve Director flags';
    END IF;

    UPDATE public.director_flags SET resolved_at = now() WHERE id = p_flag_id AND resolved_at IS NULL;
END;
$$;

-- ── 4.6 (CD10) General Institute Meetings ──

CREATE TABLE IF NOT EXISTS public.general_meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    meeting_date date NOT NULL,
    starts_at timestamptz,
    venue text NOT NULL DEFAULT '',
    audience jsonb NOT NULL DEFAULT '{"scope":"ALL"}'::jsonb,
    agenda_summary text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'HELD', 'CANCELLED')),
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.general_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS general_meetings_read_all ON public.general_meetings;
CREATE POLICY general_meetings_read_all ON public.general_meetings
    FOR SELECT TO authenticated
    USING (public.notice_matches_caller(audience) OR created_by = (SELECT auth.uid()) OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin']));

CREATE OR REPLACE FUNCTION public.general_meeting_schedule(
    p_title text,
    p_meeting_date date,
    p_venue text DEFAULT '',
    p_agenda_summary text DEFAULT '',
    p_audience jsonb DEFAULT '{"scope":"ALL"}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_id uuid;
BEGIN
    IF v_caller IS NULL OR NOT public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'Admin', 'HOD', 'DivisionHead']) THEN
        RAISE EXCEPTION 'Not authorized to schedule general institute meetings';
    END IF;

    INSERT INTO public.general_meetings (title, meeting_date, venue, agenda_summary, audience, created_by)
    VALUES (btrim(p_title), p_meeting_date, COALESCE(p_venue, ''), COALESCE(p_agenda_summary, ''), COALESCE(p_audience, '{"scope":"ALL"}'::jsonb), v_caller)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION
    public.meeting_proceeding_upsert(uuid, uuid, text, text, text, text),
    public.minutes_draft_create(uuid, text),
    public.minutes_circulate(uuid),
    public.minutes_comment_add(uuid, text, uuid),
    public.minutes_approve(uuid),
    public.signature_attest(text, text, text, text),
    public.signature_verify(text),
    public.delegation_rule_set(text, text, numeric, text),
    public.decision_authority(text, numeric),
    public.decision_record(text, text, text, text, text, numeric),
    public.director_flag_set(text, text, text, text),
    public.director_flag_resolve(uuid),
    public.general_meeting_schedule(text, date, text, text, jsonb)
TO authenticated;

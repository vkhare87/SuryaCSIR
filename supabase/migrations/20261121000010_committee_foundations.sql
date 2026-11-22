-- ============================================================
-- Stage 10 / CM0 — Committee Module Foundations
-- Contains : committees/meetings/agenda_items/action_items/meeting_documents extensions,
--            committee_terms, external_members, committee_memberships, committee_events,
--            stage<->status trigger, Term 1 + membership backfill,
--            committee_seat / committee_can_read / committee_can_run helpers,
--            narrowed RLS read policies on committee tables.
-- Depends  : Stages 01–09 (20261121000001–20261121000009)
-- ============================================================

-- ── 1. Extend existing committee tables ──────────────────────────────────────

ALTER TABLE public.committees
    ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'institute',
    ADD COLUMN IF NOT EXISTS parent_committee_id uuid REFERENCES public.committees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rule_key text,
    ADD COLUMN IF NOT EXISTS sign_policy text NOT NULL DEFAULT 'CHAIR_SECRETARY',
    ADD COLUMN IF NOT EXISTS dissolved_on date,
    ADD COLUMN IF NOT EXISTS dissolution_ref text;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'committees_confidentiality_check') THEN
        ALTER TABLE public.committees
            ADD CONSTRAINT committees_confidentiality_check
            CHECK (confidentiality IN ('institute', 'members', 'confidential'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'committees_sign_policy_check') THEN
        ALTER TABLE public.committees
            ADD CONSTRAINT committees_sign_policy_check
            CHECK (sign_policy IN ('CHAIR_SECRETARY', 'ALL_PRESENT'));
    END IF;
END $$;

ALTER TABLE public.meetings
    ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'PLANNED',
    ADD COLUMN IF NOT EXISTS meeting_no integer,
    ADD COLUMN IF NOT EXISTS starts_at timestamptz,
    ADD COLUMN IF NOT EXISTS ends_at timestamptz,
    ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'IN_PERSON',
    ADD COLUMN IF NOT EXISTS term_id uuid,
    ADD COLUMN IF NOT EXISTS adjourned_from_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notice_days integer;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_stage_check') THEN
        ALTER TABLE public.meetings
            ADD CONSTRAINT meetings_stage_check
            CHECK (stage IN (
                'PLANNED', 'NOTICE_ISSUED', 'AGENDA_CIRCULATED',
                'HELD', 'MINUTES_DRAFT', 'MINUTES_CIRCULATED', 'MINUTES_SIGNED', 'CONFIRMED',
                'POSTPONED', 'CANCELLED', 'ADJOURNED'
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_mode_check') THEN
        ALTER TABLE public.meetings
            ADD CONSTRAINT meetings_mode_check
            CHECK (mode IN ('IN_PERSON', 'ONLINE', 'HYBRID'));
    END IF;
END $$;

ALTER TABLE public.agenda_items
    ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'OTHER',
    ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS presenter_staff_id text,
    ADD COLUMN IF NOT EXISTS minutes_allotted integer,
    ADD COLUMN IF NOT EXISTS proposal_state text NOT NULL DEFAULT 'ACCEPTED';

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_items_item_type_check') THEN
        ALTER TABLE public.agenda_items
            ADD CONSTRAINT agenda_items_item_type_check
            CHECK (item_type IN ('CONFIRM_MINUTES', 'ACTION_TAKEN', 'DECISION', 'INFORMATION', 'OTHER'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_items_proposal_state_check') THEN
        ALTER TABLE public.agenda_items
            ADD CONSTRAINT agenda_items_proposal_state_check
            CHECK (proposal_state IN ('PROPOSED', 'ACCEPTED', 'DECLINED'));
    END IF;
END $$;

ALTER TABLE public.agenda_items DROP CONSTRAINT IF EXISTS agenda_items_subject_type_check;
ALTER TABLE public.agenda_items
    ADD CONSTRAINT agenda_items_subject_type_check
    CHECK (subject_type IS NULL OR subject_type IN (
        'project_review', 'proposal', 'change_request', 'completion_report', 'action_item'
    ));

ALTER TABLE public.action_items
    ADD COLUMN IF NOT EXISTS agenda_item_id uuid REFERENCES public.agenda_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS proceeding_id uuid,
    ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN IF NOT EXISTS verified_by text,
    ADD COLUMN IF NOT EXISTS verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS extensions integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS assigned_staff_id text;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'action_items_priority_check') THEN
        ALTER TABLE public.action_items
            ADD CONSTRAINT action_items_priority_check
            CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT'));
    END IF;
END $$;

ALTER TABLE public.action_items DROP CONSTRAINT IF EXISTS action_items_status_check;
ALTER TABLE public.action_items
    ADD CONSTRAINT action_items_status_check
    CHECK (status IN ('Pending', 'InProgress', 'Completed', 'Blocked', 'Dropped', 'Verified'));

CREATE INDEX IF NOT EXISTS action_items_assigned_staff_idx
    ON public.action_items (assigned_staff_id) WHERE assigned_staff_id IS NOT NULL;

ALTER TABLE public.meeting_documents
    ADD COLUMN IF NOT EXISTS agenda_item_id uuid REFERENCES public.agenda_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;

-- ── 2. New committee foundation tables ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.committee_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
    term_no integer NOT NULL CHECK (term_no >= 1),
    from_on date NOT NULL,
    to_on date,
    order_ref text DEFAULT '' NOT NULL,
    order_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
    terms_of_reference text DEFAULT '' NOT NULL,
    quorum_min integer NOT NULL DEFAULT 1 CHECK (quorum_min >= 1),
    quorum_needs_chair boolean NOT NULL DEFAULT false,
    cadence_months integer CHECK (cadence_months IS NULL OR cadence_months > 0),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'SUPERSEDED')),
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT committee_terms_committee_term_key UNIQUE (committee_id, term_no),
    CONSTRAINT committee_terms_dates_check CHECK (to_on IS NULL OR to_on >= from_on)
);

CREATE INDEX IF NOT EXISTS committee_terms_committee_idx ON public.committee_terms (committee_id, status);

CREATE TABLE IF NOT EXISTS public.external_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    organisation text DEFAULT '' NOT NULL,
    designation text DEFAULT '' NOT NULL,
    email text,
    phone text,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS external_members_user_idx
    ON public.external_members (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.committee_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
    term_id uuid NOT NULL REFERENCES public.committee_terms(id) ON DELETE CASCADE,
    staff_id text,
    external_member_id uuid REFERENCES public.external_members(id) ON DELETE CASCADE,
    seat text NOT NULL CHECK (seat IN (
        'CHAIRPERSON', 'MEMBER_SECRETARY', 'CONVENER',
        'MEMBER', 'EXTERNAL_EXPERT', 'NOMINEE', 'INVITEE'
    )),
    from_on date NOT NULL DEFAULT CURRENT_DATE,
    to_on date,
    ended_reason text,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT committee_memberships_person_check CHECK (
        (staff_id IS NOT NULL AND external_member_id IS NULL)
        OR (staff_id IS NULL AND external_member_id IS NOT NULL)
    ),
    CONSTRAINT committee_memberships_dates_check CHECK (to_on IS NULL OR to_on >= from_on)
);

CREATE INDEX IF NOT EXISTS committee_memberships_committee_idx ON public.committee_memberships (committee_id, term_id);
CREATE INDEX IF NOT EXISTS committee_memberships_staff_idx
    ON public.committee_memberships (staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS committee_memberships_ext_idx
    ON public.committee_memberships (external_member_id) WHERE external_member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.committee_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    committee_id uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
    meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
    term_id uuid REFERENCES public.committee_terms(id) ON DELETE SET NULL,
    actor_id uuid DEFAULT auth.uid(),
    event_type text NOT NULL,
    summary text NOT NULL DEFAULT '',
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS committee_events_committee_idx
    ON public.committee_events (committee_id, created_at DESC);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_term_id_fkey') THEN
        ALTER TABLE public.meetings
            ADD CONSTRAINT meetings_term_id_fkey
            FOREIGN KEY (term_id) REFERENCES public.committee_terms(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS meetings_term_idx ON public.meetings (term_id) WHERE term_id IS NOT NULL;

-- ── 3. Triggers: stage <-> status sync, membership -> committee leads, action_items staff key ──

CREATE OR REPLACE FUNCTION public.meetings_sync_status_from_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.stage = 'PLANNED' AND NEW.status = 'Completed' THEN
            NEW.stage := 'HELD';
        ELSIF NEW.stage = 'PLANNED' AND NEW.status = 'Cancelled' THEN
            NEW.stage := 'CANCELLED';
        END IF;
    ELSE
        IF NEW.stage IS NOT DISTINCT FROM OLD.stage AND NEW.status IS DISTINCT FROM OLD.status THEN
            NEW.stage := CASE NEW.status
                WHEN 'Completed' THEN 'HELD'
                WHEN 'Cancelled' THEN 'CANCELLED'
                ELSE 'PLANNED'
            END;
        END IF;
    END IF;

    NEW.status := CASE
        WHEN NEW.stage IN ('HELD', 'MINUTES_DRAFT', 'MINUTES_CIRCULATED', 'MINUTES_SIGNED', 'CONFIRMED') THEN 'Completed'
        WHEN NEW.stage = 'CANCELLED' THEN 'Cancelled'
        ELSE 'Scheduled'
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meetings_sync_status_from_stage ON public.meetings;
CREATE TRIGGER trg_meetings_sync_status_from_stage
    BEFORE INSERT OR UPDATE ON public.meetings
    FOR EACH ROW EXECUTE FUNCTION public.meetings_sync_status_from_stage();

CREATE OR REPLACE FUNCTION public.committee_memberships_sync_leads()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.staff_id IS NOT NULL AND NEW.to_on IS NULL THEN
        IF NEW.seat = 'CHAIRPERSON' THEN
            UPDATE public.committees SET chairperson_id = NEW.staff_id WHERE id = NEW.committee_id;
        ELSIF NEW.seat = 'MEMBER_SECRETARY' THEN
            UPDATE public.committees SET secretary_id = NEW.staff_id WHERE id = NEW.committee_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_committee_memberships_sync_leads ON public.committee_memberships;
CREATE TRIGGER trg_committee_memberships_sync_leads
    AFTER INSERT OR UPDATE ON public.committee_memberships
    FOR EACH ROW EXECUTE FUNCTION public.committee_memberships_sync_leads();

CREATE OR REPLACE FUNCTION public.action_items_sync_staff_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       AND NEW.assigned_staff_id IS NOT DISTINCT FROM OLD.assigned_staff_id THEN
        NEW.assigned_staff_id := NULL;
    END IF;
    IF NEW.assigned_staff_id IS NULL AND length(btrim(coalesce(NEW.assigned_to, ''))) > 0 THEN
        SELECT u.staff_id INTO NEW.assigned_staff_id
          FROM public.unique_staff_names u
         WHERE u.name = btrim(NEW.assigned_to);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_action_items_sync_staff_id ON public.action_items;
CREATE TRIGGER trg_action_items_sync_staff_id
    BEFORE INSERT OR UPDATE ON public.action_items
    FOR EACH ROW EXECUTE FUNCTION public.action_items_sync_staff_id();

-- ── 4. Backfill Term 1, memberships, meeting stages/terms, action_items.assigned_staff_id ──

INSERT INTO public.committee_terms (committee_id, term_no, from_on, status)
SELECT c.id, 1, coalesce(c.formed_date, CURRENT_DATE),
       CASE WHEN c.status = 'Inactive' THEN 'EXPIRED' ELSE 'ACTIVE' END
  FROM public.committees c
 WHERE NOT EXISTS (
     SELECT 1 FROM public.committee_terms t WHERE t.committee_id = c.id
 );

INSERT INTO public.committee_memberships (committee_id, term_id, staff_id, seat, from_on)
SELECT c.id, t.id, c.chairperson_id, 'CHAIRPERSON', t.from_on
  FROM public.committees c
  JOIN public.committee_terms t ON t.committee_id = c.id AND t.term_no = 1
 WHERE length(btrim(coalesce(c.chairperson_id, ''))) > 0
   AND NOT EXISTS (
       SELECT 1 FROM public.committee_memberships m
        WHERE m.term_id = t.id AND m.staff_id = c.chairperson_id AND m.seat = 'CHAIRPERSON'
   );

INSERT INTO public.committee_memberships (committee_id, term_id, staff_id, seat, from_on)
SELECT c.id, t.id, c.secretary_id, 'MEMBER_SECRETARY', t.from_on
  FROM public.committees c
  JOIN public.committee_terms t ON t.committee_id = c.id AND t.term_no = 1
 WHERE length(btrim(coalesce(c.secretary_id, ''))) > 0
   AND NOT EXISTS (
       SELECT 1 FROM public.committee_memberships m
        WHERE m.term_id = t.id AND m.staff_id = c.secretary_id AND m.seat = 'MEMBER_SECRETARY'
   );

INSERT INTO public.committee_memberships (committee_id, term_id, staff_id, seat, from_on)
SELECT cm.committee_id, t.id, cm.staff_id,
       CASE cm.role
           WHEN 'Invitee' THEN 'INVITEE'
           WHEN 'ExternalExpert' THEN 'EXTERNAL_EXPERT'
           ELSE 'MEMBER'
       END,
       t.from_on
  FROM public.committee_members cm
  JOIN public.committee_terms t ON t.committee_id = cm.committee_id AND t.term_no = 1
 WHERE length(btrim(coalesce(cm.staff_id, ''))) > 0
   AND NOT EXISTS (
       SELECT 1 FROM public.committee_memberships m
        WHERE m.term_id = t.id AND m.staff_id = cm.staff_id
   );

UPDATE public.meetings m
   SET term_id = coalesce(m.term_id, (
           SELECT t.id FROM public.committee_terms t
            WHERE t.committee_id = m.committee_id
            ORDER BY t.term_no DESC LIMIT 1
       )),
       stage = CASE m.status
           WHEN 'Completed' THEN 'HELD'
           WHEN 'Cancelled' THEN 'CANCELLED'
           ELSE 'PLANNED'
       END
 WHERE m.term_id IS NULL
    OR (m.stage = 'PLANNED' AND m.status IN ('Completed', 'Cancelled'));

UPDATE public.action_items a
   SET assigned_staff_id = public.resolve_unique_staff_id(a.assigned_to)
 WHERE a.assigned_staff_id IS NULL
   AND length(btrim(coalesce(a.assigned_to, ''))) > 0
   AND public.resolve_unique_staff_id(a.assigned_to) IS NOT NULL;

-- ── 5. Access helpers ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.caller_is_committee_authority()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT coalesce(public.caller_is_admin(), false)
        OR coalesce(public.caller_has_role('Director'), false);
$$;

CREATE OR REPLACE FUNCTION public.committee_seat(p_committee_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    WITH me AS (
        SELECT auth.uid() AS uid,
               public.caller_staff_id() AS my_staff_id,
               public.ist_today() AS today
    ),
    acting_staff AS (
        SELECT s."ID" AS principal_staff_id
          FROM me
          JOIN public.acting_assignments aa
            ON aa.acting_user_id = me.uid
           AND me.today BETWEEN aa.from_on AND aa.to_on
          JOIN public.staff s
            ON s.user_id = aa.principal_user_id
    ),
    candidates AS (
        SELECT m.seat,
               CASE m.seat
                   WHEN 'CHAIRPERSON'      THEN 1
                   WHEN 'MEMBER_SECRETARY' THEN 2
                   WHEN 'CONVENER'         THEN 3
                   WHEN 'MEMBER'           THEN 4
                   WHEN 'NOMINEE'          THEN 5
                   WHEN 'EXTERNAL_EXPERT'  THEN 6
                   ELSE 7
               END AS ord
          FROM me
          JOIN public.committee_terms t
            ON t.committee_id = p_committee_id
           AND t.status = 'ACTIVE'
          JOIN public.committee_memberships m
            ON m.term_id = t.id
           AND (m.to_on IS NULL OR m.to_on >= me.today)
          LEFT JOIN public.external_members em ON em.id = m.external_member_id
         WHERE (me.my_staff_id IS NOT NULL AND m.staff_id = me.my_staff_id)
            OR (me.uid IS NOT NULL AND em.user_id = me.uid)
            OR m.staff_id IN (SELECT principal_staff_id FROM acting_staff)
    )
    SELECT seat FROM candidates ORDER BY ord LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.committee_can_read(p_committee_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT coalesce(public.caller_is_committee_authority(), false)
        OR EXISTS (
            SELECT 1
              FROM public.committees c
             WHERE c.id = p_committee_id
               AND (
                   (c.confidentiality = 'institute' AND coalesce(public.caller_is_verified(), false))
                   OR public.committee_seat(p_committee_id) IS NOT NULL
               )
        );
$$;

CREATE OR REPLACE FUNCTION public.committee_can_run(p_committee_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT coalesce(public.caller_is_committee_authority(), false)
        OR coalesce(public.committee_seat(p_committee_id) IN ('CHAIRPERSON', 'MEMBER_SECRETARY', 'CONVENER'), false);
$$;

-- ── 6. RLS & Grants for committee foundation tables + narrowed existing reads ──

ALTER TABLE public.committee_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.committee_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.committee_events TO authenticated;
GRANT ALL ON TABLE public.committee_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.committee_terms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.external_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.committee_memberships TO authenticated;

DROP POLICY IF EXISTS "committees_select" ON public.committees;
CREATE POLICY "committees_select" ON public.committees
    FOR SELECT TO authenticated
    USING (public.committee_can_read(id));

DROP POLICY IF EXISTS "committee_members_select" ON public.committee_members;
CREATE POLICY "committee_members_select" ON public.committee_members
    FOR SELECT TO authenticated
    USING (public.committee_can_read(committee_id));

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
CREATE POLICY "meetings_select" ON public.meetings
    FOR SELECT TO authenticated
    USING (public.committee_can_read(committee_id));

DROP POLICY IF EXISTS "agenda_items_select" ON public.agenda_items;
CREATE POLICY "agenda_items_select" ON public.agenda_items
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings m
         WHERE m.id = agenda_items.meeting_id
           AND public.committee_can_read(m.committee_id)
    ));

DROP POLICY IF EXISTS "meeting_documents_select" ON public.meeting_documents;
CREATE POLICY "meeting_documents_select" ON public.meeting_documents
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings m
         WHERE m.id = meeting_documents.meeting_id
           AND public.committee_can_read(m.committee_id)
    ));

DROP POLICY IF EXISTS "committee_terms_select" ON public.committee_terms;
CREATE POLICY "committee_terms_select" ON public.committee_terms
    FOR SELECT TO authenticated
    USING (public.committee_can_read(committee_id));

DROP POLICY IF EXISTS "committee_terms_write" ON public.committee_terms;
CREATE POLICY "committee_terms_write" ON public.committee_terms
    FOR ALL TO authenticated
    USING (public.caller_is_committee_authority())
    WITH CHECK (public.caller_is_committee_authority());

DROP POLICY IF EXISTS "committee_memberships_select" ON public.committee_memberships;
CREATE POLICY "committee_memberships_select" ON public.committee_memberships
    FOR SELECT TO authenticated
    USING (public.committee_can_read(committee_id));

DROP POLICY IF EXISTS "committee_memberships_write" ON public.committee_memberships;
CREATE POLICY "committee_memberships_write" ON public.committee_memberships
    FOR ALL TO authenticated
    USING (public.caller_is_committee_authority())
    WITH CHECK (public.caller_is_committee_authority());

DROP POLICY IF EXISTS "external_members_select" ON public.external_members;
CREATE POLICY "external_members_select" ON public.external_members
    FOR SELECT TO authenticated
    USING (
        public.caller_is_committee_authority()
        OR user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.committee_memberships m
             WHERE m.external_member_id = external_members.id
               AND public.committee_can_read(m.committee_id)
        )
    );

DROP POLICY IF EXISTS "external_members_write" ON public.external_members;
CREATE POLICY "external_members_write" ON public.external_members
    FOR ALL TO authenticated
    USING (public.caller_is_committee_authority())
    WITH CHECK (public.caller_is_committee_authority());

DROP POLICY IF EXISTS "committee_events_select" ON public.committee_events;
CREATE POLICY "committee_events_select" ON public.committee_events
    FOR SELECT TO authenticated
    USING (public.committee_can_read(committee_id));

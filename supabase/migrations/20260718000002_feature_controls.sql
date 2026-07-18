-- ═══════════════════════════════════════════════════════════════════════
-- 20260718000002_feature_controls
-- Runtime feature kill-switches, managed by MasterAdmin.
--
-- feature_key = an ACCESS_MAP path ('/explore', '/pms', …). Absent row ⇒
-- feature fully enabled (default-open). enabled=false switches the feature
-- off for everyone; disabled_roles switches it off for specific roles.
-- MasterAdmin is exempt client-side and is the only writer here, so the
-- discretion cannot lock its own holder out. This table governs UI
-- availability only — RLS on the data tables remains the hard gate.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feature_controls (
    feature_key    text PRIMARY KEY,
    enabled        boolean NOT NULL DEFAULT true,
    disabled_roles text[]  NOT NULL DEFAULT '{}',
    note           text,
    updated_by     uuid REFERENCES auth.users(id),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_feature_controls_updated_at
    BEFORE UPDATE ON public.feature_controls
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

ALTER TABLE public.feature_controls ENABLE ROW LEVEL SECURITY;

-- Flags drive every user's nav/routes, so they are readable by all
-- authenticated users. They contain no sensitive data.
CREATE POLICY "feature_controls_select" ON public.feature_controls
    FOR SELECT TO authenticated USING (true);

-- Writes are MasterAdmin discretion only (caller_has_role from
-- 20260718000001_rls_scope_reads).
CREATE POLICY "feature_controls_write" ON public.feature_controls
    FOR ALL TO authenticated
    USING (public.caller_has_role('MasterAdmin'))
    WITH CHECK (public.caller_has_role('MasterAdmin'));

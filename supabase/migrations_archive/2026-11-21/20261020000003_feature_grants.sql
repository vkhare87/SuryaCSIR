-- ═══════════════════════════════════════════════════════════════════════
-- 20261020000003_feature_grants
-- Per-user extra features, granted by MasterAdmin.
--
-- ACCESS_MAP (src/constants/access.ts) gives each role only the pages its
-- profile needs. A row here opens one more page (feature_key = an ACCESS_MAP
-- path) for one user, whatever role they are acting as. feature_controls
-- still applies on top: a globally switched-off feature stays off.
--
-- Like feature_controls, this governs UI availability only. RLS on the data
-- tables is unchanged, so a granted page shows the rows the user's role may
-- already read — a grant never widens data access.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feature_grants (
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feature_key text        NOT NULL,
    note        text,
    granted_by  uuid        REFERENCES auth.users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, feature_key)
);

ALTER TABLE public.feature_grants ENABLE ROW LEVEL SECURITY;

-- A user reads their own grants (to build nav + route guards); MasterAdmin
-- reads all of them to manage them.
DROP POLICY IF EXISTS "feature_grants_select" ON public.feature_grants;
CREATE POLICY "feature_grants_select" ON public.feature_grants
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.caller_has_role('MasterAdmin'));

-- Grant and revoke are MasterAdmin discretion only. granted_by must be the
-- caller, so the audit field cannot be forged.
DROP POLICY IF EXISTS "feature_grants_insert" ON public.feature_grants;
CREATE POLICY "feature_grants_insert" ON public.feature_grants
    FOR INSERT TO authenticated
    WITH CHECK (public.caller_has_role('MasterAdmin') AND granted_by = auth.uid());

DROP POLICY IF EXISTS "feature_grants_delete" ON public.feature_grants;
CREATE POLICY "feature_grants_delete" ON public.feature_grants
    FOR DELETE TO authenticated
    USING (public.caller_has_role('MasterAdmin'));

-- Default privileges (20260726000004) hand authenticated ALL on new tables.
-- Rows are never edited in place — revoke = delete, re-grant = insert.
REVOKE UPDATE, TRUNCATE ON public.feature_grants FROM authenticated;
REVOKE ALL ON public.feature_grants FROM anon;
GRANT SELECT, INSERT, DELETE ON public.feature_grants TO authenticated;

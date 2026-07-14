-- ──────────────────────────────────────────────────────────────
-- user_profiles.preferences — per-user calibration knobs (D5)
-- Personal dashboard thresholds (Director burn/ending/AMC windows etc.)
-- previously lived in localStorage and died with the browser profile.
-- JSONB keyed by feature, e.g. {"directorThresholds": {"lowBurnPct": 40}}.
-- RLS: covered by the existing row-level select_own/update_own policies
-- on user_profiles — no new policy needed.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_profiles.preferences IS
    'Per-user UI calibration (dashboard thresholds etc.), keyed by feature. Not a role or security store.';

-- Shallow-merge a patch into the caller's own preferences. SECURITY INVOKER:
-- RLS update_own policy is the gate; callers can only touch their own row.
CREATE OR REPLACE FUNCTION public.merge_user_preferences(p_patch jsonb)
RETURNS void LANGUAGE sql AS $$
    UPDATE public.user_profiles
    SET preferences = preferences || p_patch
    WHERE user_id = auth.uid();
$$;

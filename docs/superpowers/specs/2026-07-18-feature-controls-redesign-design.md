# Feature Controls Redesign — Design

## Problem

`src/pages/admin/FeatureControls.tsx` lists all ~30 controllable features in 5 groups, each row showing a master on/off pill toggle plus a row of per-role "blocked" pills. This is feature-first: to answer "what can Scientist do?" you scan all 30 rows checking one pill each. Worse, when MasterAdmin toggles a role pill, there's no confirmation the click landed — color is the only signal, and it's easy to lose track of whether a toggle changed anything.

The actual task MasterAdmin does most — "turn this off for that role" — is buried behind a feature-first scan instead of being the primary flow.

## Design

Replace the single feature-first list with three independent panels, each with one job. No schema change — all three read/write the same `feature_controls` table (`feature_key`, `enabled`, `disabled_roles`, `note`) via the existing `useFeatureControls()` context and `supabase.from('feature_controls').upsert()` pattern.

### 1. Role Editor (primary — the fix for the core complaint)

- Role `<select>` at top. Options: all roles except `MasterAdmin` (MasterAdmin is exempt from every control per `featureEnabled()` — nothing to configure for it).
- Below: the feature list, grouped using the existing `GROUPS` constant (Overview / Unified Human Resource / Research Ops / Governance / Data Ops), filtered to only features where the selected role appears in `ACCESS_MAP[path]`. A role never sees a toggle for a page it can't reach regardless of feature-control state.
- Each row: feature label + a toggle **with explicit "ON"/"OFF" text next to it** (not color-only — color-only state was the root cause of the original confusion).
- Click → `save()` upserts `disabled_roles` (add/remove the selected role) → toggle updates from the refreshed `controls` → a brief inline "Saved" confirmation flashes next to the row and fades (~1.5s), so the click's effect is never ambiguous.
- If the feature's global kill switch (`enabled`) is off, the row renders disabled/greyed with a fixed "Off for everyone" label instead of a clickable toggle — toggling this role's access would be a no-op while the global kill is active, so the UI doesn't pretend otherwise.

### 2. Feature Lookup (secondary, read-only)

- Feature `<select>` (same grouped list, for scanability in the dropdown).
- On selection, renders a static summary: "Enabled for N of M eligible roles" (M = `ACCESS_MAP[path]` minus MasterAdmin, N = M minus `disabled_roles` count, only while `enabled` is true), a list of which eligible roles are currently blocked (if any), and the current global-kill state for that feature.
- No controls in this panel — it exists purely to answer "how exposed is this feature right now" without touching the Role Editor's per-role state.

### 3. Global Kill Switches (institute-wide)

- One row per controllable feature: label + ON/OFF toggle with text label, same immediate-save + "Saved" flash as the Role Editor.
- Writes `enabled` on the same `feature_controls` row.
- Optional note field per feature (carried over from the current page) — lives here since it's an institute-wide annotation, not role-specific.
- Reset button per row: clears `enabled` back to `true` and `note` back to `null`. (No separate "reset" control in the Role Editor — the per-role toggle already is the reset: switching a blocked role back on removes it from `disabled_roles` directly.)

### Shared behavior

- All three panels share the `UNCONTROLLABLE_PATHS` exclusion (dashboard `/` and `/admin/*` never appear — self-lockout guard, unchanged from today).
- All three read from the same `controls` array (`useFeatureControls()`); a save in any panel triggers `refresh()`, so all three panels stay in sync without extra plumbing.
- Saving/error handling: unchanged pattern — `setSaving(key)` during the upsert, toast on error via `useToast()`, no optimistic UI (matches the current page's approach).

## Out of scope

- No schema/migration change — this is a UI-only reshuffle of the same `feature_controls` table.
- No change to `featureEnabled()` runtime-check logic (`src/lib/access/featureControls.ts`) — MasterAdmin exemption and default-open behavior are unchanged.
- No new roles, no new feature-control dimensions (e.g. per-division controls) — out of scope for this pass.

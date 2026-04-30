# Architecture
_Last updated: 2026-04-30_

## Summary

SURYA is a client-only SPA. All state lives in four nested Context providers. Data comes from Supabase (when provisioned) or in-memory mock data. Pages consume data exclusively through `useData()`.

---

## Provider Tree (`src/main.tsx`)

```
StrictMode
  ThemeProvider      — CSS class + data-density on <html>
    UIProvider       — responsive breakpoints, device type
      AuthProvider   — Supabase Auth session, roles, login/logout
        DataProvider — all domain entity arrays
          App        — HashRouter, ProtectedRoute, Layout, pages
```

Inner providers can read outer. `DataProvider` is nested inside `AuthProvider` to support future per-user data scoping (RLS rows filtered by session JWT).

---

## Routing (`src/App.tsx`)

**Router**: `HashRouter` — all routes use `#/path`. Static-host friendly.

**Route guard** (`ProtectedRoute`):
1. `isLoading` → loading screen
2. Not provisioned + not at `/login` → redirect `/setup`
3. Not authenticated → redirect `/login`
4. `allowedRoles` provided + role mismatch → redirect `/`

**Role-gated routes**:

| Route | Min role |
|-------|----------|
| `/`, `/staff`, `/projects`, `/phd`, `/divisions`, `/intelligence`, `/calendar` | any authenticated |
| `/facilities`, `/recruitment` | Admin+ |
| `/data` | MasterAdmin |
| `/pms/*` | varies by PMS role |

**Navigation** defined as `NAV_ITEMS[]` in `src/components/layout/Layout.tsx`. Sidebar filters by `hasPermission(item.role)`.

---

## Context Details

### AuthContext (`src/contexts/AuthContext.tsx`)
- Manages `UserAccount | null`. Multi-role: `roles[]` + `activeRole`.
- On mount: calls `supabase.auth.getSession()` then queries `user_roles` + `user_profiles`.
- `login()`: `supabase.auth.signInWithPassword()`.
- `hasPermission(role)`: hierarchy `MasterAdmin > SystemAdmin/HRAdmin > others`.
- Session from Supabase JWT, **not** `localStorage` role spoofing.

### DataContext (`src/contexts/DataContext.tsx`)
- All domain entities: `divisions`, `staff`, `projects`, `projectStaff`, `phDStudents`, `scientificOutputs`, `ipIntelligence`, `equipment`, `contractStaff`.
- **Dual-mode**: `isProvisioned()` → Supabase `Promise.all()` for parallel fetches; else `mockData.ts`.
- `scientificOutputs` and `ipIntelligence` still mock-only (tech debt — tables exist in DB but not wired).
- Rows mapped via `src/utils/dataMapper.ts` before storing in state.
- Exposes `refreshData()`, `isBackendProvisioned`.

### ThemeContext (`src/contexts/ThemeContext.tsx`)
- `ThemeMode` (`light` | `dark` | `system`) + `UIDensity` (`compact` | `medium` | `relaxed`).
- Persists to `localStorage` (`surya_theme`, `surya_density`).
- Applies class on `document.documentElement`.

### UIContext (`src/contexts/UIContext.tsx`)
- `DeviceType` (`mobile` | `tablet` | `desktop`) from `window.innerWidth`.
- Breakpoints: `< 768px` mobile, `768–1023px` tablet, `>= 1024px` desktop.
- Manual `ViewMode` override available.

---

## Data Flows

### Mock Mode
```
App boot → no credentials → isProvisioned() = false
→ DataProvider loads mockData.ts arrays
→ Pages read via useData()
```

### Supabase Mode
```
App boot → VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY present (or localStorage fallback)
→ Supabase client created → isProvisioned() = true
→ DataProvider: 6 parallel .select('*') queries
→ Rows through dataMapper.ts → typed arrays in context
→ Pages read via useData()
```

### Data Import (DataManagement page, MasterAdmin only)
```
Upload .xlsx/.xls/.csv → parseFile() (FileReader + xlsx/papaparse)
→ formatData(): SCHEMA_MAPS (column renames) + ALLOWED_COLUMNS (whitelist)
→ pushToSupabase(): batch upsert in chunks of 50
→ DataProvider.refreshData()
```

### PMS State Machine
```
Scientist creates report (DRAFT)
→ pms_submit_report() RPC → SUBMITTED
→ Admin assigns evaluators → pms_assign_evaluators() RPC → UNDER_COLLEGIUM_REVIEW
→ All evaluators complete → trigger auto-advances → CHAIRMAN_REVIEW
→ Chairman submits range → pms_save_chairman_review() RPC → EMPOWERED_COMMITTEE_REVIEW
→ Committee decides → pms_finalize_report() RPC → FINALIZED
```

All PMS transitions are SECURITY DEFINER RPCs — never patched directly by client.

---

## Supabase Client (`src/utils/supabaseClient.ts`)

Module-level singleton, initialized at import time. Credential resolution order:
1. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars
2. `localStorage` keys `surya_supabase_url` / `surya_supabase_anon_key`

If neither: `supabase = null`, `isProvisioned() = false`. Changing credentials requires `window.location.reload()`.

---

## Key Design Decisions

**HashRouter** → no server config needed; works on any static host.

**Module-level Supabase singleton** → client initialized once at import time; reload required after credential change.

**Dual-mode data loading** → app runs without a backend for demo/dev.

**Mapper layer** (`dataMapper.ts`) → translation boundary between raw Supabase rows and TypeScript types; isolates schema changes.

**SECURITY DEFINER RPCs for PMS** → state-machine transitions enforced server-side, not trustable client-side.

**`user_roles` composite PK `(user_id, role)`** → multi-role support; one user can hold Scientist + DivisionHead simultaneously.

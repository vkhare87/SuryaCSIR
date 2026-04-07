# Architecture
_Last updated: 2026-04-07_

## Summary

SURYA is a single-page React/TypeScript application using a Context-based state management pattern. All application state lives in four nested Context providers wrapping the app root. Data is sourced either from Supabase (when credentials are provisioned) or from in-memory mock data, with all pages consuming data exclusively through the `useData()` hook.

---

## Overall Pattern

**Client-only SPA with optional backend.** The app runs entirely in the browser. There is no server-side rendering. Supabase serves as the remote database when provisioned; the app degrades gracefully to mock data without it. This dual-mode design allows the app to run in "Local Demo Mode" with no backend credentials.

**Hash-based routing.** React Router's `HashRouter` is used (not `BrowserRouter`). All URLs use `/#/path` format. This avoids server-side routing configuration requirements.

---

## Provider Tree

Defined in `SuryaFD/src/main.tsx`. Nesting order is outermost to innermost:

```
StrictMode
  ThemeProvider      — CSS class + data-attribute on <html>
    UIProvider       — responsive breakpoints, viewMode
      AuthProvider   — session, role, login/logout
        DataProvider — all domain entities
          App        — routes, layout, pages
```

Inner providers can read from outer providers. `DataProvider` does not currently read from `AuthProvider`, but the nesting supports future per-user data scoping.

---

## Context Details

### ThemeContext (`SuryaFD/src/contexts/ThemeContext.tsx`)

- Manages `ThemeMode` (`light` | `dark` | `system`) and `UIDensity` (`compact` | `medium` | `relaxed`).
- Persists both values to `localStorage` under keys `surya_theme` and `surya_density`.
- Applies theme as a class on `document.documentElement` (`light` or `dark`).
- Applies density as `data-density` attribute on `document.documentElement`.
- System theme: reads `window.matchMedia('(prefers-color-scheme: dark)')` at mount time only (no live listener for system changes).
- Hook: `useTheme()`

### UIContext (`SuryaFD/src/contexts/UIContext.tsx`)

- Tracks `DeviceType` (`mobile` | `tablet` | `desktop`) derived from `window.innerWidth`.
- Breakpoints: `< 768px` = mobile, `768–1023px` = tablet, `>= 1024px` = desktop.
- Supports a manual `ViewMode` override (`AUTO` | `MOBILE` | `DESKTOP`).
- Re-evaluates on `resize` events. Cleans up listener on unmount.
- Exposes `isMobile`, `isTablet`, `isDesktop` boolean shortcuts.
- Hook: `useUI()`

### AuthContext (`SuryaFD/src/contexts/AuthContext.tsx`)

- Manages `UserAccount | null` state.
- On mount, restores session from `localStorage` key `surya_session` (JSON-parsed `UserAccount`).
- `login(username, password)`: currently hardcoded to accept `MasterAdmin` / `Admin` only. Returns `Promise<boolean>`. Supabase auth is a future TODO.
- `logout()`: clears state and removes `surya_session` from `localStorage`.
- `hasPermission(requiredRole)`: role hierarchy is `MasterAdmin > Admin > User`. MasterAdmin passes all checks; Admin passes `User`-level checks; User only passes exact `User` checks.
- `isLoading` is `true` during the initial session restoration effect.
- Hook: `useAuth()`

### DataContext (`SuryaFD/src/contexts/DataContext.tsx`)

- Manages all domain entity arrays: `divisions`, `staff`, `projects`, `projectStaff`, `phDStudents`, `scientificOutputs`, `ipIntelligence`, `equipment`.
- **Dual-mode loading**: calls `isProvisioned()` at provider initialization. If `true` and `supabase` client exists, fetches from Supabase tables using `Promise.all()` for parallel requests. Otherwise loads from `mockData.ts`.
- **Partial mock fallback**: `scientificOutputs` and `ipIntelligence` always come from `mockData.ts` even when Supabase is provisioned, because those tables do not exist in Supabase yet.
- Supabase rows are mapped through typed mapper functions from `SuryaFD/src/utils/dataMapper.ts`.
- Exposes `refreshData()` to re-trigger the full load cycle.
- Exposes `isBackendProvisioned` boolean for UI to show provisioning status.
- Hook: `useData()`

---

## Data Flow

### Mock Mode (no Supabase credentials)

```
App boot
  → supabaseClient.ts: no credentials found → supabase = null
  → isProvisioned() = false
  → DataProvider.loadData(): loads from src/utils/mockData.ts
  → All arrays populated in DataContext
  → Pages call useData() → read arrays directly
```

### Supabase Mode (credentials present)

```
App boot
  → supabaseClient.ts: reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from env
    OR reads surya_supabase_url / surya_supabase_anon_key from localStorage
  → Supabase client created → isProvisioned() = true
  → DataProvider.loadData(): fires 6 parallel Supabase queries
  → Raw rows passed through dataMapper.ts functions
  → Typed arrays stored in DataContext state
  → Pages call useData() → read typed arrays
```

### Data Import (DataManagement page, MasterAdmin only)

```
User uploads .xlsx/.xls/.csv file
  → dataMigration.ts: parseFile() reads file via FileReader
  → XLSX or papaparse parses rows to JSON
  → formatData() applies SCHEMA_MAPS (column renames) then ALLOWED_COLUMNS (column whitelist)
  → pushToSupabase() upserts in batches of 50
  → DataProvider.refreshData() should be called to reload (not automatic)
```

### Supabase Provisioning (SetupWizard)

```
User enters Supabase URL + anon key in SetupWizard
  → provisionDatabase() stores to localStorage
  → window.location.reload() forces full re-initialization
  → supabaseClient.ts reads localStorage on next boot → creates client
```

---

## Routing and Navigation

Defined in `SuryaFD/src/App.tsx`.

**Router type:** `HashRouter` — all routes prefixed with `#`.

**Route guard:** `ProtectedRoute` component wraps all main application routes. It enforces:
1. If `isLoading` (session check in progress): renders a loading screen.
2. If not provisioned AND hash is not `#/login`: redirects to `/setup`.
3. If not authenticated: redirects to `/login`.
4. If `allowedRoles` provided and user's role not in list: redirects to `/`.

**Route layout:** Protected routes render inside `<Layout>` (sidebar + topbar shell via `<Outlet>`). Public routes (`/login`, `/setup`) render standalone.

**Navigation items** are defined in `SuryaFD/src/components/layout/Layout.tsx` as `NAV_ITEMS[]`, each with a minimum `role` requirement. The sidebar filters items using `hasPermission(item.role)` before rendering.

**Role-gated routes:**
| Route | Minimum Role |
|---|---|
| `/` `/staff` `/projects` `/phd` `/divisions` `/intelligence` `/calendar` | User |
| `/facilities` `/recruitment` | Admin |
| `/data` | MasterAdmin |

**Navigation extras:**
- Command palette (`Cmd/Ctrl+K`) opens a global search overlay (`CommandPalette.tsx`).
- Settings modal opens from the sidebar bottom button (`SettingsModal.tsx`).
- Page transitions use `framer-motion` `AnimatePresence` with `opacity` + `y` animation, keyed on `window.location.hash`.

---

## Authentication and Authorization

**Session persistence:** `localStorage` key `surya_session` stores the `UserAccount` object as JSON. Restored on every app boot in `AuthContext`'s `useEffect`.

**Current auth method:** Hardcoded credential check (`MasterAdmin` / `Admin`). Supabase auth integration is explicitly marked as a TODO in `AuthContext.tsx`.

**Role hierarchy (enforced in `hasPermission`):**
- `MasterAdmin`: passes all role checks
- `Admin`: passes `User` and `Admin` checks
- `User`: passes only `User` checks

**Route enforcement:** `ProtectedRoute` enforces both authentication and role. Layout's `NAV_ITEMS` enforce role-based sidebar visibility. Individual routes also use nested `ProtectedRoute` with `allowedRoles` for double enforcement.

---

## Supabase Client Initialization

`SuryaFD/src/utils/supabaseClient.ts` runs at module import time (not inside a React component). Credential resolution order:
1. Environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
2. `localStorage` keys `surya_supabase_url` and `surya_supabase_anon_key`

If neither is present, `supabase = null` and `isProvisioned()` returns `false`. The client is a module-level singleton — changing credentials requires a full page reload (`provisionDatabase()` and `wipeProvisioning()` both call `window.location.reload()`).

---

## Key Design Decisions

**Why HashRouter?** Avoids needing a server configured to serve `index.html` for all routes. Works with simple static hosting.

**Why module-level Supabase client?** The client is initialized once at import time. This means credentials must be set before the module loads — hence `window.location.reload()` after provisioning.

**Why dual-mode data loading?** Allows the app to be demonstrated and developed without a live Supabase instance. Mock data in `mockData.ts` mirrors the production schema.

**Why mapper functions?** `dataMapper.ts` provides a translation boundary between raw Supabase row shapes (which may use snake_case) and the frontend TypeScript types (which use the original Excel column name casing). This isolates schema changes to one file.

**Why string-based foreign keys?** `StaffMember.Division` references `DivisionInfo.divCode` as a plain string. There is no enforced referential integrity in TypeScript — lookups are done by filtering arrays in pages. This mirrors the source Excel structure.

---

## Supabase Tables vs. Mock-Only Data

| Entity | Supabase Table | Status |
|---|---|---|
| `DivisionInfo` | `divisions` | Live |
| `StaffMember` | `staff` | Live |
| `ProjectInfo` | `projects` | Live |
| `ProjectStaff` | `project_staff` | Live |
| `PhDStudent` | `phd_students` | Live |
| `Equipment` | `equipment` | Live |
| `ScientificOutput` | — | Mock only |
| `IPIntelligence` | — | Mock only |

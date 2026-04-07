---
phase: 02-authentication-role-based-access-control
plan: 01
subsystem: auth
tags: [supabase, supabase-auth, typescript, rbac, rls, postgres, react]

# Dependency graph
requires:
  - phase: 01-design-system-overhaul
    provides: Login.tsx warm palette (parchment background, terracotta button preserved)
provides:
  - Role union type with 7 CamelCase values (Director, DivisionHead, Scientist, Technician, HRAdmin, FinanceAdmin, SystemAdmin)
  - UserAccount interface with divisionCode field
  - Supabase-backed AuthContext with signInWithPassword, session restoration, onAuthStateChange
  - ROLE_ROUTES constant for role-specific URL routing
  - Login.tsx with email field and role-redirect useEffect
  - user_roles DDL with RLS policies in supabase_schema.sql
  - seed.sql for first SystemAdmin bootstrap with placeholder guard
affects:
  - 02-02 (role-scoped dashboards consume role/divisionCode from AuthContext)
  - 02-03 (user management UI reads/writes user_roles table)
  - DataContext (needs auth-awareness for division-scoped data filtering)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Supabase Auth session: getSession().then() for init (prevents flash), onAuthStateChange for live updates"
    - "resolveUserRole: fetch role from DB after auth; sign out if no row (security: no role = no access)"
    - "hasPermission(allowedRoles: Role[]): flat array includes check — no role hierarchy"
    - "ROLE_ROUTES in constants/ to avoid circular import (App->Layout->App)"
    - "Role-redirect in Login.tsx useEffect watching [isAuthenticated, role] — handles async role resolution"

key-files:
  created:
    - SuryaFD/src/constants/roleRoutes.ts
    - SuryaFD/seed.sql
  modified:
    - SuryaFD/src/types/index.ts
    - SuryaFD/src/contexts/AuthContext.tsx
    - SuryaFD/src/pages/Login.tsx
    - SuryaFD/supabase_schema.sql
    - SuryaFD/src/components/layout/Layout.tsx
    - SuryaFD/src/App.tsx

key-decisions:
  - "Role values are CamelCase strings (Director, DivisionHead, etc.) — matches DB CHECK constraint exactly"
  - "divisionCode replaces staffId in UserAccount — division scoping comes from user_roles, not staff table join"
  - "hasPermission now takes Role[] (flat check) — no 3-tier hierarchy, each route lists exactly which roles may access"
  - "Layout.tsx NAV_ITEMS use roles: Role[] — ALL_ROLES constant for universal items, explicit arrays for restricted ones"
  - "seed.sql RAISE EXCEPTION guard prevents accidental execution with placeholder values"

patterns-established:
  - "AuthContext pattern: isLoading stays true until getSession().then() resolves — prevents auth flash on reload"
  - "Auth guard: resolveUserRole signs out user immediately if no user_roles row found (no role = forced logout)"
  - "Legacy migration: surya_session localStorage key removed on AuthProvider mount and on logout"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05]

# Metrics
duration: 35min
completed: 2026-04-07
---

# Phase 2 Plan 1: Supabase Auth Integration Summary

**Supabase Auth replacing hardcoded MasterAdmin credentials: signInWithPassword, session restoration via getSession, onAuthStateChange subscription, resolveUserRole fetching from user_roles table with RLS, and 7-role RBAC throughout the type system**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-07T09:30:00Z
- **Completed:** 2026-04-07T10:05:00Z
- **Tasks:** 6 (+ 1 auto-fix deviation)
- **Files modified:** 8

## Accomplishments

- Replaced hardcoded `MasterAdmin`/`Admin` credentials with `supabase.auth.signInWithPassword` — auth is now server-validated
- Session persists across reload via `getSession().then()` with `isLoading = true` until resolved (prevents auth flash)
- Role fetched from `user_roles` DB table after auth; user is signed out immediately if no role row exists
- `user_roles` DDL with full RLS (SystemAdmin CRUD + self-read/self-update-last_seen) appended to schema
- All 6 data tables now have RLS enabled with broad read policies for authenticated users
- `seed.sql` bootstrap script with placeholder guard prevents accidental execution with template values

## Task Commits

1. **Task 1: Update Role type and UserAccount interface** - `d2a98c5` (feat)
2. **Task 2: Replace AuthContext with Supabase Auth** - `dc178d3` (feat)
3. **Task 3: Create roleRoutes.ts** - `c058198` (feat)
4. **Task 4: Update Login.tsx** - `df6060c` (feat)
5. **Task 5: Append user_roles DDL to supabase_schema.sql** - `3003bbe` (feat)
6. **Task 6: Create seed.sql** - `b9dfbc1` (feat)
7. **Auto-fix: Layout.tsx + App.tsx role migration** - `be67446` (fix)

## Files Created/Modified

- `SuryaFD/src/types/index.ts` — Role union replaced with 7-value CamelCase type; UserAccount gets divisionCode, loses staffId
- `SuryaFD/src/contexts/AuthContext.tsx` — Full rewrite: Supabase Auth, resolveUserRole, getSession init, onAuthStateChange, async logout
- `SuryaFD/src/constants/roleRoutes.ts` — New file: ROLE_ROUTES Record<Role, string> mapping all 7 roles to URL paths
- `SuryaFD/src/pages/Login.tsx` — email field, ROLE_ROUTES import, role-redirect useEffect, destructured login return
- `SuryaFD/supabase_schema.sql` — Appended user_roles DDL + 10 RLS policies + RLS on 6 data tables
- `SuryaFD/seed.sql` — New file: SystemAdmin bootstrap script with RAISE EXCEPTION placeholder guard
- `SuryaFD/src/components/layout/Layout.tsx` — NavItem.role→roles: Role[], ALL_ROLES constant, updated role values
- `SuryaFD/src/App.tsx` — ProtectedRoute allowedRoles updated from old 3-tier values to new 7-role values

## Decisions Made

- `hasPermission` changed from single-role hierarchy check to flat `allowedRoles.includes(user.role)` — simpler and explicit
- `ROLE_ROUTES` extracted to `src/constants/` (not `App.tsx`) to avoid circular dependency with Layout.tsx
- `divisionCode: string | null` in UserAccount (not staffId) — division comes from user_roles.division_code directly
- `ALL_ROLES` constant in Layout.tsx for nav items accessible to all authenticated users

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated Layout.tsx and App.tsx for 7-role type compatibility**
- **Found during:** Build verification after Task 6
- **Issue:** `Layout.tsx` NAV_ITEMS used old `'User'`, `'Admin'`, `'MasterAdmin'` role strings (TypeScript errors on all 11 nav entries). `hasPermission(item.role)` passed a single `Role` but new signature requires `Role[]`. `App.tsx` had `allowedRoles={['MasterAdmin', 'Admin']}` on two routes.
- **Fix:** Changed `NavItem.role: Role` to `roles: Role[]`; added `ALL_ROLES` constant; updated all 10 nav entries to correct 7-role values; updated `hasPermission` call; fixed App.tsx ProtectedRoute allowedRoles on /recruitment and /data routes
- **Files modified:** `SuryaFD/src/components/layout/Layout.tsx`, `SuryaFD/src/App.tsx`
- **Verification:** `npm run build` completed with zero TypeScript errors
- **Committed in:** `be67446`

---

**Total deviations:** 1 auto-fixed (Rule 1 - type error bug)
**Impact on plan:** Necessary for TypeScript compilation. Role mapping follows principle of least privilege (Facilities/Recruitment to HRAdmin/FinanceAdmin/SystemAdmin, Data Management to SystemAdmin only).

## Issues Encountered

- `AuthContext.tsx`, `types/index.ts`, `Login.tsx`, and `supabase_schema.sql` were untracked in the git worktree (never committed to main). Files were copied from the main repo working directory into the worktree before modification. No data loss — files were identical to what the main repo had on disk.

## Known Stubs

None — no hardcoded empty values or placeholder UI text introduced in this plan. The app runs in mock mode when Supabase is not provisioned (existing behavior, unchanged).

## User Setup Required

Before Supabase auth can be used in production:

1. Run `SuryaFD/supabase_schema.sql` in Supabase SQL Editor to create all tables including `user_roles`
2. Edit `SuryaFD/seed.sql` — replace `REPLACE_WITH_ADMIN_EMAIL`, `REPLACE_WITH_INITIAL_PASSWORD`, `REPLACE_WITH_DISPLAY_NAME`
3. Run the edited `seed.sql` in Supabase SQL Editor (runs as postgres, bypasses RLS)
4. Delete or archive `seed.sql` after successful execution (contains plaintext password)
5. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `SuryaFD/.env` (or use the Setup Wizard)

## Next Phase Readiness

- AuthContext is ready for Phase 2 Plan 2 (role-scoped dashboards) — `role` and `divisionCode` both exposed on context
- `ROLE_ROUTES` is ready to be consumed by Dashboard routing logic
- `user_roles` table schema is deployed-ready; RLS policies cover SystemAdmin CRUD for user management UI (Plan 3)
- DataContext still needs auth-awareness for division-scoped filtering (DivisionHead, Technician) — Plan 2 concern

---
*Phase: 02-authentication-role-based-access-control*
*Completed: 2026-04-07*

---
phase: 02-authentication-role-based-access-control
plan: 02
subsystem: auth
tags: [react, typescript, rbac, react-router, navigation]

# Dependency graph
requires:
  - phase: 02-authentication-role-based-access-control
    provides: ROLE_ROUTES constant, Role union type (7 values), AuthContext with role/divisionCode/hasPermission

provides:
  - ProtectedRoute typed with Role[] (not string[]) — type-safe role guards
  - 7 role-specific routes (/director, /division-head, /scientist, /technician, /hr-admin, /finance-admin, /system-admin) each rendering Dashboard
  - Wrong-role redirect navigates to ROLE_ROUTES[user.role] — no more '/' fallback
  - NAV_ITEMS with allowedRoles: Role[] per-item principle-of-least-privilege mapping
  - filteredNav using item.allowedRoles.includes(role) — correct filter pattern
  - Dashboard nav item dynamically resolves to role-specific URL via ROLE_ROUTES[role]
  - Async logout wrapped in void logout() — no unhandled Promise
affects:
  - 02-03 (user management UI uses Layout/nav infrastructure built here)
  - future plans relying on role-scoped routing

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ProtectedRoute.allowedRoles: Role[] — type-safe array check via allowedRoles.includes(user.role)"
    - "Wrong-role redirect: Navigate to={ROLE_ROUTES[user.role]} — redirects to user's own dashboard, not '/'"
    - "NAV_ITEMS principle of least privilege: each item lists exactly which roles may see it, ALL_ROLES for universal items"
    - "dashboardPath = role ? ROLE_ROUTES[role] : '/' — computed once in Layout body, mapped onto Dashboard nav item"
    - "void logout() pattern for async onClick handlers in React — prevents unhandled Promise warning"
    - "ROLE_ROUTES imported from constants/roleRoutes.ts in BOTH App.tsx and Layout.tsx — avoids circular dependency"

key-files:
  created: []
  modified:
    - SuryaFD/src/App.tsx
    - SuryaFD/src/components/layout/Layout.tsx

key-decisions:
  - "NAV_ITEMS uses allowedRoles: Role[] (not roles: Role[]) — field name matches plan spec and ProtectedRoute convention"
  - "filteredNav uses item.allowedRoles.includes(role) not hasPermission(item.roles) — direct role check, no context indirection"
  - "Human Capital restricted to Director/DivisionHead/HRAdmin/SystemAdmin — Scientist/Technician/FinanceAdmin cannot see staff list"
  - "Divisions restricted to Director/SystemAdmin only — most sensitive structural view"
  - "Facilities accessible to Technician (their primary operational view) but not Scientist/HRAdmin/FinanceAdmin"

patterns-established:
  - "Route guards: ProtectedRoute with Role[] allowedRoles — every role-specific route has exactly one allowedRole entry"
  - "Nav filtering: NAV_ITEMS.filter(item => role && item.allowedRoles.includes(role)) — no hasPermission indirection in nav"

requirements-completed: [RBAC-01, AUTH-04]

# Metrics
duration: 25min
completed: 2026-04-07
---

# Phase 2 Plan 2: Role Mapping & Route Guards Summary

**7 role-specific React Router routes with type-safe ProtectedRoute (Role[]), principle-of-least-privilege NAV_ITEMS for all 7 roles, and dynamic dashboard navigation URL via ROLE_ROUTES**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-07T09:52:00Z
- **Completed:** 2026-04-07T10:17:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `ProtectedRoute.allowedRoles` typed as `Role[]` — TypeScript now enforces only valid 7-role strings in route guards
- 7 role-specific routes added (`/director` through `/system-admin`) — each single-role guarded, renders `Dashboard`
- Wrong-role redirect fixed from `'/'` to `ROLE_ROUTES[user.role]` — users always land on their own dashboard
- `NavItem.allowedRoles: Role[]` replaces single `role: Role` — 10-item NAV_ITEMS maps all 7 roles per principle of least privilege
- Dashboard nav item dynamically resolves to the current user's role-specific URL (e.g. `/director` for Director)
- Async `logout` wrapped in `void logout()` — no unhandled Promise in React event handlers
- Both files import `ROLE_ROUTES` from `src/constants/roleRoutes.ts` — no circular dependency between App and Layout

## Task Commits

1. **Task 1: Update App.tsx** - `a06632c` (feat)
2. **Task 2: Update Layout.tsx** - `82ebb55` (feat)

## Files Created/Modified

- `SuryaFD/src/App.tsx` — Role type import, ROLE_ROUTES import, Role[] ProtectedRouteProps, wrong-role redirect to ROLE_ROUTES, 7 new role-specific routes
- `SuryaFD/src/components/layout/Layout.tsx` — NavItem.allowedRoles: Role[], ALL_ROLES constant, 10-item NAV_ITEMS with least-privilege role arrays, ROLE_ROUTES import, dashboardPath computation, filteredNav with allowedRoles.includes, void logout() fix

## NAV_ITEMS Final State

```typescript
const NAV_ITEMS: NavItem[] = [
  { path: '/',             label: 'Dashboard',       icon: LayoutDashboard, allowedRoles: ALL_ROLES },
  { path: '/staff',        label: 'Human Capital',   icon: Users,           allowedRoles: ['Director', 'DivisionHead', 'HRAdmin', 'SystemAdmin'] },
  { path: '/projects',     label: 'Projects',        icon: Briefcase,       allowedRoles: ['Director', 'DivisionHead', 'Scientist', 'FinanceAdmin', 'SystemAdmin'] },
  { path: '/phd',          label: 'PhD Tracker',     icon: BookOpen,        allowedRoles: ['Director', 'DivisionHead', 'Scientist', 'SystemAdmin'] },
  { path: '/divisions',    label: 'Divisions',       icon: Network,         allowedRoles: ['Director', 'SystemAdmin'] },
  { path: '/intelligence', label: 'Intelligence',    icon: Microscope,      allowedRoles: ['Director', 'DivisionHead', 'Scientist', 'SystemAdmin'] },
  { path: '/facilities',   label: 'Facilities',      icon: Building2,       allowedRoles: ['Director', 'DivisionHead', 'Technician', 'SystemAdmin'] },
  { path: '/recruitment',  label: 'Recruitment',     icon: FileText,        allowedRoles: ['HRAdmin', 'SystemAdmin'] },
  { path: '/calendar',     label: 'Calendar',        icon: CalendarIcon,    allowedRoles: ALL_ROLES },
  { path: '/data',         label: 'Data Management', icon: Database,        allowedRoles: ['SystemAdmin'] },
];
```

## Decisions Made

- `allowedRoles: Role[]` field name chosen over the Plan 1 auto-fix's `roles: Role[]` — matches the plan spec and is consistent with `ProtectedRoute.allowedRoles`
- `filteredNav` uses direct `item.allowedRoles.includes(role)` check rather than `hasPermission(item.roles)` — removes one indirection layer and makes the filter logic self-evident
- Technician gets Facilities but not Human Capital, Projects, PhD Tracker, or Divisions — restricted to operational equipment/facility view
- FinanceAdmin gets Projects (budget visibility) but not Human Capital (no staffing data), not Facilities, not Divisions
- Director gets all views except Data Management (SystemAdmin-only admin tool)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Layout.tsx NavItem field name alignment**
- **Found during:** Task 2 (Layout.tsx update)
- **Issue:** Plan 1 auto-fix had used `roles: Role[]` as the NavItem field name. Plan 2 spec requires `allowedRoles: Role[]` (matching ProtectedRoute's field name convention). The filter call also used `hasPermission(item.roles)` instead of the plan-specified `item.allowedRoles.includes(role)`.
- **Fix:** Renamed field to `allowedRoles` throughout NavItem interface and all 10 NAV_ITEMS entries. Updated filteredNav to use direct `.includes()` check with `role` from `useAuth()`.
- **Files modified:** `SuryaFD/src/components/layout/Layout.tsx`
- **Verification:** Zero TypeScript errors in Layout.tsx; all 10 allowedRoles entries verified in grep check
- **Committed in:** `82ebb55` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - naming inconsistency between Plan 1 auto-fix and Plan 2 spec)
**Impact on plan:** Required to match the plan spec. No scope creep — only affects Layout.tsx field naming.

## Issues Encountered

- **Build tooling unavailable in worktree**: `package.json`, `tsconfig.json`, `vite.config.ts` are untracked files that existed at conversation start per the gitStatus snapshot but were no longer on disk when Task 2 verification ran. The `npm run build` command from the plan could not execute. Used TypeScript compiler directly (`tsc 5.9.3` from main repo `node_modules/.bin/tsc.cmd`) with a temporary `tsconfig_temp.json` pointing at the worktree source. Both `App.tsx` and `Layout.tsx` reported zero TypeScript errors from our changes. The 121 total errors from the full compile are pre-existing issues in other files (Dashboard.tsx, StaffDetail.tsx, etc.) caused by missing untracked files (`supabaseClient.ts`, `ThemeContext.tsx`, `DataContext.tsx`) — none caused by Plan 2 changes.

## Known Stubs

None — no hardcoded empty values or placeholder UI introduced. Dashboard nav item dynamically resolves to a real role route.

## Next Phase Readiness

- Route guards are in place: authenticated users can only access their own role's dashboard URL
- NAV_ITEMS correctly restricts navigation per role — Technician sees Facilities but not Human Capital; FinanceAdmin sees Projects but not Divisions
- `Dashboard.tsx` still renders a single view for all roles — Plan 3 (role-scoped dashboard views) can now wire up per-role sub-components with the routing infrastructure in place
- `ROLE_ROUTES` is fully wired through both App.tsx and Layout.tsx — no further routing changes needed for basic RBAC

---
*Phase: 02-authentication-role-based-access-control*
*Completed: 2026-04-07*

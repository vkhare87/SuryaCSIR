# Merge Data Import + DB Wizard — Design Spec

**Date:** 2026-05-25
**Status:** Approved direction; pending spec review

## Goal

Collapse the two overlapping admin pages — `/data` (Data Management) and `/db-wizard` (Database Builder) — into one page, without losing any working functionality.

## Decisions (locked)

- **Structure:** Two tabs on one page — **Build Database** and **Staff Mapping**. The ad-hoc "Data Import" tab is dropped (the wizard's clickable stepper already imports all 7 types).
- **Canonical route:** `/data`. `/db-wizard` redirects to `/data` so existing links/bookmarks keep working.
- **Access roles:** `HRAdmin`, `SystemAdmin`, `MasterAdmin` (the union; matches today's `/data`). HRAdmin retains import + mapping access.
- **Nav:** single entry pointing at `/data`, relabeled "Data Management". The `/db-wizard` nav entry is removed.

## Non-goals

- No change to the shared `ImportFlow`, `ManualEntryGrid`, or `dataMigration` template/transform logic.
- No change to the import/mapping behavior itself — only composition and routing.
- No redesign of the stepper or mapping panels.

## Current state

- `src/pages/DataManagement.tsx` (`/data`, "Data Management"): tabs `import` | `mapping`. Import tab renders `<ImportFlow showTypePicker onComplete={refreshData} />`. Mapping tab renders `StaffMappingPanel` (assign division/supervisor/PI to untagged project-staff, PhD, contract-staff). Top: heading + untagged-records banner that switches to the mapping tab.
- `src/pages/DatabaseWizard.tsx` (`/db-wizard`, "Database Builder"): dependency-ordered `STEP_DEFS` stepper (divisions→staff→projects→projectStaff→phd→equipment→contractStaff), per-step `.xlsx`/`.csv` template download, `upload | manual` mode toggle rendering `<ImportFlow type=… onComplete={advance} />` or `<ManualEntryGrid type=… onComplete={advance} />`, prereq warnings, and a "not connected to Supabase" banner.
- Both are lazy-loaded in `src/App.tsx`; both have nav entries in `src/components/layout/Layout.tsx` (`NAV_SECTIONS` → Admin). `/data` roles = HRAdmin+SystemAdmin+MasterAdmin; `/db-wizard` roles = SystemAdmin+MasterAdmin.

> Note: `DataManagement.tsx`, `DatabaseWizard.tsx`, `dataMigration.ts` have uncommitted working-tree changes, and `ImportFlow.tsx`, `ManualEntryGrid.tsx`, `dataMigration.test.ts` are untracked. This work builds on the current working-tree state (the versions described above).

## Target architecture

```
/data  → DataManagement (page)
  ├── heading + untagged banner (banner deep-links to Mapping tab)
  ├── Tabs:  [ Build Database ]  [ Staff Mapping ]
  │     Build Database → <DatabaseBuilderPanel/>   (extracted from DatabaseWizard)
  │     Staff Mapping  → <StaffMappingPanel/>       (unchanged)
/db-wizard → <Navigate to="/data" replace />
```

### Work units

**Unit 1 — Extract `DatabaseBuilderPanel`.**
Create `src/components/DatabaseBuilderPanel.tsx` containing the body of `DatabaseWizard` (the `STEP_DEFS`, `downloadTemplate`, stepper + active-step panel JSX, `useData`, `useState` for `activeIdx`/`mode`, prereq logic, the not-connected banner). Export `function DatabaseBuilderPanel()`. It owns its own state and data access exactly as the page did. Remove only the outer page wrapper (`<div className="space-y-6 max-w-6xl mx-auto">` and the page `<h1>` heading, since the merged page provides the heading).

**Unit 2 — Recompose `DataManagement`.**
- Change the tab union from `'import' | 'mapping'` to `'build' | 'mapping'`; default `'build'`.
- Tab labels: "Build Database" and "Staff Mapping" (keep the untagged count badge on the Mapping tab).
- Build tab renders `<DatabaseBuilderPanel />`; Mapping tab renders the existing `<StaffMappingPanel .../>`.
- Remove the `<ImportFlow showTypePicker .../>` usage and its now-unused import.
- Keep the heading + untagged banner; the banner's `onClick` still sets the active tab to `'mapping'`.
- Widen the page container from `max-w-5xl` to `max-w-6xl` so the wizard's two-column stepper layout has room (the wizard used `max-w-6xl`).

**Unit 3 — Routing.**
In `src/App.tsx`: keep `/data` → `DataManagement`. Replace the `/db-wizard` route element with `<Navigate to="/data" replace />` (import `Navigate` from `react-router-dom` if not already imported). Remove the now-unused `DatabaseWizard` lazy import. Delete `src/pages/DatabaseWizard.tsx`.

**Unit 4 — Nav.**
In `src/components/layout/Layout.tsx` `NAV_SECTIONS` (Admin section): remove the `{ path: '/db-wizard', label: 'DB Wizard', … }` item. Relabel the `/data` item to "Data Management" (roles already HRAdmin+SystemAdmin+MasterAdmin — unchanged).

## Functionality preservation checklist

- [ ] Ordered stepper with per-step completion checks — preserved (Build tab).
- [ ] Per-step `.xlsx` / `.csv` template downloads — preserved.
- [ ] Upload-file flow (`ImportFlow type=…`) — preserved.
- [ ] Manual-entry grid (`ManualEntryGrid type=…`) — preserved.
- [ ] Prereq + not-connected warnings — preserved.
- [ ] Staff Mapping (project/PhD/contract division assignment) — preserved (Mapping tab).
- [ ] Untagged banner + count badge — preserved.
- [ ] `/db-wizard` bookmarks — still resolve (redirect to `/data`).
- [ ] HRAdmin access to import + mapping — preserved (`/data` roles unchanged).
- [ ] Removed intentionally: standalone ad-hoc "Data Import (pick any type)" tab — covered by the stepper.

## Verification

- `npx tsc --noEmit` clean; `npx eslint src/` no new errors; `npx vitest run` all pass.
- No dead imports/exports after deleting `DatabaseWizard.tsx`.
- Manual user pass (authed browser verification blocked by dev auth issue): `/data` shows Build + Mapping tabs; the stepper works; `/db-wizard` redirects to `/data`; nav shows one "Data Management" entry.

## Risks

- Tab composition isn't meaningfully unit-testable; relies on tsc/lint + manual pass.
- `DatabaseBuilderPanel` extraction must not drop any state/logic — verify by diffing the extracted JSX against the original page body.

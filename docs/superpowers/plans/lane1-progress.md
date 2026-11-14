# Lane 1 progress — home screens and common desk

Branch `lane1/home`, cut from `feature/enterprise-phases` at `d632f030` (enterprise P1–P9
are committed there, not yet on `main`). Order: [`BUILD-ORDER.md`](../../roadmap/sources/BUILD-ORDER.md).

Baseline before any change (2026-11-14): `npm run build` passed; `npm test` 148 files,
1287 tests passed.

| Phase | Status | Not verified / notes |
|---|---|---|
| `SH1` scientist home | **Done** on today's data | **Not seen in the browser as a Scientist.** The signed-in dev account holds only `MasterAdmin` and `DefaultUser`; giving it the Scientist role is a change on the live database, so it was not done. Covered instead by `ScientistView.test.tsx` (5 tests) and `src/lib/home/home.test.ts` (15 tests). As MasterAdmin the page loads with no console error and `MyActions` reads from `HomeContext` |
| `CD0` shell | Next | — |

## SH1 — what was built

- `src/lib/home/`: `classify.ts` (kind → group, minutes), `doNext.ts` (ranking, quick wins,
  next item), `today.ts` (local dates, done-today, week strip), `greeting.ts`, `api.ts`
  (`callerStaffId`, `milestonesFor`).
- `src/contexts/HomeContext.tsx`: mounted by `Dashboard.tsx` only. Holds the staff link
  (by `caller_staff_id()`), the ranked open items, and the done-today count.
- `src/pages/dashboards/ScientistView.tsx`: rewritten. `MyActions` is no longer rendered
  above it. `MyActions` (other roles) now reads the same ranked list from `HomeContext`.

## Defaults used

- Time estimates: fixed table per kind in `classify.ts` (plan question 5).
- "Done today" is a view convenience kept in `localStorage` per user per day: items seen
  open earlier today that are closed now. It is not a record.

## Blocks marked "not connected yet"

| Block | Waits on |
|---|---|
| Scientist · Waiting in offices | `SH6` (CPS / AMS / eHRMS files) |

## Known limits carried forward

- Committee action items and `project_staff` rows hold a **name**, not a staff ID. Until
  `CM0` (action items) and the project-staff link are by ID, "Committee tasks on me",
  team rows and project membership (non-PI) still match by name. PI projects, committees
  and the staff row itself are matched by ID.
- Do-first (priorities) is `SH3`; report timers are `SH2`; neither block is on the screen yet.
- Old content removed from the scientist page (own proposals, publications, IRINS panel)
  is reachable from "My profile"; the page links to it.

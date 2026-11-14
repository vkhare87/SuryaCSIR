# Lane 1 progress — home screens and common desk

Branch `lane1/home`, cut from `feature/enterprise-phases` at `d632f030` (enterprise P1–P9
are committed there, not yet on `main`). Order: [`BUILD-ORDER.md`](../../roadmap/sources/BUILD-ORDER.md).

Baseline before any change (2026-11-14): `npm run build` passed; `npm test` 148 files,
1287 tests passed.

| Phase | Status | Not verified / notes |
|---|---|---|
| `SH1` scientist home | **Done** on today's data | **Not seen in the browser as a Scientist.** The signed-in dev account holds only `MasterAdmin` and `DefaultUser`; giving it the Scientist role is a change on the live database, so it was not done. Covered instead by `ScientistView.test.tsx` (5 tests) and `src/lib/home/home.test.ts` (15 tests). As MasterAdmin the page loads with no console error and `MyActions` reads from `HomeContext` |
| `CD0` shell | **Done** on today's data | Seen in the browser as MasterAdmin at 1440 px and at phone width: two halves on desktop, desk below the role half on a phone, no sideways scroll, no console error. **Not seen in dark theme** (the app's theme is a class, the browser's colour-scheme switch does not set it). Not seen as other roles |
| Wave 2 (`HH1`, `DH1`, `ST1`, `PJ1`, `TS1`, CD phase A, `SH2`) | Next | — |

## SH1 — what was built

- `src/lib/home/`: `classify.ts` (kind → group, minutes), `doNext.ts` (ranking, quick wins,
  next item), `today.ts` (local dates, done-today, week strip), `greeting.ts`, `api.ts`
  (`callerStaffId`, `milestonesFor`).
- `src/contexts/HomeContext.tsx`: mounted by `Dashboard.tsx` only. Holds the staff link
  (by `caller_staff_id()`), the ranked open items, and the done-today count.
- `src/pages/dashboards/ScientistView.tsx`: rewritten. `MyActions` is no longer rendered
  above it. `MyActions` (other roles) now reads the same ranked list from `HomeContext`.

## CD0 — what was built

- `src/components/home/CommonDesk.tsx`: Raise a request, My day, My requests, Notices,
  People, and My committees (only when the person has a meeting coming).
- `src/lib/home/desk.ts`: `myDay`, `myRequests`, `currentNotices`, `withoutClaimed`,
  `deskKey` (tests in `desk.test.ts`).
- `HomeContext`: `claimed` / `claim` and the `useClaim` hook. `ScientistView` and
  `MyActions` claim the rows they show, so the desk does not repeat them.
- `Dashboard.tsx`: every working role renders role half + desk
  (`xl:grid-cols-[minmax(0,1fr)_320px]`). `Guest` and `DefaultUser` have no desk.

Left for later, on purpose:

- Collapse the right column to icons (plan rule 7) — not built; add when someone asks.
- Phone order "first three role blocks, then the desk" — today the whole role half comes
  first. For roles still on the old dashboards that is a long scroll; it shortens as each
  role view is rebuilt in wave 2.
- The breakpoint is `xl` (1280 px), not 1100 px: with the sidebar open, 1100 px leaves the
  role half too narrow.
- Search and the bell stay in the existing top bar; they were already common.
- My requests reads helpdesk tickets only; Notices reads calendar announcements only
  (`CD2`, `CD4` widen them).

## Defaults used

- Time estimates: fixed table per kind in `classify.ts` (plan question 5).
- "Done today" is a view convenience kept in `localStorage` per user per day: items seen
  open earlier today that are closed now. It is not a record.

## Blocks marked "not connected yet"

| Block | Waits on |
|---|---|
| Scientist · Waiting in offices | `SH6` (CPS / AMS / eHRMS files) |
| Common desk · People (who is away today) | `CD5` (eHRMS leave file) |

## Known limits carried forward

- Committee action items and `project_staff` rows hold a **name**, not a staff ID. Until
  `CM0` (action items) and the project-staff link are by ID, "Committee tasks on me",
  team rows and project membership (non-PI) still match by name. PI projects, committees
  and the staff row itself are matched by ID.
- Do-first (priorities) is `SH3`; report timers are `SH2`; neither block is on the screen yet.
- Old content removed from the scientist page (own proposals, publications, IRINS panel)
  is reachable from "My profile"; the page links to it.

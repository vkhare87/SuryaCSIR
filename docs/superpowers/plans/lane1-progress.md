# Lane 1 progress — home screens and common desk

Branch `lane1/home`, cut from `feature/enterprise-phases` at `d632f030` (enterprise P1–P9
are committed there, not yet on `main`). Order: [`BUILD-ORDER.md`](../../roadmap/sources/BUILD-ORDER.md).

Baseline before any change (2026-11-14): `npm run build` passed; `npm test` 148 files,
1287 tests passed.

| Phase | Status | Not verified / notes |
|---|---|---|
| `SH1` scientist home | **Done** on today's data | Seen in the browser as a Scientist at 1440 px, light and dark theme (2026-11-14): greeting in Fraunces, counts in IBM Plex Mono, one strong button, no console error. The owner agreed to add the Scientist role to the dev login for this check; **the role is still on that login**. Seen at phone width (375 px) too: desk below the role half, no sideways scroll, every link at least 24 px high. Fault found and fixed in the browser check: a role switch counted as work done on the ring (the done-today list is now kept per role) |
| `CD0` shell | **Done** on today's data | Seen in the browser as MasterAdmin at 1440 px and at phone width: two halves on desktop, desk below the role half on a phone, no sideways scroll, no console error. **Not seen in dark theme** (the app's theme is a class, the browser's colour-scheme switch does not set it). Not seen as other roles |
| `HH1` head home | **Done** on today's data | Seen in the browser as HOD (2026-11-14), desktop and phone: switch to My own work and back works, no sideways scroll, no console error. The dev login's HOD role has division `DEV`, which has no projects, so the exception rows were seen only in tests (`HoDView.test.tsx`, 6 tests; `division.test.ts`). Acting-head scope is not tested here; it rests on the existing RLS (`caller_in_division` has the acting branch) |
| `DH1` Director home | **Done** on today's data | Seen in the browser as Director (2026-11-14) on live data, desktop and phone: no sideways scroll, no console error. `DirectorView.test.tsx` (5 tests). Not seen as an acting Director |
| Rest of wave 2 (`ST1`, `PJ1`, `TS1`, CD phase A, `SH2`) | Next | — |

## SH1 — what was built

- `src/lib/home/`: `classify.ts` (kind → group, minutes), `doNext.ts` (ranking, quick wins,
  next item), `today.ts` (local dates, done-today, week strip), `greeting.ts`, `api.ts`
  (`callerStaffId`, `milestonesFor`).
- `src/contexts/HomeContext.tsx`: mounted by `Dashboard.tsx` only. Holds the staff link
  (by `caller_staff_id()`), the ranked open items, and the done-today count.
- `src/pages/dashboards/ScientistView.tsx`: rewritten. `MyActions` is no longer rendered
  above it. `MyActions` (other roles) now reads the same ranked list from `HomeContext`.

## HH1 — what was built

- `src/pages/dashboards/HoDView.tsx`: greeting, Division / My-own-work switch (remembered
  per browser), Waiting on you (one strong button), division projects by exception with
  time and money bars, People (posts, retirements, contracts ending, heavy load),
  Instruments (down, service contract ending), then the existing division figures.
  `DivisionHeadView.tsx` now re-exports it.
- `src/lib/home/division.ts`: `readProject`, `projectsByException`.
- `src/components/home/parts.tsx`: shared greeting, ask box, action row, block styles and
  the "not connected yet" block. `ScientistView` uses them too.

Differences from the plan, on purpose:

- **No `caller_division_codes()` and no migration.** The data a head loads is already cut
  to the division by RLS, and `caller_in_division()` already honours acting charges. The
  view also filters by the role's division code.
- "Needs attention" today = past end date, ends within 60 days, late milestones, or money
  use more than 25 points behind time use. "Vacant post on the project" and "review soon"
  are not in the rule yet (they need `HH2` / post-to-project links).
- "Waiting on you" is the ranked action list until `HH2` builds the decision queue. It has
  no pre-check line and no days-waiting yet.
- The old attention strip, staff table and project table are gone from this page; the
  directory and project pages hold them.

## DH1 — what was built

- `src/pages/dashboards/DirectorView.tsx`: greeting, ask box, Waiting on you (one strong
  button), Divisions by exception, My week, four institute figures that each open their
  list, one card that names the seven blocks not connected yet, then the existing
  institute charts.
- `src/lib/home/division.ts`: `divisionRollup`. `parts.tsx`: `WaitingOnYou`, shared with
  the head screen.

Found on live data and fixed:

- **No project has a spent amount recorded**, so "money far behind time" flagged every
  project (19 of 19 in one division). The rule now needs a recorded spent amount; without
  one the money figure is "—" and there is no flag. The same gap makes the old
  "low fund burn 82" tile at the bottom of the page meaningless; that tile is old code and
  was left as it is.
- After the fix the live figures are 9 of 19, 7 of 16 and so on. These come from real end
  dates that are past (39 running projects are past their end date). That is a data matter
  for PME, not a screen fault.

Differences from the plan, on purpose:

- `division_rollup()` is a client function over data the Director already loads, not a
  database function. Move it to SQL when `DH13` needs it on the server.
- The head's answer time is not in the division row yet (`HH2`).
- Posts show "—" because no sanctioned posts are entered on live.
- The old data-freshness table and the threshold sliders are gone from this page.

## Dev login

The owner agreed (2026-11-14) to add roles to the dev login for browser checks. It now
holds: `MasterAdmin`, `DefaultUser`, `Scientist`, `HOD`, `Director`, `Student`,
`ProjectStaff`, `Technician`, and `PME`. **`PME` was not asked for**: it appeared while
the owner and the agent were both clicking in the same tab. Remove the roles in
Master Admin → Users & Roles when the checks are done.

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
| Head · Reports that go up from you | `HH4` |
| Head · Technologies | `HH5` |
| Head · Outside | `HH6` |
| Director · Briefing and watch list | `DH13` |
| Director · How much reaches me (delegation) | `DH2` |
| Director · From CSIR Headquarters | `DH5` |
| Director · Fund status by head | `DH10` |
| Director · The next 12 months | `DH9` |
| Director · Purchase plan and stuck in offices | `DH11`, `DH6` |
| Director · Infrastructure | `DH12` |

## Known limits carried forward

- Committee action items and `project_staff` rows hold a **name**, not a staff ID. Until
  `CM0` (action items) and the project-staff link are by ID, "Committee tasks on me",
  team rows and project membership (non-PI) still match by name. PI projects, committees
  and the staff row itself are matched by ID.
- Do-first (priorities) is `SH3`; report timers are `SH2`; neither block is on the screen yet.
- Old content removed from the scientist page (own proposals, publications, IRINS panel)
  is reachable from "My profile"; the page links to it.

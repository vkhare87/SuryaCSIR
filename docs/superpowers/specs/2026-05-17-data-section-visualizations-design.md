# Data Section Visualizations — Design Spec

**Date:** 2026-05-17
**Status:** Approved — ready for implementation plan
**Scope:** Inline insight strips + Analytics tabs across 8 HR/operational list pages

---

## Context

SURYA's list pages (Staff, Divisions, Projects, PhD Students, Equipment, Recruitment, Helpdesk, Committees) currently render data only as tables. Charts exist only in `DirectorView` (a single BarChart). All other sections show raw rows with no visual aggregation, no trends, no drill-down. This spec adds a consistent visualization layer across every operational list page so users can see distributions, hotspots, and trends at a glance, and click-to-navigate from chart to filtered table.

**Goal:** Every operational list page gains (a) a compact inline insight strip and (b) a deep Analytics tab — without bloating the initial bundle and without changing how existing tables work.

**Out of scope:** Calendar page, IP Intelligence page, Audit Log page, Scientific Outputs as a standalone Analytics page (Sci Outputs data is consumed by the Staff collaboration network only).

---

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Placement | Both: inline summary strip + deep Analytics tab on each list page |
| 2 | Scope | All HR/operational sections at once (8 sections) |
| 3 | Interactivity | Click chart → filter table via URL params |
| 4 | Maps | Organizational hierarchy tree + collaboration network graph |
| 5 | Time filter | Per-chart time control (no global picker) |
| 6 | Approach | Recharts + lazy micro-libs (react-d3-tree, react-force-graph-2d, @nivo/calendar) |

---

## Architecture

### Two shells, lazy-split

- **`<InsightsStrip>`** — horizontal row of 3–5 compact tiles above the table on every list page. Recharts-only (already bundled). Zero new chunks.
- **Tab switcher on list pages** — `Table | Analytics`. Existing table becomes Tab 1. Tab 2 is `React.lazy(() => import('./<Section>Analytics'))`. Heavy libs only load when Analytics is opened.

### URL state for click-to-filter

- Bar/slice click pushes `?filter=<dim>:<value>` via React Router search params.
- Table reads same params and filters rows.
- `<FilterChip>` rendered above the table with × to clear. Shareable, bookmarkable, back-button works.

### Data path

All viz read from `useData()`. Aggregations via `useMemo` inside each Analytics page. No new Supabase queries — DataContext already loads everything in scope.

### File layout

```
src/components/viz/
  InsightsStrip.tsx       shell
  KpiTile.tsx             number + delta + optional sparkline
  MiniBar.tsx
  MiniDonut.tsx
  MiniSparkline.tsx
  ProgressRing.tsx        Recharts RadialBar
  Histogram.tsx           binning helper + BarChart
  Treemap.tsx             Recharts Treemap
  Funnel.tsx              Recharts FunnelChart
  GanttLite.tsx           horizontal bars on date scale
  Heatmap.tsx             grid heatmap (category × category)
  HeatmapCalendar.tsx     @nivo/calendar (lazy)
  OrgTree.tsx             react-d3-tree (lazy)
  NetworkGraph.tsx        react-force-graph-2d (lazy)
  TimeRangePicker.tsx
  ChartCard.tsx           titled <Card> with action slot
  FilterChip.tsx          active URL filter chip
src/pages/<section>/
  Analytics.tsx           new lazy view per section (8 total)
src/utils/
  useChartFilter.ts       URL filter round-trip
  useTimeRange.ts         per-chart range state + predicate
  binning.ts              histogram binning utils
```

---

## Per-Section Viz Catalog

### Staff

**Host pages:** No standalone Staff list page exists today. Staff is rendered inside role dashboards (`HRAdminView`, `DirectorView`, `DivisionHeadView`) and via `StaffDetail.tsx` for detail. Resolution:
- **Strip** lives on `HRAdminView` (and is reusable from other dashboards that already render staff).
- **Analytics** ships as a new route `/staff/analytics` (or new tab on `HRAdminView`, decided at plan phase).

- **Strip:** total | active count (where `StaffMember` has not retired — `DOJ` set and no termination date / inactive flag; exact predicate confirmed at plan phase) | designation mini-donut | division mini-bar
- **Analytics:**
  - Headcount by Division (bar; click → filter)
  - Designation pyramid (horizontal stacked bar by Group/Designation)
  - Service tenure histogram (from `DOJ`)
  - Retirement runway bar (next 5 years from `DOB` if available)
  - **Org hierarchy tree** — Director → DivHead → HOD → Scientist (react-d3-tree, lazy)
  - **Collaboration network graph** — nodes = scientists, edges = co-authorship from `scientificOutputs.authors[]`, node size = output count (react-force-graph-2d, lazy)

### Divisions (`src/pages/Divisions.tsx`)

- **Strip:** division count | sanctioned vs current ProgressRing | avg utilization %
- **Analytics:**
  - Sanctioned-vs-Current grouped bar with utilization %
  - Research-area × Division heatmap (counts)
  - Treemap sized by current strength
  - Active projects per division (bar; click → Projects filtered)
  - Publications-per-scientist density bar

### Projects (`src/pages/Projects.tsx`)

- **Strip:** active count | total sanctioned ₹ | avg duration | ongoing %
- **Analytics:**
  - FundType donut
  - Top sponsorers treemap
  - Project status pie
  - Gantt-lite (start → completion bars)
  - Cost histogram
  - PI workload bar (click → filter)
  - Division × FundType heatmap
  - Project-start calendar heatmap (@nivo/calendar)

### PhD Students (`src/pages/PhDTracker.tsx`)

- **Strip:** total | ongoing % | thesis submitted | awarded
- **Analytics:**
  - Status donut
  - Specialization treemap
  - Supervisor workload bar (click → filter)
  - Enrollment trend line
  - Duration histogram (enrollment → submission)

### Equipment (`src/pages/Facilities.tsx`)

- **Strip:** total | operational % | AMC expiring ≤90d
- **Analytics:**
  - Status donut
  - Per-lab equipment count bar
  - AMC expiry timeline (next 12 months — calendar heatmap)
  - Division × Lab utilization heatmap

### Recruitment (`src/pages/Recruitment.tsx`)

- **Strip:** open vacancies | total applicants | fill rate progress
- **Analytics:**
  - Hiring funnel (Received → Shortlisted → Interviewed → Selected → Rejected)
  - Vacancy status pie
  - Time-to-fill histogram
  - Applicants per vacancy bar

### Helpdesk (`src/pages/helpdesk/TicketList.tsx`)

- **Strip:** open | avg resolution hrs | SLA breach count | critical urgency count
- **Analytics:**
  - Status donut
  - Urgency × Category heatmap
  - Resolution-time histogram
  - Daily volume trend line
  - Assignee workload bar
  - Ticket-creation calendar heatmap

### Committees (`src/pages/committees/CommitteeList.tsx`)

- **Strip:** active count | meetings next 30d | pending action items | overdue count
- **Analytics:**
  - Active vs Inactive donut
  - Meetings per committee bar
  - Action item status donut + overdue flag
  - Meeting calendar heatmap
  - Member-overlap matrix (committees × scientists)

---

## Dependencies

New deps (lazy-loaded only, zero impact on initial bundle):

| Package | Approx gzipped | Use |
|---|---|---|
| `react-d3-tree` | ~30 KB | Org hierarchy |
| `react-force-graph-2d` | ~80 KB | Collaboration network |
| `@nivo/calendar` + `@nivo/core` | ~50 KB combined | Calendar heatmaps |

Existing Recharts handles all other chart types.

---

## Implementation Phases

### Phase 1 — Foundation (no user-visible viz)
Build all `src/components/viz/` primitives (Recharts-only ones), build hooks (`useChartFilter`, `useTimeRange`, `binning`), confirm/build `<Tabs>` primitive. Unit tests for binning and filter URL round-trip.

### Phase 2 — Inline strips on all 8 list pages
Add `<InsightsStrip>` to each list page. No tab switcher yet. Wires `useData()` → `useMemo` → tiles. Cheapest user-visible win.

### Phase 3 — Analytics tab scaffolding
Add Tab switcher to all 8 list pages. Create empty `Analytics.tsx` for each, lazy-loaded. URL filter wiring on Table tab — table reads, no chart writes yet.

### Phase 4 — Recharts Analytics content (8 sections)
All charts that don't need new libs: bar, donut, pie, treemap, funnel, histogram, Gantt-lite, heatmap grid, line trend. Click handlers push URL filters.

### Phase 5 — Heavy lazy libs
Add @nivo/calendar (calendar heatmaps for Projects/Helpdesk/Committees/Equipment AMC). Add react-d3-tree (Staff org tree). Add react-force-graph-2d (Staff collaboration network, reads `scientificOutputs`). Verify chunk sizes via `vite build`.

### Phase 6 — Polish
Empty/error states per chart. Loading skeletons. Dark-mode pass (Recharts via CSS vars where possible; else `useTheme()`). Optional PNG export per chart via `html-to-image`. ≥1 unit test per Analytics page covering aggregation logic.

---

## Risks

- **Force-graph theme sync** — canvas-based; verify dark-mode color updates trigger re-render.
- **@nivo tree-shake** — confirm unused @nivo modules trimmed; fallback is custom SVG calendar.
- **Recharts Treemap labels** — truncate at small widths; use `<ResponsiveContainer>` carefully.
- **HR column casing** — quoted CamelCase (`"DOJ"`, `"divCode"`, `"CompletioDate"`); aggregation helpers must use exact casing.

---

## Verification

### Per-phase gates

- **Phase 1:** `npm run lint` clean. `npm test` passes new units. `npm run build` succeeds, initial bundle delta ≤5 KB gzipped.
- **Phase 2:** All 8 list pages show strip with non-zero tiles. DivisionHead login → strip scoped to that division (DataContext already scopes). Dark-mode swap clean.
- **Phase 3:** Tab switcher present on all 8 pages. Analytics tab opens empty placeholder. DevTools Network shows separate chunk loaded only on Analytics click.
- **Phase 4:** Every Analytics page renders listed charts. Click bar/slice → URL updates → switching to Table tab shows filtered rows + FilterChip → × clears. Back button restores. Per-chart time picker filters that chart only.
- **Phase 5:** Org tree renders depth correctly; click node → staff detail. Collaboration network shows nodes/edges/hover tooltips at ≥30fps with full author set. Calendar heatmaps respect dark mode.
- **Phase 6:** Empty state shown when section has zero rows. Error state shown when `DataContext.error` set. PNG export downloads correct chart.

### Cross-cutting

- `npx tsc --noEmit` clean throughout.
- `npm run build` chunk report: lazy chunks for d3-tree, force-graph, nivo NOT in initial bundle.
- Role smoke test: DefaultUser (no access), DivisionHead (scoped), SystemAdmin (full).
- Manual viz QA via `/browse` on dev server.

### Happy path

1. Login as SystemAdmin → Projects page.
2. Strip shows: active count, total ₹, avg duration, ongoing %.
3. Click Analytics tab → Recharts donut + treemap + Gantt-lite render.
4. Click FundType=External slice → URL becomes `?filter=fundType:External`.
5. Switch to Table tab → table filtered, FilterChip visible.
6. Clear chip → full table restored.
7. Open Staff Analytics → click Collaboration Network → lazy chunk loads → graph renders.

---

## Critical Files

**Modified:**
- 7 list pages get `<Tabs>` + `<InsightsStrip>` + `<FilterChip>`: `src/pages/Divisions.tsx`, `src/pages/Projects.tsx`, `src/pages/PhDTracker.tsx`, `src/pages/Facilities.tsx`, `src/pages/Recruitment.tsx`, `src/pages/helpdesk/TicketList.tsx`, `src/pages/committees/CommitteeList.tsx`.
- Staff handled separately: strip added to `src/pages/dashboards/HRAdminView.tsx`; Analytics is a new route/tab decided at plan phase.
- `src/components/ui/Tabs.tsx` — confirm exists, build if not.

**New:**
- `src/components/viz/*` (15 files)
- `src/pages/<section>/Analytics.tsx` × 8
- `src/utils/useChartFilter.ts`, `src/utils/useTimeRange.ts`, `src/utils/binning.ts`

**Untouched:**
- `00000000000000_init.sql` and all migrations.
- DataContext (no new entities needed).
- Existing dashboards in `src/pages/dashboards/` (separate, can adopt new primitives later).

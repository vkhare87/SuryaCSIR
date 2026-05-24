# Project Staff Analytics — Design Spec

**Date:** 2026-05-25
**Scope:** Add an Analytics tab to the Project Staff roster page (`/staff/project`).
**Status:** Approved design, pending implementation plan.

---

## Goal

The Project Staff roster (`src/pages/ProjectStaffRoster.tsx`) currently shows only a table. Add
decision-useful analytics — tenure, project-wise, PI-wise, designation/intake — as a second tab on
the same page. Charts double as navigation: clicking a chart element filters the List tab.

## Principles

- **Tabs on one page.** List (existing table) + Analytics (new chart grid). No new route.
- **Click-to-filter.** Clicking a chartable element sets a facet filter `{dim, value}` and switches to
  the List tab, pre-filtered, with a clearable chip.
- **Reuse the viz kit** (`ChartCard`, `CategoryBar`, `CategoryDonut`, `Histogram`, `TrendLine`, `KpiTile`)
  and the established analytics pattern from `StaffAnalytics.tsx`.
- **Pure, tested selectors.** All derivations in `src/utils/projectStaffMetrics.ts`, unit-tested.
- **No schema/route/RLS changes.** Reads `useData().projectStaff` only.

## Non-Goals

- No cross-tab live-sync filter chip on the Analytics tab (filter applies to List only).
- No new backend, migration, or detail page.
- No edit/create of project staff here.

---

## Data Notes

`ProjectStaff` fields used: `StaffName`, `Designation`, `RecruitmentCycle` (e.g. `"2023-I"`),
`DateOfJoining` (e.g. `"2023-08-15"`), `DateOfProjectDuration` (range string `"2023-08-15 to 2025-08-14"`),
`ProjectNo`, `PIName`, `DivisionCode`.

- **Contract end** = parse the substring after `" to "` in `DateOfProjectDuration`. If absent/unparseable,
  exclude from runway.
- **Tenure** = years from `DateOfJoining` to now; drop unparseable/negative.
- Dates are loose strings — use `parseDate` from `dateUtils`; guard nulls everywhere.

---

## Page Structure (`ProjectStaffRoster.tsx`)

1. Header (title + subtitle) — existing.
2. **Tab bar:** `List` | `Analytics` (state `activeTab`, default `list`).
3. **List tab:** existing search input + division dropdown + `DataTable`, PLUS a facet chip when a
   facet filter is active (shows `dim: value`, clear button resets it).
4. **Analytics tab:** `<ProjectStaffAnalytics onFacet={...} onDivision={...} />` — the chart grid.

### Facet filter model

```ts
type FacetDim = 'project' | 'pi' | 'designation' | 'cycle';
interface Facet { dim: FacetDim; value: string; }
```

State in `ProjectStaffRoster`: `facet: Facet | null`. Division is handled by the existing
`selectedDivision` dropdown (the division chart sets it directly, not via facet).

List filtering applies, in order: search term → division dropdown → facet (if set). Facet field map:
`project → ProjectNo`, `pi → PIName`, `designation → Designation`, `cycle → RecruitmentCycle`.

When a chart fires `onFacet(facet)`: set `facet`, set `activeTab='list'`. When it fires
`onDivision(code)`: set `selectedDivision=code`, set `activeTab='list'`.

---

## Analytics Charts (`ProjectStaffAnalytics.tsx`)

Grid `grid-cols-1 lg:grid-cols-2 gap-4`, each in a `ChartCard`. Empty series → `ChartEmpty` (built into
the viz components).

| Chart | Component | Source selector | onClick |
|-------|-----------|-----------------|---------|
| Service tenure | `Histogram` + a small avg-tenure stat | `getTenureYears`, `getAvgTenure` | — |
| Contract runway | `CategoryBar` (buckets `<3mo`,`3–6mo`,`6–12mo`,`>12mo`) | `getContractRunway` | — |
| Headcount by project | `CategoryBar` | `getHeadcountByProject` | `onFacet({dim:'project', value})` |
| Headcount by PI | `CategoryBar` horizontal | `getHeadcountByPI` | `onFacet({dim:'pi', value})` |
| Designation mix | `CategoryDonut` | `getDesignationMix` | `onFacet({dim:'designation', value})` |
| Hires by recruitment cycle | `CategoryBar` | `getHiresByCycle` | `onFacet({dim:'cycle', value})` |
| Joining trend by year | `TrendLine` | `getJoiningByYear` | — |
| Division distribution | `CategoryDonut` | `getDivisionMix` | `onDivision(label)` |

Avg-tenure shown inline (e.g. small text under the histogram title or a `KpiTile`); keep it simple.

---

## Selectors (`src/utils/projectStaffMetrics.ts`)

All pure, take `ProjectStaff[]` (and `now` where time-relative), return viz-ready shapes
(`CategoryDatum[]`, `TrendPoint[]`, `number[]`).

- `parseDurationEnd(duration: string): Date | null` — end date after `" to "`, else null.
- `getTenureYears(staff, now?): number[]` — years since `DateOfJoining`, finite & ≥ 0.
- `getAvgTenure(staff, now?): number` — mean of `getTenureYears`, 1-dp; 0 if none.
- `getContractRunway(staff, now?): CategoryDatum[]` — fixed buckets `<3mo`/`3–6mo`/`6–12mo`/`>12mo`
  from `parseDurationEnd`, skipping expired/unparseable.
- `getHeadcountByProject(staff): CategoryDatum[]` — count per `ProjectNo`, desc, top 15.
- `getHeadcountByPI(staff): CategoryDatum[]` — count per `PIName`, desc, top 15.
- `getDesignationMix(staff): CategoryDatum[]` — count per `Designation`, desc.
- `getHiresByCycle(staff): CategoryDatum[]` — count per `RecruitmentCycle`, sorted by label asc.
- `getJoiningByYear(staff): TrendPoint[]` — count per joining year, asc.
- `getDivisionMix(staff): CategoryDatum[]` — count per `DivisionCode`, desc.

Empty/`'Unspecified'` fallback for blank keys, matching `StaffAnalytics` conventions.

---

## Files

- **New:** `src/utils/projectStaffMetrics.ts`, `src/utils/projectStaffMetrics.test.ts`,
  `src/pages/ProjectStaffAnalytics.tsx` (child grid component, named export).
- **Modify:** `src/pages/ProjectStaffRoster.tsx` — tab bar, `activeTab`/`facet` state, facet chip,
  extend list filtering, render analytics tab.

Conventions: `useMemo` for all derived data; semantic tokens; `import type`; `useData()` only.

## Testing

- Unit-test selectors (vitest): `parseDurationEnd` (valid range, missing `" to "`, garbage),
  tenure math + avg, runway bucket boundaries, headcount grouping/sort, cycle sort, joining-by-year.
- Manual: both tabs render; clicking each clickable chart lands on List filtered correctly; chip clears;
  empty data shows ChartEmpty without crash. Verify live as DivisionHead (page is reachable).

## Open Items for Planning

- Exact avg-tenure presentation (inline stat vs KpiTile) — cosmetic.
- Tab-bar styling — match any existing tab pattern in the app (e.g. AuditLog tabs) if present.

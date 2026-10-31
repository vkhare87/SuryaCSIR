# SURYA UX and Analytics Modernization — Phased Implementation Plan

**Status:** Proposed execution plan  
**Created:** 2026-10-31  
**Primary input:** [Analytics App UX Review](ANALYTICS-APP-UX-REVIEW.md)  
**Long-term direction:** [Vision Architecture](VISION-ARCHITECTURE.md) and [Master Roadmap](ROADMAP.md)

## Goal

Make SURYA a coherent analytics and institutional-records app. A user should be able to move from a role dashboard to a meaningful alert or metric, understand its scope and freshness, inspect the relevant records, open a related entity, and return without losing context. Preserve the approved warm editorial design and existing role/RLS boundaries.

This plan prioritizes reliability and connected workflows before new visual effects or broad feature expansion. Execute phases in order; each phase should be independently reviewable and releasable.

## Guiding decisions

- `DESIGN.md` is the visual source of truth. Retain parchment/ink/terracotta, Fraunces display, Inter UI, tabular numerals, semantic status colors, and restrained motion.
- Treat existing capabilities as foundations: role dashboards, chart filters, active filter chips, `DataTable` sort/search/export/pagination, entity links, relationship helpers, `/explore`, and the command palette.
- Keep the page command palette for navigation. Design universal **record search** as a distinct capability with its own permission and provenance requirements.
- Preserve Postgres RLS as the hard access boundary. A chart, search result, preview, export, related panel, and deep link must not widen access.
- Do not add chart trends or comparison claims unless the underlying data supports them.
- Treat observed count changes as investigation leads. Confirm the cause before changing metric logic or calling live data incorrect.

## Phase overview

| Phase | Name | Main result | Relative size |
|---|---|---|---|
| 0 | Baseline and route integrity | Reproducible state, route/metric inventory, broken links corrected | S |
| 1 | Dashboard trust and action priority | Reliable counts, freshness cues, clear overdue work, focused role home | M |
| 2 | Connected analytics pilot | Staff and Projects analytics connect chart → filter → records → detail | M |
| 3 | Navigation and entity context | Consistent location, back paths, and related records | M |
| 4 | Universal record search | Authorized cross-module record discovery with provenance | L–XL |
| 5 | Scale analytics/table patterns | Consistency across Divisions, PhD, Recruitment, Facilities, other modules | M–L |
| 6 | Accessibility, performance, and adoption | Role- and device-validated experience; maintainable standards | M |

Effort is indicative only. Re-estimate after Phase 0 and split phases further if needed.

## Phase 0 — Baseline and route integrity

**Objective:** Establish known-good journeys and fix verified route failures before expanding the UI.

### Work

1. Create a route inventory: route, page title, parent, roles, sidebar/menu entry, deep-link sources, and loading/error state.
2. Inventory analytics pages and `DataTable` call sites: filters, export behavior, entity links, row counts, mobile layout, and source data.
3. Reproduce dashboard values after data load settles. Record source, refresh timing, role, and whether mock or Supabase data is active.
4. Investigate the “Equipment” total/down counts and the “never uploaded” freshness warnings while populated records appear. Trace calculations and event-source semantics; document findings before changing logic.
5. Fix the “divisions with no records” link observed on the Master Admin dashboard. Point it to a registered route with the correct view/filter, or to the appropriate divisions page until a dedicated destination exists.
6. Check every dashboard action/alert destination against the router; add a low-cost route-link audit to prevent recurrence.
7. Define a short role walkthrough set (Master Admin, Director, Division Head/HOD, Scientist, HR, Technician, Student/Project Staff) for follow-on phases.

### Exit criteria

- Every dashboard CTA used by the sampled roles lands on a registered, relevant route.
- Metric discrepancies have a documented explanation or a specific bug ticket, owner, and reproduction.
- Freshness semantics are defined: what event makes a dataset fresh, what “never uploaded” means, and how mock mode is identified.
- Route and analytics inventories are checked into the repo or linked from this plan.

## Phase 1 — Dashboard trust and action priority

**Objective:** Make each dashboard useful at a glance and safe to act on.

### Work

1. Correct KPI derivations and ensure displayed totals and subcounts reconcile. For example, “down” equipment cannot exceed the total equipment count unless the two values intentionally refer to different scopes; if scopes differ, name them.
2. Add explicit loading, last-refreshed/source, stale, missing, and error states. Do not briefly display partial counts as settled totals without indicating loading.
3. Refine freshness alerts so “no import event,” “no records,” “stale records,” and “fetch failed” are separate states with accurate destinations.
4. Classify action items as overdue, due soon, or later; sort by urgency; display due date and current workflow status clearly. Historical deadlines must not look current.
5. Reduce dashboard overload: keep My Actions and Needs Attention near the top; show a role-relevant set of summary metrics; move exhaustive user administration and long registries to their dedicated pages or collapsed sections.
6. Separate current page heading from active role. Make the active role switcher’s scope clear, especially for accounts with composite roles.
7. Ensure all displayed KPIs that imply drill-down have an explicit relevant destination.

### Exit criteria

- Core headline metrics reconcile to their underlying records and show scope/source/freshness.
- Alerts distinguish urgency and their destinations are verified.
- No “overdue” item is shown as an ordinary future task.
- Each sampled role can find its priority actions and core measures without scanning unrelated admin data.

## Phase 2 — Connected analytics pilot

**Objective:** Prove a standard analytics-to-record journey in two high-value areas before generalizing it.

**Pilot pages:** Staff Analytics and Projects Analytics.

### Work

1. Agree on shared analytics page structure: page title/purpose, scope and date context, filters, charts, active-filter chips, results table, export, and explicit data states.
2. Make chart selections update the other applicable widgets and the result table. Preserve full categories in the chart dimension being selected so users can change the selection.
3. Make active filters readable, removable one by one, and clearable together.
4. Keep chart totals and table totals consistent. Explain the record scope and any exclusions.
5. Make rows link to canonical entity details. Pilot the existing entity registry and `EntityLink` pattern, extending the registry only as required.
6. Preserve filters in URL state when moving to details or sharing a filtered view; support browser back/forward without losing context.
7. Ensure export uses the currently filtered records and includes understandable headings and relevant scope/date context.
8. Add loading, empty, no-match, permission-limited, stale, and backend-error states.

### Exit criteria

- A user can select a chart category, see every relevant view update, inspect the filtered rows, open a record, and return to the same filter context.
- Chart counts, table counts, and exported rows match for representative filters.
- Screen reader/keyboard users can identify and clear active filters and access the underlying records.
- Pilot patterns are documented for reuse before scaling.

## Phase 3 — Navigation and entity context

**Objective:** Make location and relationships understandable across modules.

### Work

1. Add route-derived page titles and breadcrumbs to the shell. Show the page title in the header; keep role switching as a separate control.
2. Audit the grouped sidebar, “More” disclosure, active route indication, and route naming. Keep the current navigation model unless walkthrough evidence supports a restructure.
3. Add labels/tooltips and accessible names to collapsed navigation icons. Ensure current section and active item remain understandable by keyboard and screen reader.
4. Use consistent page headers and primary-action placement across list, analytics, and detail screens.
5. Extend entity links in the next most useful places: Projects list/analytics, Divisions, project detail, and staff detail. Avoid noisy hover-card use on touch devices; always provide a direct link.
6. Use `RelatedRail`/`Sheet` for selected relationships on detail pages where users routinely need cross-module context. Respect role permissions and avoid redundant/unbounded queries.
7. Verify overlays’ accessible names, focus entry/return, Escape behavior, and small-screen layout.

### Exit criteria

- Users can tell current page, parent page, and active role across desktop and mobile.
- All high-use list/detail pages provide a clear return path.
- Cross-links lead to the correct entity and do not reveal inaccessible records.
- Navigation and overlay walkthroughs pass for keyboard and touch use.

## Phase 4 — Universal record search

**Objective:** Find institutional records across modules, under the same access and provenance rules as the records themselves.

This phase is larger than a UI task. Start with an architecture/design decision before implementation.

### Work

1. Specify supported record types, identifiers, searchable fields, synonyms, facets, and expected result volumes.
2. Decide search architecture and indexing approach with the current Supabase/RAG/data architecture. Preserve one canonical record home and ID.
3. Define permission enforcement for query, result count, snippets, previews, and exports. RLS remains authoritative; search must not leak restricted existence or content.
4. Distinguish page-navigation results from record results in UI and language.
5. Add type/date/division/project facets and concise previews with canonical destinations.
6. Preserve document citation/provenance (record, version, page, creator) and clearly label metadata versus full-text matches.
7. Add empty, partial-index, backend-error, and restricted-result states. Only after core search works, consider recent/saved searches and alerts.

### Exit criteria

- A user can find known people, projects, divisions, instruments, outputs, and authorized indexed documents by name or stable ID.
- Search results, counts, snippets, and facets respect the user’s access scope.
- Document results retain source provenance and open the canonical record.
- Performance and RLS behavior are verified against representative data volumes and roles.

## Phase 5 — Scale analytics and table patterns

**Objective:** Extend proven behavior to the rest of the app without forcing every page into the same template.

### Work

1. Apply the analytics frame and connected-filter pattern to Divisions, PhD, Recruitment, Facilities, and then other analytics views based on usage.
2. Standardize chart title, unit, tooltip, number/date format, legend, keyboard summary, and export conventions.
3. Adopt entity links where they clarify a real next step; keep module-specific layouts where they support the task better.
4. Inventory table needs. Make sort/search/export/column settings consistent on high-use tables; add column filters or expanded rows only where needed.
5. Add virtualization only after measuring slow representative tables. Keep an accessible paging option and ensure export behavior is explicit.
6. Use shared filter metadata and URL patterns. Do not introduce a global filter context where page-level state is sufficient.
7. Update feature reference and analytics guide as each module adopts the standard.

### Exit criteria

- Analytics modules use consistent interaction conventions and distinguish their domain-specific metric definitions.
- Filtered data, displayed counts, and exports agree.
- Large-table performance is measured before and after any virtualization change.
- Exceptions to shared patterns are documented and justified by a workflow need.

## Phase 6 — Accessibility, performance, and adoption

**Objective:** Make the new patterns work for real users, roles, devices, and data volumes.

### Work

1. Conduct representative role-based walkthroughs using realistic records, including restricted and empty states.
2. Review keyboard access, focus indicators, focus return, chart summaries, table semantics, contrast, zoom/reflow, and reduced motion.
3. Review responsive behavior at mobile, tablet, and desktop sizes. Mobile should support its intended check/approve workflows, not just a compressed desktop layout.
4. Profile route loading, dashboard queries, repeated entity joins, and large tables; optimize measured bottlenecks.
5. Confirm all changed paths still honor route guards, feature controls, and RLS. Check deep links and exports as well as page navigation.
6. Gather staff feedback on terminology, alert usefulness, and whether connected links reduce task time; refine based on evidence.
7. Update this plan’s phase status, the UX review, `docs/engineering/FEATURES.md`, and `DESIGN.md` only when a design-system decision changes.

### Exit criteria

- The walkthrough set completes core tasks without dead ends.
- Accessibility and responsive issues found in the phase are resolved or documented with owner and priority.
- No material access-boundary regression is found.
- Performance and usability decisions are backed by representative measurements or observed user feedback.

## Delivery method for each phase

For each phase, create a small implementation spec before coding:

1. **Scope:** user roles, routes, files/modules, and explicit exclusions.
2. **Current behavior:** screenshots/observations and source behavior.
3. **Stories:** user task → expected result.
4. **Design contract:** states, layout, tokens, responsive behavior, keyboard behavior.
5. **Data/access contract:** metric definitions, sources, freshness, RLS expectations.
6. **Acceptance checklist:** concrete pass/fail behavior from the phase exit criteria.
7. **Rollout:** pilot route, fallback, instrumentation or feedback method.

Ship one phase or independently verifiable slice at a time. Keep shared primitives backward-compatible during pilots; update other call sites only after the new pattern is proven.

## Dependencies and sequencing

```text
Phase 0: baseline and route integrity
  └── Phase 1: dashboard trust/action priority
       ├── Phase 2: connected analytics pilot
       │    └── Phase 5: scale patterns
       └── Phase 3: navigation/entity context
            └── Phase 4: universal record search
Phase 6: validate throughout; final cross-role adoption pass after Phases 1–5
```

Phase 4 may be designed in parallel after Phase 0, but implementation depends on an agreed data/index and permission design. Avoid starting search UI before those decisions.

## Not part of this plan’s first delivery horizon

The vision document includes a digital lab notebook, sample/material registry, dataset registry, cross-lab federation, and full record-spine capabilities. Keep these as strategic horizon items. Do not add them to the initial modernization scope until core data quality, access, search, and daily usage are validated. Likewise, do not schedule decorative effects from `PLAN-visual-overhaul.md` until they support a named user workflow and match `DESIGN.md`.

## Completion definition

The modernization is successful when users can reliably understand dashboard metrics, act on the right alert, navigate to supporting records, explore related entities, and find authorized information across modules—with consistent behavior, visible provenance/freshness, accessible controls, and no loss of role boundaries.

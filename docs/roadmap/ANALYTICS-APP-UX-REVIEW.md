# SURYA Analytics App — Design and Product Upgrade Brief

**Status:** Development brief based on repository review  
**Reviewed:** 2026-10-31  
**Scope:** Existing React app routes, navigation, shared UI, analytics pages, project design/roadmap documents, and feature reference. Includes a signed-in local browser walkthrough on 2026-10-31 using the supplied account. This does not certify production behavior or a clean live-data state.

## 1. Purpose

Make SURYA feel and behave like one coherent institutional analytics and records app. Users should be able to move from an institute-level signal to the relevant chart, filtered records, entity detail, and related information without losing context. Modernization should improve the quality of decisions and daily workflows while retaining SURYA’s warm, archival identity and role-based governance.

This brief turns the current implementation and existing plans into concrete objectives, prioritized upgrades, and acceptance criteria for future development.

## 2. Product objectives

1. **Connect information.** Every meaningful chart, KPI, table row, entity name, and task should lead to the next useful piece of context.
2. **Make analytics actionable.** Users can inspect a metric, understand its definition and time window, apply or clear filters, and open the records that make up the result.
3. **Make navigation predictable.** The same concepts have consistent names, hierarchy, active states, breadcrumbs, and back paths across roles and screen sizes.
4. **Support role-specific work.** Dashboards prioritize each role’s decisions and assigned actions while keeping access boundaries visible and intact.
5. **Build trust in the data.** Show source, freshness, scope, and quality warnings where they affect interpretation; distinguish missing data from zero.
6. **Modernize without losing identity.** Keep the parchment, ink, and restrained terracotta design direction in `DESIGN.md`; use motion, depth, and responsive layout to clarify state and hierarchy.
7. **Deliver incrementally.** Improve shared patterns first, pilot them in a small number of high-use modules, then extend them consistently.

## 3. Current-state review

### What is already in place

- **A real app shell:** `Layout` provides role switching, a discoverable command-palette trigger and Ctrl/Cmd+K shortcut, notifications, settings, page transitions, and mobile quick navigation. `Sidebar` groups navigation into Overview, Human Resources, Research Ops, Governance, and Admin, with a collapsed rail and a “More” section.
- **Role-aware dashboards and access:** The app has dashboards for multiple roles, route guards, feature controls, and Supabase RLS. The feature reference describes a “My Actions” inbox with links into owning modules.
- **Reusable analytics and data display primitives:** `DataTable` supports sorting, global search, pagination, optional column visibility, CSV export, and a mobile card mode. KPI cards support count-up, delta, and sparkline slots. Shared visualization components cover bars, donuts, heatmaps, treemaps, funnels, and trends.
- **Some connected analytics flows:** Staff and project analytics implement chart-driven filtering with active filter chips. Other pages use chart filters as well. Human Capital uses `EntityLink`; the entity registry, hover preview, relation helpers, `RelatedRail`, and `Sheet` exist. `/explore` is registered.
- **A defined visual identity:** `DESIGN.md` establishes an editorial-archival visual direction, Fraunces headings, Inter UI text, mono numerals, semantic color tokens, warm light/dark themes, and minimal motion.
- **A broader product vision:** `docs/roadmap/VISION-ARCHITECTURE.md` sets the institute-memory direction, calls for universal record search, provenance, entity-resolved graph navigation, and trustworthy retrieval. It explicitly distinguishes the current navigation palette from universal record search.

### Main gaps and risks seen in the code/docs

- **Navigation hierarchy is broad and terminology drifts.** The sidebar groups many modules, while analytics often appear as tabs or nested links within pages. Users may have to know a module name before they can find a specific analytical view. The header shows the active role rather than the current page, and there is no visible route breadcrumb in the shell.
- **The command palette is navigation, not record search.** It helps jump to app destinations but does not search staff, projects, instruments, documents, or other records. This limitation is also recorded in the standing vision document.
- **Connected patterns are only partly adopted.** Shared `EntityLink`, relation rails, chart filters, search, and export exist, but adoption is uneven. For example, the entity link is visibly used in Human Capital; the reusable infrastructure does not by itself guarantee that analytics charts link to filtered tables or that tables link consistently to details.
- **The table upgrade plan needs revision.** The current `DataTable` has more capability than the old visual-overhaul plan acknowledges, but it still uses page-based pagination and does not implement the plan’s proposed virtualization, per-column filters, or expanded detail rows. Existing options are opt-in, so coverage is not uniform.
- **Metric interpretation needs a shared contract.** Analytics should consistently state unit, period, population/scope, source/freshness, and definition. A label and chart alone can invite incorrect comparisons, especially for small or incomplete datasets.
- **Plan documents conflict or are stale.** `PLAN-visual-overhaul.md` describes some already-shipped work as future work and conflicts with the newer `DESIGN.md` on typography and visual direction. `.planning/STATE.md` and `.planning/ROADMAP.md` describe older May 2026 helpdesk work and should not be treated as authoritative current product status. `docs/roadmap/VISION-ARCHITECTURE.md` is the clearest future north star.
- **Backend verification remains environment-dependent.** The repository has mock-data support and provisioned Supabase behavior. This review cannot verify live role-specific results, freshness, RLS, persistence, or write flows without a configured signed-in environment.

### Findings from the local signed-in walkthrough (2026-10-31)

- **The account enters as Master Admin and can switch into another role.** The first screen is a working operational dashboard rather than a generic landing page. It has My Actions, Needs Attention, KPI tiles, charts, backend health, user/role administration, and division strength. The account also displays both DefaultUser and MasterAdmin grants; users with multiple roles need a clear explanation of the active role and which permissions it controls.
- **The shell is compact and consistent but under-labeled when collapsed.** At the observed desktop viewport the left rail shows icons only, the page title is the uppercase role name (“MASTER ADMIN”), and there is no breadcrumb or page title. Add accessible/visible hover tooltips and make the header identify the current page while keeping active role in its separate switcher.
- **A dashboard alert led to a dead route.** “6 divisions with no records” linked to `#/divisions-analytics`; selecting it returned to `#/` (the dashboard). The path is not registered in `src/App.tsx`, though the divisions analytics view is available through another navigation path. This is a concrete broken deep link and should be fixed before visual refinements.
- **Dashboard data needs a trust/consistency pass.** During the same visit, visible headline values changed after navigation/refresh (for example staff and equipment counts), and “Equipment” showed 181 total with 163 down. Several data-health alerts said core datasets had never been uploaded while populated records were visible. These may be timing, stale/mock, or metric-definition issues; show refresh/source/freshness state and investigate the counts before treating them as authoritative.
- **Urgency is not obvious from the action list.** Progress reports with due dates of 2026-06-12 appeared as “awaiting review” during the 2026-10-31 review, without a clear overdue label. The dashboard should sort and label overdue work explicitly, distinguish due date from submitted date, and avoid presenting stale deadlines as ordinary tasks.
- **The dashboard has useful breadth but weak prioritization.** My Actions, Needs Attention, a large KPI set, charts, backend status, a long user list, and division table all share one vertically scrolling surface. Keep the high-value action/data-quality summary at the top; move system administration and exhaustive registries into dedicated destinations or collapsible sections.
- **The current app visually follows the warm identity.** The observed surface uses parchment background, dark icon rail, warm terracotta accents, serif role heading, and restrained cards. Focus modernization on hierarchy, label clarity, evidence links, and trustworthy metric states rather than adding generic gradients or glass effects.

The walkthrough was read-only after sign-in; no user/role changes, data edits, or other administrative actions were made. A single alert destination was clicked to verify its navigation behavior.

## 4. Recommended information architecture

Keep the existing broad sections, but make each module’s entry page clearly lead to its records, analytics, and related entities. The exact labels should be checked with staff and role representatives before a large navigation rewrite.

| Global area | Primary destination | Natural connected destinations |
|---|---|---|
| Overview | Role dashboard and My Actions | Alerts, deadlines, data-quality/freshness issues, relevant module pages |
| People & organisation | Human Capital, Project Staff, PhD, Divisions, Recruitment | Person profile, division profile, workforce analytics, projects and outputs |
| Research portfolio | Projects, Proposals, Reports, Facilities, Partnerships, R&D Monitor | Project detail, PI/person, instrument, sponsor, outputs, budget and timeline |
| Governance & service | PMS, Committees, Helpdesk, Calendar | Report/evaluation, meeting/minutes/action, ticket, related person and dates |
| Intelligence | Ask SURYA, Institute analytics, Explore | Cited documents, source records, entity graph, saved views/search |
| Data & administration | Data Management, IRINS, feature/access controls | Import history, freshness, quality issues, audit trail, system settings |

Navigation behavior requirements:

- Keep the user’s active role and current location understandable at all widths.
- Use consistent page titles and breadcrumbs for nested views, with a clear return path to the parent list or analytics page.
- Indicate unavailable modules through the existing access behavior; do not expose restricted records through search previews or relationship panels.
- Preserve mobile quick actions, and make every destination reachable through the menu and keyboard navigation.
- Deep links should preserve relevant filters and selected entity context when moving between analytics and records.

## 5. Upgrade backlog

### P0 — Establish a reliable analytics-to-record journey

**Objective:** A user can start from a KPI or chart and reach the exact records behind it.

- Standardize the interaction: chart selection updates the page’s other charts and result table; an active-filter row explains the selection and provides one-action clearing; clicking a record opens its detail page.
- Pass filter state through URL query parameters where practical so links can be shared, bookmarked, and restored with browser back/forward.
- Use `EntityLink` consistently for staff, divisions, projects, instruments, and other supported entity types in charts, tables, dashboards, and related panels.
- Add concise hover/focus previews only when they improve scanning; every preview must also work by keyboard and touch through an explicit link or action.
- Make “no results,” “no data,” “not permitted,” and “data unavailable” distinct states.

**Acceptance criteria:** From a supported analytics chart, selecting a category visibly updates all relevant widgets and the row set; the active filter is named and removable; opening a row reaches the correct entity; browser back returns to the prior filter state; access rules are unchanged.

### P0 — Make metric meaning and data trust visible

**Objective:** Users can tell what a metric means and whether it is safe to compare.

- Define shared metric metadata: title, definition, unit, numerator/denominator when applicable, date window, population/scope, source, last refresh, and known caveat.
- Add a lightweight “About this metric” affordance to KPI/chart cards and include an accessible text summary for charts.
- Surface freshness/completeness and import-quality signals in the relevant dashboard or analytics page, with a direct link to the records or import history that need attention.
- Use explicit unavailable values (`—`, “No records,” or “Not reported”) rather than rendering missing values as zero.
- Add accessible chart/table alternatives and ensure color is not the only way to distinguish series or status.

**Acceptance criteria:** Every high-impact dashboard metric has a definition, period/scope, and source/freshness cue; missing and zero values are distinguishable; a chart’s key information can be understood without color or hover.

### P1 — Add universal record search, distinct from route navigation

**Objective:** Search finds records users are authorized to see, not just pages.

- Keep Ctrl/Cmd+K for fast navigation and add a separate, clearly named record search experience (or a deliberate unified palette with separate “Pages” and “Records” result groups).
- Search across authorized people, projects, divisions, instruments, publications/IP, committees, and indexed documents, with entity type and relevant facets.
- Search results should show a short preview, stable identifier where available, and the canonical detail destination. Document results should preserve citations/provenance.
- Apply the same authorization boundaries as the destination page and avoid leaking restricted labels, counts, or snippets.
- Add recent searches or saved searches only after the core search and permission model are reliable.

**Acceptance criteria:** A user can search for a known record by name/identifier, filter by type, open its canonical page, and never see restricted results; tests cover role boundaries and empty/error states.

### P1 — Make navigation and page context consistent

**Objective:** Users always know where they are and how to continue.

- Add route-derived breadcrumbs and consistent page headers (title, short purpose, primary action, optional date/scope controls).
- Audit all sidebar and in-page links for role visibility, active highlighting, dead ends, and duplicate labels. Keep the current grouped model unless usage evidence supports another structure.
- Provide sensible cross-links between related modules, for example division → staff/projects/outputs; person → projects/outputs/committees; project → team/reports/budget/instruments.
- Use a shared related-information pattern on detail pages; keep related sections permission-aware and avoid loading unrelated large datasets.
- Ensure all modals/sheets manage focus, Escape behavior, accessible names, and return focus to the opener.

**Acceptance criteria:** Every registered primary route is reachable through at least one authorized navigation path; nested pages show a correct parent path; keyboard users can open/close overlays and continue from the trigger.

### P1 — Bring analytics pages to one interaction standard

**Objective:** Analytics feel like one product even when each module has different measures.

- Create a reusable analytics page frame for title/context, date range, scope/filter controls, active filters, chart grid, result table, export, and loading/empty/error states.
- Standardize chart titles, legends, tooltip formatting, units, number/date formatting, and responsive behavior.
- Prefer comparison controls that match the data (period-over-period, division, category); do not imply trends where the data has no reliable time series.
- Ensure exports respect the selected filters and include useful column labels and the relevant period/scope in the filename or metadata.
- Pilot on Staff Analytics and Projects Analytics, then use Divisions, PhD, Recruitment, and Facilities as follow-on modules.

**Acceptance criteria:** Pilot pages share the same filter and export behavior; chart/table counts agree; loading, no-data, backend-error, and small-screen states have been reviewed.

### P2 — Upgrade table capability based on real workload

**Objective:** Make large and data-dense registries efficient without making small lists harder to use.

- Inventory `DataTable` call sites and record actual row counts, required columns, mobile use, exports, and sort/search expectations.
- Make existing sort/search/export/visibility options consistent on high-use registries; document intentional exceptions.
- Add multi-column filtering and expandable rows only where users need them. Add virtualization only where measured row count/render cost justifies it; keep pagination available for accessible navigation and export clarity.
- Persist table preferences only when stable table identity and privacy expectations are clear.
- Improve empty/no-match messaging and expose visible row count versus total count.

**Acceptance criteria:** Pilot tables work with keyboard and screen reader basics, maintain correct sorting/filter/export results, support representative large datasets without sluggish interaction, and remain usable on phone/tablet layouts.

### P2 — Refine dashboards around decisions, not card count

**Objective:** Each role’s first screen answers “what changed, what needs attention, and what can I do?”

- Keep “My Actions” and deadlines prominent, then show a small number of role-relevant institute/portfolio measures and trends.
- Make clickable KPIs lead to a scoped view that explains the number; show comparison period and caveat for deltas.
- Add a role-aware “data status” cue where a dashboard depends on stale or incomplete imports.
- Use the approved visual identity; prefer hierarchy, spacing, and meaningful chart forms over decorative glow or motion.
- Tune card order and density with representative role walkthroughs rather than applying one bento layout to every role.

**Acceptance criteria:** Each role can locate its top actions and core metrics quickly; every clickable metric has a useful destination; light/dark, reduced motion, and mobile states retain hierarchy and legibility.

## 6. Design and interaction principles

- Preserve the editorial-archival identity from `DESIGN.md`: warm paper and charcoal surfaces, ink-first typography, Fraunces display, Inter UI, tabular mono data, and restrained terracotta.
- Use stronger hierarchy and semantic status color before adding gradients, glass, glow, or animated effects. Motion should signal navigation or state and honor reduced-motion preferences.
- Design for dense institutional records: readable labels, aligned numeric values, visible units, predictable table columns, and clear focus states.
- Keep desktop power workflows and mobile checking/approval workflows both intentional. Do not shrink a desktop table until it becomes unusable.
- Treat accessibility, role permissions, and data provenance as product behavior, not final polish.

## 7. Suggested delivery sequence

| Slice | Work | Outcome |
|---|---|---|
| 0. Baseline | Inventory routes, analytics pages, `DataTable` options/call sites, entity link coverage, role permissions, and current data/refresh states. Resolve contradictory plan status. | Accurate, prioritized backlog with measurable baseline |
| 1. Fix dashboard trust and dead ends | Correct the `/divisions-analytics` alert destination; reconcile KPI calculations, refresh behavior, “never uploaded” alerts, and overdue task presentation. | Dashboard alerts and metrics lead to trustworthy, relevant action |
| 2. Connected analytics pilot | Standardize chart filters, chips, linked rows, URL state, metric context, and export on Staff + Projects Analytics. | A complete and repeatable chart → records → detail journey |
| 3. Navigation/context | Route-derived breadcrumbs, page header conventions, link audit, related entity links/rails on pilot detail pages. | Lower navigation friction and fewer dead ends |
| 4. Search | Design record-search source/index, permission model, facets, previews, and canonical destinations; keep page navigation distinct. | Searchable institutional records with access controls |
| 5. Scale the patterns | Extend shared analytics/table/search patterns to Divisions, PhD, Recruitment, Facilities, and other high-use modules; tune dashboards by role. | Coherent cross-module experience |
| 6. Validate and maintain | Role-based walkthroughs, responsive/accessibility review, performance checks on representative data, update feature and vision docs. | Reliable changes and trustworthy future plan |

Slices 1 and 2 can overlap after the baseline. Search has separate data/index and access-control dependencies and should not be treated as a visual-only task.

## 8. Verification checklist for future changes

- **Task completion:** Can a user go from dashboard signal to filtered records and detail, then return without losing context?
- **Role coverage:** Have the affected routes and search/relationship previews been checked for every relevant role, including restricted and pending-access states?
- **Data meaning:** Are definition, unit, period, scope, freshness, source, and caveats clear?
- **Interaction:** Do charts, filter chips, tables, exports, links, breadcrumbs, and browser history agree?
- **State handling:** Are loading, stale, empty, no-match, permission-denied, and backend-error states distinct?
- **Accessibility:** Keyboard operation, focus visibility/return, accessible chart summary, color-independent status, reduced motion, contrast, and screen-width behavior.
- **Performance:** Representative record counts; no avoidable full-dataset work in render; lazy routes remain useful; large tables remain responsive.
- **Documentation:** Update this brief’s status, feature reference, and the standing roadmap when a recommendation ships or is deliberately deferred.

## 9. Planning document guidance

- Treat `DESIGN.md` as the current visual-system contract.
- Treat `docs/roadmap/VISION-ARCHITECTURE.md` as the long-term product north star, especially for universal record search, record provenance, and the graph.
- Use this document as the prioritized UX/analytics development brief.
- Reconcile `PLAN-visual-overhaul.md` before scheduling more work from it: mark capabilities that already exist, revise recommendations that conflict with `DESIGN.md`, and remove speculative visual effects that do not support an identified workflow.
- Treat `.planning/STATE.md` and `.planning/ROADMAP.md` as historical context until their current milestone and verification status are reconciled with the main branch.

## 10. Limitations of this review

The signed-in walkthrough verified the local UI and one route behavior; it was not a full role matrix, RLS audit, or write-workflow validation. The app displayed a Supabase live health state, but the observed metric/freshness discrepancies were not traced to their backend cause. Before broad workflow changes, validate the pilot flows with representative roles and known-good data.

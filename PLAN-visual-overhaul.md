# PLAN — Visual Overhaul: Modern/Futuristic SURYA

> Approved direction: **evolve warm brand** (terracotta/parchment identity kept, modernized), executed **design-system-first, phased** (Approach A). Each phase ships independently; app never broken.

---

## Vision

SURYA today: flat ring-bordered cards, static paginated tables, text-first pages, warm palette used timidly. Target: same warm identity but rendered like a modern intelligence product — layered depth, motion, connected data you can *travel through*, dashboards that feel alive.

Signature motif: **the institute as a connected graph**. Appears on landing (animated canvas), in entity graph explorer, in hover-peek links. One idea threaded through the whole app.

---

## Phase 0 — Design System Foundation

Everything downstream inherits from this. No page redesigns yet.

### 0.1 Token expansion (`src/index.css`)
- **Elevation scale**: `--shadow-e1..e4` — soft layered shadows (warm-tinted, not gray) replacing flat `0 0 0 1px` ring borders as the primary depth cue. Rings stay for inputs/focus.
- **Gradient tokens**: `--gradient-hero` (parchment→ivory mesh), `--gradient-brand` (terracotta→coral), `--gradient-glow` (radial amber, for accents behind KPIs/headings).
- **Motion tokens**: `--ease-out-expo`, `--duration-fast/base/slow`. Shared spring config exported from a tiny `src/utils/motion.ts` (framer-motion variants: `fadeUp`, `staggerChildren`, `scaleIn`).
- **Refined dark mode**: warm near-black stays; add `--color-surface-raised` (dark mode needs 2 surface levels to show elevation), glow accents get higher alpha in dark.
- **Radius scale**: standardize on `rounded-xl` cards / `rounded-lg` controls (today it's mixed 8/12/16px ad hoc).
- **Grain/noise**: one reusable `.bg-grain` utility (inline SVG noise, low opacity) for hero surfaces.

### 0.2 Primitive upgrades (`src/components/ui/`)
- **Card**: variants `flat | raised | interactive` (interactive = hover lift + shadow-e3 + border warm-up). Today every page hand-rolls hover styles.
- **KpiCard**: animated count-up numbers (reuse Login's `useCountUp`, extract to `src/utils/` — it's currently trapped in Login.tsx), sparkline slot, delta chip (▲/▼ vs previous period), glow accent on hover.
- **Button**: gradient-brand primary variant, consistent focus ring, loading spinner state.
- **Skeleton**: shimmer animation (current is static pulse), shaped variants (table-row, kpi, card).
- **New: `Sheet`** (slide-over side panel, framer-motion) — needed by Phase 4 related-entity rails; built once here.
- **New: `HoverCard`** — floating peek card w/ delay + position logic; needed by Phase 4 hover links.

**Acceptance**: tokens defined, primitives updated, `npm run build` green, zero page-level visual regressions (pages still render with old flat look until phases below adopt).

---

## Phase 1 — DataTable v2

Highest leverage single file in the repo: ~15 pages render through `DataTable.tsx`.

### Deps
- `@tanstack/react-table` (headless — sorting/filtering/visibility logic, zero styling opinions)
- `@tanstack/react-virtual` (virtualized rows past ~100 records)

### Features
- **Sortable columns** — click header, tri-state, sort icon.
- **Global search box** + optional per-column filters (declared in `Column<T>` config).
- **Sticky header** inside scroll container; table gets max-height + virtual scroll instead of pagination for long lists (pagination stays as fallback prop).
- **Column visibility menu** — show/hide, persisted per-table in localStorage.
- **Density-aware rows** — respect existing `data-density` (compact/relaxed paddings via `--density-padding-base`).
- **Row expansion** — optional `renderExpanded(item)` prop: click chevron → inline detail panel (kills many "click through to detail page just to see 2 fields" trips).
- **CSV export** button (data already client-side; ~20 lines, papaparse already installed).
- **Row hover** — subtle raise + left accent bar (terracotta), not just bg change.
- **Motion**: rows stagger-fade on data change (AnimatePresence, capped to first ~20 rows).

### Migration
`Column<T>` interface extended backward-compatibly (`sortable?`, `filter?`, `renderExpanded?`). Existing call sites compile unchanged; pages opt into new features incrementally.

**Acceptance**: existing DataTable tests pass + new tests for sort/filter/visibility; HumanCapital and Projects pages exercised as pilots.

---

## Phase 2 — Landing + Login

Keep 3-section scroll story + right auth panel. Radical rework of rendering:

- **Animated network canvas** (hero background): slow-drifting nodes + edges in terracotta/coral on near-black — "institute as living graph". Pure canvas, ~100 lines, no dep. Respects `prefers-reduced-motion`.
- **Hero type**: SURYA in large serif with animated gradient sheen; tagline gets staggered word reveal on load.
- **Acronym cards** → magnetic hover (subtle pointer-follow tilt via framer-motion), letter glyph gets glow.
- **Section transitions**: scroll-triggered reveals (framer-motion `whileInView`), stats count up when scrolled into view (currently fire on 300 ms timer whether visible or not).
- **Quick links / news** → glass cards (`backdrop-blur` on translucent ivory) floating over canvas.
- **Auth panel** → floating glass card, gradient-brand submit button, input focus states in brand terracotta (currently random blue `#3898ec` — off-brand), error shake kept. Greeting block simplified.
- **Copy pass**: "Authenticate State" → "Sign In"; tone down "Strategic Access Layer" verbosity (flag for user review, not silently changed).
- Login page adopts Phase 0 tokens — kill ~40 hardcoded hex classes in Login.tsx.

**Acceptance**: `/login` verified in browser (light+dark, mobile+desktop), reduced-motion honored, auth flow untouched (form logic/AuthContext unchanged).

---

## Phase 3 — App Shell

- **Sidebar** → modern rail: collapsed = icon rail with tooltips, expanded = grouped nav with section labels; active item gets terracotta accent bar + soft glow; smooth width spring. User chrome (role switcher, avatar) anchored bottom.
- **Header**: prominent command-palette trigger styled as search field ("Search or jump to… ⌘K") — palette already exists, make it discoverable; breadcrumbs from route; theme/density/notification cluster right.
- **Page transitions**: route-level fade+rise (AnimatePresence around Outlet), 150 ms, reduced-motion safe.
- **Bento dashboards**: Dashboard + role views (`src/pages/dashboards/`) recomposed to bento grid — mixed-size tiles (hero KPI 2×2, sparkline tiles 1×1, chart tiles 2×1), staggered entry. Uses Phase 0 Card/KpiCard only; no new components.
- **Skeletons everywhere**: route-level Suspense fallbacks get shaped skeletons (routes already lazy-loaded).

**Acceptance**: nav works all roles, mobile drawer intact, browser-verified light/dark.

---

## Phase 4 — Data Connections (rising complexity)

### 4.1 Hover peek + deep links
- `EntityLink` component: staff/project/division name anywhere renders as subtle link → `HoverCard` (Phase 0) with mini profile (photo/name/designation/division for staff; title/PI/budget/status for project) + "Open →".
- Central `src/lib/entities.ts`: entity type → route, label, icon, peek fields. One registry, used by hover-cards, graph, side panels.
- Adopt in DataTable cells on pilot pages (HumanCapital, Projects, Divisions).

### 4.2 Related-entity side panels
- `Sheet` (Phase 0) + `RelatedRail` on detail pages (StaffDetail, ProjectDetail, InstrumentDetail): connected records grouped by type — person → projects/outputs/students/committees; project → team/equipment/outputs.
- Relations computed client-side in `useMemo` from existing `useData()` arrays (joins already done ad hoc on detail pages today — centralize in `src/lib/relations.ts`, tested).

### 4.3 Cross-filter dashboards
- `FilterContext` per analytics page: click chart segment (division bar, status pie slice) → sets shared filter → all widgets + table on page respond; active filter chips row with clear-all.
- Pilot: StaffAnalytics + ProjectsAnalytics. Pattern documented, other analytics pages adopt as touched.

### 4.4 Entity graph explorer
- Dep: `react-force-graph-2d` (canvas force layout, handles thousands of nodes).
- New page `/explore` (nav under Overview): institute graph — nodes = staff/divisions/projects (toggleable types), edges = works-in/leads/member-of. Click node → focus + `RelatedRail` sheet; double-click → detail page. Search-to-focus. Node color by type (chart palette), size by degree.
- Graph data built from `relations.ts` (same source as 4.2 — no second join layer).

**Acceptance per sub-phase**: browser-verified; relations.ts unit-tested; graph capped/perf-checked at full mock dataset.

---

## Order & Independence

```
0 tokens+primitives → 1 DataTable v2 → 2 landing/login → 3 shell → 4.1 → 4.2 → 4.3 → 4.4
```
Each phase = own branch/commit set, shippable alone. 4.x sub-phases individually shippable.

## New Dependencies (total 3)

| Dep | Why | Phase |
|-----|-----|-------|
| `@tanstack/react-table` | headless table logic | 1 |
| `@tanstack/react-virtual` | long-list virtualization | 1 |
| `react-force-graph-2d` | force-directed graph canvas | 4.4 |

Everything else: existing framer-motion, recharts, papaparse, CSS.

## Explicitly Out of Scope

- PMS page redesigns (adopt new primitives passively; no PMS-specific work)
- New backend/schema — all connection features use client-side data already in `DataContext`
- Icon set change, font change (Inter + Georgia stay)
- Light theme removal — both themes first-class

## Risks

- **Tanstack migration breaks a page silently** → `Column<T>` kept backward-compatible; pilot 2 pages before mass adoption; existing DataTable tests must pass.
- **Graph perf on full dataset** → canvas renderer chosen for this; cap initial render to filtered subset if needed.
- **Warm palette + glass/glow can turn muddy in dark mode** → Phase 0 defines dark-mode glow/surface tokens explicitly; every phase verified in both themes.
- **Landing canvas battery/CPU** → static fallback under `prefers-reduced-motion`, pause when tab hidden.

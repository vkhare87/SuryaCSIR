# PLAN — SURYA UI & Navigation Overhaul (Reference Guide)

> **Purpose:** Master reference & upgrade checklist for modernizing SURYA's UI and navigation feel while preserving its warm editorial-archival identity (*Digital Sun* — parchment, ivory, terracotta, Fraunces + Inter + IBM Plex Mono) and adding **zero new npm dependencies**.
>
> Companion to [DESIGN.md](./DESIGN.md) and [PLAN-visual-overhaul.md](./PLAN-visual-overhaul.md).

---

## Architecture Overview

Every phase ships independently and builds directly on React 19, Tailwind 4, Framer Motion 12, Lucide, and existing `DataContext` / `relations.ts` / `ask/client.ts` primitives:

```
Phase 0 (Tokens, Dark Luminance, Primitives)
   ├── Phase 1 (2-Tier Rail, Instant Shell, WorkspaceMenu, Real Breadcrumbs)
   │      ├── Phase 2 (Keyboard-First ⌘K Command Center + Recents)
   │      ├── Phase 3 (Ambient Ask SURYA Copilot Drawer — ⌘J)
   │      └── Phase 4 (Non-Destructive Quick Inspector — Peek & Slide)
   │             └── Phase 6 (Inline 1-Hop Neighborhood Graph + Focus Mode)
   └── Phase 5 (Living Executive Briefs + SVG Sparklines + Bento Dashboards)
```

---

## Anti-Bloat Guardrails

1. **0 new runtime dependencies** in `package.json`.
2. **GPU-only transitions** (`transform`, `opacity`) — never block route renders behind exit animations (`<AnimatePresence mode="wait">`).
3. **Lazy-loaded ambient overlays** — `AskSuryaDrawer` mounts only when opened.
4. **Zero extra network queries for navigation chrome** — sidebar badges and breadcrumbs derive from already-loaded contexts (`useData`, `usePMS`, `useAuth`).
5. **Respect `prefers-reduced-motion`** — already enforced globally via `<MotionConfig reducedMotion="user">` in `src/main.tsx` and CSS media queries in `src/index.css`.
6. **Monotonically shrink design debt** — never use raw Tailwind palette classes (`bg-white`, `text-slate-600`) or arbitrary hex (`[#...]`) in `src/`; use semantic tokens from `src/index.css` and run `node scripts/update-design-debt.mjs --write` after touching debt files.

---

## Phase Checklist

### Phase 0 — Design Tokens, Dark-Mode Luminance & Core Primitives
- [x] **`src/index.css`**: Refine `.dark` surface elevation ladder (`#141413` → `#1e1d1b` → `#282623` → `#32302c`), add `--shadow-dark-highlight`, `.glass-header`, and pure-CSS `.card-sheen` warm spotlight utility.
- [x] **`src/utils/motion.ts`**: Add shared `navSpring` and non-blocking `pageEnter` presets.
- [x] **`src/components/ui/Cards.tsx`**: Replace hardcoded `#c96442`/`#f0eee6` in `StatCard`, add `tabular-nums`, optional `sheen` pointer highlight, and dark top-edge luminance.
- [x] **`src/components/ui/Tabs.tsx`**: Add Framer Motion `layoutId` sliding active pill, `ArrowLeft`/`ArrowRight` keyboard switching, and `focus-visible:ring-focus-blue`.
- [x] **`src/components/SettingsModal.tsx`**: Remove hardcoded hex classes; fix `Mobile View` / `Desktop View` icons (`Smartphone` / `Monitor`).

### Phase 1 — Navigation Architecture & Instant App Shell
- [x] **`src/hooks/useNavBadges.ts`**: Memoized live urgency badges (`/work`, `/pms`, `/helpdesk`) with zero extra fetches.
- [x] **`src/components/layout/WorkspaceMenu.tsx`**: Unified Account & Workspace popover (Role Switcher, instant Solar Light / Deep Night toggle, Compact / Balanced / Spacious density, All Preferences, Sign Out).
- [x] **`src/components/layout/Sidebar.tsx`**:
  - Keep pinned **"For you"** role-ordered section at top (`PRIMARY_NAV[role]`).
  - Replace flat 30-item *"More"* wall with collapsible domain groups (expanded) and floating hover/focus flyouts (collapsed icon rail).
  - Add spring `layoutId="sidebar-active-pill"` indicator and live badge counters.
- [x] **`src/utils/pageTrail.ts` & `src/hooks/useEntityBreadcrumb.ts`**: Resolve actual record names/codes (`Projects › GAP-0421`, `Human Capital › Dr. Sharma`) instead of generic `"Details"`.
- [x] **`src/components/layout/Layout.tsx`**:
  - Remove `400ms` blocking `<AnimatePresence mode="wait">`; switch to instant `140ms` non-blocking enter transition.
  - Sticky frosted `.glass-header` with `⌘K` pill, `⌘J` Ask SURYA trigger, `NotificationBell`, and `WorkspaceMenu`.
  - Register global shortcuts: `⌘K` / `/` (Command Center), `⌘J` (Copilot Drawer), `Alt+F` (Focus Mode).
- [x] **`src/components/layout/Dossier.tsx`**: Sticky translucent tab bar + animated `layoutId` underline glider.

### Phase 2 — Keyboard-First `⌘K` Command Center
- [x] **`src/hooks/useRecentRoutes.ts`**: Persist last 6 visited pages/entities in `localStorage`.
- [x] **`src/components/CommandPalette.tsx`**:
  - Real `↑`/`↓`/`Enter`/`Home`/`End` keyboard navigation with `scrollIntoView`.
  - Unified sections: **Recent**, **Pages & Navigation** (all `canAccess`-filtered routes), **Quick Actions** (Theme, Density, Role Switch, Ask SURYA, Focus Mode), and **Records & Documents**.
  - Eliminate all hardcoded `#f0eee6`/`#5e5d59` colors for full dark-mode polish.

### Phase 3 — Ambient AI Copilot ("Ask SURYA Anywhere")
- [x] **`src/contexts/CopilotContext.tsx`**: Global drawer state + `inferRouteEntity(pathname)` auto-scoping to active Project / Staff / Instrument / Division.
- [x] **`src/components/AskSuryaDrawer.tsx`**: Lazy-loaded slide-over `Sheet` using `askSuryaStream` + `citationHref`, active context chip, 3 context-aware starter prompts, and *"Continue in full Ask SURYA ↗"* link.
- [x] **`src/components/AskAboutLink.tsx`**: Open `AskSuryaDrawer` in place (Cmd/Ctrl-click still opens `/ask?entity=…`).

### Phase 4 — Non-Destructive "Peek & Slide" Browsing (Quick Inspector)
- [x] **`src/components/QuickInspectorSheet.tsx`**: Reusable slide-over preview for `staff`, `project`, `division`, and `instrument` records with key metrics, `EntityLink` connections, *"Open Full Dossier ↗"*, and *"Ask SURYA"*.
- [x] **`src/components/ui/DataTable.tsx`**: Backward-compatible `onPeekRow` prop (row hover peek trigger + `Space` key on focused row) and subtle left terracotta accent bar on hover.
- [x] **Pilot Adoption**: Wire `QuickInspectorSheet` + `EntityLink` into `src/pages/HumanCapital.tsx`, `src/pages/Projects.tsx`, and `src/pages/Facilities.tsx`.

### Phase 5 — Living Executive Briefs & Telemetry-Driven Bento Dashboards
- [x] **`src/components/dashboard/LivingBriefHeader.tsx`**: Time-aware editorial Fraunces opening sentence with inline interactive metric pills (DESIGN.md R5).
- [x] **`src/components/viz/Sparkline.tsx`**: ~35-line pure-SVG sparkline for `KpiCard`'s `sparkline` slot.
- [x] **`src/pages/dashboards/DirectorView.tsx`**: Adopt `LivingBriefHeader`, `Sparkline` + `delta` in `KpiCard`, `sheen` on `HeroTile`, remove all hardcoded hex classes, upgrade Division Breakdown table to DESIGN.md R6 ledger styling.
- [x] **`src/pages/dashboards/ScientistView.tsx`**: Adopt `LivingBriefHeader` + Bento layout rhythm.

### Phase 6 — Inline 1-Hop Neighborhood Graph & Focus Mode
- [x] **`src/components/viz/MiniNeighborhoodGraph.tsx`**: Pure-SVG 1-hop radial graph over `src/lib/relations.ts` with hover highlight, node click navigation, and *"Expand in Graph Explorer ↗"*.
- [x] **`src/pages/StaffDetail.tsx` & `src/pages/ProjectDetail.tsx`**: Embed `MiniNeighborhoodGraph` in detail views.
- [x] **`src/hooks/useFocusMode.ts` & `src/components/layout/Layout.tsx`**: Distraction-free Focus Mode (`Alt+F`) for heavy authoring/review pages (`/pms/*`, `/proposals/*`, `/reports/*`).

---

## Rollout Pattern for Remaining Pages

When upgrading additional role dashboards (`DivisionHeadView`, `HoDView`, `HRAdminView`, `SystemAdminView`, `FinanceAdminView`) or directory tables:
1. Replace the static `<h1 className="... uppercase">` header with `<LivingBriefHeader kicker="..." greeting={...} summary={...} />`.
2. Pass `<Sparkline data={...} />` and `delta={...}` into `<KpiCard />`.
3. Pass `onPeekRow={row => setInspected({ kind: '...', id: ... })}` into `<DataTable />` and mount `<QuickInspectorSheet />`.
4. Replace any remaining hardcoded hex or raw Tailwind color utilities with semantic tokens from `src/index.css`, then run:
   ```powershell
   node scripts/update-design-debt.mjs --write
   npm test
   npm run lint
   npm run build
   ```

# Responsive Mobile & Tablet Pass — Design Spec

**Date:** 2026-05-25
**Status:** Approved direction; pending spec review
**Scope:** Priority user flows only. Tablet = small desktop.

---

## Goal

Make SURYA usable on phones (360px+) and tablets (768–1024px) without horizontal scrolling or cramped controls. Internal tool — pragmatic, not pixel-perfect.

## Decisions (locked)

- **Scope:** Priority flows first. Defer rarely-used admin pages (Data Import, DB Wizard, IRINS Sync, Holidays).
- **Tablet behavior:** Tablet = small desktop. Keep tables/charts/multi-column; sidebar already auto-collapses; grids drop to 2 columns. Desktop layout returns at `lg:` (1024px+).
- **Strategy:** CSS-first (Tailwind `sm:/md:/lg:` utilities) fixing shared primitives once. JS `useUI().isMobile` branching only where CSS can't express the change (table→card swap on pages without `renderGridItem`).
- **Min target width:** 360px.

## Non-goals

- No dedicated mobile routes or duplicate component trees.
- No redesign of admin-only pages this pass.
- No new dependency. Tailwind 4 utilities only.

---

## Current state (audit)

**Already responsive:**
- `Layout.tsx` — desktop sidebar (collapsible), tablet auto-collapse, mobile drawer + hamburger topbar.
- `UIContext.tsx` — JS breakpoints (mobile<768, tablet<1024, desktop) + manual AUTO/MOBILE/DESKTOP override.
- `DataTable.tsx` — auto-flips to card grid on mobile **only if** the page passes `renderGridItem`; tables otherwise get `overflow-x-auto`.
- `Login.tsx` — already responsive (done separately).

**Gaps:**
- Tables WITHOUT `renderGridItem` horizontal-scroll on phone: `PhDTracker`, `Proposals`, `Facilities`, `ProjectStaffRoster`, `Intelligence` (×2).
- Fixed multi-column KPI/stat grids that don't collapse on narrow widths.
- PMS multi-column forms likely overflow under `lg:`.
- Charts with fixed pixel widths.
- Icon-button tap targets below ~40px.
- Topbar on 360px: role-switcher + search + bell + avatar crowding.

---

## Priority flow pages (in scope)

1. Role dashboards (`src/pages/dashboards/*View.tsx`)
2. PMS self-report + review (`src/pages/pms/*`)
3. Human Capital / Staff (`HumanCapital.tsx` — already has cards)
4. PhD Tracker (`PhDTracker.tsx` — **needs card renderer**)
5. Projects (`Projects.tsx` — already has cards)
6. Proposals (`Proposals.tsx` — **needs card renderer**)
7. Facilities / Instruments (`Facilities.tsx` — **needs card renderer**)
8. Calendar (`Calendar.tsx`)
9. Helpdesk (`Helpdesk.tsx`)

Out of scope this pass: ProjectStaffRoster and Intelligence tables get `overflow-x-auto` left as-is (acceptable horizontal scroll) unless trivially fixable.

---

## Work units

### Unit 1 — Shared primitives (highest leverage)

**1a. `DataTable.tsx`** — make the no-`renderGridItem` path degrade gracefully.
- Today: pages without `renderGridItem` show a wide `overflow-x-auto` table on phone.
- Change: when `isMobile && !renderGridItem`, render a generic stacked "label: value" card per row built from `columns` (header = label, cell/accessor = value). Keeps every list readable on phone with zero per-page work, while pages that supply a custom `renderGridItem` still win.
- Acceptance: every DataTable list is readable at 360px with no horizontal scroll.

**1b. `Modal.tsx`** — bottom-sheet on phone.
- Change: `max-sm:` → full-width, bottom-anchored, `rounded-t-2xl`, `max-h-[92vh]`; `sm:` keeps centered dialog. Reduce body padding to `px-4 sm:px-6`.
- Acceptance: modal content reachable and dismissible at 360px.

**1c. `Cards.tsx` / `KpiCard.tsx`** — confirm card padding scales (`p-4 sm:p-6`) and no fixed widths.

### Unit 2 — Grid reflow sweep (priority pages)

- Replace fixed `grid-cols-4` / `grid-cols-3` KPI & stat rows with `grid-cols-2 lg:grid-cols-4` (tablet = 2, desktop = 4) per the tablet=small-desktop decision.
- Page-section two/three-column layouts → `grid-cols-1 lg:grid-cols-N`.
- Acceptance: no element wider than viewport at 360 / 768 / 1024.

### Unit 3 — Charts

- Wrap ReCharts in `ResponsiveContainer width="100%"` with a `min-h-[240px]` parent. Remove any fixed pixel `width`.
- Acceptance: charts fill column width, no clipping, at all three widths.

### Unit 4 — PMS forms

- Multi-column form rows → `grid-cols-1 lg:grid-cols-2`. Sticky action bars become bottom-fixed on phone if present.
- Acceptance: self-report + review forms fillable on phone, all fields visible.

### Unit 5 — Touch targets & topbar

- Icon buttons: min `h-10 w-10` (or `p-2.5`) tap area on touch.
- Topbar at 360px: hide search label (already `hidden md:inline`), verify role-switcher collapses to icon, ensure no overflow.
- Acceptance: all interactive controls ≥40px tap area; topbar fits 360px.

---

## Verification

Per unit, verify in the running preview at three widths: **360 (phone), 768 (tablet portrait), 1024 (desktop edge)**.
- `preview_resize` → `preview_screenshot` + `preview_snapshot` for overflow/structure.
- Check `preview_console_logs` for errors after each page.
- Typecheck (`npx tsc --noEmit`) + lint clean.

No element may exceed viewport width (no horizontal page scroll) at 360 and 768.

---

## Risks

- **Generic stacked card (1a)** may look plain vs hand-tuned cards — acceptable fallback; pages can opt into `renderGridItem` later.
- **Tablet=desktop** means some dense tables still need `overflow-x-auto` on tablet portrait — accepted by decision.
- PMS form sticky bars may need per-page tuning — handled in Unit 4.

## Sequencing

Unit 1 (primitives) first — propagates everywhere. Then 2 → 3 → 4 → 5 across priority pages. Each unit independently verifiable and committable.

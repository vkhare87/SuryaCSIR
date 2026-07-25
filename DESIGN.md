# Design System — SURYA

## Product Context
- **What this is:** Institutional management + analytics dashboard for CSIR-AMPRI (CSIR research institute, Bhopal) — HR data ops and a multi-stage scientist performance appraisal system (PMS).
- **Who it's for:** Scientists, technicians, HODs, division heads, HR/finance/system admins, PhD students, committee members — logged in daily, role-scoped views.
- **Space/industry:** Government research institute software. Peers are institutional portals and gov analytics dashboards — a category that defaults to cold blue-gray slate.
- **Project type:** Data-dense internal web app (React 19 + Tailwind 4, HashRouter SPA).

## The Memorable Thing
**"An institute that remembers."** Every design decision serves warmth without sacrificing legibility — SURYA should feel like a well-kept institutional register, not a generic SaaS admin template. This is the one thing that differentiates SURYA from every other blue-gray gov dashboard: warmth is the moat.

## Aesthetic Direction
- **Direction:** Editorial-archival — "the well-kept register." Paper ground, ink text, a ceremonial accent used sparingly.
- **Decoration level:** Intentional-minimal — typography and the ledger-table pattern do the work; no illustration, no gradients, no decorative blobs.
- **Mood:** Quiet recognition — opening a well-kept file with your name already on it. Not delight-for-delight's-sake; competence rendered warmly.
- **Origin:** Built upon the existing "Digital Sun" identity (codified 2026-07-18 via `/design-consultation`, informed by the 2026-07-18 `/design-review` audit which scored the pre-existing system B+ design / A anti-slop). Research: 2026 dashboard trends favor serif headlines + ledger-style numerals over generic sans-only UI ([muz.li](https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/)); gov portals converge on high-contrast, large-default-type, WCAG AA ([designrush](https://www.designrush.com/best-designs/websites/trends/best-government-institution-website-designs)). SURYA's existing warm-paper direction is ahead of the category curve, not behind it — the plan is to sharpen it, not replace it.

## Typography
- **Display/Hero:** **Fraunces** (variable, `opsz` axis) — replaces the system Georgia fallback. Georgia's ambitious grandchild: bookish, archival, unmistakably printed. `font-family: 'Fraunces', Georgia, serif;`
- **Body/UI:** **Inter** — kept as-is. Deliberately *not* swapped (rejected risk R4): it is the least-broken part of the current system and a body-font swap has the highest churn-to-value ratio of any considered change.
- **Data/IDs/scores/dates:** **IBM Plex Mono**, `font-variant-numeric: tabular-nums`. Every identifier, date, and score renders as a ledger *entry*, not UI chrome.
- **One Devanagari moment:** **Tiro Devanagari Sanskrit**, सूर्य set large, login screen only. Not decoration — a specific, deliberate acknowledgment of place.
- **Loading:** Google Fonts CDN (`Fraunces`, `Inter` already loaded, add `IBM+Plex+Mono`, `Tiro+Devanagari+Sanskrit`), `font-display: swap`.
- **Scale:** unchanged existing scale — kicker 12px / body 16px / h3 18-19px / h2 24-28px / h1 30-52px depending on context. No new scale introduced.

## Color
- **Approach:** Restrained — one ceremonial accent, semantic range for state.
- **Paper (background):** `#FAF9F5` — kept.
- **Card (surface):** `#F5F4ED` — kept.
- **Ink (text):** `#141413` — kept.
- **Stamp / terracotta (primary accent):** `#C96442` / `#D97757` — kept, but **scope narrowed**: primary CTAs, active/selected states, and the new stamped-seal component only. No longer a generic hover-accent sprinkled everywhere; scarcity is what makes it ceremonial. Existing `focus:ring-[#c96442]` usages are fine (focus is a "your action matters" moment).
- **Archive green (secondary):** `#3F5C46` (light) / `#7FA388` (dark) — secondary actions, `FINALIZED` seal.
- **Turmeric (pending/warning):** `#D9A441` (light) / `#E0B65E` (dark) — pending/attention states, `UNDER_EVALUATION_COMMITTEE_REVIEW` seal.
- **Iron-gall (links/data ink):** `#2B3A55` (light) / `#8FA3C4` (dark) — hyperlinks, data-emphasis text. New token; not yet used in code.
- **Semantic:** success = archive green, warning = turmeric, error = terracotta-adjacent rose (existing `rose-*` dark-variant pairs from the 2026-07-18 design-review pass), info = iron-gall.
- **Dark mode:** Warm charcoal, never slate. `#211E1A` ground / `#2A2622` card / `#EDE8DF` text / terracotta lifts to `#E07B57`. This is close to the existing `.dark` tokens in `src/index.css` (`#141413`/`#30302e`) — the new values are a slight warm-lift, not a rewrite; treat as a future refinement, not urgent.

## Spacing
- **Base unit:** 4px — unchanged.
- **Density:** existing `density-compact` / `density-medium` / `density-relaxed` modes — codified, no change.
- **Scale:** unchanged Tailwind default scale.

## Layout
- **Approach:** Grid-disciplined app UI — sidebar nav + `max-w-7xl` content column. Unchanged.
- **Grid:** existing `sm`/`md`/`lg` breakpoints only (no `xl`/`2xl` sprawl) — this discipline is correct, keep it.
- **Border radius:** existing hierarchical scale (`rounded-lg`/`rounded-xl`/`rounded-[12px]` etc.) — codify current usage, no new scale.

## Motion
- **Approach:** Intentional-minimal — unchanged. `framer-motion` page-transition fades already correct; `prefers-reduced-motion` already honored in `src/index.css`.
- **Easing/duration:** existing values are fine — no changes proposed.

## Implementation status (2026-07-25)

The 2026-07-25 audit found this document describing adopted risks as though
they had shipped. They mostly had not — R1 and R3 did not exist in the
codebase at all, and no font was ever loaded, so `--font-sans: 'Inter'` and
`--font-serif: Georgia-fallback` both silently rendered as `system-ui`. A
design doc that overstates what shipped is worse than none, because the next
session reads it as ground truth.

| Risk | Status | Where |
|------|--------|-------|
| R1 Fraunces | **Shipped** 2026-07-25 | `index.html` font links, `--font-serif` in `src/index.css` |
| R2 expanded ink palette | **Shipped** 2026-07-25 | `--color-archive-green`, `--color-turmeric`, `--color-iron-gall`; terracotta demotion is a slow drift-reversal, ongoing |
| R3 `<StatusSeal>` | **Shipped** 2026-07-25 | `src/components/pms/StatusSeal.tsx`; `pms/StatusBadge` now delegates to it, so all six PMS call sites render seals |
| R5 sentence-first greeting | Not implemented | — |
| R6 ledger tables | Partial | `SystemAdminView` only |

Also shipped 2026-07-25: IBM Plex Mono and Tiro Devanagari Sanskrit are now
actually fetched (both were specified below but never loaded), and the
design-token lint is enforced as an **error** outside a shrinking allowlist
(`eslint.design-debt.json`, `scripts/update-design-debt.mjs`) rather than
1083 warnings nobody could act on.

**Keep this table honest.** If you adopt a risk and do not build it, say so
here the same day.

## Adopted Risks (2026-07-18)

These are the deliberate departures from gov-software convention this session approved. Each is additive — existing pages keep working unstyled until touched.

1. **R1 — Fraunces display type.** Swap `--font-serif` from Georgia-fallback to Fraunces everywhere `font-serif`/`.heading` is used. Low-risk, single CSS variable + font link.
2. **R2 — Expanded ink palette, terracotta demoted to ceremonial.** Add `--color-archive-green`, `--color-turmeric`, `--color-iron-gall` tokens to `src/index.css` `@theme`. Migrate non-CTA terracotta usages to the new semantic tokens as pages are touched (do not mass-migrate — this is a slow drift-reversal, same pattern as the DEF-001 lint-rule task already queued from the 2026-07-18 design-review).
3. **R3 — Stamped status seals.** New `<StatusSeal>` component for PMS states (`DRAFT`/`SUBMITTED`/`UNDER_EVALUATION_COMMITTEE_REVIEW`/`FINALIZED`/`NOT_ASSESSED`/`UNDER_GRIEVANCE_REVIEW`) — mono type, pill border, 0.5–1° rotation, color-only-by-ink (no fill), replacing the current pill-badge pattern. Needs `aria-label` with the plain-text status (rotation/mono styling must not degrade screen-reader output) and must render legibly in the existing `@react-pdf` PMS report export (no CSS transform in PDF — seal renders as a plain bordered label there).
4. **R5 — Sentence-first dashboard greeting.** Each role dashboard (`src/pages/dashboards/*View.tsx`) opens with one composed Fraunces sentence — day/date, cycle status, pending-action count — above the KPI card grid, not instead of it. Requires real per-role data (already available via `useData()`); empty-DB dev environments will show a graceful fallback sentence.
5. **R6 — Ledger tables.** `DataTable`-pattern tables move to hairline row rules (no zebra striping), mono `tabular-nums` for all numeric columns, and a thin serial-number margin column in muted terracotta. Row height increases slightly — offset by existing `density-compact` mode for power users. Apply to `SystemAdminView` division-strength table first (already touched in the 2026-07-18 design-review fix pass), then `PMSReports`, `HumanCapital`.

**Deferred (not adopted this session):** R4 (Inter → Instrument Sans body swap) — highest churn, lowest signal; revisit only if Inter becomes a stated pain point.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-18 | Initial DESIGN.md created via `/design-consultation` | Codify + evolve the existing ivory/terracotta identity rather than replace it — audit same day scored current system B+/A. Scope = "build upon the current codebase" per user request. |
| 2026-07-18 | Memorable thing set: "An institute that remembers" | User-selected over "serious instrument" and "sun at the center" alternatives — matches existing serif+ivory+Devanagari cues already in the login page. |
| 2026-07-18 | Adopted R1, R2, R3, R5, R6; deferred R4 | User selected via AskUserQuestion — full risk set except the Inter body-font swap, judged highest-churn-lowest-value. |
| 2026-07-18 | Terracotta scope narrowed to ceremonial/CTA use | Subagent design voice ("Ledger Illuminated") argued scarcity makes the accent meaningful; adopted as R2. |

# SURYA — CSIR-AMPRI Management Dashboard

## What This Is

SURYA is an institutional management and analytics dashboard for CSIR-AMPRI, a CSIR research institute. It gives every staff member a role-scoped view of the institute's data — staff records, projects, PhD students, equipment, scientific outputs, and IP intelligence — while also serving as the live data management system for uploading and cleaning incoming Excel/CSV data. The app is as much an analytics platform as it is a data operations tool.

## Core Value

Every staff member logs in and sees their own slice of the institute — real data, real identity, role-appropriate scope.

## Requirements

### Validated

- ✓ React/TypeScript/Vite frontend with hash-based routing — existing
- ✓ Light/dark/system theme via CSS variables — existing
- ✓ Responsive layout with UIContext breakpoints — existing
- ✓ Staff, Projects, PhD Students, Equipment data views — existing
- ✓ DataContext dual-mode (Supabase + mock fallback) — existing
- ✓ Supabase client provisioning via Setup Wizard — existing
- ✓ Excel/CSV upload pipeline with SCHEMA_MAPS and batch upsert — existing
- ✓ Basic role hierarchy: User < Admin < MasterAdmin — existing

### Active

- [ ] **Complete UI redesign** — replace current blue-toned Tailwind UI with DESIGN.md design system (parchment canvas `#f5f4ed`, terracotta CTAs `#c96442`, Anthropic Serif/Sans typography, ring-based shadows, warm-only neutrals)
- [ ] **Real Supabase authentication** — replace hardcoded `MasterAdmin`/`Admin` credentials with actual Supabase Auth; staff log in with their own credentials
- [ ] **7 role-based dashboards** — Director, Division Head, Scientist, Technician (science track) and HR Admin, Finance/Project Admin, System Admin (admin track); each profile sees a tailored layout and data scope
- [ ] **Scientist portfolio view** — cross-table view connecting a scientist to all their projects, PhD students supervised, scientific outputs authored, and equipment used
- [ ] **Division scorecards** — KPI cards and charts per division: publication count, project funding, PhD completion rates, equipment utilization
- [ ] **Excel import with cleaning UI** — review and fix messy imported data before committing to Supabase; show column mapping, flag bad rows, allow inline edits
- [ ] **Cross-table search** — institute-wide search that surfaces connected records across tables (search a name → see staff card + projects + publications + PhDs)
- [ ] **scientific_outputs Supabase table** — wire up the existing mock to a real Supabase table with full CRUD
- [ ] **ip_intelligence Supabase table** — wire up the existing mock to a real Supabase table with full CRUD

### Out of Scope

- Exportable PDF/Excel reports — deferred; not needed for V1, adds significant scope
- Time-series trend analysis — deferred; charts for V1 are current-state KPIs, not historical trends
- PhD student direct login — PhD data managed by supervising scientist or admin; no student-facing auth
- Mobile-first design — responsive but desktop-primary; institute staff work on desktops

## Context

**Existing codebase:** React 18 + TypeScript + Vite + Tailwind CSS. The app is currently functional with mock data. Supabase is partially wired: `divisions`, `staff`, `projects`, `phd_students`, `equipment`, `project_staff` tables exist; `scientific_outputs` and `ip_intelligence` are mock-only. Auth is hardcoded — Supabase Auth not yet integrated.

**Design direction:** DESIGN.md describes the Claude/Anthropic design language — warm parchment canvas, Anthropic Serif for all headings, terracotta brand accent, ring-shadow depth system, and strict warm-only neutral palette. This is a full visual overhaul, not a theme tweak. The current blue-gray Tailwind aesthetic is being replaced.

**Role structure:** Two staff tracks exist at CSIR-AMPRI — scientific (Director → Division Head → Scientist → Technician) and administrative (HR Admin, Finance/Project Admin, System Admin). PhD students are not system users; their data is managed by supervisors.

**Data operations:** The institute receives data as Excel files. The existing `dataMigration.ts` handles parsing and batch-upsert but has no user-facing review step. A cleaning UI is needed before data is committed.

**V1 definition of done:** A staff member can log in with real credentials, see a dashboard scoped to their role, view and search real institute data, and admins can import and clean Excel data before saving.

## Constraints

- **Tech Stack**: React/TypeScript/Vite — established, not changing
- **Database**: Supabase — already provisioned, extending not replacing
- **Design**: Must follow DESIGN.md exactly — no cool grays, no heavy shadows, no sharp corners, Anthropic Serif weight 500 only
- **Auth**: Must use Supabase Auth — no third-party auth providers for V1
- **Data**: Real institute data exists in `Data/` Excel files — must be importable via the cleaning UI

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Full UI redesign vs theme update | DESIGN.md is a distinct design language, not a Tailwind theme extension — requires CSS variable overhaul and component rewrites | — Pending |
| Supabase Auth (not third-party) | Data is sensitive institutional records; keeping auth within Supabase reduces vendor surface area | — Pending |
| 7 distinct role dashboards | Each role has genuinely different data scope and actions; shared dashboard with toggles would create too many conditionals | — Pending |
| PhD students not given login | PhD data volume is low, supervisor-managed; adding another user class adds auth and UX complexity without clear V1 benefit | — Pending |
| Excel cleaning UI before commit | Raw institute Excel files are consistently messy; committing dirty data creates hard-to-fix DB state | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-07 after initialization*

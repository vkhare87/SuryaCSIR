# SURYA — Project Context

**Initialized:** 2026-05-07
**Repository:** C:\Users\HP\Desktop\Claude\Surya

## What This Is

SURYA is an institutional management + analytics dashboard for **CSIR-AMPRI** (CSIR research institute, Bhopal). Two halves: HR analytics & data ops (staff, divisions, projects, PhD students, equipment, scientific outputs, IP) and PMS (multi-stage scientist appraisal).

## Current Milestone: v1.0 Committees & Helpdesk

**Goal:** Add committee management (full governance suite) and helpdesk ticket system (auto-routed, category-based resolution) as two independent modules.

**Target features:**
- Committee roster with members, chairperson, secretary, mandate
- Meeting scheduling with agenda items, minutes, and document uploads
- Action item tracker with assignment, deadlines, and status pipeline
- Helpdesk ticket creation with 8 categories and auto-routing
- Ticket lifecycle: Open → InProgress → Resolved → Closed (RPC-gated)
- Ticket responses (conversation thread) and event timeline

## Key Decisions

1. **Approach B (SURYA-native):** Designed from scratch using SURYA patterns — no AHEAD code copied. Follows DataContext, Supabase RLS, PMS-style state machines.
2. **Separate modules:** Committees and helpdesk are independent — no shared ticket engine. Only shared UI primitives (status badges, assignment picker).
3. **Snake_case for new tables:** All new DB tables use snake_case (no legacy Excel headers to mirror).
4. **Auto-routing via DB function:** Category→assignment mapping stored in `helpdesk_routing` config table with `route_ticket()` function. Fallback chain: configured target → DivisionHead → SystemAdmin.
5. **Ticket state machine via RPCs:** Transitions enforced server-side (mirrors PMS pattern). No client-side `UPDATE status`.

## Context

- **Stack:** React 19, TypeScript 5.9 (strict), Vite 8, Tailwind CSS 4, Supabase, React Router 7 (HashRouter), ReCharts, Framer Motion, Lucide React
- **Conventions:** See CLAUDE.md for full coding rules. Key: DataContext for all data loading, semantic Tailwind tokens, relative imports, `interface` for entities, `export default function` for pages.
- **14 roles:** Director, DivisionHead, HOD, Scientist, Technician, HRAdmin, FinanceAdmin, SystemAdmin, MasterAdmin, Student, ProjectStaff, Guest, DefaultUser, EmpoweredCommittee
- **Existing features:** Staff directory, projects, PhD tracker, divisions, scientific intelligence (outputs + IP), facilities/instruments, recruitment, calendar, data import, PMS (12 evaluation dimensions, 6-state workflow)

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

*Last updated: 2026-05-07*

# Roadmap — SURYA

**Current Milestone:** v1.0 Committees & Helpdesk

---

## Phase 1: Foundation

**Goal:** Data layer for both modules — types, mock data, migration, DataContext extensions. Nothing visible yet, but both modules load from `useData()`.

**Requirements:** Sets data foundation for all CMT/HD requirements
**Depends on:** —

**Success criteria:**
1. Migration runs cleanly — all 9 tables + audit_log created with RLS policies
2. `npm run build` passes with new types (no type errors)
3. `useData()` returns `committees`, `meetings`, `actionItems`, `meetingDocs`, `tickets`, `ticketResponses`, `ticketEvents` arrays
4. Mock data populates in local/dev mode — 5 committees, 3 meetings each, 15-20 tickets visible

**Key artifacts:**
- `src/types/index.ts` — 9 new interfaces
- `src/utils/mockData.ts` — extended with committees + tickets seed data
- `src/utils/dataMapper.ts` — mapper functions for new entities
- `src/contexts/DataContext.tsx` — loading + role-scoping for new entities
- `supabase/migrations/20260507XXXXXX_committees_helpdesk.sql` — tables, RLS, RPCs, storage bucket

---

## Phase 2: Committee Management

**Goal:** Full committee governance module — list, detail, meetings, minutes, action items, document uploads.

**Requirements:** CMT-01, CMT-02, CMT-03, CMT-04, CMT-05, CMT-06, CMT-07, CMT-08
**Depends on:** Phase 1 (Foundation)

**Success criteria:**
1. `/committees` shows committee list with search + type/status filter
2. Admin can create committee with members (StaffPicker), edit, and delete
3. Committee detail has 3 working tabs: Overview, Meetings, Action Tracker
4. Chairperson/secretary can schedule meeting with agenda items (drag-to-reorder)
5. Minutes editor works — saves to Supabase, locks after 7 days (UI + RLS)
6. Document upload to Supabase Storage works — upload + download
7. Action items created from meeting or standalone, status toggles work
8. Action Tracker shows all items across committees with overdue highlight

**Key artifacts:**
- `src/pages/committees/CommitteeList.tsx`
- `src/pages/committees/CommitteeDetail.tsx`
- `src/pages/committees/MeetingDetail.tsx`
- `src/components/committees/CommitteeFormModal.tsx`
- `src/components/committees/MeetingFormModal.tsx`
- `src/components/committees/ActionItemModal.tsx`

---

## Phase 3: Helpdesk

**Goal:** Ticket system with 8 categories, auto-routing, response thread, RPC-gated state machine.

**Requirements:** HD-01, HD-02, HD-03, HD-04, HD-05, HD-06, HD-07, HD-08
**Depends on:** Phase 1 (Foundation) — independent of Phase 2

**Success criteria:**
1. `/helpdesk/new` creates ticket — 8-category grid, urgency selector, routing preview
2. Ticket token auto-generated (AMPRI-YYMMDD-XXX format)
3. Auto-routing assigns ticket to correct handler based on category mapping
4. `/helpdesk` left panel shows filtered ticket list; right panel shows detail
5. Handler can respond and transition status (Open→InProgress→Resolved) via RPC
6. Admin can view all, reassign, force-close any ticket
7. Ticket detail shows full response thread + event timeline
8. Submitter can close own resolved ticket; stale resolved tickets auto-close at 14 days

**Key artifacts:**
- `src/pages/helpdesk/Helpdesk.tsx`
- `src/pages/helpdesk/TicketForm.tsx`
- `src/pages/helpdesk/TicketDetail.tsx`
- `src/lib/helpdesk/ticketRPCs.ts` — RPC wrappers for state transitions
- `src/lib/helpdesk/routing.ts` — category-to-handler mapping
- Supabase: `route_ticket()`, `helpdesk_update_status()`, `helpdesk_assign_ticket()` RPCs

---

## Phase 4: Integration & Polish

**Goal:** Wire everything together — navigation, routes, audit log, shared UI components.

**Requirements:** INT-01, INT-02, INT-03
**Depends on:** Phase 2, Phase 3

**Success criteria:**
1. Committees and Helpdesk links appear in sidebar for all authenticated users
2. All 6 routes registered in App.tsx with correct role protection
3. Audit log captures committees + helpdesk changes; viewable at `/pms/audit` (extend)
4. `StatusBadge` promoted from `src/components/pms/` to `src/components/ui/`
5. `StaffPicker` component extracted (reused in committee members + ticket assignment)
6. Both modules work end-to-end: create committee → schedule meeting → write minutes → create action item; create ticket → auto-route → respond → resolve → close

**Key artifacts:**
- `src/components/layout/Layout.tsx` — new nav items
- `src/App.tsx` — new routes + protection
- `src/components/ui/StatusBadge.tsx` — promoted from PMS
- `src/components/ui/StaffPicker.tsx` — new shared component
- `src/components/ui/Timeline.tsx` — new shared component

---

## Dependency Graph

```
Phase 1 (Foundation)
    ├──▶ Phase 2 (Committees)
    │       └──▶ Phase 4 (Integration)
    │                    ◀──┘
    └──▶ Phase 3 (Helpdesk)
```

Phases 2 and 3 are parallel after Phase 1.

---

## Requirement Coverage

| REQ-ID | Phase | Description |
|--------|-------|-------------|
| CMT-01 | 2 | Committee list with search/filter |
| CMT-02 | 2 | Committee CRUD + member management |
| CMT-03 | 2 | Committee detail (3 tabs) |
| CMT-04 | 2 | Meeting scheduling + agenda items |
| CMT-05 | 2 | Meeting minutes with auto-lock |
| CMT-06 | 2 | Document upload/download |
| CMT-07 | 2 | Action item CRUD + status toggles |
| CMT-08 | 2 | Action Tracker (cross-committee) |
| HD-01 | 3 | Ticket creation form |
| HD-02 | 3 | Auto-routing on create |
| HD-03 | 3 | Ticket list with filters |
| HD-04 | 3 | Responses + status transitions |
| HD-05 | 3 | Admin view-all + reassign |
| HD-06 | 3 | Ticket timeline + response thread |
| HD-07 | 3 | Close ticket (submitter + auto-close) |
| HD-08 | 3 | Auto-generated ticket token |
| INT-01 | 4 | Sidebar navigation |
| INT-02 | 4 | Route registration + protection |
| INT-03 | 4 | Audit log integration |
| INT-04 | 1 | RLS policies (built into migration) |

**Coverage:** 20/20 requirements mapped (100%)

---

*Last updated: 2026-05-07*

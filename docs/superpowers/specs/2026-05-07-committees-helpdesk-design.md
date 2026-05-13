# Committees & Helpdesk — Design Spec

**Date:** 2026-05-07
**Status:** Approved
**Approach:** SURYA-native (Approach B)

## Overview

Two independent modules for CSIR-AMPRI institutional management:

1. **Committee Management** — full governance suite: committee roster, meeting minutes, agenda items, action item tracker, document uploads
2. **Helpdesk** — ticket system where any staff member raises a ticket, auto-routed by category to the appropriate division/role for resolution

Both are separate modules with no shared ticket engine. They share only UI primitives (status badges, staff assignment picker) and reference the same `staff` table.

---

## Data Model

All tables use snake_case column names. RLS enabled on every table.

### Committees Domain

**committees**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| committee_type | text | Standing / AdHoc / Review / Advisory |
| mandate | text | |
| chairperson_id | text | → staff."ID" |
| secretary_id | text | → staff."ID" |
| status | text | Active / Inactive |
| formed_date | date | |
| created_at | timestamptz | |

**committee_members** (bridge table)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| committee_id | uuid → committees.id | |
| staff_id | text → staff."ID" | |
| role | text | Member / Invitee / ExternalExpert |

**meetings**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| committee_id | uuid → committees.id | |
| meeting_date | date | |
| venue | text | |
| title | text | |
| summary | text | minutes text |
| status | text | Scheduled / Completed / Cancelled |
| created_at | timestamptz | |

**agenda_items**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| meeting_id | uuid → meetings.id | |
| sequence | int | |
| description | text | |
| proposed_by | text → staff."ID" | |
| status | text | Pending / Discussed / Deferred |

**action_items**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| meeting_id | uuid → meetings.id | nullable (manual items) |
| source | text | meeting / manual |
| task | text | |
| assigned_to | text → staff."ID" | |
| deadline | date | |
| status | text | Pending / InProgress / Completed |
| completed_at | timestamptz | nullable |
| notes | text | |

**meeting_documents**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| meeting_id | uuid → meetings.id | |
| file_name | text | |
| storage_path | text | Supabase Storage key |
| uploaded_at | timestamptz | |

### Helpdesk Domain

**tickets**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| token | text | AMPRI-{YY}{MM}{DD}-{seq} |
| subject | text | |
| category | text | Infrastructure / EquipmentIT / Administrative / HRGrievance / Finance / LabResearch / Library / Transport |
| urgency | text | Low / Medium / High / Critical |
| description | text | |
| submitted_by | text → staff."ID" | |
| assigned_to | text → staff."ID" | nullable, auto-routed on create |
| status | text | Open / InProgress / Resolved / Closed |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| resolved_at | timestamptz | nullable |

**ticket_responses**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| ticket_id | uuid → tickets.id | |
| author_id | text → staff."ID" | |
| message | text | |
| created_at | timestamptz | |

**ticket_events** (audit timeline)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| ticket_id | uuid → tickets.id | |
| event_type | text | Created / Assigned / StatusChanged / Resolved / Closed / Reopened |
| actor_id | text → staff."ID" | |
| details | jsonb | machine-readable snapshot |
| created_at | timestamptz | |

### Shared

**audit_log**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| entity_type | text | committee / meeting / action_item / ticket / ticket_response |
| entity_id | uuid | |
| action | text | created / updated / deleted / status_changed |
| actor_id | text → staff."ID" | |
| changes | jsonb | before/after diff |
| created_at | timestamptz | |

---

## Routes

```
/committees                        → CommitteeList.tsx
/committees/:id                    → CommitteeDetail.tsx
/committees/:id/meetings/:meetId   → MeetingDetail.tsx
/helpdesk                          → Helpdesk.tsx
/helpdesk/new                      → TicketForm.tsx
/helpdesk/:ticketId                → TicketDetail.tsx
```

### Navigation

Both pages added to sidebar under new section. Visible to all authenticated users.

---

## State Machines

### Ticket Workflow

```
Open → InProgress → Resolved → Closed
  │       │            │           │
  └───────┴────────────┴───────────┘ (reassign at any state)
                                    │
  Closed ──→ Reopened ──→ InProgress → ...
```

Transitions enforced via Supabase RPCs (never client-side `UPDATE status`):
- `helpdesk_create_ticket` — inserts ticket + routes assignment
- `helpdesk_update_status` — validates transition, logs event
- `helpdesk_assign_ticket` — reassigns handler

### Auto-Routing

Category-to-assignment mapping via database function `route_ticket(category, submitter_id)`:

| Category | Routes To |
|----------|-----------|
| Infrastructure | Division with "Administration" / "Facility Group" |
| EquipmentIT | Division with equipment responsibility |
| Administrative | HRAdmin role |
| HRGrievance | HRAdmin role |
| Finance | FinanceAdmin role |
| LabResearch | DivisionHead of submitter's division |
| Library | Division with library responsibility |
| Transport | DivisionHead of "Administration" |

Fallback: submitter's DivisionHead.

**Routing config:** A `helpdesk_routing` config table stores `(category, target_type, target_id)` rows. `target_type` is `division` or `role`. On ticket creation, `route_ticket()` function resolves the target: for `division`, finds the division's HoD; for `role`, finds any active user holding that role. If resolution fails, falls back to submitter's DivisionHead. If that also fails, routes to SystemAdmin.

### Meeting / Action Item States

Meetings: Scheduled → Completed | Cancelled
Action Items: Pending → InProgress → Completed (simple, no RPC gate)

**Minutes lock:** RLS policy prevents UPDATE on meetings.summary when `status = 'Completed' AND meeting_date < NOW() - INTERVAL '7 days'`. Admins bypass via SECURITY DEFINER override function. UI also disables the edit button on the same condition (soft gate, avoids failed requests).

**Ticket auto-close:** A Supabase scheduled job (pg_cron or edge function) sets `status = 'Closed'` on tickets where `status = 'Resolved' AND updated_at < NOW() - INTERVAL '14 days'`. The submitter can also manually close any time via RPC.

---

## Permissions

### Committees

| Action | Scientist | DivHead | HOD | Director | HRAdmin | SysAdmin | MasterAdmin |
|--------|-----------|---------|-----|----------|---------|----------|-------------|
| View all | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/Edit committee | - | - | - | ✓ | - | ✓ | ✓ |
| Delete committee | - | - | - | - | - | - | ✓ |
| Schedule meeting | - | if chair/sec | if chair/sec | if chair/sec | - | ✓ | ✓ |
| Write minutes | - | if chair/sec | if chair/sec | if chair/sec | - | ✓ | ✓ |
| Edit action items | - | ✓ | ✓ | ✓ | - | ✓ | ✓ |

### Helpdesk

| Action | Submitter | Handler | DivHead | HRAdmin | SysAdmin | MasterAdmin |
|--------|-----------|---------|---------|---------|----------|-------------|
| Create ticket | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View own + assigned | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View all tickets | - | - | division only | ✓ | ✓ | ✓ |
| Respond | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Change status | - | ✓ (→Resolved) | ✓ | ✓ | ✓ | ✓ |
| Close ticket | ✓ (own) | - | ✓ | ✓ | ✓ | ✓ |
| Reassign | - | - | - | ✓ | ✓ | ✓ |

---

## Component Tree

**Committees:**
```
CommitteeList.tsx — sidebar + 3-tab main (Overview | Meetings | Action Tracker)
CommitteeDetail.tsx — single-committee view, same 3 tabs scoped
MeetingDetail.tsx — agenda, action items, document upload, minutes editor
Modals: CommitteeFormModal, MeetingFormModal, ActionItemModal
```

**Helpdesk:**
```
Helpdesk.tsx — left panel (ticket list) + right panel (detail), filters
TicketForm.tsx — category selector grid, form, auto-routing preview
TicketDetail.tsx — conversation thread, timeline, admin tray
```

---

## Data Flow

Follows SURYA's 5-file pattern per entity:
1. Type → `src/types/index.ts`
2. Mock → `src/utils/mockData.ts` (extend)
3. Mapper → `src/utils/dataMapper.ts` (extend)
4. Context → `src/contexts/DataContext.tsx` (extend)
5. Migration → `supabase/migrations/` (new file)

Pages consume via `useData()` only. Never call Supabase directly.

---

## Build Order

| Step | What | Verify |
|------|------|--------|
| 1 | Types + mock data + migration | Tables exist, types compile |
| 2 | DataContext extensions | `useData()` returns committees + tickets |
| 3 | Committee list + detail + form modal | CRUD committees, view members |
| 4 | Meetings + agenda items + action items | Full meeting workflow |
| 5 | Document upload for meetings | Files upload to Supabase Storage |
| 6 | Helpdesk ticket list + detail + form | Tickets created, viewed, filtered |
| 7 | Auto-routing + ticket RPCs | Ticket lifecycle transitions |
| 8 | Ticket responses + timeline | Conversation + event history |
| 9 | Audit log integration | Changes logged for both modules |
| 10 | Navigation + route registration | Sidebar links appear, routing works |

Steps 3-5 and 6-8 are independent after foundation (1-2).

---

## Migration File

Single file: `supabase/migrations/20260507XXXXXX_committees_helpdesk.sql`

Creates 10 tables (9 domain + audit_log), 3 RPCs, 1 storage bucket, RLS policies for all.

---

## Storage

Supabase bucket: `committee-docs` — meeting document uploads. RLS: chairperson, secretary, and admins can upload; all authenticated can read.

# Phase 3: Helpdesk — Research

**Researched:** 2026-05-10
**Domain:** Helpdesk ticket system — React 19 frontend with Supabase backend, RPC-gated state machine
**Confidence:** HIGH

## Summary

Phase 3 builds a helpdesk ticket system on top of Phase 1's data layer foundation. All types (`Ticket`, `TicketResponse`, `TicketEvent`), mock data (20 tickets, 10 responses, 13 events), DataContext loading, and database tables/RPCs already exist. The phase delivers three pages (`Helpdesk.tsx`, `TicketForm.tsx`, `TicketDetail.tsx`), a `src/lib/helpdesk/` module with permissions and RPC wrappers, and additional Supabase RPCs for reassignment and response insertion.

The architecture follows the established SURYA pattern: pages consume data via `useData()`, write operations go through Supabase RPCs (SECURITY DEFINER to bypass RLS), and all derived data is wrapped in `useMemo`. This phase is independent of Phase 2 (committees) but depends on Phase 1's data layer.

**Primary recommendation:** Follow the PMS state-machine pattern exactly — status transitions are RPC-gated, never patched client-side. The existing migration provides `helpdesk_create_ticket` and `helpdesk_update_status`; this phase must add `helpdesk_assign_ticket` and `helpdesk_add_response` RPCs as a new migration (existing migration cannot be edited per project rules).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ticket creation + token generation | Database (Supabase RPC) | Browser (React form) | Token generation + routing DB-side for atomicity; form is pure UX |
| Auto-routing (category→handler) | Database (Supabase RPC) | — | `route_ticket()` resolves categories via `helpdesk_routing` config table |
| Ticket list with filters | Browser (React/useMemo) | — | All data loaded via `useData()`, filtering is client-side computation |
| Status transitions | Database (Supabase RPC) | Browser (React button) | `helpdesk_update_status` validates transitions server-side; UI just calls RPC |
| Response thread display | Browser (React) | — | Composited from `ticketResponses` + `staff` arrays via `useMemo` |
| Response submission | Database (Supabase RPC) | Browser (React form) | Needs SECURITY DEFINER RPC — current RLS blocks non-admin writes |
| Admin reassignment | Database (Supabase RPC) | Browser (React modal) | `helpdesk_assign_ticket` — new RPC to create in this phase |
| Timeline display | Browser (React) | — | `ticketEvents` array rendered as vertical timeline with lucide icons |
| Auto-close stale resolved | Database (pg_cron/job) | — | Out of scope for Phase 3 — DB infrastructure task |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Segmented controls + dropdown for filters. Status as horizontal segments (All|Open|InProgress|Resolved|Closed). Category and urgency as dropdown multi-selects. Pills pattern rejected — doesn't scale to 16 pills (8 categories + 4 urgency + 4 status).
- **D-02:** Default view = "My Tickets" tab (tickets submitted by me). Role-scoped: handlers also see their assigned tickets within this tab.
- **D-03:** Urgency displayed as color-coded badge on each ticket list item. Follows PMS StatusBadge pattern. List auto-sorted by urgency (Critical→High→Medium→Low) then by date.
- **D-04:** 2-tab assignment scope: "My Tickets" | "Assigned to Me". Admin roles (HRAdmin/SystemAdmin/MasterAdmin) see additional "All" button for full access.
- **D-05:** Support-ticket post style for responses. Linear posts with author name, role badge, and timestamp in header. Full-width, not alternating sides. No chat bubbles — professional helpdesk look.
- **D-06:** Stacked layout on TicketDetail. Response thread occupies top section (~70%) with collapsible event timeline below. Both visible without tab switching.
- **D-07:** Collapsible reply input. "Reply" button expands textarea + submit button. Not always visible — preserves vertical space for reading threads.
- **D-08:** Vertical timeline with lucide-react icons per event type. Events connected by vertical line. Icons: Created (CirclePlus), Assigned (UserCheck), StatusChanged (ArrowRightCircle), Resolved (CircleCheck), Closed (CircleX), Reopened (RotateCcw).

### Carried Forward from Phase 1
- Auto-routing via `route_ticket()` DB function with config table `helpdesk_routing`
- Routing config managed via DB Wizard tab on `/db-wizard` (Phase 1 D-05)
- Fallback chain: DivisionHead → HRAdmin → SystemAdmin (Phase 1 D-07)
- Single target per category, one row per category (Phase 1 D-08)
- Ticket state machine via RPCs only, no client-side status patches
- Token format: AMPRI-YYMMDD-XXX (auto-generated on create)

### Claude's Discretion
- Category grid visual design on TicketForm (8-category selector — icon cards, button grid, or list)
- Master-detail empty state + mobile responsive behavior
- Exact urgency badge colors (Critical/High/Medium/Low)
- Exact timeline event type → icon mapping (use lucide-react icons as noted in D-08)
- Filter dropdown design (placement, multi-select UX, clear/reset behavior)
- "Reply & Resolve" button behavior on response input
- Admin tray contents on TicketDetail (reassign button, force-close, status override)

### Deferred Ideas (OUT OF SCOPE)
- Category grid design — icon cards vs button grid. Deferred to Claude's discretion.
- Master-detail mobile behavior. Deferred to Claude's discretion.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HD-01 | Any authenticated staff can create a ticket with subject, category (8 options), urgency, and description | TicketForm page; calls `helpdesk_create_ticket` RPC; 8-category grid (D-01 design pattern) |
| HD-02 | System auto-routes new ticket; routing preview shown before submit | `route_ticket()` DB function already exists in migration; preview via `routing.ts` client-side lookup |
| HD-03 | Staff can view own + assigned tickets with filter by status, category, urgency | Helpdesk master-detail page; segmented controls (status) + dropdowns (category, urgency); `useMemo` filtering |
| HD-04 | Handler can respond and transition status (Open→InProgress→Resolved) via RPC | TicketDetail reply thread; `helpdesk_update_status` RPC (exists); `helpdesk_add_response` RPC (new) |
| HD-05 | Admin can view all, reassign handler, and force-close any ticket | "All" tab for admin roles; admin tray on TicketDetail; `helpdesk_assign_ticket` RPC (new) |
| HD-06 | Ticket detail shows full timeline + response thread | TicketDetail stacked layout (D-06); vertical timeline with lucide icons (D-08) |
| HD-07 | Submitter can close own resolved ticket; stale resolved auto-close at 14 days | Client-side close button (gated by permissions); auto-close is DB infrastructure (out of scope for Phase 3 UI) |
| HD-08 | Each ticket gets auto-generated token in format AMPRI-YYMMDD-XXX | Token generated by `helpdesk_create_ticket` RPC — already implemented in migration |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.5 | UI framework | Project standard [VERIFIED: package.json] |
| TypeScript | 5.9 | Type safety (strict mode) | Project standard [VERIFIED: CLAUDE.md] |
| React Router | 7.14.1 | Client routing (HashRouter) | Project standard [VERIFIED: package.json] |
| @supabase/supabase-js | 2.103.0 | Backend (DB, Auth, RLS, RPCs) | Project standard [VERIFIED: package.json] |
| Tailwind CSS | 4.x | Styling (via @tailwindcss/vite) | Project standard [VERIFIED: CLAUDE.md] |
| lucide-react | 0.577.0 | Icons (timeline, categories, nav) | Project standard [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| framer-motion | 12.38.0 | Animations (collapsible reply, timeline) | Collapsible reply input expansion; vertical timeline appearance [VERIFIED: package.json] |
| clsx | 2.1.1 | Conditional class composition | All component className building [VERIFIED: package.json] |
| vitest | 4.1.5 | Unit testing (permissions, routing) | `src/lib/helpdesk/*.test.ts` [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom RPC wrapper (fetch-based) | Supabase `.rpc()` | `.rpc()` is the project standard — already used in PMS. Typesafe, handles auth header. |

**Installation:** No new dependencies needed. All libraries already in package.json from Phase 1.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ BROWSER (React)                                             │
│                                                             │
│  /helpdesk/new         /helpdesk            /helpdesk/:id   │
│  TicketForm.tsx  ──►  Helpdesk.tsx   ──►  TicketDetail.tsx │
│       │               │     │               │     │         │
│       │               │     │               │     │         │
│  ┌────▼────┐    ┌─────▼──┐  │    ┌──────────▼──┐  │         │
│  │Category │    │Filter  │  │    │Response      │  │         │
│  │Grid     │    │Panel   │  │    │Thread (70%)  │  │         │
│  │+ Form   │    │+ Ticket│  │    │+ Reply Input │  │         │
│  │+ Routing│    │List    │  │    │+ Timeline    │  │         │
│  │Preview  │    │(sorted)│  │    │(30%)         │  │         │
│  └────┬────┘    └────┬───┘  │    └──────┬───────┘  │         │
│       │              │      │            │          │         │
│  ┌────▼──────────────▼──────▼────────────▼──────────▼────┐  │
│  │  src/contexts/DataContext.tsx (useData)               │  │
│  │  tickets[] | ticketResponses[] | ticketEvents[]       │  │
│  │  staff[]   | committees[] (for routing preview)       │  │
│  └───────────────────────┬──────────────────────────────┘  │
│                          │                                  │
│  ┌───────────────────────▼──────────────────────────────┐  │
│  │  src/lib/helpdesk/                                    │  │
│  │  permissions.ts  |  ticketRPCs.ts  |  routing.ts      │  │
│  └───────────────────────┬──────────────────────────────┘  │
└──────────────────────────┼─────────────────────────────────┘
                           │  supabase.rpc() / supabase.from()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ SUPABASE (PostgreSQL)                                       │
│                                                             │
│  Tables:                    RPCs (SECURITY DEFINER):        │
│  ┌──────────────────┐      ┌──────────────────────────────┐│
│  │ tickets          │      │ helpdesk_create_ticket()     ││
│  │ ticket_responses │      │ helpdesk_update_status()     ││
│  │ ticket_events    │      │ helpdesk_assign_ticket() ★   ││
│  │ helpdesk_routing │      │ helpdesk_add_response() ★    ││
│  └──────────────────┘      │ route_ticket() (helper)      ││
│                            └──────────────────────────────┘│
│  ★ = new in Phase 3                                       │
│                                                             │
│  RLS Policies:                                             │
│  SELECT → all authenticated                               │
│  ALL (INSERT/UPDATE/DELETE) → admin roles only             │
│  (RPCs bypass RLS via SECURITY DEFINER)                    │
└─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── pages/helpdesk/
│   ├── Helpdesk.tsx          # Master-detail: left panel (list) + right panel (detail)
│   ├── TicketForm.tsx        # Create ticket: 8-category grid, form, routing preview
│   └── TicketDetail.tsx      # Response thread + timeline + admin tray
├── lib/helpdesk/
│   ├── permissions.ts        # Pure functions: canCreateTicket, canRespond, canTransition, etc.
│   ├── permissions.test.ts   # Unit tests for permission functions
│   ├── ticketRPCs.ts         # Wrappers: createTicket(), updateStatus(), addResponse(), assignTicket()
│   └── routing.ts            # Category-to-handler lookups for preview (client-side mirror of DB)
├── components/helpdesk/      # (optional) shared sub-components if needed
│   └── (none required — pages self-contained per SURYA convention)
└── supabase/migrations/
    └── 20260510XXXXXX_helpdesk_rpcs.sql  # NEW: helpdesk_assign_ticket + helpdesk_add_response RPCs
```

### Pattern 1: RPC-Gated State Machine (mirrors PMS)

**What:** All ticket status changes go through Supabase RPCs. Client never executes `UPDATE tickets SET status = ...`. The RPC validates transitions and logs events atomically.

**When to use:** Every status transition (Open→InProgress, InProgress→Resolved, Resolved→Closed, Closed→InProgress for reopen). Also: ticket creation, response insertion, and assignment changes.

**Example (existing migration RPC — already built):**
```sql
-- Source: supabase/migrations/20260507000000_committees_helpdesk.sql (lines 365-409)
CREATE OR REPLACE FUNCTION public.helpdesk_update_status(
    p_ticket_id uuid,
    p_new_status text,
    p_actor_id text
) RETURNS void AS $$
-- Validates:
--   Open → InProgress or Closed
--   InProgress → Resolved or Closed
--   Resolved → Closed or InProgress (reopen)
--   Closed → InProgress (reopen)
-- Logs event of type: StatusChanged / Resolved / Closed / Reopened
-- Updates resolved_at when transitioning to Resolved
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Client-side RPC wrapper pattern:**
```typescript
// src/lib/helpdesk/ticketRPCs.ts
// Follow the established pattern: call supabase.rpc(), handle errors, return typed result
import { supabase } from '../../utils/supabaseClient';

export async function updateTicketStatus(
  ticketId: string,
  newStatus: string,
  actorId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { error } = await supabase.rpc('helpdesk_update_status', {
    p_ticket_id: ticketId,
    p_new_status: newStatus,
    p_actor_id: actorId,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
```

### Pattern 2: Permissions Module (mirrors committees)

**What:** Pure functions in `src/lib/helpdesk/permissions.ts` that take `UserAccount` + entity and return boolean. No side effects, no supabase calls. Testable in isolation.

**When to use:** Every UI gate — show/hide buttons, enable/disable actions, route protection.

**Functions needed (from design spec permissions matrix):**
```typescript
canCreateTicket(user: UserAccount): boolean            // Any authenticated
canViewAllTickets(user: UserAccount): boolean          // HRAdmin/SystemAdmin/MasterAdmin
canViewDivisionTickets(user: UserAccount): boolean     // DivisionHead (scoped to division)
canRespond(user: UserAccount, ticket: Ticket): boolean // Submitter or handler
canTransitionStatus(user: UserAccount, ticket: Ticket, targetStatus: string): boolean
canCloseTicket(user: UserAccount, ticket: Ticket): boolean
canReassign(user: UserAccount): boolean                // HRAdmin/SystemAdmin/MasterAdmin
canForceClose(user: UserAccount): boolean              // HRAdmin/SystemAdmin/MasterAdmin
isAdmin(user: UserAccount): boolean                    // HRAdmin/SystemAdmin/MasterAdmin
```

### Pattern 3: Master-Detail Page (Helpdesk.tsx)

**What:** Left panel shows filtered/sorted ticket list; right panel shows selected ticket detail or "no selection" placeholder. Pattern established by `/committees` but split-pane not tabbed.

**When to use:** `/helpdesk` route — the main ticket browsing interface.

**Structure:**
- Left panel (w-96, 320px): tab bar (My Tickets | Assigned to Me [+ All for admin]), filter bar (segmented status + dropdown category + dropdown urgency), scrollable ticket list
- Right panel (flex-1): TicketDetail rendered inline, or placeholder state

### Pattern 4: Stacked Layout with Collapsible Sections (TicketDetail.tsx)

**What:** Response thread on top (~70%), collapsible event timeline below. Both visible without tab switching. Reply input expands via framer-motion.

**When to use:** `/helpdesk/:ticketId` route — individual ticket view.

### Anti-Patterns to Avoid
- **Client-side status patches:** Never do `supabase.from('tickets').update({ status: 'Resolved' })`. Always call the RPC. The RPC validates transitions and logs events atomically. [ASSUMED — pattern established by PMS design spec]
- **Direct Supabase calls from pages:** Pages consume via `useData()`. Write operations use wrapper functions in `ticketRPCs.ts`. Only the RPC wrappers call `supabase.rpc()`.
- **Raw Tailwind colors:** Use semantic tokens (`bg-surface`, `text-text-muted`, `border-border`, `text-brand-blue`). Raw hex only in chart fill props and `index.css` theme variables.
- **Editing existing migration:** The `20260507000000_committees_helpdesk.sql` migration is immutable per project rules. New RPCs go in a new timestamped migration file.
- **Missing error boundary for RPC failures:** RPC calls should catch errors and surface them to UI. Current `DataContext` pattern swallows errors — this is known tech debt but should not be replicated for write operations.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ticket token format generation (AMPRI-YYMMDD-XXX) | Client-side counter or UUID-based | `helpdesk_create_ticket` RPC (already exists, uses `MAX(SUBSTRING(...))` for atomic sequence within date) | DB-level atomicity avoids race conditions on sequence numbers |
| Status transition validation | Client-side if/else or switch | `helpdesk_update_status` RPC (already exists, validates all transitions server-side) | Single source of truth; client checks are UX-only (hide buttons), not enforcement |
| Auto-routing logic | Client-side mapping + staff lookup | `route_ticket()` DB function (already exists, resolves via `helpdesk_routing` config table + fallback chain) | DB has access to `user_roles`, `staff`, `divisions` tables; client would need redundant data |
| Multi-select dropdown UX | Custom multi-select from scratch | Native `<select multiple>` + styled container, or simple checkbox dropdown | Complexity of custom multi-select (keyboard nav, a11y, search) outweighs benefit for 8 categories |
| Animations for collapsible sections | CSS transitions or manual animation | framer-motion `<AnimatePresence>` with `<motion.div>` (already in dependencies) | Consistent with project conventions; handles mount/unmount animations natively |
| Timeline rendering | Custom SVG/CSS line drawing | CSS border-left + positioned icons (lucide-react) with framer-motion for staggered appearance | Simple, maintainable, matches design spec D-08 |
| Urgency badge colors | Manual color mapping in each component | Constants module in `src/lib/helpdesk/constants.ts` (follows `src/lib/pms/constants.ts` STATUS_COLORS pattern) | Single source of truth; easy to adjust all badges at once |

**Key insight:** The database already handles the complex parts (token generation, routing, state validation). The frontend's job is to present data and invoke RPCs — not to reimplement business logic.

## Runtime State Inventory

> Phase 3 is a greenfield build. No rename/refactor/migration of runtime state needed.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — greenfield pages on existing tables | None |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None — uses existing Supabase connection | None |
| Build artifacts | None | None |

**Nothing found in any category — verified by: Phase 3 is greenfield (no existing pages, no renaming). All database tables already created in Phase 1 migration.**

## Common Pitfalls

### Pitfall 1: Missing RLS Bypass for Response Insertion
**What goes wrong:** The `ticket_responses` table has an RLS policy restricting INSERT to admin roles only (`Director`/`SystemAdmin`/`MasterAdmin`). But submitters and assigned handlers also need to post responses. Direct client insert will fail with RLS violation.

**Why it happens:** Phase 1's shallow RLS decision granted all-write to admin roles only for simplicity. The migration was built before the full UX was designed.

**How to avoid:** Create a new SECURITY DEFINER RPC `helpdesk_add_response(ticket_id, author_id, message)` that inserts into `ticket_responses` and returns the new response row. The client calls this RPC, never inserts directly. This must be a new migration file — do not edit the existing Phase 1 migration.

**Warning signs:** "new row violates row-level security policy" error when non-admin user tries to respond.

### Pitfall 2: Missing `helpdesk_assign_ticket` RPC
**What goes wrong:** Admin reassignment requires updating `tickets.assigned_to` and logging an `Assigned` event atomically. The existing `helpdesk_update_status` RPC only handles status transitions, not assignment changes. Direct updates are blocked by RLS for all but admin roles, and even admin direct updates wouldn't log the event.

**Why it happens:** Phase 1 migration was scoped to foundation — create + status update. Reassignment was identified as a Phase 3 requirement but the RPC wasn't built ahead.

**How to avoid:** Create `helpdesk_assign_ticket(ticket_id, new_handler_id, actor_id)` RPC as SECURITY DEFINER. It updates `assigned_to`, sets `updated_at`, and inserts an `Assigned` event row. New migration file.

**Warning signs:** Can't find a way to change handler assignment without breaking audit trail.

### Pitfall 3: Route Order Sensitivity (learned from Phase 2 Pitfall 6)
**What goes wrong:** React Router matches the first matching route. If `/helpdesk/new` is registered after `/helpdesk/:ticketId`, then "new" gets captured as a `:ticketId` param.

**Why it happens:** React Router 7 evaluates routes in order. `:ticketId` is a wildcard that matches "new".

**How to avoid:** Register specific routes BEFORE parameterized routes:
```tsx
<Route path="/helpdesk/new" element={<TicketForm />} />
<Route path="/helpdesk/:ticketId" element={<TicketDetail />} />
<Route path="/helpdesk" element={<Helpdesk />} />
```

### Pitfall 4: Stale Data After RPC Calls
**What goes wrong:** After calling an RPC that changes ticket status, the UI still shows the old status because `useData()` hasn't refreshed.

**Why it happens:** RPCs execute server-side. The DataContext state is client-side and only refreshed on page load or explicit `refreshData()` call.

**How to avoid:** Call `refreshData()` from `useData()` after every successful RPC mutation. The `ticketRPCs.ts` wrappers should accept `refreshData` as a callback or return a flag that the page component uses to trigger refresh. Follow the CommitteeFormModal pattern: `await refreshData?.();` after successful write.

### Pitfall 5: Client-Side Enforcement Confusion
**What goes wrong:** Developer adds `if (canTransition) { /* show button */ }` but forgets that a malicious user could call the RPC directly. This is actually fine because the RPC enforces transitions server-side.

**Why it happens:** Confusion between UX gating (client-side) and security enforcement (server-side).

**How to avoid:** **Client-side permission checks are UX only** — they hide/disable buttons. **The RPC is the actual enforcement.** Never assume a hidden button means the action is impossible. This is the correct design — just document it clearly in `permissions.ts` JSDoc.

### Pitfall 6: Reply Input State Management
**What goes wrong:** User expands reply input, types a message, collapses it (or navigates away), and loses their draft.

**Why it happens:** The collapsible input (D-07) toggles mount/unmount which destroys component state.

**How to avoid:** Either (a) use `useState` lifted above the collapse toggle so text persists even when hidden, or (b) use `AnimatePresence` with a keyed motion.div that keeps state while the parent tracks visibility.

## Code Examples

Verified patterns from official sources:

### Permissions Module Pattern
```typescript
// Source: src/lib/committees/permissions.ts (established pattern to replicate)
import type { UserAccount, Ticket } from '../../types';

const ADMIN_ROLES = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'] as const;

export function canCreateTicket(_user: UserAccount): boolean {
  return true; // All authenticated users can create tickets
}

export function canViewAllTickets(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

export function canRespond(user: UserAccount, ticket: Ticket): boolean {
  return user.id === ticket.submitted_by || user.id === ticket.assigned_to;
}

export function canTransitionStatus(
  user: UserAccount,
  ticket: Ticket,
  targetStatus: string,
): boolean {
  // Handler can move to InProgress or Resolved
  // Admin can move anywhere
  // Submitter can only close resolved tickets
  const isHandler = user.id === ticket.assigned_to;
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
  const isSubmitter = user.id === ticket.submitted_by;

  if (isAdmin) return true;
  if (isHandler && (targetStatus === 'InProgress' || targetStatus === 'Resolved')) return true;
  if (isSubmitter && ticket.status === 'Resolved' && targetStatus === 'Closed') return true;
  return false;
}
```
[CITED: src/lib/committees/permissions.ts — replicate structure, adapt to ticket domain]

### Vertical Timeline Pattern
```typescript
// Pattern: CSS border-left vertical line with positioned icon circles
// Icons per D-08: CirclePlus, UserCheck, ArrowRightCircle, CircleCheck, CircleX, RotateCcw
// Source: design spec D-08 + lucide-react icons
const EVENT_ICONS: Record<string, React.ElementType> = {
  Created: CirclePlus,
  Assigned: UserCheck,
  StatusChanged: ArrowRightCircle,
  Resolved: CircleCheck,
  Closed: CircleX,
  Reopened: RotateCcw,
};

function TimelineEvent({ event }: { event: TicketEvent }) {
  const Icon = EVENT_ICONS[event.event_type] || CircleDot;
  return (
    <div className="relative pl-8 pb-4 border-l-2 border-border last:border-transparent">
      <div className="absolute left-0 top-0 -translate-x-1/2 w-6 h-6 rounded-full bg-surface border-2 border-border flex items-center justify-center">
        <Icon size={12} className="text-text-muted" />
      </div>
      <p className="text-sm font-medium text-text">{event.event_type}</p>
      <p className="text-xs text-text-muted">
        {new Date(event.created_at).toLocaleString('en-IN')}
      </p>
    </div>
  );
}
```
[ASSUMED — standard CSS timeline pattern, no library needed; verified lucide-react icons available at v0.577.0]

### Urgency Badge Pattern (follows PMS StatusBadge)
```typescript
// Source: src/components/pms/StatusBadge.tsx (pattern to follow)
// Constants in src/lib/helpdesk/constants.ts
export const URGENCY_COLORS = {
  Critical: { bg: 'bg-red-50 dark:bg-red-950', text: 'text-red-700 dark:text-red-300', label: 'Critical' },
  High:     { bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-300', label: 'High' },
  Medium:   { bg: 'bg-yellow-50 dark:bg-yellow-950', text: 'text-yellow-700 dark:text-yellow-300', label: 'Medium' },
  Low:      { bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-700 dark:text-green-300', label: 'Low' },
} as const;
```
[ASSUMED — color choices are Claude's discretion per CONTEXT.md; structure follows STATUS_COLORS from PMS]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A (greenfield module) | RPC-gated state machine (mirrors PMS) | — | Consistent with PMS; DB is source of truth for state transitions |
| N/A | SECURITY DEFINER RPCs for all write operations | Phase 1 | Bypasses shallow RLS; allows non-admin responders and submitters to write |
| N/A | Shallow RLS (all authenticated can SELECT, admin roles can ALL) | Phase 1 | Simplifies authorization; RPCs handle the nuanced write permissions |

**Deprecated/outdated:**
- Direct table INSERT/UPDATE for tickets — use RPCs only. The RLS policy technically allows admin direct writes, but this bypasses the audit trail (ticket_events). Always go through RPCs.
- `helpdesk_create_ticket` and `helpdesk_update_status` are already in the Phase 1 migration — they are current, not deprecated.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `helpdesk_add_response` RPC is needed because current RLS blocks non-admin ticket_response inserts | Pitfall 1 | If RLS policy is relaxed instead, RPC approach changes — but the migration rule says don't edit existing migration, so a new migration is still needed |
| A2 | `helpdesk_assign_ticket` RPC is needed for admin reassignment (not in Phase 1 migration) | Pitfall 2 | If reassignment is handled differently (e.g., admin direct UPDATE + separate event INSERT), the plan structure changes. But atomicity requirement favors RPC |
| A3 | Ticket auto-close (14-day stale resolved) is out of scope for Phase 3 UI — it's a DB infrastructure task (pg_cron or edge function) | HD-07 | If included in Phase 3 scope, a scheduled job must be created. The submitter manual close is in scope |
| A4 | Category grid on TicketForm uses an 8-button grid (not icon cards) — Claude's discretion, but button grid is simplest and already styled by the Button component | Claude's Discretion | If icon cards are preferred, the component complexity increases moderately |
| A5 | Reply "Reply & Resolve" button submits both response text and transitions to Resolved in a single user action. This maps to two RPC calls: `helpdesk_add_response` + `helpdesk_update_status` | Claude's Discretion | If these must be atomic (one DB call), a combined RPC is needed. Two separate calls with refreshData after each is simpler |

## Open Questions

1. **Response + status transition atomicity**
   - What we know: "Reply & Resolve" is a single button that submits a response and transitions the ticket to Resolved
   - What's unclear: Should these be two separate RPC calls (add_response, then update_status) or a single atomic RPC?
   - Recommendation: Two separate calls with try/catch — if the status update fails after the response is saved, the response still exists in the thread. This is acceptable UX. A single atomic RPC adds complexity without clear benefit.

2. **Auto-close mechanism for HD-07**
   - What we know: Resolved tickets should auto-close after 14 days of inactivity. The design spec mentions pg_cron or edge function.
   - What's unclear: Is implementing the scheduled job in scope for Phase 3, or is it deferred to Phase 4 (Integration & Polish)?
   - Recommendation: Treat as out-of-scope for Phase 3. The submitter manual close button satisfies HD-07's primary acceptance criterion. The auto-close is infrastructure that requires pg_cron extension or edge function setup — coordinate with Phase 4 or a separate infrastructure task.

3. **"All" tab data loading for admin roles**
   - What we know: Admin roles (HRAdmin/SystemAdmin/MasterAdmin) see all tickets. Non-admins see their own + assigned.
   - What's unclear: Should the "All" view load all tickets unfiltered, or apply division scoping for DivisionHead/HOD roles? The design spec says DivisionHead sees "division only."
   - Recommendation: "My Tickets" = `submitted_by === user.id`. "Assigned to Me" = `assigned_to === user.id`. "All" (admin only) = all tickets from `useData().tickets`. DivisionHead scoping is a future enhancement.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/dev server | YES | v24.14.0 | — |
| npm | Package management | YES | 11.9.0 | — |
| React | UI framework | YES | 19.2.5 | — |
| TypeScript | Type checking | YES | 5.9 (strict) | — |
| Supabase CLI | DB migration push | NOT CHECKED | — | SQL can be pasted into Supabase SQL Editor |
| Supabase project | Backend (DB, RPCs) | PRESUMED | — | Mock data fallback exists in DataContext |

**Missing dependencies with no fallback:**
- None blocking. The app already runs with mock data fallback when Supabase is not provisioned.

**Missing dependencies with fallback:**
- Supabase CLI: migration SQL can be manually applied via Supabase SQL Editor.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | vite.config.ts (inline vitest config) |
| Quick run command | `npx vitest run src/lib/helpdesk/` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HD-01 | Ticket creation form renders all 8 categories | integration/smoke | Manual — page render verification | NO — Wave 0 |
| HD-02 | Routing preview shows correct handler for category | unit | `vitest run src/lib/helpdesk/routing.test.ts` | NO — Wave 0 |
| HD-03 | Filtering logic: status, category, urgency; sort by urgency+date | unit | `vitest run src/lib/helpdesk/ -- --grep "filter\|sort"` | NO — Wave 0 |
| HD-04 | Status transitions: canTransitionStatus returns correct booleans | unit | `vitest run src/lib/helpdesk/permissions.test.ts` | NO — Wave 0 |
| HD-05 | Admin permissions: canViewAllTickets, canReassign, canForceClose | unit | `vitest run src/lib/helpdesk/permissions.test.ts` | NO — Wave 0 |
| HD-06 | Timeline icons mapped correctly to event types | unit | `vitest run src/lib/helpdesk/ -- --grep "timeline\|event"` | NO — Wave 0 |
| HD-07 | Submitter can close own resolved ticket | unit | `vitest run src/lib/helpdesk/permissions.test.ts` | NO — Wave 0 |
| HD-08 | Token format AMPRI-YYMMDD-XXX valid | integration | Manual (DB function) — RPC already exists | N/A (DB-side) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/helpdesk/` (permissions + routing unit tests, < 2s)
- **Per wave merge:** `npm test` (full test suite)
- **Phase gate:** `npm test` green + `npx tsc --noEmit` clean + `npx eslint src/` clean

### Wave 0 Gaps
- [ ] `src/lib/helpdesk/permissions.test.ts` — covers HD-04, HD-05, HD-07 permission functions
- [ ] `src/lib/helpdesk/routing.test.ts` — covers HD-02 routing preview logic
- [ ] `src/lib/helpdesk/constants.test.ts` — covers urgency/status color maps (optional, low priority)
- [ ] Test fixtures: `makeUser()` and `makeTicket()` helpers (follow `permissions.test.ts` in committees pattern)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | YES (inherited) | Supabase Auth — already handled by AuthContext |
| V3 Session Management | YES (inherited) | Supabase session tokens — already handled |
| V4 Access Control | YES | RLS policies (DB layer) + permissions module (UI layer) + RPC gating (business logic) |
| V5 Input Validation | YES | Zod for form validation on TicketForm (subject, description length limits). RPCs validate transitions. |
| V6 Cryptography | NO | Not applicable to ticket system |
| V7 Logging | YES | `ticket_events` table serves as audit log; `audit_log` table captures all CUD operations |

### Known Threat Patterns for Supabase + React

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Direct status manipulation bypassing RPC | Tampering | RLS policies block direct UPDATE; SECURITY DEFINER RPCs are the only write path. Client-side `supabase.from('tickets').update()` fails for non-admin users |
| Horizontal privilege escalation (viewing others' tickets) | Information Disclosure | RLS SELECT policy allows all authenticated (Phase 1 decision D-01). Client-side filtering via `useMemo` is UX, not security. Acceptable for internal institutional app |
| Response injection by unauthorized user | Spoofing | `helpdesk_add_response` RPC checks that `author_id` matches authenticated user and that user is submitter or assigned handler |
| Replay attacks on status transitions | Tampering | RPC validates current status before allowing transition. `Closed → Resolved` is rejected, only `Closed → InProgress` allowed |
| Token sequence collision | Denial of Service | `helpdesk_create_ticket` uses `MAX(SUBSTRING(...)) + 1` within the same date prefix. Row-level locking via the transaction prevents duplicates |

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/20260507000000_committees_helpdesk.sql` — Verified: existing tables (tickets, ticket_responses, ticket_events, helpdesk_routing), RPCs (route_ticket, helpdesk_create_ticket, helpdesk_update_status), RLS policies (shallow — SELECT all authenticated, ALL admin-only), triggers (trg_tickets_updated_at)
- `src/types/index.ts` — Verified: Ticket, TicketResponse, TicketEvent interfaces with correct field names and union types
- `src/contexts/DataContext.tsx` — Verified: tickets, ticketResponses, ticketEvents loaded from Supabase (with mock fallback), exposed via `useData()`
- `src/utils/mockData.ts` — Verified: 20 mockTickets, 10 mockTicketResponses, 13 mockTicketEvents, 8 mockHelpdeskRouting rows
- `package.json` — Verified: react 19.2.5, react-router-dom 7.14.1, @supabase/supabase-js 2.103.0, lucide-react 0.577.0, framer-motion 12.38.0, vitest 4.1.5

### Secondary (MEDIUM confidence)
- `docs/superpowers/specs/2026-05-07-committees-helpdesk-design.md` — CITED: data model, state machine transitions, permission matrix, auto-routing logic, token format
- `CLAUDE.md` — CITED: coding rules, folder map, naming conventions, do/don't list
- `src/lib/committees/permissions.ts` — CITED: pattern for helpdesk permissions module
- `src/lib/pms/constants.ts` — CITED: STATUS_COLORS pattern for urgency constants
- `src/pages/committees/CommitteeList.tsx` — CITED: list page pattern (search, filter, derive, render)
- `src/pages/committees/CommitteeDetail.tsx` — CITED: detail page pattern (useParams, derived state, tabs)

### Tertiary (LOW confidence)
- None — all claims verified against existing codebase or cited from design spec

## Project Constraints (from CLAUDE.md)

### TypeScript
- `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` all on
- `interface` for object shapes. `type` for unions and aliases
- `import type { ... }` mandatory for type-only imports
- `any` only in mapper/migration boundary layers. Never in UI/hooks

### React
- Function components only. Pages: `export default function`. Lib/hooks: named export
- Context pattern with undefined guard
- `useMemo` for all derived/computed data in pages
- Pages consume data via `useData()` only — never call Supabase directly from a page

### Naming
- Files: pages `PascalCase.tsx`, utils `camelCase.ts`, types `index.ts`
- Snake_case for all new entity fields (consistent with Phase 1 ticket types)
- Semantic Tailwind tokens, not raw colors

### Database
- Never edit `00000000000000_init.sql` or `20260507000000_committees_helpdesk.sql`
- New RPCs go in new timestamped migration
- RLS mandatory on all tables
- Status transitions via RPCs only

### Imports
- No path aliases. Always relative imports
- Order: React/third-party → internal contexts → internal components → internal utils → internal types

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against package.json, no new dependencies needed
- Architecture: HIGH — patterns verified against existing SURYA codebase (committees, PMS); the RPC-gated state machine pattern is well-established
- Pitfalls: HIGH — Pitfalls 1 and 2 (missing RPCs) are directly verifiable by reading the migration; Pitfall 3 (route ordering) is a confirmed Phase 2 bug; Pitfall 4 (stale data) is a known React+Supabase pattern
- Security: HIGH — RLS policies and RPC design verified against existing migration; threat model straightforward for internal institutional app

**Research date:** 2026-05-10
**Valid until:** 2026-06-09 (30 days — stable stack, no external API dependencies)

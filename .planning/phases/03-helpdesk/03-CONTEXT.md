# Phase 3: Helpdesk — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Ticket system UI — 8 categories, auto-routing, response thread, RPC-gated state machine. Pages consume data via `useData()`. Write operations call Supabase RPCs for state transitions (mirrors PMS pattern). All types, mock data, mappers, and DataContext loading already built in Phase 1.
</domain>

<decisions>
## Implementation Decisions

### Ticket List Filtering
- **D-01:** Segmented controls + dropdown for filters. Status as horizontal segments (All|Open|InProgress|Resolved|Closed). Category and urgency as dropdown multi-selects. Pills pattern rejected — doesn't scale to 16 pills (8 categories + 4 urgency + 4 status).
- **D-02:** Default view = "My Tickets" tab (tickets submitted by me). Role-scoped: handlers also see their assigned tickets within this tab.
- **D-03:** Urgency displayed as color-coded badge on each ticket list item. Follows PMS StatusBadge pattern. List auto-sorted by urgency (Critical→High→Medium→Low) then by date.
- **D-04:** 2-tab assignment scope: "My Tickets" | "Assigned to Me". Admin roles (HRAdmin/SystemAdmin/MasterAdmin) see additional "All" button for full access.

### Response Thread & Timeline
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
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & Requirements
- `docs/superpowers/specs/2026-05-07-committees-helpdesk-design.md` — Full design spec: data model, routes, permissions matrix, state machines, component tree, auto-routing rules
- `.planning/ROADMAP.md` — Phase 3 success criteria, key artifacts, dependency graph
- `.planning/REQUIREMENTS.md` — HD-01 through HD-08 requirement descriptions

### Prior Phase Decisions
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1 decisions (RLS depth, routing config approach, fallback chain, single-target routing, mock data strategy)

### Project Conventions
- `CLAUDE.md` — Coding rules, folder map, naming conventions, do/don't list

### Patterns to Follow
- `src/lib/pms/permissions.ts` — Permission module pattern to replicate at `src/lib/helpdesk/permissions.ts`
- `src/pages/committees/CommitteeList.tsx` — List page pattern with search + filter
- `src/pages/committees/CommitteeDetail.tsx` — Detail page pattern (useParams, tabs)
- `src/components/committees/CommitteeFormModal.tsx` — Form modal pattern (may adapt to page form)
- `src/components/ui/Modal.tsx` — Modal component API
- `src/components/ui/Cards.tsx` — Card + Badge components
- `src/components/ui/Button.tsx` — Button variants
- `src/components/ui/Skeleton.tsx` — Loading skeleton
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useData()` — already returns `tickets`, `ticketResponses`, `ticketEvents` arrays
- `Modal` — available for admin actions (reassign, force-close confirmation)
- `Button`, `Badge` — status badges, urgency badges, action buttons
- `Skeleton` — loading states for ticket list and detail
- `framer-motion` — already in dependencies, use for collapsible reply input and vertical timeline animations

### Established Patterns
- Pages consume data via `useData()` only — never call Supabase directly
- `useMemo` for all derived/computed data (filtered ticket lists, stats)
- `useParams` + `useNavigate` for routing
- `export default function` for pages, named exports for components
- Snake_case for all new entity fields (consistent with Phase 1 ticket types)
- `src/lib/<module>/permissions.ts` pattern established by PMS and committees
- StatusBadge pattern in PMS components — replicate for urgency badges

### Integration Points
- `src/App.tsx` — register routes: `/helpdesk`, `/helpdesk/new`, `/helpdesk/:ticketId`
- `src/components/layout/Layout.tsx` — add Helpdesk nav item to `NAV_ITEMS`
- `src/contexts/DataContext.tsx` — tickets, ticketResponses, ticketEvents already loaded
- `src/types/index.ts` — Ticket, TicketResponse, TicketEvent already defined
- `src/utils/mockData.ts` — 20 tickets, 10 responses, 13 events already seeded
- `src/lib/helpdesk/` — new directory for permissions.ts, ticketRPCs.ts, routing.ts
- Supabase — `route_ticket()`, `helpdesk_update_status()`, `helpdesk_assign_ticket()` RPCs to create
</code_context>

<specifics>
## Specific Ideas

No external product references discussed. Implementation follows standard SURYA patterns with the UX decisions captured above. Ticket form at `/helpdesk/new` is a full page (not modal) per the design spec route definition.
</specifics>

<deferred>
## Deferred Ideas

### Discussed but not selected
- **Category grid design** — icon cards vs button grid on TicketForm. Deferred to Claude's discretion (not selected as discussion area).
- **Master-detail mobile behavior** — how split-pane adapts to mobile. Deferred to Claude's discretion (not selected as discussion area).

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 3-Helpdesk*
*Context gathered: 2026-05-10*

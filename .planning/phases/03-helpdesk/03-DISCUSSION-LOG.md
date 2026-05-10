# Phase 3: Helpdesk — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 03-helpdesk
**Areas discussed:** Ticket list filtering UX, Response thread + timeline layout

---

## Ticket List Filtering UX

| Option | Description | Selected |
|--------|-------------|----------|
| Segmented controls + dropdown | Status as horizontal segments, category + urgency as dropdown multi-selects, assignment as toggle | ✓ |
| Sidebar filter panel | All filters as vertical checklist in collapsible panel | |
| Search bar + filter pills | Same as committee list pattern, horizontal scrollable pills | |

| Option | Description | Selected |
|--------|-------------|----------|
| My tickets (submitted by me) | Default view shows user's own tickets, role-scoped for handlers too | ✓ |
| All open tickets | Show everything needing attention, role-scoped subset for non-admin | |
| Remember last filter | Persist filter state in localStorage | |

| Option | Description | Selected |
|--------|-------------|----------|
| Urgency badge + sort priority | Color-coded badge on each item, list sorted by urgency then date | ✓ |
| Color accent + icon | Icon per urgency level, less prominent than badge | |
| Sort by urgency only | No visual indicator, just sort order | |

| Option | Description | Selected |
|--------|-------------|----------|
| 2 tabs: My Tickets \| Assigned to Me | Simple binary split, admin gets extra "All" button | ✓ |
| 3 tabs: Submitted \| Assigned \| All | Three-way split always visible | |
| Single list + filter toggles | No tabs, just checkboxes | |

**User's choice:** Segmented controls + dropdown for filter layout. Default to "My Tickets" view. Urgency badge with sort priority. 2-tab assignment scope.
**Notes:** User followed committee patterns where applicable but preferred to diverge on filter layout (segmented controls over pills — tickets have more filter dimensions than committees).

---

## Response Thread & Timeline Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Support-ticket posts | Linear posts with author name, role badge, timestamp header. Full-width. Professional helpdesk style. | ✓ |
| Chat-style bubbles | Alternating left/right aligned message bubbles | |
| Minimal thread (no cards) | Plain text with separator lines, author in muted text | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stacked: thread above, timeline below | Response thread ~70%, collapsible timeline below. Both visible. | ✓ |
| Side panel: thread left, timeline right | Timeline as narrow right sidebar, events always visible | |
| Tabs: Conversation \| History | Separate tabs, max space each but lose cross-context | |

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible input, expand on click | "Reply" button reveals textarea + submit. Saves space when reading. | ✓ |
| Always-visible input at bottom | Textarea fixed at bottom, always accessible for fast replies | |
| Modal reply form | "Reply" opens modal with textarea, extra click per response | |

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical timeline with icons | Events connected by vertical line, lucide-react icons per event type | ✓ |
| Compact table rows | Simple sortable table: Event Type \| Actor \| Date \| Details | |
| Stepper (horizontal steps) | Horizontal step indicator, shows state progression | |

**User's choice:** Support-ticket posts for response display. Stacked layout (thread above, timeline below). Collapsible reply input. Vertical timeline with lucide-react icons.
**Notes:** User preferred professional helpdesk aesthetic over chat-style messaging. Stacked layout with collapsible timeline keeps both thread and events accessible without tab switching.

---

## Claude's Discretion

- Category grid visual design on TicketForm (8-category selector)
- Master-detail empty state + mobile responsive behavior
- Exact urgency badge colors
- Exact timeline event type → icon mapping
- Filter dropdown design (placement, multi-select UX)
- "Reply & Resolve" button behavior
- Admin tray contents on TicketDetail

## Deferred Ideas

- **Category grid design** — discussed during gray area selection, deferred to Claude's discretion
- **Master-detail mobile behavior** — discussed during gray area selection, deferred to Claude's discretion

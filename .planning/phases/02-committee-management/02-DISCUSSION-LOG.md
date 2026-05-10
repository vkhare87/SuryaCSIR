# Phase 2: Committee Management — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 2-Committee-Management
**Areas discussed:** Committee List & Navigation, Member & Agenda Management, Action Tracker Design, Empty States & Error Handling, Meeting Detail Layout

---

## Committee List & Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Separate pages | CommitteeList → click → detail page. Matches Facilities/InstrumentDetail. | ✓ |
| Master-detail split panel | Left sidebar list, right detail panel. Single-page. | |

| Option | Description | Selected |
|--------|-------------|----------|
| URL sub-routes | Tabs at /committees/:id, /committees/:id/meetings, /committees/:id/actions. Deep-linkable. | ✓ |
| State-based tabs | Single route with useState toggle. Simpler. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Card grid | 2-3 column responsive grid. Richer info per committee. | ✓ |
| Data table | Rows with sortable columns. Denser. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Full dashboard | Info + mini meeting timeline + action item stats on Overview tab. | ✓ |
| Info panel + members | Committee info + members list only. Simpler. | |

**Notes:** None — user selected recommended option across all questions.

---

## Member & Agenda Management

| Option | Description | Selected |
|--------|-------------|----------|
| Search + add list | Search staff by name, click to add with role, chips for added members. | ✓ |
| Multi-select modal | Modal with searchable checkbox list + bulk select. | |
| Inline multi-select dropdown | Dropdown with checkboxes. Compact. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Drag to reorder | framer-motion Reorder with grip handles. | ✓ |
| Up/down arrow buttons | Per-row arrow buttons. Simpler. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Button on Action Tracker tab | "+ Action Item" at top of tracker. Modal with committee selector. | ✓ |
| Button on Overview tab | "+ Action Item" on committee detail Overview. Committee pre-selected. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Single scrollable modal | All fields in one modal with sections. | ✓ |
| Multi-step wizard | Step 1: info, Step 2: leadership, Step 3: members. | |

**Notes:** None — user selected recommended option across all questions.

---

## Action Tracker Design

| Option | Description | Selected |
|--------|-------------|----------|
| Kanban-style columns | Pending/InProgress/Completed columns with drag. | ✓ |
| Grouped list with filters | Flat list grouped by status. Simpler. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Red border + badge | Left red border + Overdue badge + days-overdue counter. | ✓ |
| Red background tint | Full card red tint. Aggressive. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Status + committee filter bar | Chips + dropdown + search. Minimal. | ✓ |
| Full filter panel | More filters (date range, source). Complex. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Drag columns + click cycle | Drag to column OR click badge to cycle status. | ✓ |
| Drag columns only | Status changes only via drag. | |
| Click cycle only | Click badge to cycle. No drag. | |

**Notes:** None — user selected recommended option across all questions.

---

## Empty States & Error Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Illustration + CTA | Icon + message + role-aware Create button. | ✓ |
| Simple text message | Minimal text, no CTA. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Contextual CTA per tab | Each tab has its own icon + message + action button. | ✓ |
| Uniform empty state | Same pattern for all tabs. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inline form errors + toast | Field-level inline errors + toast for server/network. | ✓ |
| Inline only | All errors inline. | |
| Toast only | All errors as toast. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Skeleton loading only | Skeleton + subtle error banner on failure. | ✓ |
| Skeleton + inline error | Skeleton + error card with retry. | |

**Notes:** None — user selected recommended option across all questions.

---

## Meeting Detail Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Stacked sections | Single scroll: info → agenda → minutes → actions → docs. | ✓ |
| 2-column split | Left: agenda+minutes, Right: info+actions+docs. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Edit mode toggle | View mode (no drag handles) → Edit mode (drag + add + delete). | ✓ |
| Always editable | Drag handles always visible to permitted users. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Large textarea + lock badge | 8-10 row textarea, autosave, lock UI after 7 days. | ✓ |
| Rich text editor | Toolbar with formatting. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Upload button + file list | Native file picker, immediate upload, file list with download. | ✓ |
| Drag-and-drop zone | Drop zone + file list. | |

**Notes:** None — user selected recommended option across all questions.

---

## Claude's Discretion

- Meeting scheduling form fields (date, venue, title — standard inputs)
- Meeting status transitions (simple dropdown, no RPC gate)
- Delete confirmation dialogs (standard Modal confirm pattern)
- Committee type options (from Phase 1: Standing, AdHoc, Review, Advisory)
- Meeting form modal follows same single-modal pattern as committee form
- Toast implementation approach
- Staff search for member picker (client-side filter)

## Deferred Ideas

- Permissions UI behavior (hide vs disable vs error-on-click) — user chose not to discuss
- StaffPicker extraction to shared UI component — planned for Phase 4
- Rich text minutes editor — rejected, plain text is sufficient
- Drag-and-drop file upload — rejected, button + file picker is sufficient

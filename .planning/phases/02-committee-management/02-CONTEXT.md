# Phase 2: Committee Management — Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Full committee governance UI — list, detail, meetings, minutes, action items, document uploads. All pages consume data via `useData()`. Write operations call Supabase directly (app-level enforcement, no RPC gates per Phase 1 D-02). Permissions module at `src/lib/committees/permissions.ts` mirrors PMS pattern.
</domain>

<decisions>
## Implementation Decisions

### Committee List & Navigation
- **D-01:** Separate pages, not master-detail split. CommitteeList shows card grid → click navigates to `/committees/:id`. Matches Facilities→InstrumentDetail pattern.
- **D-02:** URL sub-routes for tabs. CommitteeDetail has `/committees/:id` (Overview), `/committees/:id/meetings` (Meetings), `/committees/:id/actions` (Action Tracker). MeetingDetail at `/committees/:id/meetings/:meetId`.
- **D-03:** Card grid layout for committee list. 2-3 column responsive grid. Each card shows: committee name, type badge, chairperson, member count, status. Search bar + filter pills (type, status) at top.
- **D-04:** Overview tab = full mini-dashboard. Shows: committee info card (name, type, mandate, formed date, status), chairperson + secretary cards, members list with role badges, mini meeting timeline (last 3 meetings), action item status counts (Pending/InProgress/Completed).

### Member & Agenda Management
- **D-05:** Member selection = search + add list. Text input searches staff by name, dropdown shows matches, click adds with role selector (Member/Invitee/ExternalExpert). Added members shown as removable chips/badges.
- **D-06:** Agenda item ordering = drag to reorder using framer-motion `Reorder` component. Grip handle on each row. Sequence numbers auto-updated on save.
- **D-07:** Standalone action items created via "+ Action Item" button on Action Tracker tab. Modal includes committee selector dropdown. Meeting-based action items created inline on MeetingDetail page.
- **D-08:** Committee create/edit form = single scrollable modal. Sections: Basic Info (name, type, mandate, date, status), Leadership (chairperson + secretary pickers), Members (search+add list). Reuses existing Modal component.

### Action Tracker Design
- **D-09:** Kanban-style layout. 3 columns: Pending | In Progress | Completed. Cards show task, committee name, assignee, deadline. Drag between columns changes status via framer-motion.
- **D-10:** Overdue items: red left-border accent + red "Overdue" badge + days-overdue counter (e.g. "+3d"). Deadline text turns red.
- **D-11:** Filter bar: status chips (All/Pending/InProgress/Completed/Overdue) + committee dropdown + assignee search input. Overdue is computed filter (past deadline, status != Completed).
- **D-12:** Status toggle: drag card to target column OR click status badge to cycle Pending→InProgress→Completed→Pending. Both interactions work.

### Empty States & Error Handling
- **D-13:** Empty committee list: centered illustration (lucide-react icon) + message + CTA button. "Create Committee" button only shown if user has admin role (Director/SystemAdmin/MasterAdmin).
- **D-14:** Empty tabs: contextual CTA per tab. Meetings tab: "No meetings scheduled" + "Schedule Meeting" button (if permitted). Action Tracker: "No action items" + "Create Action Item" button. Members: "No members added" + "Edit Committee" button (if admin).
- **D-15:** Form errors: validation errors (required fields, invalid dates) shown inline below field in red text. Server/network errors shown as toast notification.
- **D-16:** Data loading: Skeleton component during load. On fetch failure, show empty arrays with subtle "Could not load data" banner. No blocking error states — pages remain navigable.

### Meeting Detail Layout
- **D-17:** Stacked single-column layout. Order: Meeting info card → Agenda items (ordered list) → Minutes editor → Action items (compact list) → Documents (upload + list). Section dividers with sticky header anchors.
- **D-18:** Agenda edit mode toggle. View mode: numbered list, drag handles hidden. "Edit Agenda" button (chair/sec/admin) enables: drag handles appear, inline add field, delete X, inline edit on click. Save/Cancel buttons.
- **D-19:** Minutes = large textarea (8-10 rows), full-width, plain text. Autosave on blur or debounced. When meeting is Completed + past 7 days: textarea becomes read-only + amber "Locked" badge with tooltip. Admin sees "Unlock" button.
- **D-20:** Document upload = "Upload Document" button opens native file picker (accept .pdf,.doc,.docx,.xlsx,.png,.jpg). Uploads immediately on select with progress indicator. Files listed below with name, type icon, upload date, download button, delete X for permitted users.

### Claude's Discretion
- Meeting scheduling form fields: date picker, venue text input, title input — standard form, no special UX
- Meeting status transitions: Scheduled→Completed→Cancelled — simple dropdown, no RPC gate needed per Phase 1 D-02
- Delete confirmations: standard Modal with "Are you sure?" + Cancel/Delete buttons
- Committee type options: Standing, AdHoc, Review, Advisory (from Phase 1)
- Meeting form modal follows same single-scrollable-modal pattern as committee form (D-08)
- Toast implementation: simple fixed-position div with auto-dismiss, no library needed
- Staff search for member picker: client-side filter of staff array by name match
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & Requirements
- `docs/superpowers/specs/2026-05-07-committees-helpdesk-design.md` — Full design spec: data model, routes, permissions matrix, state machines, component tree
- `.planning/ROADMAP.md` — Phase 2 success criteria, key artifacts, dependency graph
- `.planning/REQUIREMENTS.md` — CMT-01 through CMT-08 requirement descriptions
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1 decisions (RLS depth, permissions pattern, no RPC gates)

### Project Conventions
- `CLAUDE.md` — Coding rules, folder map, naming conventions, do/don't list

### Patterns to Follow
- `src/lib/pms/permissions.ts` — Permission module pattern to replicate at `src/lib/committees/permissions.ts`
- `src/components/ui/Modal.tsx` — Modal component API (isOpen, onClose, title, children)
- `src/components/ui/Cards.tsx` — Card + Badge exports for committee listing
- `src/components/ui/Skeleton.tsx` — Skeleton loading component
- `src/components/ui/Button.tsx` — Button variants
- `src/pages/InstrumentDetail.tsx` — Detail page pattern (useParams, useData, useMemo, not-found UI, back nav)
- `src/pages/Facilities.tsx` — List page pattern (search, filter, card grid)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Modal` component — used for all modals (CommitteeFormModal, MeetingFormModal, ActionItemModal)
- `Card` / `Badge` from Cards — card grid layout, status/type badges
- `DataTable<T>` — available if table view needed (e.g., admin list view)
- `Skeleton` — loading states for all pages
- `Button` — action buttons throughout
- `framer-motion` — already in dependencies, use for drag-to-reorder (agenda) and kanban columns

### Established Patterns
- Pages consume data via `useData()` only — never call Supabase directly
- `useMemo` for all derived/computed data (filtered lists, stats)
- `useState` for form state, modal open/close
- `useParams` + `useNavigate` for routing
- `export default function` for pages, named exports for components
- Snake_case for new entity fields (committee tables use snake_case)
- `src/lib/<module>/permissions.ts` pattern established by PMS

### Integration Points
- `src/App.tsx` — register new routes: `/committees`, `/committees/:id`, `/committees/:id/meetings`, `/committees/:id/meetings/:meetId`, `/committees/:id/actions`
- `src/components/layout/Layout.tsx` — add Committees nav item to `NAV_ITEMS`
- `src/contexts/DataContext.tsx` — committees, meetings, actionItems, meetingDocs already loaded. Read from `useData()`. Write operations call Supabase directly.
- `src/types/index.ts` — Committee, Meeting, ActionItem, AgendaItem, CommitteeMember, MeetingDocument types already defined
- `Supabase Storage` — bucket `committee-docs` already created in Phase 1 migration
</code_context>

<specifics>
## Specific Ideas

No external product references discussed. Implementation follows standard SURYA patterns with the UX decisions captured above.
</specifics>

<deferred>
## Deferred Ideas

- **Permissions UI behavior** — hide vs disable vs error-toast for restricted actions. Deferred to planning (Claude's discretion).
- **StaffPicker component** — extraction to `src/components/ui/StaffPicker.tsx` planned for Phase 4 (Integration & Polish). Phase 2 implements inline search+add.
- **Rich text editor** for minutes — not needed, plain text is sufficient per user decision.
- **Drag-and-drop file upload zone** — not needed, button + file picker is sufficient.

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 2-Committee-Management*
*Context gathered: 2026-05-09*

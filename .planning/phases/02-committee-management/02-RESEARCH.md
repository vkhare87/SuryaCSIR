# Phase 2: Committee Management - Research

**Researched:** 2026-05-09
**Domain:** Committee governance UI — CRUD, meetings, minutes, action items, document management
**Confidence:** HIGH

## Summary

Phase 2 builds the full committee management module as a browser-side React application consuming data from `useData()` (Phase 1 foundation) and writing directly to Supabase. All domain types, mock data, mappers, and DataContext arrays are already in place. The work is purely UI composition: pages, modals, drag-and-drop interactions, file uploads, and a permissions module.

The phase follows established SURYA patterns: `Facilities.tsx` (list page with search/filter), `InstrumentDetail.tsx` (detail page with tabs), `Modal` (form overlays), and `Cards/Badge` (UI primitives). framer-motion `Reorder` handles agenda item reordering and kanban column drag-and-drop. Supabase Storage handles document uploads via the pre-existing `committee-docs` bucket.

**Primary recommendation:** Follow SURYA's 3-page pattern (List, Detail, MeetingDetail), replicate the `src/lib/pms/permissions.ts` module structure, and use framer-motion `Reorder` for list reordering but switch to manual click-to-toggle (D-12) for kanban column transitions since `Reorder` cannot drag between separate groups.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Separate pages, not master-detail split. CommitteeList shows card grid → click navigates to `/committees/:id`. Matches Facilities→InstrumentDetail pattern.
- **D-02:** URL sub-routes for tabs. CommitteeDetail has `/committees/:id` (Overview), `/committees/:id/meetings` (Meetings), `/committees/:id/actions` (Action Tracker). MeetingDetail at `/committees/:id/meetings/:meetId`.
- **D-03:** Card grid layout for committee list. 2-3 column responsive grid. Each card shows: committee name, type badge, chairperson, member count, status. Search bar + filter pills (type, status) at top.
- **D-04:** Overview tab = full mini-dashboard. Shows: committee info card (name, type, mandate, formed date, status), chairperson + secretary cards, members list with role badges, mini meeting timeline (last 3 meetings), action item status counts (Pending/InProgress/Completed).
- **D-05:** Member selection = search + add list. Text input searches staff by name, dropdown shows matches, click adds with role selector (Member/Invitee/ExternalExpert). Added members shown as removable chips/badges.
- **D-06:** Agenda item ordering = drag to reorder using framer-motion `Reorder` component. Grip handle on each row. Sequence numbers auto-updated on save.
- **D-07:** Standalone action items created via "+ Action Item" button on Action Tracker tab. Modal includes committee selector dropdown. Meeting-based action items created inline on MeetingDetail page.
- **D-08:** Committee create/edit form = single scrollable modal. Sections: Basic Info (name, type, mandate, date, status), Leadership (chairperson + secretary pickers), Members (search+add list). Reuses existing Modal component.
- **D-09:** Kanban-style layout. 3 columns: Pending | In Progress | Completed. Cards show task, committee name, assignee, deadline. Drag between columns changes status via framer-motion.
- **D-10:** Overdue items: red left-border accent + red "Overdue" badge + days-overdue counter (e.g. "+3d"). Deadline text turns red.
- **D-11:** Filter bar: status chips (All/Pending/InProgress/Completed/Overdue) + committee dropdown + assignee search input. Overdue is computed filter (past deadline, status != Completed).
- **D-12:** Status toggle: drag card to target column OR click status badge to cycle Pending→InProgress→Completed→Pending. Both interactions work.
- **D-13:** Empty committee list: centered illustration (lucide-react icon) + message + CTA button. "Create Committee" button only shown if user has admin role (Director/SystemAdmin/MasterAdmin).
- **D-14:** Empty tabs: contextual CTA per tab. Meetings tab: "No meetings scheduled" + "Schedule Meeting" button (if permitted). Action Tracker: "No action items" + "Create Action Item" button. Members: "No members added" + "Edit Committee" button (if admin).
- **D-15:** Form errors: validation errors (required fields, invalid dates) shown inline below field in red text. Server/network errors shown as toast notification.
- **D-16:** Data loading: Skeleton component during load. On fetch failure, show empty arrays with subtle "Could not load data" banner. No blocking error states — pages remain navigable.
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

### Deferred Ideas (OUT OF SCOPE)
- **Permissions UI behavior** — hide vs disable vs error-toast for restricted actions. Deferred to planning (Claude's discretion).
- **StaffPicker component** — extraction to `src/components/ui/StaffPicker.tsx` planned for Phase 4 (Integration & Polish). Phase 2 implements inline search+add.
- **Rich text editor** for minutes — not needed, plain text is sufficient per user decision.
- **Drag-and-drop file upload zone** — not needed, button + file picker is sufficient.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CMT-01 | Committee list with search by name and filter by type/status | Facilities.tsx pattern; card grid layout (D-03); search+filter UI pattern established |
| CMT-02 | Admin CRUD for committees + member roster management | Modal form pattern (D-08); D-05 member selection; direct Supabase writes; permissions module |
| CMT-03 | Committee detail with 3 tabs (Overview, Meetings, Action Tracker) | InstrumentDetail.tsx pattern; D-04 mini-dashboard; sub-routes D-02 |
| CMT-04 | Schedule meetings with date, venue, title, agenda items (ordered, with proposer) | MeetingFormModal; D-06 drag-to-reorder via framer-motion Reorder; D-18 agenda edit mode |
| CMT-05 | Meeting minutes with auto-lock 7 days after completion | D-19 autosave textarea; lock logic (UI + RLS); admin unlock; **CONFLICT: migration says no lock — see Open Questions** |
| CMT-06 | Document upload to Supabase Storage; authenticated download | `committee-docs` bucket exists (private); upload via `storage.from().upload()`; download via `storage.from().download()`; **CONFLICT: storage RLS policies** |
| CMT-07 | Action item CRUD + status toggle (Pending→InProgress→Completed) | D-07 (standalone + meeting-based); D-12 status toggle; direct Supabase writes |
| CMT-08 | Action Tracker with filter by status, assignee, deadline (overdue highlight) | D-09 kanban layout; D-10 overdue indicators; D-11 filter bar; D-12 drag/click toggle; **Reorder limitation for cross-column drag** |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Committee list/detail rendering | Browser/Client | — | Pure React UI; data from `useData()` context |
| Committee CRUD writes | Browser/Client | Database/Storage (Supabase) | Client calls Supabase directly; RLS enforces authorization on server |
| Meeting scheduling + CRUD | Browser/Client | Database/Storage (Supabase) | Same pattern — direct Supabase calls, RLS enforcement |
| Minutes text editing + locking | Browser/Client | Database/Storage (Supabase) | UI soft-gate (disable textarea) + RLS hard-gate for lock enforcement |
| Agenda drag-to-reorder | Browser/Client | — | framer-motion Reorder operates entirely in DOM; sequence saved to DB on explicit save action |
| Kanban drag-to-reorder | Browser/Client | — | framer-motion Reorder within single column; cross-column via status badge click per D-12 |
| Document upload/download | Browser/Client | CDN/Storage (Supabase Storage) | Client uploads via supabase-js Storage API; downloads as Blob for private bucket |
| Permission checks | Browser/Client | — | `src/lib/committees/permissions.ts` pure functions; no API call needed |
| Staff search for member picker | Browser/Client | — | Client-side filter of staff array by name match (Claude's Discretion) |
| Route protection | Browser/Client (React Router) | — | `ProtectedRoute` component with `allowedRoles` in App.tsx |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | UI framework | Project standard |
| TypeScript | 5.9.3 | Type safety | Project standard; strict mode |
| Vite | 8.0.0 | Bundler/HMR | Project standard |
| Tailwind CSS | 4.2.1 | Utility CSS | Project standard; via `@tailwindcss/vite` |
| React Router | 7.13.1 | Client routing | Project standard; HashRouter pattern |
| Supabase JS | 2.105.4 | Database + Auth + Storage | Project standard; data reads via `useData()`, writes direct |
| framer-motion | 12.38.0 | Animations + drag-and-drop | Project standard; `Reorder` for list reordering |

**Verified:** `npm view` confirmed latest versions: framer-motion 12.38.0, @supabase/supabase-js 2.105.4. All packages already installed.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 0.577.0 | Icons | All icon needs (empty states, buttons, file type indicators) |
| clsx | 2.1.1 | Conditional class names | All Tailwind class composition |
| zod | 4.3.6 | Validation (optional) | Can be used for form validation if needed; project declares it |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| framer-motion Reorder (kanban) | @dnd-kit/core | Reorder cannot drag between separate columns; dnd-kit handles multi-container DnD. But D-12 allows click-to-toggle as primary interaction, making Reorder inside columns + click-cycling sufficient. |
| Custom file upload UI | react-dropzone | User deferred drag-drop zone. Native `<input type="file">` is simpler and sufficient. |

**Installation:**
No new packages needed. All dependencies are already in `package.json` from Phase 1.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER / CLIENT                         │
│                                                                 │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────────────────┐ │
│  │ App.tsx  │   │ Layout.tsx   │   │   DataContext (useData)  │ │
│  │ Routes   │──▶│ Sidebar Nav  │──▶│   committees[],          │ │
│  │ Guards   │   │ TopBar       │   │   meetings[],            │ │
│  └──────────┘   └──────────────┘   │   actionItems[],         │ │
│       │                             │   meetingDocs[],         │ │
│       ▼                             │   staff[]                │ │
│  ┌──────────────────────────┐       └───────────┬─────────────┘ │
│  │     Pages (3 routes)     │                   │               │
│  │                          │       ┌───────────▼─────────────┐ │
│  │  /committees             │       │  Mock Data (fallback)   │ │
│  │    CommitteeList.tsx     │       │  mockCommittees[]       │ │
│  │                          │       │  mockMeetings[] etc.    │ │
│  │  /committees/:id         │       └─────────────────────────┘ │
│  │    CommitteeDetail.tsx   │                                    │
│  │    (tabs via sub-routes) │       ┌─────────────────────────┐ │
│  │                          │       │  Permissions Module     │ │
│  │  /committees/:id/        │       │  src/lib/committees/    │ │
│  │    meetings/:meetId      │       │    permissions.ts       │ │
│  │    MeetingDetail.tsx     │       │  canEditCommittee()     │ │
│  │                          │       │  canScheduleMeeting()   │ │
│  │  Modals:                 │       │  canWriteMinutes() etc. │ │
│  │  CommitteeFormModal      │       └─────────────────────────┘ │
│  │  MeetingFormModal        │                                    │
│  │  ActionItemModal         │                                    │
│  └──────┬───────────────────┘                                    │
│         │ WRITE operations                                      │
└─────────┼──────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE BACKEND                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ PostgreSQL   │  │ Auth (RLS)   │  │ Storage              │ │
│  │              │  │              │  │                       │ │
│  │ committees   │  │ SELECT: all  │  │ committee-docs bucket │ │
│  │ committee_   │  │   auth'd     │  │ (private)             │ │
│  │   members    │  │              │  │                       │ │
│  │ meetings     │  │ INSERT/      │  │ Upload: Director,     │ │
│  │ agenda_items │  │ UPDATE/      │  │ SysAdmin, MasterAdmin │ │
│  │ action_items │  │ DELETE:      │  │ Download: all auth'd  │ │
│  │ meeting_     │  │   admin      │  │                       │ │
│  │   documents  │  │   roles      │  │                       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow: Primary Use Case (View Committee → Write Minutes → Upload Document)

```
1. User navigates to /committees
   │
2. CommitteeList.tsx
   ├── useData().committees (read from context, already loaded)
   ├── useMemo: filtered by searchTerm, typeFilter, statusFilter
   └── Renders: card grid → user clicks card
   │
3. Navigate to /committees/:id (CommitteeDetail.tsx)
   ├── useParams<{ id }>()
   ├── useData().committees.find(...) → committee
   ├── useMemo: derived members, meetings, action items for this committee
   ├── Tab: Overview (D-04 mini-dashboard)
   ├── Tab: /committees/:id/meetings (meetings list)
   └── Tab: /committees/:id/actions (action tracker)
   │
4. User clicks meeting → /committees/:id/meetings/:meetId (MeetingDetail.tsx)
   ├── useParams<{ id, meetId }>()
   ├── useData(): meetings.find(...), agendaItems.filter(...), actionItems.filter(...), meetingDocs.filter(...)
   ├── Sections rendered in stacked order (D-17)
   │
5. User types minutes → autosave on blur
   ├── supabase.from('meetings').update({ summary: newText }).eq('id', meetId)
   └── refreshData() to sync context
   │
6. User uploads document:
   ├── <input type="file" accept=".pdf,.doc,.docx,.xlsx,.png,.jpg" />
   ├── supabase.storage.from('committee-docs').upload(path, file)
   ├── supabase.from('meeting_documents').insert({ meeting_id, file_name, storage_path })
   └── refreshData()
```

### Recommended Project Structure

```
src/
├── pages/
│   └── committees/                    # [NEW] Committee pages
│       ├── CommitteeList.tsx          # /committees — card grid, search, filter
│       ├── CommitteeDetail.tsx        # /committees/:id — tabs container
│       └── MeetingDetail.tsx          # /committees/:id/meetings/:meetId
├── components/
│   └── committees/                    # [NEW] Committee-specific components
│       ├── CommitteeFormModal.tsx     # Create/edit committee modal (D-08)
│       ├── MeetingFormModal.tsx       # Schedule meeting modal
│       ├── ActionItemModal.tsx        # Create action item modal (standalone)
│       ├── MemberPicker.tsx           # Inline staff search+add (D-05)
│       ├── AgendaEditor.tsx           # Drag-reorder agenda list (D-06)
│       ├── MinutesEditor.tsx          # Textarea + lock logic (D-19)
│       ├── DocumentUploader.tsx       # File picker + upload + list (D-20)
│       ├── KanbanBoard.tsx            # 3-column kanban (D-09)
│       ├── KanbanCard.tsx             # Single kanban card (D-10)
│       └── ActionTrackerFilters.tsx   # Filter bar (D-11)
├── lib/
│   └── committees/
│       └── permissions.ts             # [NEW] Committee permission functions
├── types/
│   └── index.ts                       # [EXISTS] Committee types already defined
├── utils/
│   └── dataMapper.ts                  # [EXISTS] Committee mappers already defined
├── contexts/
│   └── DataContext.tsx                # [EXISTS] Committees data already loaded
├── components/ui/
│   ├── Modal.tsx                      # [EXISTS] Reused for all modals
│   ├── Cards.tsx (Card, Badge, StatCard)  # [EXISTS] Reused for card grids
│   ├── Skeleton.tsx                   # [EXISTS] Loading states
│   ├── KpiCard.tsx                    # [EXISTS] KPI display
│   └── Button.tsx                     # [EXISTS] Action buttons
└── App.tsx                            # [MODIFY] Register 3 new routes
```

### Component Responsibility Map

| Component | Owns | States Handled | Key Dependencies |
|-----------|------|---------------|------------------|
| `CommitteeList.tsx` | Search box, type/status filter, card grid, empty state, create button | Loading (Skeleton), Empty (D-13), Error (banner), Populated | `useData().committees`, `useAuth()`, `CommitteeFormModal` |
| `CommitteeDetail.tsx` | Tab container, Overview tab content, tab navigation | Loading, Not-found (invalid ID), Error | `useParams`, `useData()`, `permissions.ts` |
| `MeetingDetail.tsx` | Meeting info, agenda, minutes, action items, documents — all sections | Loading, Not-found, Locked-minutes, Empty-agenda | `useParams`, `useData()`, `AgendaEditor`, `MinutesEditor`, `DocumentUploader` |
| `CommitteeFormModal.tsx` | Form state, validation, Supabase upsert | New (create), Edit (pre-populated), Validating, Submitting, Error | `Modal`, `MemberPicker`, `useAuth()` |
| `MeetingFormModal.tsx` | Date, venue, title, agenda items, Supabase insert | New (create), Edit | `Modal`, `AgendaEditor`, `useAuth()` |
| `ActionItemModal.tsx` | Task, assignee, deadline, committee selector, Supabase insert | New (create), Edit (standalone) | `Modal`, `useData()` |
| `MemberPicker.tsx` | Search input, dropdown, selected chips, role selector | Searching, No-results, Selected | `useData().staff` |
| `AgendaEditor.tsx` | Reorder.Group, inline add/edit/delete, sequence management | View mode, Edit mode, Reordering | framer-motion `Reorder`, `useAuth()` for edit permission |
| `MinutesEditor.tsx` | Textarea, autosave (blur/debounce), lock read-only state | Editing, Saving, Locked (read-only + badge) | `supabase`, `permissions.ts` |
| `DocumentUploader.tsx` | File input, upload progress, file list, download, delete | Idle, Uploading, Error, Listed | `supabase.storage`, `supabase.from('meeting_documents')` |
| `KanbanBoard.tsx` | 3 columns, drag within columns, status badges, filter bar | Loading, Empty, Filtered, Dragging | `Reorder.Group/Item`, `KanbanCard`, `ActionTrackerFilters` |
| `KanbanCard.tsx` | Card display, overdue styling, status badge click handler | Normal, Overdue, Dragging | `permissions.ts` for edit checks |

### Pattern 1: List Page Pattern (CommitteeList.tsx)
**What:** Card grid with search + filter. Follows `Facilities.tsx` but uses Card grid instead of DataTable.
**When to use:** CMT-01 — committee list page
**Key characteristics:**
- `useData()` for data, `useAuth()` for role checks
- `useMemo` for filtered data
- `useState` for search term, filter values, modal open/close
- Responsive grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Empty state with icon + message + conditional CTA button
- Skeleton loading during `isLoading`

### Pattern 2: Detail Page with Tabs (CommitteeDetail.tsx)
**What:** Single-committee view with Overview/Meetings/Action Tracker tabs via URL sub-routes.
**When to use:** CMT-03 — committee detail page
**Key characteristics:**
- `useParams<{ id }>()` to get committee ID
- `useMemo` to find committee and derive meetings, action items, members
- NotFound inline UI when committee doesn't exist
- Tab navigation via `<NavLink>` with `to` pointing to sub-routes
- Only Overview tab renders inline; Meetings and Actions are separate route renders or conditionally rendered sections

### Pattern 3: Meeting Detail (MeetingDetail.tsx)
**What:** Stacked single-column layout with sections per D-17.
**When to use:** CMT-04, CMT-05, CMT-06 — meeting view/edit
**Key characteristics:**
- `useParams<{ id, meetId }>()` — two route params
- `useMemo` to derive: meeting, agenda items (sorted by sequence), action items, documents
- Sections rendered in order: Info → Agenda → Minutes → Actions → Documents
- Sticky section headers with anchor navigation
- Agenda edit mode toggle (D-18)

### Pattern 4: Modal Form Pattern (CommitteeFormModal, MeetingFormModal, ActionItemModal)
**What:** Single scrollable modal using existing `<Modal>` component.
**When to use:** CMT-02 (committee CRUD), CMT-04 (meeting creation), CMT-07 (action item creation)
**Key characteristics:**
- `<Modal isOpen={} onClose={} title="">{form content}</Modal>`
- Form state via `useState` per field
- Validation errors inline below fields in red text (D-15)
- On submit: call Supabase directly (`.insert()` or `.upsert()`), then `refreshData()`
- Server errors shown as toast notification
- Reuses existing Modal component API: `isOpen`, `onClose`, `title`, `children`, `className`

### Pattern 5: Permissions Module (src/lib/committees/permissions.ts)
**What:** Pure functions returning boolean for access checks. Mirrors `src/lib/pms/permissions.ts`.
**When to use:** Every action button, edit control, and UI decision
**Functions needed:**
```typescript
canViewCommittees(user: UserAccount): boolean                 // all authenticated
canCreateCommittee(user: UserAccount): boolean                // Director, SystemAdmin, MasterAdmin
canEditCommittee(user: UserAccount): boolean                  // Director, SystemAdmin, MasterAdmin
canDeleteCommittee(user: UserAccount): boolean                // MasterAdmin only
canScheduleMeeting(user: UserAccount, committee: Committee): boolean  // if chair/sec or admin
canWriteMinutes(user: UserAccount, committee: Committee): boolean     // if chair/sec or admin
canEditActionItems(user: UserAccount): boolean                // DivisionHead, HOD, Director, SystemAdmin, MasterAdmin
canUploadDocuments(user: UserAccount): boolean                // Director, SystemAdmin, MasterAdmin (+ chair/sec per design spec)
canManageMembers(user: UserAccount): boolean                  // Director, SystemAdmin, MasterAdmin
canUnlockMinutes(user: UserAccount): boolean                  // Admin roles
```

### Pattern 6: Drag-and-Drop (Agenda Reorder + Kanban)
**What:** framer-motion `Reorder` for within-group reordering.
**When to use:** CMT-04 agenda reordering (D-06), CMT-08 kanban within-column drag (D-09)
**Key characteristics:**
- **Agenda:** `Reorder.Group` with `values={agendaItems}` and `onReorder={setAgendaItems}`
  - `Reorder.Item` per agenda item with `value={item.id}`
  - Grip handle via `useDragControls()` + `dragListener={false}` (D-06)
  - Sequence numbers recalculated and saved on explicit Save action
- **Kanban:** `Reorder.Group` per column (3 separate groups)
  - Cross-column movement via click-to-cycle status badge (D-12)
  - framer-motion `Reorder` does NOT support dragging between separate groups [VERIFIED: motion.dev docs]
  - Each kanban card gets `onClick` on status badge to cycle Pending→InProgress→Completed→Pending

### Anti-Patterns to Avoid
- **Direct Supabase calls from pages:** Pages call Supabase for WRITES only; reads ALWAYS through `useData()`. Confirmed in CONTEXT.md phase boundary and code_context.
- **Client-side `UPDATE status` for PMS-style gating:** Committees do NOT use RPC gates for status transitions (Decision D-02, Phase 1). Direct `supabase.from().update()` is correct for committee/meeting/action_item status changes.
- **`localStorage` for role/permission checks:** Use `useAuth().user` and `permissions.ts` functions. `localStorage` is spoofable per CLAUDE.md.
- **Master-detail split layout:** User decided separate pages (D-01). Don't implement a sidebar+detail panel layout.
- **Rich text for minutes:** User decided plain text. Don't use contentEditable, TipTap, or any rich text editor.
- **Building custom drag-and-drop:** framer-motion Reorder is already installed and sufficient. Don't install @dnd-kit or react-beautiful-dnd.
- **Raw Tailwind colors:** Use semantic tokens only: `bg-surface`, `text-text-muted`, `border-border`, `text-brand-blue`. Never raw hex in components.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agenda item reordering | Custom drag-and-drop JS | framer-motion `Reorder.Group` + `Reorder.Item` | Already installed; handles animation, accessibility, touch; edge cases (autoscroll, z-index) are non-trivial |
| Kanban column drag | Custom HTML5 drag-and-drop | framer-motion `Reorder` (within columns) + status badge click (cross-column) | Reorder limitation: cannot drag between separate groups. D-12 provides click-to-cycle as fallback for cross-column |
| File upload UI | Custom progress tracking + multipart upload | `supabase.storage.from('committee-docs').upload()` | Handles authentication, RLS, progress events; custom multipart upload is complex and error-prone |
| Authentication checks | Manual `localStorage.getItem()` | `useAuth()` context | Already wired; RLS-enforced; `localStorage` is spoofable |
| Form validation | Custom validation functions | Inline validation checks (required, date validity) | Simple form needs; zod available if complex validation needed |
| Toast notifications | react-hot-toast or similar library | Simple fixed-position div with auto-dismiss | User explicitly chose no library (Claude's Discretion); 20-line implementation |
| Staff search | Complex autocomplete component | Client-side `.filter()` of staff array by name match | User decided client-side is sufficient (Claude's Discretion) |
| Date formatting | Custom date functions | `src/utils/dateUtils.ts` existing helpers | Already handles HR date formats; extend for meeting dates, deadline display |

**Key insight:** The only non-trivial custom behavior is the minutes lock (D-19) which requires both UI soft-gate (disable textarea + amber badge) and RLS hard-gate (prevent UPDATE on locked meetings). The lock condition is: `meeting.status === 'Completed' AND meeting_date < NOW() - INTERVAL '7 days'`. Admin unlock requires a SECURITY DEFINER function that bypasses RLS.

## Runtime State Inventory

> **Phase type:** Greenfield UI build (not a rename/refactor/migration phase). No runtime state needs migration. All data entities are new and use the established Phase 1 foundation.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Committee, meeting, action item data in Supabase (via Phase 1 migration) | None — data model exists, pages will CRUD into it |
| Live service config | None — no external services configured with committee-specific settings | None |
| OS-registered state | None | None |
| Secrets/env vars | None new — uses existing Supabase credentials | None |
| Build artifacts | None | None |

**Nothing found in any category:** This is a greenfield UI build on top of an existing data layer. All runtime state is managed by the existing Supabase backend + DataContext.

## Common Pitfalls

### Pitfall 1: Committee Members and Agenda Items Not in DataContext State
**What goes wrong:** Pages trying `useData().committeeMembers` or `useData().agendaItems` will get `undefined` — these are loaded from Supabase but discarded with `void` in DataContext (line 191-192 of DataContext.tsx). STATE.md explicitly says: "committee_members and agenda_items loaded from Supabase but not stored in top-level state — reserved for Phase 2 committee detail pages."
**Why it happens:** Phase 1 deferred storing these in top-level state to avoid `noUnusedLocals` compilation errors.
**How to avoid:** Phase 2 MUST either: (a) add `committeeMembers` and `agendaItems` to DataContext state + interface, or (b) fetch them independently from Supabase in detail pages. Option (a) is preferred — add state variables, update DataContextType interface, add to provider value. This is a Wave 0 prerequisite task.
**Warning signs:** `Property 'committeeMembers' does not exist on type 'DataContextType'` TypeScript error.

### Pitfall 2: framer-motion Reorder Cannot Drag Between Groups
**What goes wrong:** Implementing kanban drag between columns using `Reorder.Group` per column. The `onReorder` callback only fires for items within the same group — dragging a card from "Pending" to "In Progress" column won't trigger any callback.
**Why it happens:** framer-motion Reorder is designed for single-list reordering, not multi-container DnD. The official docs confirm this limitation.
**How to avoid:** Implement cross-column movement via clicking the status badge (D-12) — which cycles Pending→InProgress→Completed→Pending. Within-column reordering via `Reorder` is fine for visual organization. If cross-column drag is essential, would need @dnd-kit/core (but D-12 provides click fallback, so this is acceptable).
**Warning signs:** Card disappears visually when dragged to another column, no `onReorder` callback fires.

### Pitfall 3: Private Storage Bucket — Don't Use getPublicUrl
**What goes wrong:** Using `storage.from('committee-docs').getPublicUrl(path)` to create download links — this returns 404 because the `committee-docs` bucket is private (`public: false` in migration line 416).
**Why it happens:** Public URL methods only work for public buckets. The policy is intentional (RLS-enforced access).
**How to avoid:** Use `storage.from('committee-docs').download(path)` which returns a signed Blob via authenticated request. Create an object URL from the Blob for display/download: `URL.createObjectURL(blob)`. Alternatively, use `createSignedUrl(path, expiresIn)` for time-limited direct URLs.
**Warning signs:** 404 errors from `getPublicUrl`, broken download links, console errors about unauthorized access.

### Pitfall 4: Minutes Lock — Migration Says "No Lock" but CONTEXT.md Requires It
**What goes wrong:** The minutes editor locking logic (D-19) requires both UI and RLS enforcement, but the Phase 1 migration explicitly states "Decision D-03: No minutes lock (RLS or app-level)." The planner must reconcile this.
**Why it happens:** Phase 1 migration was written before the CONTEXT.md decisions were finalized. D-03 in the migration is stale.
**How to avoid:** A new migration is needed to add: (a) RLS policy preventing `UPDATE` on `meetings.summary` when `status='Completed' AND meeting_date < NOW() - INTERVAL '7 days'`, and (b) a SECURITY DEFINER function `unlock_meeting_minutes(meeting_id uuid)` for admin override. The UI soft-gate (disable textarea + amber badge) can be implemented regardless, but without the RLS policy, any authenticated user could bypass it via direct API call.
**Warning signs:** Locked meetings can still be edited via API, admin unlock has no implementation path.

### Pitfall 5: Storage RLS Restricts Upload to Admin-Only (Design Spec Wants Chair/Sec Too)
**What goes wrong:** The design spec (and D-20) says chairperson and secretary should be able to upload meeting documents, but the current RLS policy (lines 425-430 of migration) only allows Director, SystemAdmin, MasterAdmin.
**Why it happens:** RLS policy was written with a conservative admin-only stance. Chairperson/secretary upload permission was specified later in the UX design.
**How to avoid:** Update the storage INSERT policy to also check: the uploading user is the chairperson or secretary of the committee that owns the meeting. This requires a subquery joining `meetings` → `committees` to verify `chairperson_id` or `secretary_id` matches `auth.uid()`. This needs a new migration. Alternatively, accept the current restriction and adjust the UI to only show upload button to admin roles.
**Warning signs:** Chairperson/secretary sees upload button but gets RLS error on upload attempt.

### Pitfall 6: Multiple Routes Registered Under Same Layout
**What goes wrong:** Routes `/committees/:id`, `/committees/:id/meetings`, `/committees/:id/actions`, `/committees/:id/meetings/:meetId` must be carefully ordered in React Router to avoid ambiguity.
**Why it happens:** React Router matches routes in order. `/committees/:id` will match `/committees/:id/meetings` if not ordered correctly.
**How to avoid:** Register more specific routes first: `/committees/:id/meetings/:meetId` → `/committees/:id/meetings` → `/committees/:id/actions` → `/committees/:id`. This is the standard React Router v7 ordering pattern.
**Warning signs:** Clicking "Meetings" tab navigates to Overview instead of meetings list.

## Code Examples

### Committee List with Card Grid
```typescript
// Source: Facilities.tsx pattern + CONTEXT.md D-03
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Skeleton } from '../../components/ui/Skeleton';
import { canCreateCommittee } from '../../lib/committees/permissions';
import { Search, Building2 } from 'lucide-react';
import type { Committee } from '../../types';

export default function CommitteeList() {
  const { committees, isLoading } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filtered = useMemo(() =>
    committees.filter(c => {
      const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = typeFilter === 'ALL' || c.committee_type === typeFilter;
      const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    }),
  [committees, searchTerm, typeFilter, statusFilter]);

  if (isLoading) {
    return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1,2,3].map(i => <Skeleton key={i} className="h-48" />)}
    </div>;
  }

  // Empty state (D-13)
  if (committees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <Building2 size={48} className="text-text-muted" />
        <p className="text-text-muted">No committees configured yet.</p>
        {user && canCreateCommittee(user) && (
          <button className="px-4 py-2 bg-[#c96442] text-white rounded-lg">Create Committee</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search + Filters (D-03) */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <input
            type="text" placeholder="Search committees..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm w-64"
          />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-sm">
          <option value="ALL">All Types</option>
          <option value="Standing">Standing</option>
          <option value="AdHoc">Ad Hoc</option>
          <option value="Review">Review</option>
          <option value="Advisory">Advisory</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-sm">
          <option value="ALL">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {/* Card Grid (D-03) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(c => (
          <button key={c.id} onClick={() => navigate(`/committees/${c.id}`)} className="text-left">
            <Card className="hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <h3 className="font-[500] text-text font-serif">{c.name}</h3>
                <Badge variant={c.committee_type === 'Standing' ? 'info' : 'neutral'}>{c.committee_type}</Badge>
              </div>
              <p className="text-sm text-text-muted mt-2 line-clamp-2">{c.mandate}</p>
              <div className="flex items-center gap-2 mt-3 text-xs text-text-muted">
                <Badge variant={c.status === 'Active' ? 'success' : 'warning'}>{c.status}</Badge>
                <span>Formed: {c.formed_date}</span>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Agenda Reorder with framer-motion
```typescript
// Source: framer-motion Reorder docs [VERIFIED: motion.dev] + D-06, D-18
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, X, Plus, Check, Pencil } from 'lucide-react';
import type { AgendaItem } from '../../../types';

interface AgendaEditorProps {
  items: AgendaItem[];
  onSave: (items: AgendaItem[]) => Promise<void>;
  canEdit: boolean;
}

export function AgendaEditor({ items, onSave, canEdit }: AgendaEditorProps) {
  const [editMode, setEditMode] = useState(false);
  const [localItems, setLocalItems] = useState(items);

  // D-18: View mode vs Edit mode
  if (!editMode) {
    return (
      <div>
        <ol className="list-decimal list-inside space-y-2">
          {items.map(item => (
            <li key={item.id} className="text-sm text-text">{item.description}</li>
          ))}
        </ol>
        {canEdit && (
          <button onClick={() => setEditMode(true)}
            className="mt-3 flex items-center gap-1.5 text-xs text-[#c96442]">
            <Pencil size={12} /> Edit Agenda
          </button>
        )}
      </div>
    );
  }

  // D-06: Drag to reorder with grip handles
  return (
    <div>
      <Reorder.Group
        axis="y"
        values={localItems}
        onReorder={setLocalItems}
        className="space-y-2"
      >
        {localItems.map((item, idx) => {
          const controls = useDragControls();
          return (
            <Reorder.Item
              key={item.id}
              value={item.id}
              dragListener={false}
              dragControls={controls}
              className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3"
            >
              {/* Grip handle (D-06) */}
              <div
                onPointerDown={(e) => controls.start(e)}
                className="cursor-grab text-text-muted hover:text-text"
              >
                <GripVertical size={16} />
              </div>
              <span className="text-xs text-text-muted w-6">{idx + 1}.</span>
              <span className="flex-1 text-sm text-text">{item.description}</span>
              <button onClick={() => {
                setLocalItems(localItems.filter(i => i.id !== item.id));
              }} className="text-text-muted hover:text-red-500">
                <X size={14} />
              </button>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>

      {/* Inline add (D-18) */}
      <div className="mt-2 flex gap-2">
        <input placeholder="Add agenda item..." className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm" />
        <button className="p-2 text-[#c96442]"><Plus size={16} /></button>
      </div>

      <div className="mt-3 flex gap-2 justify-end">
        <button onClick={() => { setLocalItems(items); setEditMode(false); }}
          className="px-3 py-1.5 text-sm border border-border rounded-lg">Cancel</button>
        <button onClick={async () => {
          // Recalculate sequence numbers
          const sequenced = localItems.map((item, i) => ({ ...item, sequence: i + 1 }));
          await onSave(sequenced);
          setEditMode(false);
        }} className="px-3 py-1.5 text-sm bg-[#c96442] text-white rounded-lg flex items-center gap-1">
          <Check size={14} /> Save
        </button>
      </div>
    </div>
  );
}
```

### Supabase Document Upload
```typescript
// Source: Supabase Storage docs [VERIFIED: supabase.com/docs] + D-20
import { supabase } from '../../../utils/supabaseClient';
import { useData } from '../../../contexts/DataContext';

interface DocumentUploaderProps {
  meetingId: string;
  committeeId: string;
}

export function DocumentUploader({ meetingId, committeeId }: DocumentUploaderProps) {
  const { meetingDocs, refreshData } = useData();
  const [uploading, setUploading] = useState(false);

  const docs = useMemo(
    () => meetingDocs.filter(d => d.meeting_id === meetingId),
    [meetingDocs, meetingId]
  );

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const path = `${committeeId}/${meetingId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase!
        .storage.from('committee-docs')
        .upload(path, file);

      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase!
        .from('meeting_documents')
        .insert({
          meeting_id: meetingId,
          file_name: file.name,
          storage_path: path,
        });

      if (insertErr) throw insertErr;
      await refreshData();
    } catch (err) {
      console.error('Upload failed:', err);
      // Show toast notification
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (storagePath: string, fileName: string) => {
    const { data, error } = await supabase!
      .storage.from('committee-docs')
      .download(storagePath);

    if (error || !data) return;

    // Create blob URL for download (private bucket)
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <label className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg cursor-pointer hover:bg-surface-hover text-sm">
        <Upload size={14} />
        {uploading ? 'Uploading...' : 'Upload Document'}
        <input type="file" accept=".pdf,.doc,.docx,.xlsx,.png,.jpg"
          onChange={handleUpload} className="hidden" disabled={uploading} />
      </label>

      {docs.map(doc => (
        <div key={doc.id} className="flex items-center gap-3 mt-2 p-2 bg-surface border border-border rounded-lg">
          <FileText size={16} className="text-text-muted" />
          <span className="flex-1 text-sm text-text">{doc.file_name}</span>
          <span className="text-xs text-text-muted">{doc.uploaded_at}</span>
          <button onClick={() => handleDownload(doc.storage_path, doc.file_name)}
            className="text-[#c96442] hover:underline text-xs">Download</button>
        </div>
      ))}
    </div>
  );
}
```

### Minutes Editor with Lock
```typescript
// Source: CONTEXT.md D-19 + permissions.ts pattern
import { canWriteMinutes, canUnlockMinutes } from '../../../lib/committees/permissions';
import { supabase } from '../../../utils/supabaseClient';
import type { Meeting, Committee } from '../../../types';

interface MinutesEditorProps {
  meeting: Meeting;
  committee: Committee;
  user: UserAccount;
  onUpdate: () => void;
}

export function MinutesEditor({ meeting, committee, user, onUpdate }: MinutesEditorProps) {
  const [text, setText] = useState(meeting.summary);
  const [saving, setSaving] = useState(false);

  // D-19: Lock condition
  const isLocked = meeting.status === 'Completed'
    && new Date(meeting.meeting_date) < new Date(Date.now() - 7 * 86400000);

  const canEdit = !isLocked && canWriteMinutes(user, committee);
  const canUnlock = isLocked && canUnlockMinutes(user);

  const handleBlur = async () => {
    if (text === meeting.summary || !canEdit) return;
    setSaving(true);
    await supabase!.from('meetings').update({ summary: text }).eq('id', meeting.id);
    setSaving(false);
    onUpdate();
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text">Meeting Minutes</h3>
        {isLocked && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700"
            title="Minutes are locked 7 days after meeting completion. Only admins can unlock.">
            <Lock size={12} /> Locked
          </span>
        )}
        {canUnlock && (
          <button onClick={async () => {
            await supabase!.rpc('unlock_meeting_minutes', { meeting_id: meeting.id });
            onUpdate();
          }} className="text-xs text-[#c96442] hover:underline">Unlock</button>
        )}
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={handleBlur}
        disabled={!canEdit}
        rows={8}
        className={`w-full px-4 py-3 bg-surface border border-border rounded-lg text-sm resize-y
          ${!canEdit ? 'bg-surface-hover text-text-muted cursor-not-allowed' : ''}`}
        placeholder={canEdit ? 'Enter meeting minutes...' : 'Minutes are locked.'}
      />
      {saving && <span className="text-xs text-text-muted">Saving...</span>}
    </div>
  );
}
```

### Permissions Module
```typescript
// Source: replicates src/lib/pms/permissions.ts pattern [VERIFIED: codebase]
import type { UserAccount, Committee } from '../../types';

const ADMIN_ROLES = ['Director', 'SystemAdmin', 'MasterAdmin'] as const;

export function canViewCommittees(_user: UserAccount): boolean {
  return true; // All authenticated users
}

export function canCreateCommittee(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

export function canEditCommittee(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

export function canDeleteCommittee(user: UserAccount): boolean {
  return user.activeRole === 'MasterAdmin';
}

export function canScheduleMeeting(user: UserAccount, committee: Committee): boolean {
  if ((ADMIN_ROLES as readonly string[]).includes(user.activeRole)) return true;
  // Must be chairperson or secretary OF THIS committee
  return user.id === committee.chairperson_id || user.id === committee.secretary_id;
}

export function canWriteMinutes(user: UserAccount, committee: Committee): boolean {
  return canScheduleMeeting(user, committee);
}

export function canEditActionItems(user: UserAccount): boolean {
  const allowed: string[] = ['DivisionHead', 'HOD', 'Director', 'SystemAdmin', 'MasterAdmin'];
  return allowed.includes(user.activeRole);
}

export function canUploadDocuments(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

export function canManageMembers(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

export function canUnlockMinutes(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `framer-motion` (npm) | `motion` (rebranded) | 2025/Q4 (v12.x) | Package name change from `framer-motion` to `motion`; import path changed. Project still uses `framer-motion` v12.38.0 which supports both import paths. `import { Reorder } from 'framer-motion'` still works. |
| supabase-js v1 storage API | supabase-js v2 storage API | 2023 | v2 uses `storage.from(bucket).upload(path, body)` vs v1's `.upload(path, body)`. Project already on v2.105.4. |
| React Router v6 nesting | React Router v7 route layouts | 2024/Q4 | Project uses `HashRouter` with flat route structure + `ProtectedRoute` wrapper. No nesting syntax change needed. |

**Deprecated/outdated:**
- `framer-motion` Reorder documentation at `framer.com` — redirects to `motion.dev`. Always use `motion.dev` for current API docs. [VERIFIED: 308 redirect]
- React Router v6 `<Routes>` nesting with `<Outlet>` — still works in v7 but the project already uses this pattern.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `committee_members` and `agenda_items` need to be added to DataContext state (currently loaded but discarded). | DataContext Pitfall #1 | Medium — pages would need to fetch these independently from Supabase, breaking the `useData()` pattern. |
| A2 | framer-motion `Reorder` can be used for within-column kanban reordering but NOT cross-column. | Architecture Patterns #6 | Low — verified via official docs at motion.dev. D-12 provides click-to-cycle as cross-column fallback. |
| A3 | A new migration is needed for minutes lock RLS policy + unlock RPC. | Pitfall #4 | High — without RLS policy, UI-only lock can be bypassed via API. Security concern. |
| A4 | A new migration is needed for storage upload RLS to include chairperson/secretary. | Pitfall #5 | Medium — without update, chairperson/secretary cannot upload documents despite UI showing the button. |
| A5 | React Router v7 route ordering (specific before general) prevents route ambiguity. | Pitfall #6 | Low — standard React Router behavior. |
| A6 | Toast notification can be a simple fixed div without a library. | Don't Hand-Roll | Low — user explicitly chose this approach. Worst case: add a 2KB toast library later. |
| A7 | The project uses `src/pages/committees/` subdirectory (not `src/pages/Committees.tsx`). | Project Structure | Medium — CLAUDE.md says `src/pages/<Page>.tsx` for single-file pages but doesn't specify subdirectories. Subdirectory is cleaner for 3 pages + modals. |

## Open Questions (RESOLVED)

1. **Minutes Lock RLS Policy vs. Migration Statement**
   - What we know: CONTEXT.md D-19 requires auto-lock 7 days after completion. Phase 1 migration line 5 says "Decision D-03: No minutes lock (RLS or app-level)."
   - What's unclear: Whether to add the lock in Phase 2 (new migration) or defer it. CONTEXT.md (user decision) takes precedence over the migration comment, but this needs explicit user confirmation.
   - Recommendation: Include the lock implementation in the plan (both UI soft-gate AND new RLS migration for hard-gate). Flag this as a user-confirm item.

2. **Storage Upload RLS Expansion**
   - What we know: Current RLS allows upload only for Director/SystemAdmin/MasterAdmin. Design spec and D-20 imply chairperson and secretary should be able to upload meeting documents.
   - What's unclear: Whether to update RLS now (new migration) or defer to Phase 4 (Integration & Polish).
   - Recommendation: Update the RLS policy in Phase 2 as part of the document upload feature. The update needs a subquery joining `meetings → committees` to verify `chairperson_id` or `secretary_id`. If this is complex, defer and restrict UI upload button to admin roles only for Phase 2.

3. **Committee Members and Agenda Items in DataContext**
   - What we know: These are loaded from Supabase (line 180-181 of DataContext.tsx) but discarded (line 191-192: `void cmmRes; void agiRes;`). STATE.md confirms this is deferred to Phase 2.
   - What's unclear: Whether to add them as top-level arrays in DataContext (matching other entities) or fetch them from Supabase directly in detail pages.
   - Recommendation: Add to DataContext as top-level arrays (`committeeMembers`, `agendaItems`) to maintain the clean `useData()` pattern. This is the simplest approach and consistent with how meetings, action items, and meetingDocs are handled.

4. **Kanban Cross-Column Drag Behavior**
   - What we know: D-09 says "Drag between columns changes status via framer-motion." D-12 says both drag and click-to-cycle should work. framer-motion Reorder cannot drag between separate groups.
   - What's unclear: Whether to implement cross-column drag (requiring @dnd-kit) or accept click-to-cycle as the only cross-column mechanism with Reorder handling within-column reordering only.
   - Recommendation: Implement click-to-cycle (D-12) as the cross-column mechanism and use Reorder for within-column card ordering. Add a note that full cross-column drag-and-drop requires @dnd-kit and can be added later. This satisfies D-12 ("Both interactions work") with the Reorder limitation clearly documented.

5. **Tab Implementation Strategy**
   - What we know: D-02 defines 3 tabs (Overview, Meetings, Action Tracker) with Overview at `/committees/:id` and the others navigable. But the component tree in the design spec shows "CommitteeDetail.tsx — single-committee view, same 3 tabs scoped" implying tabs within a single page.
   - What's unclear: Whether tabs are React Router sub-routes (navigable URLs) or client-side tab state (conditional rendering within CommitteeDetail.tsx).
   - Recommendation: Use React Router sub-routes as D-02 specifies explicit URLs (`/committees/:id/meetings`, `/committees/:id/actions`). This makes each tab bookmarkable and shareable. CommitteeDetail.tsx renders the tab navigation bar + `<Outlet />` for tab content, or conditionally renders sections based on `useLocation()`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/dev | Yes | — (runtime) | — |
| npm | Package management | Yes | — | — |
| Supabase project | Data + Auth + Storage | Yes (via env/ls) | — | Mock data in DataContext |
| framer-motion | Drag-and-drop (agenda, kanban) | Yes | 12.38.0 | — |
| lucide-react | Icons | Yes | 0.577.0 | — |

**Missing dependencies with no fallback:** None — all dependencies are project-standard and already installed.

**Missing dependencies with fallback:** None.

**Step 2.6: SKIPPED (all external dependencies are project-standard packages already in node_modules; Supabase connection is optional — mock data fallback exists).**

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | none — create `vitest.config.ts` as Wave 0 |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CMT-01 | Committee list renders, search filters by name, type/status filter works | unit (component) | `npx vitest run src/pages/committees/__tests__/CommitteeList.test.tsx` | No (Wave 0) |
| CMT-02 | Admin can create committee (form → Supabase insert), validation errors shown | integration | `npx vitest run src/components/committees/__tests__/CommitteeFormModal.test.tsx` | No (Wave 0) |
| CMT-03 | Committee detail renders 3 tabs, not-found UI for invalid ID | unit (component) | `npx vitest run src/pages/committees/__tests__/CommitteeDetail.test.tsx` | No (Wave 0) |
| CMT-04 | Meeting scheduling form validates, agenda items reorder via Reorder | integration | `npx vitest run src/components/committees/__tests__/MeetingFormModal.test.tsx` | No (Wave 0) |
| CMT-05 | Minutes autosave on blur, lock disables textarea after 7 days | unit (component) | `npx vitest run src/components/committees/__tests__/MinutesEditor.test.tsx` | No (Wave 0) |
| CMT-06 | File upload triggers Supabase storage call, download creates blob URL | integration | `npx vitest run src/components/committees/__tests__/DocumentUploader.test.tsx` | No (Wave 0) |
| CMT-07 | Action item status toggles Pending→InProgress→Completed→Pending | unit | `npx vitest run src/lib/committees/__tests__/permissions.test.ts` | No (Wave 0) |
| CMT-08 | Kanban renders 3 columns, overdue items have red styling, filters work | unit (component) | `npx vitest run src/components/committees/__tests__/KanbanBoard.test.tsx` | No (Wave 0) |
| CMT-permissions | Permission functions return correct boolean for each role | unit | `npx vitest run src/lib/committees/__tests__/permissions.test.ts` | No (Wave 0) |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** All tests pass before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` — Vitest configuration file (none exists)
- [ ] `src/lib/committees/__tests__/permissions.test.ts` — permission logic tests (highest priority — pure functions, no mocking needed)
- [ ] `src/components/committees/__tests__/MinutesEditor.test.tsx` — lock logic tests
- [ ] `src/components/committees/__tests__/KanbanBoard.test.tsx` — kanban rendering + overdue logic
- [ ] `src/pages/committees/__tests__/CommitteeList.test.tsx` — list rendering + filter tests
- [ ] `src/pages/committees/__tests__/CommitteeDetail.test.tsx` — detail page + tab tests
- [ ] React Testing Library setup (`@testing-library/react`, `@testing-library/jest-dom`) — not installed
- [ ] Supabase mock/setup for integration tests — `vi.mock('@supabase/supabase-js')` or test helper

**Note:** The project currently has only one test file (`src/utils/dateUtils.test.ts`). Setting up comprehensive test infrastructure is a Wave 0 task. Given Phase 2 scope, prioritize unit tests for permissions (pure functions, no mocking) and component tests for lock logic + overdue computation.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | Yes | Supabase Auth — `useAuth()` context; `ProtectedRoute` guard |
| V3 Session Management | Yes | Supabase session via `supabase.auth.getSession()` — never localStorage |
| V4 Access Control | Yes | RLS on all tables (Phase 1 migration); client-side `permissions.ts` for UI control; role-based route protection |
| V5 Input Validation | Yes | Form-level validation (required fields, date validity, file type); Supabase parameterized queries prevent SQL injection |
| V6 Cryptography | No | No cryptographic operations in this phase — auth handled by Supabase |
| V7 Error Handling | Partial | `try/catch` on all Supabase writes; errors surfaced as toast (D-15); DataContext falls back to empty arrays on fetch failure |
| V8 Data Protection | Yes | RLS restricts write access; private storage bucket prevents unauthorized file access |

### Known Threat Patterns for React + Supabase SPA

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Direct Supabase API calls from browser expose anon key | Information Disclosure | `VITE_SUPABASE_ANON_KEY` is public by design; RLS enforces all authorization server-side. Anon key in env is acceptable. |
| Client-side permission check bypass (user modifies JS) | Elevation of Privilege | RLS policies on Supabase tables provide server-side enforcement. `permissions.ts` is a UI convenience, not a security boundary. |
| Minutes lock bypass via direct API call | Tampering | RLS policy MUST prevent UPDATE on locked meetings. UI disable is not sufficient. See Open Question #1. |
| File upload to wrong meeting path | Spoofing | RLS policy should validate meeting ownership before upload. Current policy only checks role, not meeting context. |
| XSS via committee name or meeting title in card rendering | Tampering | React's JSX auto-escapes string content. No `dangerouslySetInnerHTML` used. LOW risk. |
| Unauthorized document download | Information Disclosure | `committee-docs` bucket is private; RLS restricts SELECT to authenticated users only. |
| CSRF on form submissions | Tampering | Supabase JS client handles CSRF protection internally; browser CORS policy enforced by Supabase. |

## Sources

### Primary (HIGH confidence)
- `CLAUDE.md` — Project stack, conventions, folder map, coding rules [VERIFIED: codebase root]
- `CONTEXT.md` (02-CONTEXT.md) — Phase 2 decisions and constraints [VERIFIED: file system]
- `REQUIREMENTS.md` — CMT-01 through CMT-08 requirements [VERIFIED: file system]
- `ROADMAP.md` — Phase 2 success criteria and artifacts [VERIFIED: file system]
- `docs/superpowers/specs/2026-05-07-committees-helpdesk-design.md` — Design spec with data model, permissions, state machines [VERIFIED: file system]
- `supabase/migrations/20260507000000_committees_helpdesk.sql` — Migration with RLS policies, storage bucket config [VERIFIED: file system]
- `src/contexts/DataContext.tsx` — Data loading pattern, available arrays, write pattern [VERIFIED: codebase]
- `src/types/index.ts` — Committee, Meeting, ActionItem, AgendaItem, CommitteeMember, MeetingDocument types [VERIFIED: codebase]
- `src/utils/supabaseClient.ts` — Supabase client initialization [VERIFIED: codebase]
- `src/lib/pms/permissions.ts` — Permission module pattern to replicate [VERIFIED: codebase]
- `src/components/ui/Modal.tsx` — Modal component API (isOpen, onClose, title, children) [VERIFIED: codebase]
- `src/components/ui/Cards.tsx` — Card, Badge, StatCard exports [VERIFIED: codebase]
- `src/components/ui/Skeleton.tsx` — Skeleton loading states [VERIFIED: codebase]
- `src/pages/InstrumentDetail.tsx` — Detail page pattern (useParams, useData, useMemo, not-found UI) [VERIFIED: codebase]
- `src/pages/Facilities.tsx` — List page pattern (search, filter, card grid, KPI cards) [VERIFIED: codebase]
- `src/App.tsx` — Route registration pattern with role guards [VERIFIED: codebase]
- `src/components/layout/Layout.tsx` — NAV_ITEMS pattern for sidebar [VERIFIED: codebase]
- Motion.dev: `https://motion.dev/motion/reorder/` — Reorder API (Group, Item, useDragControls, dragListener) [VERIFIED: WebFetch]
- Supabase docs: `https://supabase.com/docs/reference/javascript/storage-from-upload` — Storage upload API [VERIFIED: WebFetch]
- Supabase docs: `https://supabase.com/docs/reference/javascript/storage-from-download` — Storage download API [VERIFIED: WebFetch]
- framer-motion `Reorder` export confirmed present via `import('framer-motion')` runtime check [VERIFIED: node_modules inspection]

### Secondary (MEDIUM confidence)
- `package.json` — Exact dependency versions (React 19.2.4, framer-motion 12.38.0, supabase-js 2.105.4) [VERIFIED: codebase]
- `npm view framer-motion version` — Latest published version matches installed (12.38.0) [VERIFIED: npm registry]
- `src/utils/mockData.ts` — Mock committees, meetings, agenda items, action items, documents [VERIFIED: codebase]
- `src/utils/dataMapper.ts` — Committee row mappers [VERIFIED: codebase]

### Tertiary (LOW confidence)
- None. All claims verified against codebase or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified via `npm view` and codebase inspection
- Architecture: HIGH — patterns confirmed against existing codebase files (Facilities.tsx, InstrumentDetail.tsx, Modal.tsx, permissions.ts)
- Pitfalls: HIGH — 3 of 6 pitfalls confirmed via source code inspection (DataContext void, migration conflicts, Reorder docs); remaining 3 are standard React/Supabase patterns

**Research date:** 2026-05-09
**Valid until:** 2026-06-08 (30 days — stable React/Supabase stack)

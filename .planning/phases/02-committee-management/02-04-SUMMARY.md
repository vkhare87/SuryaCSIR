---
phase: 02-committee-management
plan: 04
subsystem: committees
tags: [modal, form, member-picker, committee-crud, meeting-schedule, action-item]
requires: [02-01-types, 02-02-permissions, 02-03-data-context, 02-04-db-schema]
provides: [MemberPicker, CommitteeFormModal, MeetingFormModal, ActionItemModal]
affects: src/components/committees/
decisions:
  - "MemberPicker uses local SelectedMember interface instead of CommitteeMember type — avoids noUnusedLocals and decouples picker from persistence"
  - "CommitteeFormModal uses delete-then-reinsert strategy for member persistence on edit — simpler than diff-based approach"
  - "ActionItemModal includes committee selector in standalone mode for context, but committee_id is not persisted (no column in action_items table)"
  - "Edit-mode status dropdown (Scheduled/Completed/Cancelled) follows Claude's discretion guidance for meeting status transitions"
tech-stack:
  added: []
  patterns: [Modal-based form pattern, useState-per-field, Supabase direct writes, delete-then-insert member persistence]
metrics:
  duration: ~25m
  start_time: 2026-05-10T00:00:00Z
  completed: 2026-05-10T00:25:00Z
key-files:
  created:
    - src/components/committees/MemberPicker.tsx
    - src/components/committees/CommitteeFormModal.tsx
    - src/components/committees/MeetingFormModal.tsx
    - src/components/committees/ActionItemModal.tsx
  modified: []
---

# Phase 2 Plan 4: Committee Modals Summary

Four modal components for committee management: staff search-and-add picker, committee CRUD form with full member persistence, meeting scheduling form, and action item creation modal.

## Tasks Executed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | MemberPicker | `145c927d` | `src/components/committees/MemberPicker.tsx` |
| 2 | CommitteeFormModal | `30d4c902` | `src/components/committees/CommitteeFormModal.tsx` |
| 3 | MeetingFormModal + ActionItemModal | `dac0635a` | `src/components/committees/MeetingFormModal.tsx`, `src/components/committees/ActionItemModal.tsx` |

## What Was Built

### MemberPicker (Task 1)
- Search staff by name with real-time filtered dropdown (max 10 results)
- Role selector for next add: Member, Invitee, ExternalExpert
- Selected members shown as chips with role badge (info/neutral/warning), role dropdown, and remove button
- Empty state: "No members added" message
- Uses `useData().staff`, `useMemo` for filtered listing, Badge component from Cards.tsx

### CommitteeFormModal (Task 2)
- Create/edit committee modal with 3 sections: Basic Info, Leadership, Members
- Fields: name, type (Standing/AdHoc/Review/Advisory), mandate, formed date, status, chairperson, secretary
- MemberPicker integration for member selection with role assignment
- Member persistence: delete-all-then-reinsert strategy for edits — ensures insert/new/delete of members is correct
- Delete committee with confirm dialog — deletes members first (FK constraint), then committee
- Validation: name, mandate, chairperson, secretary, formed date required with inline errors
- Permission guards: delete button only shown for MasterAdmin (`canDeleteCommittee`)
- Form init from committee prop for edit mode, reset for create mode

### MeetingFormModal (Task 3a)
- Schedule/edit meetings with title, date, venue
- Status dropdown (Scheduled/Completed/Cancelled) shown only in edit mode
- Inline agenda item builder: description + proposer, add/remove items, Enter-key support
- Agenda items persisted to `agenda_items` table with sequence numbering
- On edit: deletes existing agenda items, re-inserts with new sequence

### ActionItemModal (Task 3b)
- Dual-mode: meeting-based (`source=meeting`) and standalone (`source=manual`)
- Standalone mode: committee selector dropdown for context (not persisted — schema limitation)
- Staff assignee picker sorted by Name
- Fields: task description, assignee, deadline
- Status hardcoded to `Pending` on create
- Validation: task, assignee, deadline required; committee required for standalone mode

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `CommitteeMember` type import from MemberPicker**
- **Found during:** Task 1 build verification
- **Issue:** `CommitteeMember` imported but never used (strict TypeScript `noUnusedLocals`)
- **Fix:** Removed import and replaced with explanatory comment
- **Files modified:** `src/components/committees/MemberPicker.tsx`
- **Commit:** `145c927d`

**2. [Rule 1 - Bug] Removed unused permission imports and fixed null user type in CommitteeFormModal**
- **Found during:** Task 2 build verification
- **Issue:** `canEditCommittee`, `canCreateCommittee`, `canManageMembers` imported but unused; `useAuth().user` returns `UserAccount | null` but `canDeleteCommittee` expects `UserAccount`
- **Fix:** Removed 3 unused imports; added `!user ||` guard before passing user to permission function
- **Files modified:** `src/components/committees/CommitteeFormModal.tsx`
- **Commit:** `30d4c902`

## Decisions Made

1. **MemberPicker uses local `SelectedMember` interface** — decouples picker from `CommitteeMember` DB type, avoids `noUnusedLocals` issue
2. **Delete-then-reinsert for members** — simpler than diff-based approach; safe within transaction window for committee edits
3. **Committee selector in standalone ActionItemModal** — shown for UX context but not persisted (no `committee_id` column on `action_items`). This is by-design per the plan specification.
4. **Status dropdown only in edit mode for MeetingFormModal** — new meetings always start as Scheduled

## Known Stubs

| File | Line | Description |
|------|------|-------------|
| `ActionItemModal.tsx` | `committeeId` state | Committee selector in standalone mode captures value but does not persist it — `action_items` table has no `committee_id` column. Present per plan specification for future schema addition. |

## Threat Flags

None — all threat surfaces (T-02-09 through T-02-12) are covered by the plan's threat model with RLS mitigation. No new endpoints or auth paths introduced.

## Verification

- `npm run build` exits 0 across all 3 tasks
- All grep-based acceptance criteria met or exceeded
- All components compile independently with strict TypeScript
- Supabase write paths covered: committees, committee_members, meetings, agenda_items, action_items

## Self-Check: PASSED

- All 4 component files created: `MemberPicker.tsx`, `CommitteeFormModal.tsx`, `MeetingFormModal.tsx`, `ActionItemModal.tsx`
- All 3 commits verified: `145c927d`, `30d4c902`, `dac0635a`
- SUMMARY.md created at `.planning/phases/02-committee-management/02-04-SUMMARY.md`

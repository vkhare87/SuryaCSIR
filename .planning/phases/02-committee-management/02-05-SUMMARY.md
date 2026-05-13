---
phase: 02-committee-management
plan: 05
plan-type: execute
wave: 3
autonomous: true
depends_on: [02-01, 02-03]
subsystem: committees/meetings
tags: [agenda-editor, minutes-editor, document-uploader, framer-motion, supabase-storage]
completed_date: 2026-05-10T08:02:19Z
key_decisions:
  - "AgendaItemRow extracted as separate FC component to satisfy rules-of-hooks (useDragControls must be at top level, not inside .map() callback)"
  - "MinutesEditor isLocked computed via useState/useEffect pattern (not inline Date.now()) to satisfy react-hooks/purity rule"
  - "MinutesEditor guarded by committee && user null-check with read-only fallback when user/committee unavailable"
tech-stack:
  added: []
  patterns:
    - "framer-motion Reorder.Group + Reorder.Item + useDragControls for drag-to-reorder lists"
    - "Supabase Storage private bucket pattern: upload() + download() + createObjectURL (ZERO getPublicUrl calls)"
    - "React component purity: impure functions (Date.now) gated behind useEffect, never inline in render body"
key-files:
  created:
    - src/components/committees/AgendaEditor.tsx (152 lines)
    - src/components/committees/MinutesEditor.tsx (93 lines)
    - src/components/committees/DocumentUploader.tsx (131 lines)
  modified:
    - src/pages/committees/MeetingDetail.tsx
requirements:
  - CMT-04
  - CMT-05
  - CMT-06
---

# Phase 2 Plan 5: Interactive Meeting Components Summary

Build three interactive meeting components (AgendaEditor, MinutesEditor, DocumentUploader) and wire them into MeetingDetail.tsx, replacing placeholder sections from Plan 02-03.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create AgendaEditor with framer-motion drag-to-reorder | `5570facd` | `src/components/committees/AgendaEditor.tsx` (new) |
| 2 | Create MinutesEditor with autosave and lock UI | `d0c2ae14` | `src/components/committees/MinutesEditor.tsx` (new) |
| 3 | Create DocumentUploader with Supabase Storage | `b632905d` | `src/components/committees/DocumentUploader.tsx` (new) |
| 4 | Wire components into MeetingDetail.tsx + lint fixes | `0c6b10a8` | `src/pages/committees/MeetingDetail.tsx` (modified), `AgendaEditor.tsx`, `MinutesEditor.tsx` (amended) |

## Verification Results

| Check | Result |
|-------|--------|
| `npm run build` | PASSED |
| `npm run lint` (new/modified files) | PASSED — 0 errors, 0 warnings |
| AgendaEditor: Reorder imports | 6 occurrences |
| AgendaEditor: dragListener={false} | 1 occurrence |
| AgendaEditor: sequence recalculation | 1 occurrence |
| AgendaEditor: list-decimal (view mode) | 1 occurrence |
| MinutesEditor: isLocked | 4 occurrences |
| MinutesEditor: unlock_meeting_minutes RPC | 1 occurrence |
| MinutesEditor: 7-day lock window | 1 occurrence |
| DocumentUploader: storage.from('committee-docs') | 3 occurrences (upload, download, delete) |
| DocumentUploader: .download() | 1 occurrence |
| DocumentUploader: getPublicUrl | 0 occurrences (CRITICAL — Pitfall 3) |
| DocumentUploader: createObjectURL | 1 occurrence |
| MeetingDetail: AgendaEditor import | 1 occurrence |
| MeetingDetail: MinutesEditor import | 1 occurrence |
| MeetingDetail: DocumentUploader import | 1 occurrence |
| MeetingDetail: Wired by Plan 02-05 | 0 occurrences (all placeholder comments removed) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] useDragControls hook called inside .map() callback (rules-of-hooks)**
- **Found during:** Task 4 lint check
- **Issue:** `useDragControls()` was called inside the inline `.map()` arrow function in `Reorder.Group`, violating React's Rules of Hooks (hooks must be at component top level).
- **Fix:** Extracted `AgendaItemRow` as a separate named FC component that calls `useDragControls()` at its top level. The parent `AgendaEditor` renders `<AgendaItemRow>` for each item.
- **Files modified:** `src/components/committees/AgendaEditor.tsx`
- **Commit:** `0c6b10a8`

**2. [Rule 1 - Bug] Date.now() impure function called during render body (react-hooks/purity)**
- **Found during:** Task 4 lint check
- **Issue:** `Date.now()` was called inline in the `isLocked` computation within the component render body, violating React's component purity rule.
- **Fix:** Refactored to compute `isLocked` via `useState` + `useEffect` pattern: initialize `isLocked` to `false`, then evaluate the lock condition inside `useEffect` on `[meeting.status, meeting.meeting_date]` changes.
- **Files modified:** `src/components/committees/MinutesEditor.tsx`
- **Commit:** `0c6b10a8`

**3. [Rule 3 - Blocking] TypeScript null-safety: MinutesEditor requires non-null Committee and UserAccount**
- **Found during:** Task 4 build
- **Issue:** `committee` (Committee | undefined) and `user` (UserAccount | null) are nullable but MinutesEditor props require non-null types. TypeScript strict mode rejected the assignment.
- **Fix:** Added a conditional render gate: if `committee && user`, render `<MinutesEditor>`; otherwise show a read-only fallback card with meeting summary text (preserving the original UX of always-visible minutes section).
- **Files modified:** `src/pages/committees/MeetingDetail.tsx`
- **Commit:** `0c6b10a8`

## Threat Flags

None. All threat model items from the plan are addressed:
- T-02-13 (agenda tampering): UI only shows edit controls when `canEdit` prop is true (backed by RLS)
- T-02-14 (minutes lock bypass): Dual enforcement — UI disables textarea when locked, plus RLS UPDATE block
- T-02-15 (document download disclosure): Private bucket — download via authenticated `.download()`, no `getPublicUrl()`
- T-02-16 (unauthorized upload): UI only shows upload button when `canUpload` prop is true (backed by RLS)

## Known Stubs

None. All three components read real data from DataContext and write to Supabase. No hardcoded empty values, placeholder text, or mock data paths flow to UI rendering.

## Self-Check

- [x] `src/components/committees/AgendaEditor.tsx` exists
- [x] `src/components/committees/MinutesEditor.tsx` exists
- [x] `src/components/committees/DocumentUploader.tsx` exists
- [x] `src/pages/committees/MeetingDetail.tsx` modified (3 components wired)
- [x] Commit `5570facd` exists
- [x] Commit `d0c2ae14` exists
- [x] Commit `b632905d` exists
- [x] Commit `0c6b10a8` exists
- [x] `npm run build` exits 0
- [x] Lint on new files exits 0

**Self-Check: PASSED**

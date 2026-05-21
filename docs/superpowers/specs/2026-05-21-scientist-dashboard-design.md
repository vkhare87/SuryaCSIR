# Scientist Dashboard Redesign + Dev Role Access

**Date:** 2026-05-21  
**Scope:** Two changes — (1) enhance `ScientistView.tsx` with operations + research combined hub layout, (2) grant `vivek.khare@csir.res.in` all roles via migration for development role-switching.

---

## Part 1: Scientist Dashboard

### Goal

Replace the current research-only view with a combined hub: operations strip at top (meetings, action items, this-week events), research portfolio grid at bottom (projects, PhD students, proposals).

### Layout — A (stacked)

```
┌────────────────────────────────────────────────────────┐
│  My Research Portfolio    Name · Designation · Div     │
├──────────────┬──────────────┬──────────────────────────┤
│  Meetings N  │  Actions N   │  Events this week N      │  KPI strip (3 cards)
├──────────────┴──┬───────────┴──────────────────────────┤
│ Upcoming Mtgs   │  This Week (holidays + calendar)     │  2-col ops row
├─────────────────┴────────────────────────────────────── │
│ My Action Items           (full width)                 │
├──────────────────┬─────────────────┬───────────────────┤
│  My Projects     │  PhD Supervisees │  My Proposals    │  3-col research grid
└──────────────────┴─────────────────┴───────────────────┘
```

### Data sources (all via `useData()` + `useProposals()`)

| Widget | Source | Filter |
|--------|--------|--------|
| KPI — Meetings count | `meetings` + `committeeMembers` | committee member rows where `staff_id === ownStaff.ID` → join meetings this calendar month |
| KPI — Open action items | `actionItems` | `assigneeName` fuzzy-match `ownStaff.Name` + status !== 'Done' |
| KPI — Events this week | `calendarEvents` + `holidays` | `event_date` within next 7 days |
| Upcoming Meetings | same as KPI meetings | next 5 by `meeting_date` ascending, only future dates |
| This Week | `calendarEvents` + `holidays` | next 7 days, sorted by date |
| Action Items | `actionItems` | assignee match, show up to 10, sorted by `due_date` |
| My Projects | `projects` + `projectStaff` | existing logic; add `FundingAgency` + `EndDate` columns |
| PhD Supervisees | `phDStudents` | existing logic; add `EnrollmentYear` + `ExpectedCompletion` columns |
| My Proposals | `ProposalsContext.proposals` | where `pi_id === user.id` OR scientist is in `coPIs`; show title, stage badge, submission deadline |

### Assignee matching for action items

`actionItems` stores `assigned_to` as a name string (not user_id). Use existing `staffNameMatchesAuthor(ownName, item.assigned_to)` utility — same pattern already used for instruments.

### Component structure

`ScientistView.tsx` — single file rewrite. No new sub-components; sections are inline JSX blocks separated by `// --- N. Section ---` dividers. File will be ~280 lines — acceptable for a dashboard page.

New memos required:
```typescript
const ownMeetingIds   = useMemo(...)  // committee_member rows where staff_id === ownStaff.ID → meeting IDs
const ownMeetings     = useMemo(...)  // meetings filtered + sorted by date
const ownActionItems  = useMemo(...)  // action items assigned to this scientist
const upcomingEvents  = useMemo(...)  // calendar events + holidays next 7 days
const ownProposals    = useMemo(...)  // proposals where PI or Co-PI
```

Existing memos (`ownProjects`, `supervisedPhDs`, `ownInstruments`) stay; `ownInstruments` KPI card is removed from the strip but instruments table remains accessible via `/facilities` link in the profile header.

### IRINS profile card

Stays at the bottom below the 3-col grid, unchanged. Conditionally rendered only when `ownStaff.VidwanID` is set.

### Empty states

Each widget renders an `<EmptyState>` (existing component) when its list is empty. No error-distinct variant needed — context-level toast already handles load failures.

### Responsive behaviour

- KPI strip: `grid-cols-3` always (counts are small, readable at mobile)
- 2-col ops row: `grid-cols-1 lg:grid-cols-2`
- 3-col research: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`

---

## Part 2: Dev Role Access — `vivek.khare@csir.res.in`

### Goal

Insert all 14 application roles into `user_roles` for `vivek.khare@csir.res.in` so the Layout role-switcher dropdown shows all roles, enabling development testing of every role dashboard without creating separate accounts.

### Implementation

New migration: `supabase/migrations/20260521120000_dev_all_roles.sql`

Uses a `DO $$ ... $$` block to resolve the auth UUID by email at migration runtime. Inserts a row per role with `division_code = NULL` (acceptable for all non-division roles; `DivisionHead` / `HOD` roles will show division=null, which is handled gracefully by `AuthContext`).

Roles inserted: `Director`, `DivisionHead`, `HOD`, `Scientist`, `Technician`, `HRAdmin`, `FinanceAdmin`, `SystemAdmin`, `MasterAdmin`, `Student`, `ProjectStaff`, `Guest`, `DefaultUser`, `EmpoweredCommittee`.

Uses `ON CONFLICT (user_id, role) DO NOTHING` — idempotent, safe to re-run.

### No code changes required

`AuthContext` already loads all `user_roles` rows and populates `user.roles[]`. Layout already renders the role-switcher when `roles.length > 1`. `setActiveRole` already persists the choice to `user_profiles.active_role`. Nothing to change in the app.

---

## Out of scope

- PMS appraisal status widget (not selected)
- Helpdesk tickets widget (not selected)
- IP/Patents widget (not selected)
- Instruments widget in KPI strip (removed; full table still at `/facilities`)
- Scientific outputs breakdown chart (not selected)
- Any changes to other role dashboards

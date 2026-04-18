# SURYA — Milestones 2 & 3 Design
**Date:** 2026-04-18  
**Status:** Approved — ready for implementation planning  
**Scope:** Phases 04–09 (6 features across 2 milestones)

---

## Section 1 — Milestone Structure

### Milestone 2: Live Data & Discovery (Phases 04–06)

| Phase | Feature | Summary |
|-------|---------|---------|
| 04 | Recruitment Backend | Vacancies table (2-level: advertisement → posts). HR Admin CRUD. Schema forward-compatible for application portal. |
| 05 | Calendar Backend | Events table with institute/division scope. Supports system-derived events (tenure, project completion) and manual events (meetings, special events, deadlines). |
| 06 | Scientist Portfolio View | `/portfolio/:staffId` — read-only, visible to all logged-in users. Aggregates staff, projects, PhD students, publications, IP. |

### Milestone 3: Intelligence & Administration (Phases 07–09)

| Phase | Feature | Summary |
|-------|---------|---------|
| 07 | Advanced Analytics & Trends | Full picture — publications, IP, projects, staff, PhDs, equipment. DateRangePicker global filter. Role-scoped views. |
| 08 | Notifications & Alerts | Deadline + announcement notifications. Supabase Realtime per-user channel. Bell icon in Layout. |
| 09 | SystemAdmin User Management | Invite, assign roles, deactivate, full audit log. Requires Supabase Edge Function for Auth Admin API calls. |

---

## Section 2 — Architecture & Data Model

### Phase 04 — Recruitment Backend

#### Database: Two-Level Structure

**Level 1 — `vacancy_advertisements`**
```sql
id             uuid PRIMARY KEY DEFAULT gen_random_uuid()
advt_no        text UNIQUE NOT NULL  -- e.g. "CSIR-AMPRI/2024/01"
title          text NOT NULL         -- e.g. "Recruitment of Scientists"
division_code  text                  -- nullable: null = institute-wide
issue_date     date NOT NULL
closing_date   date NOT NULL
status         text NOT NULL DEFAULT 'Draft'  -- Draft | Open | Closed
description    text
created_by     uuid REFERENCES auth.users(id)
created_at     timestamptz DEFAULT now()
```

**Level 2 — `vacancy_posts`**
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
advertisement_id    uuid REFERENCES vacancy_advertisements(id) NOT NULL
post_code           text              -- e.g. "SB-01"
designation         text NOT NULL     -- e.g. "Scientist-B"
pay_level           text              -- e.g. "Level 11"
no_of_positions     integer NOT NULL DEFAULT 1
qualifications      text
age_limit           text
discipline          text
status              text NOT NULL DEFAULT 'Open'  -- Open | Filled | Withdrawn
created_at          timestamptz DEFAULT now()
```

**Relationship:** One advertisement → many posts. Future `applicants` table links to `vacancy_posts.id` (per-post tracking, not per-advertisement).

**Constraint:** Delete advertisement blocked if posts exist (no cascade). Auto-close posts when parent advertisement is closed.

#### RLS Policies
- All authenticated users → READ both tables
- HRAdmin, MasterAdmin → INSERT/UPDATE/DELETE both tables

#### Components
| Component | Change |
|-----------|--------|
| `Recruitment.tsx` | Rewrite: wire to Supabase, advertisement list view with drill-down |
| `RecruitmentPosts.tsx` | **New:** post sub-table within advertisement detail |
| `Modal.tsx` | Reuse: separate forms for Add Advertisement vs Add Post |
| `DataTable.tsx` | Reuse: both levels |
| `DataContext` | Extend: add vacancies loader |

---

### Phase 05 — Calendar Backend

#### Database: `events`
```sql
id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
title            text NOT NULL
description      text
event_date       timestamptz NOT NULL
end_date         timestamptz
location         text
scope            text NOT NULL  -- institute | division
division_code    text           -- nullable; required when scope = division
event_type       text NOT NULL  -- meeting | special_event | deadline | tenure_completion | project_completion
source           text NOT NULL DEFAULT 'manual'  -- manual | system_derived
source_entity_id uuid           -- links to staff.id or projects.id for derived events
created_by       uuid REFERENCES auth.users(id)  -- null for system_derived
created_at       timestamptz DEFAULT now()
```

**Unique constraint on `(source_entity_id, event_type)`** — prevents duplicate system-derived events on re-sync.

#### Event Types

| Type | Source | Description |
|------|--------|-------------|
| `meeting` | manual | Institute-wide or division-level meetings |
| `special_event` | manual | Foundation day, national science day, visits |
| `deadline` | manual | Report submissions, regulatory deadlines |
| `tenure_completion` | system_derived | Computed from `staff.DOJ + tenure_period` |
| `project_completion` | system_derived | Derived from `projects.EndDate` |

#### Auto-Derivation Strategy (`calendarSync` utility)
- Runs on Calendar page mount
- Queries `staff` (DOJ + tenure period) and `projects` (EndDate)
- Upserts into `events` using `ON CONFLICT (source_entity_id, event_type) DO UPDATE`
- Skips staff records with no tenure period defined
- System-derived events: edit/delete blocked in UI via `source` field check
- calendarSync failure is caught silently — calendar still shows manual events

#### RLS Policies
- All authenticated users → READ
- Director, DivisionHead, SystemAdmin, MasterAdmin → INSERT/UPDATE manual events
- System-derived events upserted client-side (no separate service required initially)

#### Components
| Component | Change |
|-----------|--------|
| `Calendar.tsx` | Rewrite: Supabase-backed, event_type filter tabs, scope filtering |
| `calendarSync.ts` | **New:** utility to upsert system-derived events |
| `Modal.tsx` | Reuse: Add/Edit form (manual events only) |
| `DataContext` | Extend: events loader filtered by scope + divisionCode |

---

### Phase 06 — Scientist Portfolio View

#### Database
No new tables. Aggregates across 5 existing tables per page load:

| Table | Join Key |
|-------|----------|
| `staff` | `staff.id = :staffId` |
| `projects` via `project_staff` | `project_staff.staff_id = :staffId` |
| `phd_students` | `SupervisorName` (string match, case-insensitive) |
| `scientific_outputs` | `authors[]` array contains StaffName |
| `ip_intelligence` | `inventors[]` array contains StaffName |

All 5 queries run in parallel (Promise.all). One query failing does not block others.

#### Route
`/portfolio/:staffId` — accessible to all authenticated users (read-only).

#### Components
| Component | Change |
|-----------|--------|
| `Portfolio.tsx` | **New:** full page at `/portfolio/:staffId` |
| `App.tsx` | Add new route |
| `StaffDetail.tsx` | Add "View Portfolio" link button |
| Scientist dashboard | Add link to own portfolio |

#### Access
- All authenticated users → READ any portfolio
- No write actions on this page for any role
- Uses existing RLS policies — no new policies needed

---

### Phase 07 — Advanced Analytics & Trends

#### Database
No new tables. Uses aggregation queries across existing tables:

| Table | Aggregation |
|-------|-------------|
| `scientific_outputs` | Count by year, division_code |
| `ip_intelligence` | Count by filing_date year, division_code |
| `projects` | Count by StartDate year, division_code; active count |
| `staff` | Count by DOJ year, division_code |
| `phd_students` | Count by enrollment year, division_code |
| `equipment` | Count by purchase year, division_code |

Date range state stored in `AnalyticsContext` (shared across all charts).

#### Role-Based Scoping
| Role | Analytics Scope |
|------|----------------|
| Director, DivisionHead, SystemAdmin, MasterAdmin | All divisions |
| Scientist, Technician, HRAdmin | Own division only |

Defense in depth: scoping enforced both via client-side filter AND existing Supabase RLS policies.

#### Components
| Component | Change |
|-----------|--------|
| `AnalyticsContext` | **New:** aggregation queries + date range state |
| `Analytics.tsx` | **New:** dedicated analytics page |
| `DateRangePicker` | **New:** global filter (start/end date, Zod-validated: start ≤ end) |
| Recharts | Extend: LineChart, AreaChart, grouped BarChart |

---

### Phase 08 — Notifications & Alerts

#### Database: `notifications`
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id      uuid REFERENCES auth.users(id) NOT NULL
title        text NOT NULL
body         text NOT NULL
type         text NOT NULL  -- deadline | announcement
read         boolean NOT NULL DEFAULT false
entity_type  text           -- nullable: e.g. "project", "vacancy"
entity_id    text           -- nullable: UUID of the referenced entity
created_at   timestamptz DEFAULT now()
```

#### RLS Policies
- Users read own notifications only: `WHERE user_id = auth.uid()`
- Director, HRAdmin, MasterAdmin → INSERT announcements
- No DELETE policy (notifications are permanent; users can mark read)

#### Realtime
- `NotificationContext` subscribes to a per-user Supabase Realtime channel on login
- Auto-reconnects on network drop (Supabase SDK handles reconnection)
- Unread count derived from DB on page load, then incremented via Realtime events

#### Components
| Component | Change |
|-----------|--------|
| `NotificationContext` | **New:** Realtime subscription + unread count state |
| `NotificationBell` | **New:** bell icon + unread badge in Layout header |
| `NotificationPanel` | **New:** dropdown showing latest 20 notifications, "View all" link |
| `Layout.tsx` | Add bell to topbar |
| Admin dashboards | Add "Send Announcement" action |

---

### Phase 09 — SystemAdmin User Management

#### Database: `audit_log`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
actor_user_id   uuid NOT NULL
action          text NOT NULL  -- invite | role_change | deactivate
target_email    text
target_user_id  uuid
old_value       text
new_value       text
created_at      timestamptz DEFAULT now()
```

**Append-only:** no DELETE policy, ever. Admin cannot clear audit history.

#### Supabase Edge Function: `admin-user-ops`
Required because invite and deactivate use the Auth Admin API (service_role key), which cannot be exposed on the frontend.

Operations handled:
- `invite` — calls `supabase.auth.admin.inviteUserByEmail()`, creates `user_roles` row, inserts to `audit_log`
- `deactivate` — calls `supabase.auth.admin.updateUserById()` with `{ ban_duration: 'none' }` to ban the account (preserves data and audit trail), invalidates session, inserts to `audit_log`
- Self-deactivation blocked: checked in Edge Function (actor_user_id ≠ target_user_id)

#### Role Changes
Direct update to `user_roles` table (no Edge Function needed). Inserts to `audit_log`.

#### RLS Policies
- `audit_log`: SystemAdmin, MasterAdmin → READ. No write from frontend (only Edge Function and role-change application code write to it — no DB triggers).
- `user_roles`: SystemAdmin, MasterAdmin → UPDATE

#### Components
| Component | Change |
|-----------|--------|
| `admin-user-ops` Edge Function | **New:** invite + deactivate via service_role |
| `SystemAdminView.tsx` | Full rebuild: user list, role picker, invite form, audit log table |
| `Modal.tsx` | Reuse: invite user form, confirm deactivate |
| `DataTable.tsx` | Reuse: user list + audit log |

---

## Section 3 — Error Handling, Edge Cases & Verification

### Phase 04 — Recruitment

| Scenario | Handling |
|----------|----------|
| Duplicate `advt_no` | Unique DB constraint; friendly error shown in form |
| Closing date in the past | Zod warns but allows (historical entries permitted) |
| Delete advertisement with posts | Blocked: "Remove all posts first" message. No cascade. |
| Non-HRAdmin write attempt | RLS rejection: "You don't have permission to perform this action" |
| Advertisement with 0 posts | Empty state with "Add Post" CTA, not blank table |
| Advertisement closed but post still Open | Auto-close posts when parent advertisement is closed |

**Verification checklist:**
- [ ] HRAdmin can create advertisement and add posts
- [ ] Scientist (read-only) cannot see Add/Edit buttons
- [ ] Drill-down: click advertisement → shows its posts only
- [ ] Duplicate `advt_no` shows error, does not save
- [ ] Delete blocked when posts exist
- [ ] Empty advertisement shows "Add Post" CTA

---

### Phase 05 — Calendar

| Scenario | Handling |
|----------|----------|
| `calendarSync` query fails | Catch silently, log warning, show calendar with manual events intact |
| `scope=division` but `division_code` null | Treat as institute-wide, log data warning |
| Manual event with `end_date < event_date` | Zod catches at form level |
| Staff with no tenure period | Skip derivation for that record — no phantom events |
| Project EndDate changes | Upsert on `source_entity_id` updates the event date — no stale entries |
| System-derived event delete attempt | Delete button hidden in UI; blocked via `source` check |
| Duplicate upsert | `ON CONFLICT DO UPDATE` — no duplicates accumulate |

**Verification checklist:**
- [ ] `calendarSync` runs on mount and upserts tenure + project events
- [ ] Re-running sync does not create duplicates
- [ ] System events show no edit/delete controls
- [ ] Event type filter tabs work (All / Meeting / Special / Deadline / Auto)
- [ ] Division user only sees institute + own division events
- [ ] `calendarSync` failure leaves calendar intact

---

### Phase 06 — Portfolio

| Scenario | Handling |
|----------|----------|
| `staffId` not found | Dedicated 404 state: "This portfolio does not exist or has been removed" |
| One of the 5 parallel queries fails | That section shows "Data unavailable" — others render normally |
| Staff with no publications / projects | Each section shows empty state independently |
| StaffName string matching | Case-insensitive, trimmed match in `scientific_outputs` and `ip_intelligence` |

**Verification checklist:**
- [ ] `/portfolio/:staffId` loads for a valid ID
- [ ] Invalid `staffId` shows 404 state (not crash)
- [ ] All 5 sections load independently (partial failure safe)
- [ ] "View Portfolio" link appears on StaffDetail page
- [ ] Scientist dashboard links to own portfolio correctly
- [ ] No write controls visible for any role

---

### Phase 07 — Analytics

| Scenario | Handling |
|----------|----------|
| Aggregation returns empty | Charts show "No data for this period" state — no broken axes |
| Date range: start > end | Zod/DateRangePicker blocks; auto-swap or validation error |
| Large date range query | Debounced; loading spinner shown during fetch |
| Single data point in chart | Recharts renders as dot, not broken line |
| Division-scoped user | Client-side filter + RLS both apply (defense in depth) |

**Verification checklist:**
- [ ] Director sees all divisions in analytics
- [ ] Scientist sees only own division data
- [ ] DateRangePicker updates all charts simultaneously
- [ ] Empty range shows "no data" per chart (not crash)
- [ ] Charts cover: publications, IP, projects, staff growth, PhDs, equipment
- [ ] start > end date is rejected at input

---

### Phase 08 — Notifications

| Scenario | Handling |
|----------|----------|
| Realtime channel drops | Supabase SDK auto-reconnects; subtle "reconnecting…" indicator on bell |
| Announcement INSERT fails | Error surfaced in admin form; not silently discarded |
| `entity_id` points to deleted record | Notification still shows; deep-link button omitted |
| Many notifications | Panel shows latest 20; "View all" loads full list |
| Unread count accuracy | Derived from DB on load; not from in-memory state alone |
| Mark all as read | Single `UPDATE WHERE user_id = auth.uid() AND read = false` |

**Verification checklist:**
- [ ] Bell badge shows accurate unread count on page load
- [ ] New announcement arrives in real-time without page refresh
- [ ] User A cannot see User B's notifications (RLS verified)
- [ ] Mark as read updates badge immediately
- [ ] Scientist cannot access "Send Announcement" UI
- [ ] Channel reconnects after network drop (manual test)

---

### Phase 09 — SystemAdmin

| Scenario | Handling |
|----------|----------|
| Edge Function timeout / error | Show error; idempotent design allows retry |
| Invite to existing email | Edge Function returns conflict: "User already exists" |
| Deactivate own account | Blocked in UI (button disabled) + enforced in Edge Function |
| Role change for active session | User sees change on next page load (AuthContext re-resolves role) |
| Deactivated user still has open session | Session invalidation called alongside deactivation |
| Non-SystemAdmin direct URL access | Route guard redirects; RLS blocks any data queries |

**Verification checklist:**
- [ ] Invite sends email and creates `user_roles` row
- [ ] Duplicate invite shows error, does not create duplicate
- [ ] Deactivate blocks self-deactivation
- [ ] Every action (invite, role change, deactivate) appears in `audit_log`
- [ ] Non-SystemAdmin is redirected away from user management route
- [ ] Deactivated user's next request is rejected (session killed)

---

## Global Testing Strategy

### RLS Smoke Tests (per new table)
Test with 3 Supabase sessions for every new table:
1. Authorized role → expects data ✓
2. Unauthorized role → expects empty / error ✓
3. Unauthenticated → expects 401 ✓

### Component Checks (before marking each phase done)
- Empty state renders without crash
- Error state renders without crash
- Form validation prevents bad data reaching Supabase
- Loading spinner shows during async fetch

### Key E2E Manual Flows
| Phase | Flow |
|-------|------|
| 04 | HR creates advertisement → adds 2 posts → closes advertisement |
| 05 | Director adds meeting → auto-derived events appear on load |
| 06 | Click staff in list → View Portfolio → all 5 sections load |
| 07 | Change date range → all charts update simultaneously |
| 08 | Admin sends announcement → bell updates live in another session |
| 09 | Invite user → audit log entry → deactivate → session killed |

---

## Infrastructure Summary

| Item | Count | Notes |
|------|-------|-------|
| New Supabase tables | 4 | `vacancy_advertisements`, `vacancy_posts`, `notifications`, `audit_log` |
| Modified tables | 1 | `events` — 3 new fields (`event_type`, `source`, `source_entity_id`) |
| New Edge Functions | 1 | `admin-user-ops` (invite + deactivate) |
| New utility | 1 | `calendarSync.ts` |
| New pages | 3 | `Portfolio.tsx`, `Analytics.tsx`, `SystemAdminView.tsx` (rebuilt) |
| New contexts | 2 | `AnalyticsContext`, `NotificationContext` |
| New UI components | 5 | `RecruitmentPosts`, `DateRangePicker`, `NotificationBell`, `NotificationPanel`, `calendarSync` |
| Reused across all phases | — | `Modal.tsx`, `DataTable.tsx`, `DataContext`, Zod validation patterns |

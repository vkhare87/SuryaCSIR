# Calendar Events — Design Spec

**Date:** 2026-05-19
**Status:** Approved (brainstorming gate)
**Scope:** Fix Calendar.tsx broken interactions + add full event system (custom events, holidays, derived project/birthday/retirement events) with role-gated create/edit and SystemAdmin-managed holiday list.

---

## 1. Problem

`src/pages/Calendar.tsx` is currently read-only and broken:

1. "New Event" button has no `onClick` handler — clicking does nothing.
2. Event rows in the day view have no click handler — no way to see event details.
3. No mechanism to add ad-hoc events (meetings, pamphlets, announcements).
4. No holiday list. No SystemAdmin admin surface for one.
5. No surfacing of project closings (despite `ProjectInfo.CompletioDate` existing).
6. No personal layer (birthdays, retirements this month).
7. `meetings` schema lacks MS Teams / online meeting URL field.

## 2. Goals

- Wire the broken "New Event" button to a working create modal (role-gated).
- Wire event row click to a detail modal (view + edit + delete modes).
- Allow institute-wide ad-hoc events (custom, pamphlet, announcement) with location + MS Teams URL + pamphlet URL + visibility scope.
- Surface 7 distinct event kinds on the calendar with consistent color taxonomy.
- Sysadmin-only Holidays admin page (manual CRUD + bulk CSV/XLSX import).
- Personal staff toggle that adds birthdays + retirements + my action items as an overlay layer.
- All new tables ship with RLS enabled and explicit policy blocks (per project standards).

## 3. Non-Goals

- Recurring event engine beyond derived birthday/retirement loops.
- Email or push notifications on event creation.
- iCal / Google Calendar export.
- Merged audit timeline (existing tech debt, not regressing).
- Per-staff retirement age override (hardcoded 60yrs).
- Per-group retirement age table (hardcoded 60yrs).
- Holiday import sources other than CSV/XLSX.
- Touching the consolidated `00000000000000_init.sql`.

## 4. Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Event storage | **Hybrid** — keep `meetings` for committee meetings; new `calendar_events` for ad-hoc + system-derived seeds | Cleanest separation; avoids coupling generic events to committees module |
| Holidays UX | **Manual CRUD + bulk import side-by-side** | Matches existing Excel pipeline pattern; covers both year-start bulk load and mid-year corrections |
| Retirement age | **Hardcoded 60yrs**, compute from DOB | CSIR standard; simple |
| Event detail view | **Modal** (centered overlay) | Matches existing repo modal pattern; sufficient for edit forms |
| Event create permission | **Role-gated**: HRAdmin / SystemAdmin / Director / HOD / DivisionHead | Org-wide events need accountable creators; matches institutional calendar audit needs |
| Pamphlet attachment | **URL only** (no Supabase Storage upload) | Avoids storage cost + upload UI; defers complexity |
| Personal toggle behavior | **Adds personal layer** — birthdays + retirements + my action items overlaid on org events | Cleanest separation; matches user mental model |
| Project closing source | `ProjectInfo.CompletioDate` only | Singular project last date; staff contract ends excluded |

## 5. Data Model

### 5.1 New migration

File: `supabase/migrations/<TS>_calendar_events_holidays.sql` (timestamp `YYYYMMDDHHMMSS`). Never edit `00000000000000_init.sql`.

### 5.2 `calendar_events`

```sql
CREATE TABLE public.calendar_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title           text NOT NULL,
    event_date      date NOT NULL,
    event_kind      text NOT NULL CHECK (event_kind IN ('Custom','Pamphlet','Announcement')),
    location        text NOT NULL DEFAULT '',
    teams_url       text,
    pamphlet_url    text,
    description     text NOT NULL DEFAULT '',
    visibility      text NOT NULL DEFAULT 'OrgWide'
                    CHECK (visibility IN ('OrgWide','Division','Personal')),
    division_code   text,
    created_by      uuid NOT NULL REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Enforce division_code presence when visibility='Division'
ALTER TABLE public.calendar_events
    ADD CONSTRAINT calendar_events_division_required
    CHECK (visibility <> 'Division' OR division_code IS NOT NULL);
```

### 5.3 `holidays`

```sql
CREATE TABLE public.holidays (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    holiday_date    date NOT NULL,
    name            text NOT NULL,
    holiday_type    text NOT NULL DEFAULT 'Gazetted'
                    CHECK (holiday_type IN ('Gazetted','Restricted','Institute')),
    year            integer NOT NULL,
    created_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (holiday_date, name)
);
```

### 5.4 Extend `meetings`

```sql
ALTER TABLE public.meetings ADD COLUMN teams_url    text;
ALTER TABLE public.meetings ADD COLUMN pamphlet_url text;
```

### 5.5 RLS policies

```sql
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays        ENABLE ROW LEVEL SECURITY;

-- calendar_events SELECT: OrgWide visible to all auth; Division to same division; Personal to creator
CREATE POLICY calendar_events_select ON public.calendar_events FOR SELECT
TO authenticated
USING (
    visibility = 'OrgWide'
    OR (visibility = 'Division' AND division_code IN (
        SELECT up.division_code FROM public.user_profiles up WHERE up.user_id = auth.uid()
    ))
    OR (visibility = 'Personal' AND created_by = auth.uid())
);

-- calendar_events INSERT: role-gated
CREATE POLICY calendar_events_insert ON public.calendar_events FOR INSERT
TO authenticated
WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('HRAdmin','SystemAdmin','Director','HOD','DivisionHead')
    )
);

-- calendar_events UPDATE/DELETE: creator OR SystemAdmin
CREATE POLICY calendar_events_modify ON public.calendar_events FOR UPDATE
TO authenticated
USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'SystemAdmin')
);

CREATE POLICY calendar_events_delete ON public.calendar_events FOR DELETE
TO authenticated
USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'SystemAdmin')
);

-- holidays SELECT: all authenticated
CREATE POLICY holidays_select ON public.holidays FOR SELECT
TO authenticated USING (true);

-- holidays mutations: SystemAdmin only
CREATE POLICY holidays_insert ON public.holidays FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'SystemAdmin')
);

CREATE POLICY holidays_update ON public.holidays FOR UPDATE
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'SystemAdmin')
);

CREATE POLICY holidays_delete ON public.holidays FOR DELETE
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'SystemAdmin')
);
```

### 5.6 Derived (no new tables)

- **Project closing** — `ProjectInfo.CompletioDate` (already loaded in `DataContext`).
- **Birthday** — `StaffMember.DOB`; month/day match in current view window.
- **Retirement** — `StaffMember.DOB + 60 years`; month/year match in current view window.

## 6. Types

`src/types/index.ts` additions:

```typescript
export interface CalendarEvent {
  id: string;
  title: string;
  event_date: string;
  event_kind: 'Custom' | 'Pamphlet' | 'Announcement';
  location: string;
  teams_url: string | null;
  pamphlet_url: string | null;
  description: string;
  visibility: 'OrgWide' | 'Division' | 'Personal';
  division_code: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  holiday_type: 'Gazetted' | 'Restricted' | 'Institute';
  year: number;
}
```

`Meeting` interface gets two new fields:

```typescript
export interface Meeting {
  // ...existing fields
  teams_url: string | null;
  pamphlet_url: string | null;
}
```

## 7. Context / Data Layer

### 7.1 `DataContext` additions
- Load `calendar_events` + `holidays` alongside existing loads.
- Expose: `calendarEvents`, `holidays`, `refreshCalendar()`, `refreshHolidays()`.
- Add mock entries in `src/utils/mockData.ts`.
- Add mapper entries in `src/utils/dataMapper.ts`.

### 7.2 New module `src/lib/calendar/`

Mirrors `src/lib/pms/` structure:

- `calendar/permissions.ts`
  - `canCreateEvent(activeRole: Role): boolean`
  - `canEditEvent(event: CalendarEvent, userId: string, activeRole: Role): boolean`
  - `canManageHolidays(activeRole: Role): boolean`
- `calendar/deriveEvents.ts` — pure functions (testable, no Supabase calls):
  - `deriveProjectClosingEvents(projects: ProjectInfo[], from: Date, to: Date): CalEvent[]`
  - `deriveBirthdayEvents(staff: StaffMember[], year: number, month: number): CalEvent[]`
  - `deriveRetirementEvents(staff: StaffMember[], year: number, month: number): CalEvent[]`
- `calendar/types.ts` — unified `CalEvent` discriminated union:

```typescript
type CalEvent =
  | { kind: 'meeting';          id: string; title: string; location: string; date: Date; meta: string; source: Meeting }
  | { kind: 'action';           id: string; title: string; location: string; date: Date; meta: string; source: ActionItem }
  | { kind: 'custom' | 'pamphlet' | 'announcement'; id: string; title: string; location: string; date: Date; meta: string; source: CalendarEvent }
  | { kind: 'holiday';          id: string; title: string; location: string; date: Date; meta: string; source: Holiday }
  | { kind: 'project_closing';  id: string; title: string; location: string; date: Date; meta: string; source: ProjectInfo }
  | { kind: 'birthday';         id: string; title: string; location: string; date: Date; meta: string; source: StaffMember }
  | { kind: 'retirement';       id: string; title: string; location: string; date: Date; meta: string; source: StaffMember; retirementDate: Date };
```

Date parsing reuses `src/utils/dateUtils.ts` (`parseDate`).

## 8. Page Refactor — `src/pages/Calendar.tsx`

1. Pull from extended `useData()`: `meetings`, `actionItems`, `calendarEvents`, `holidays`, `projects`, `staff`.
2. Build unified `CalEvent[]` via merge of source events + `deriveEvents.ts` outputs.
3. **Personal toggle** in header (next to "New Event"). Persisted via `useState(() => localStorage.getItem('surya_calendar_personal') === 'true')`. ON → include birthdays + retirements + my action items. OFF → org-only (meetings, holidays, project closings, custom events).
4. **"New Event" button** — wire `onClick` → opens `EventCreateModal`. Disabled (grey + tooltip "Insufficient permissions") when `!canCreateEvent(activeRole)`.
5. **Event row click** — wire `onClick` on day-view row + `MoreVertical` → opens `EventDetailModal` with full record.
6. **Filter chips above schedule** — toggle visibility per event kind. Local `useState`; not URL-persisted.
7. **`EVENT_COLOR` map** extended for all event kinds (table below). The unified `CalEvent` union has 7 base variants; `calendar_events` further splits into 3 sub-kinds (Custom / Pamphlet / Announcement) — Pamphlet and Announcement share one color, giving 8 visible color rows.
8. **Upcoming sidebar** respects personal toggle + filter chips.
9. **Day cell dot** — single dot remains; `title=` tooltip shows event count.

### 8.1 Color taxonomy

| Kind | Color |
|---|---|
| Meeting | `#c96442` (brand brown — existing) |
| Action Item | `bg-amber-500` (existing) |
| Custom Event | `bg-emerald-500` |
| Pamphlet / Announcement | `bg-indigo-500` |
| Holiday | `bg-rose-500` |
| Project Closing | `bg-purple-500` |
| Birthday | `bg-pink-400` |
| Retirement | `bg-sky-500` |

## 9. Modals

### 9.1 `src/components/calendar/EventForm.tsx`

Shared form internals used by both create and edit modes.

Fields:
- Title (required, text)
- Date (required, date picker)
- Event Kind (select: Custom / Pamphlet / Announcement)
- Location (text)
- MS Teams URL (text, validated as URL when present)
- Pamphlet URL (text, validated as URL when present)
- Description (textarea, max 1000 chars)
- Visibility (radio: Org-wide / Division / Personal)
- Division (select, shown only when visibility=Division; defaults to user's division)

Validation: `zod` schema. Form errors render inline via `useState('')` per existing pattern. Submit handler is passed from parent (create vs update branches there).

### 9.2 `src/components/calendar/EventCreateModal.tsx`

Named export. Follows existing modal pattern in `src/components/`.

- Wraps `<EventForm>` for input.
- Submit → `INSERT into calendar_events` via Supabase client → `refreshCalendar()` → close.
- Rendered only when `canCreateEvent(activeRole)` is true.

### 9.3 `src/components/calendar/EventDetailModal.tsx`

Modes: `view` | `edit`.

**View layout:**
- Header: colored chip (kind) + title.
- Date · Location · Kind · Visibility line.
- MS Teams URL → "Join Meeting" link button (opens new tab) if present.
- Pamphlet URL → "View Pamphlet" link button if present.
- Description block.

**Kind-specific behavior:**
- Derived events (birthday, retirement, project_closing) — read-only; show source label ("from Staff Master" / "from Project Master").
- Meeting kind — read-only here; link "Open in Committees" routes to existing meeting view.
- Action Item kind — read-only; link "Open Action Item".
- Holiday kind — edit/delete only if `activeRole === 'SystemAdmin'`; show holiday_type.
- `calendar_events` kinds — edit/delete buttons if `canEditEvent(event, user)` returns true (creator OR SystemAdmin).

**Edit mode:** swap viewer for `<EventForm>`, prefill with current values. Submit → `UPDATE`. Delete → confirmation prompt → `DELETE` → close + refresh.

## 10. Holidays Admin Page

### 10.1 Route + nav

- Route: `/admin/holidays`. Register in `src/App.tsx`.
- Nav entry in `Layout.tsx` `NAV_ITEMS` under admin group; conditionally rendered when `activeRole === 'SystemAdmin'`.
- Route guard: redirect to `/calendar` with toast if non-SystemAdmin attempts direct access.

### 10.2 File `src/pages/admin/HolidaysAdmin.tsx`

Two-pane layout:

**Left pane — Manual CRUD**
- Year selector (dropdown, defaults to current year).
- Add Holiday form: date, name, type (Gazetted / Restricted / Institute).
- Table of holidays for selected year: columns = date | name | type | actions (edit / delete).
- Inline row edit (no extra modal).

**Right pane — Bulk import**
- File picker (CSV/XLSX) using existing `parseFile` util in `src/utils/`.
- Expected columns: `date`, `name`, `type`.
- Preview table with row-level validation (date format, type enum).
- "Import N valid rows" button → batch `INSERT` via Supabase client.
- Errors listed per row inline (matches existing data ops pattern).

### 10.3 Data flow
- Page reads holidays via `useData()`.
- Mutations call Supabase directly (consistent with other admin CRUD pages).
- After mutation: `refreshHolidays()`.

### 10.4 Audit
- Each INSERT/UPDATE/DELETE writes a row to the existing `audit_log` table.

## 11. Derived Event Windowing

- Calendar.tsx computes derived events for the **current visible month** only on each month nav (cheap re-derive).
- Upcoming sidebar uses **next 60 days** window for derived events.
- Edge cases handled in tests: Feb 29 birthdays in non-leap years collapse to Feb 28; retirement month boundary inclusive.

## 12. Testing

Vitest, following existing 5-file infrastructure.

`src/lib/calendar/__tests__/`:
- `deriveEvents.test.ts` — birthday wraparound (Feb 29 → Feb 28 non-leap), retirement edge (DOB exactly 60yrs ago in current month), project closing inclusion/exclusion windows.
- `permissions.test.ts` — role × action matrix.

`src/components/calendar/__tests__/`:
- `EventCreateModal.test.tsx` — validation errors, optional URL fields, visibility=Division forces division select.

`src/pages/__tests__/`:
- `Calendar.test.tsx` — personal toggle filters birthday/retirement in/out; filter chips toggle event kinds; "New Event" button disabled for non-permitted roles.

`src/pages/admin/__tests__/`:
- `HolidaysAdmin.test.tsx` — non-SystemAdmin redirect; bulk import row validation.

## 13. Rollout Order

1. Migration file `supabase/migrations/<TS>_calendar_events_holidays.sql` — both new tables + `ALTER` on `meetings` + RLS policies.
2. Type additions in `src/types/index.ts`.
3. Mock + mapper entries in `mockData.ts` and `dataMapper.ts`.
4. `DataContext` wiring (load + refresh).
5. `src/lib/calendar/` module + unit tests.
6. `Calendar.tsx` refactor (unified `CalEvent`, filter chips, personal toggle).
7. `EventForm`, `EventCreateModal`, `EventDetailModal`.
8. `HolidaysAdmin` page + route + nav wiring.
9. Manual QA via dev server: each role × create/edit/delete × each event kind.

## 14. Risks / Open Items

- **Performance:** Birthday/retirement derivation iterates over all `staff` per month nav. Acceptable for institute scale (~hundreds of rows). Memoize on `[staff, year, month]`.
- **Date parsing:** Excel-sourced `DOB`/`CompletioDate` strings have inconsistent formats. `parseDate` in `dateUtils.ts` is the single normalizer; tests will assert it.
- **Visibility=Division:** No automatic backfill of `division_code` on user role change. Acceptable — events are point-in-time.
- **No PMS/auth coupling regression:** Changes are additive; no PMS state machine touched.
- **`user_profiles.division_code` assumption:** Section 5.5 RLS policy for `calendar_events_select` (Division visibility branch) reads `division_code` from `user_profiles`. Confirm at implementation time that this column exists on `user_profiles`; if it lives on `user_roles` or elsewhere, adjust the policy JOIN target. Do not change the column's home as part of this work.

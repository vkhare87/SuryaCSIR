# Calendar Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken Calendar.tsx (New Event button + event detail click), add full event subsystem (custom events, holidays, derived project/birthday/retirement events), with role-gated create/edit, SystemAdmin holidays admin, and personal-staff toggle.

**Architecture:** Hybrid event storage — keep existing `meetings` for committee meetings; add new `calendar_events` table for ad-hoc events (Custom / Pamphlet / Announcement) and new `holidays` table. Birthday, retirement, and project-closing events are computed client-side from existing `staff` and `projects` data via pure functions in a new `src/lib/calendar/` module. A unified `CalEvent` discriminated union drives Calendar.tsx rendering across all 7 event kinds.

**Tech Stack:** React 19 + TypeScript 5.9 (strict, `verbatimModuleSyntax`), Vite 8, Tailwind CSS 4, React Router 7 (HashRouter), Supabase (PostgreSQL + Auth + RLS), Zod 4 for validation, Vitest + @testing-library/react for tests, lucide-react icons.

**Spec reference:** [docs/superpowers/specs/2026-05-19-calendar-events-design.md](../specs/2026-05-19-calendar-events-design.md)

**Deviations from spec (discovered during plan-writing):**
1. Spec §5.5 RLS reads `division_code` from `user_profiles`. The actual init schema puts `division_code` on `user_roles` (composite PK `user_id, role`). Plan uses `user_roles.division_code` filtered by the user's `active_role` from `user_profiles`.
2. The existing `audit_log.entity_type` CHECK constraint only allows `'committee','meeting','action_item','ticket','ticket_response'`. Plan extends the CHECK to include `'calendar_event'` and `'holiday'`.
3. Spec §7.1 mentions `mockData.ts`. No such file exists; data loads exclusively from Supabase. Plan skips that step.
4. `getRetirementDate(dob)` already exists in `src/utils/dateUtils.ts`. Plan reuses it directly.
5. Test files in this repo live colocated next to source (e.g., `src/lib/helpdesk/permissions.test.ts`), not in `__tests__/` subdirectories. Plan follows the existing pattern.

---

## File Structure

**Created files:**
- `supabase/migrations/20260519000000_calendar_events_holidays.sql` — schema + RLS + audit_log CHECK extension
- `src/lib/calendar/types.ts` — `CalEvent` discriminated union
- `src/lib/calendar/permissions.ts` — role-gated permission helpers
- `src/lib/calendar/deriveEvents.ts` — pure derivation for project closings / birthdays / retirements
- `src/lib/calendar/permissions.test.ts`
- `src/lib/calendar/deriveEvents.test.ts`
- `src/components/calendar/EventForm.tsx` — shared form internals
- `src/components/calendar/EventCreateModal.tsx`
- `src/components/calendar/EventDetailModal.tsx`
- `src/components/calendar/EventCreateModal.test.tsx`
- `src/pages/admin/HolidaysAdmin.tsx`

**Modified files:**
- `src/types/index.ts` — add `CalendarEvent`, `Holiday`; extend `Meeting`
- `src/utils/dataMapper.ts` — add `mapCalendarEventRow`, `mapHolidayRow`; extend `mapMeetingRow`
- `src/contexts/DataContext.tsx` — load + expose `calendarEvents`, `holidays`, `refreshCalendar`, `refreshHolidays`
- `src/pages/Calendar.tsx` — rewrite to use unified `CalEvent` union; wire all click handlers + filter chips + personal toggle
- `src/App.tsx` — register `/admin/holidays` lazy route
- `src/components/layout/Layout.tsx` — add Holidays admin nav entry (SystemAdmin only)

---

## Task 1: Database migration — schema, RLS, audit_log CHECK extension

**Files:**
- Create: `supabase/migrations/20260519000000_calendar_events_holidays.sql`

This task is a single atomic database migration. No automated tests (RLS is verified manually in Task 15).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260519000000_calendar_events_holidays.sql` with the following content:

```sql
-- Migration: calendar_events + holidays + meetings.teams_url/pamphlet_url
-- Date: 2026-05-19

-- ══════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.calendar_events (
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
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT calendar_events_division_required
        CHECK (visibility <> 'Division' OR division_code IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.holidays (
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

-- Extend meetings table
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS teams_url    text;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS pamphlet_url text;

-- Extend audit_log.entity_type CHECK to allow new entity kinds
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_entity_type_check
    CHECK (entity_type IN (
        'committee','meeting','action_item','ticket','ticket_response',
        'calendar_event','holiday'
    ));

-- ══════════════════════════════════════════════════════════════════
-- 2. INDEXES
-- ══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS calendar_events_date_idx ON public.calendar_events(event_date);
CREATE INDEX IF NOT EXISTS calendar_events_visibility_idx ON public.calendar_events(visibility);
CREATE INDEX IF NOT EXISTS calendar_events_created_by_idx ON public.calendar_events(created_by);
CREATE INDEX IF NOT EXISTS holidays_year_idx ON public.holidays(year);
CREATE INDEX IF NOT EXISTS holidays_date_idx ON public.holidays(holiday_date);

-- ══════════════════════════════════════════════════════════════════
-- 3. RLS
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays        ENABLE ROW LEVEL SECURITY;

-- Helper: get the calling user's currently-active division_code via user_profiles.active_role -> user_roles row
-- We inline the JOIN to avoid a function dependency.

-- calendar_events SELECT
CREATE POLICY calendar_events_select ON public.calendar_events FOR SELECT
TO authenticated
USING (
    visibility = 'OrgWide'
    OR (visibility = 'Personal' AND created_by = auth.uid())
    OR (
        visibility = 'Division'
        AND division_code IN (
            SELECT ur.division_code
            FROM public.user_roles ur
            JOIN public.user_profiles up
                ON up.user_id = ur.user_id AND up.active_role = ur.role
            WHERE ur.user_id = auth.uid()
        )
    )
);

-- calendar_events INSERT: role-gated
CREATE POLICY calendar_events_insert ON public.calendar_events FOR INSERT
TO authenticated
WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('HRAdmin','SystemAdmin','Director','HOD','DivisionHead','MasterAdmin')
    )
);

-- calendar_events UPDATE: creator OR SystemAdmin/MasterAdmin
CREATE POLICY calendar_events_update ON public.calendar_events FOR UPDATE
TO authenticated
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('SystemAdmin','MasterAdmin')
    )
);

-- calendar_events DELETE: creator OR SystemAdmin/MasterAdmin
CREATE POLICY calendar_events_delete ON public.calendar_events FOR DELETE
TO authenticated
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('SystemAdmin','MasterAdmin')
    )
);

-- holidays SELECT: all authenticated
CREATE POLICY holidays_select ON public.holidays FOR SELECT
TO authenticated USING (true);

-- holidays INSERT/UPDATE/DELETE: SystemAdmin or MasterAdmin only
CREATE POLICY holidays_insert ON public.holidays FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('SystemAdmin','MasterAdmin')
    )
);

CREATE POLICY holidays_update ON public.holidays FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('SystemAdmin','MasterAdmin')
    )
);

CREATE POLICY holidays_delete ON public.holidays FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('SystemAdmin','MasterAdmin')
    )
);

-- ══════════════════════════════════════════════════════════════════
-- 4. updated_at trigger for calendar_events
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.calendar_events_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calendar_events_updated_at_trg ON public.calendar_events;
CREATE TRIGGER calendar_events_updated_at_trg
    BEFORE UPDATE ON public.calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION public.calendar_events_set_updated_at();
```

- [ ] **Step 2: Apply the migration locally**

Run:
```bash
npx supabase db push
```
Or, if using the Supabase Studio SQL editor, paste the file's contents and execute as `postgres` role.

Expected: migration applies without error. Verify with:
```bash
npx supabase db diff
```
Expected: clean (no drift).

- [ ] **Step 3: Smoke-test the schema**

In Supabase SQL editor, run:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='calendar_events';
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='meetings' AND column_name IN ('teams_url','pamphlet_url');
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname='audit_log_entity_type_check';
```
Expected: 14 rows for calendar_events; 2 rows for meetings; CHECK definition includes `'calendar_event'` and `'holiday'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260519000000_calendar_events_holidays.sql
git commit -m "feat(db): add calendar_events + holidays tables with RLS, extend meetings + audit_log"
```

---

## Task 2: Add types to src/types/index.ts

**Files:**
- Modify: `src/types/index.ts` (append new interfaces; edit existing `Meeting`)

- [ ] **Step 1: Add the new interfaces and extend Meeting**

Open `src/types/index.ts`. Find the existing `Meeting` interface (around line 241). Add two new fields:

```typescript
export interface Meeting {
  id: string;
  committee_id: string;
  meeting_date: string;
  venue: string;
  title: string;
  summary: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  created_at: string;
  teams_url: string | null;
  pamphlet_url: string | null;
}
```

At the end of the file (or in a logical spot — after `MeetingDocument`), append:

```typescript
// --- Calendar Event Types ---

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

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: PASS. (If `mapMeetingRow` errors due to new required fields, that's expected — we fix it in Task 3.)

If errors point to `mapMeetingRow` missing `teams_url` / `pamphlet_url`, continue to Task 3 before re-running typecheck.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add CalendarEvent + Holiday; extend Meeting with teams_url + pamphlet_url"
```

---

## Task 3: Mappers in dataMapper.ts

**Files:**
- Modify: `src/utils/dataMapper.ts`

- [ ] **Step 1: Extend the Meeting mapper**

In `src/utils/dataMapper.ts`, add `CalendarEvent` and `Holiday` to the top-level type import:

```typescript
import type { DivisionInfo, StaffMember, ProjectInfo, ProjectStaff, PhDStudent, Equipment, ScientificOutput, IPIntelligence, ContractStaff, VacancyAdvertisement, VacancyPost, Notification, Committee, CommitteeMember, Meeting, AgendaItem, ActionItem, MeetingDocument, Ticket, TicketResponse, TicketEvent, HelpdeskRouting, CalendarEvent, Holiday } from '../types';
```

Find `mapMeetingRow` (search the file). Update it to include the two new nullable fields:

```typescript
export const mapMeetingRow = (row: any): Meeting => ({
  id: String(row.id || ''),
  committee_id: String(row.committee_id || ''),
  meeting_date: row.meeting_date || '',
  venue: row.venue || '',
  title: row.title || '',
  summary: row.summary || '',
  status: row.status || 'Scheduled',
  created_at: row.created_at || '',
  teams_url: row.teams_url ?? null,
  pamphlet_url: row.pamphlet_url ?? null,
});
```

If `mapMeetingRow` is structured differently in the actual file, only the two new lines (`teams_url`, `pamphlet_url`) need adding — preserve all existing field assignments.

- [ ] **Step 2: Add the two new mappers at the end of the file**

```typescript
export const mapCalendarEventRow = (row: any): CalendarEvent => ({
  id: String(row.id || ''),
  title: row.title || '',
  event_date: row.event_date || '',
  event_kind: row.event_kind || 'Custom',
  location: row.location || '',
  teams_url: row.teams_url ?? null,
  pamphlet_url: row.pamphlet_url ?? null,
  description: row.description || '',
  visibility: row.visibility || 'OrgWide',
  division_code: row.division_code ?? null,
  created_by: String(row.created_by || ''),
  created_at: row.created_at || '',
  updated_at: row.updated_at || '',
});

export const mapHolidayRow = (row: any): Holiday => ({
  id: String(row.id || ''),
  holiday_date: row.holiday_date || '',
  name: row.name || '',
  holiday_type: row.holiday_type || 'Gazetted',
  year: parseInt(row.year || '0', 10),
});
```

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/utils/dataMapper.ts
git commit -m "feat(mappers): add calendar_events + holidays row mappers, extend meeting mapper"
```

---

## Task 4: DataContext wiring

**Files:**
- Modify: `src/contexts/DataContext.tsx`

- [ ] **Step 1: Add imports**

In `src/contexts/DataContext.tsx`, extend the type import block:

```typescript
import type {
  // ...existing...
  CalendarEvent,
  Holiday,
} from '../types';
```

Extend the mapper import block:

```typescript
import {
  // ...existing...
  mapCalendarEventRow,
  mapHolidayRow,
} from '../utils/dataMapper';
```

- [ ] **Step 2: Extend the context type**

Find the `DataContextType` interface. Add three new fields:

```typescript
interface DataContextType {
  // ...existing fields...
  calendarEvents: CalendarEvent[];
  holidays: Holiday[];
  refreshCalendar: () => Promise<void>;
  refreshHolidays: () => Promise<void>;
}
```

- [ ] **Step 3: Add state inside DataProvider**

Find the existing `useState` block inside `DataProvider`. Add:

```typescript
const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
const [holidays, setHolidays] = useState<Holiday[]>([]);
```

Find `resetAll` and add:

```typescript
setCalendarEvents([]);
setHolidays([]);
```

- [ ] **Step 4: Add the two tables to the parallel load**

Inside `loadData`, find the `Promise.all([...])` call. Add two new entries at the end:

```typescript
supabase.from('calendar_events').select('*').order('event_date', { ascending: true }),
supabase.from('holidays').select('*').order('holiday_date', { ascending: true }),
```

And update the destructured names — add two new variables to the destructuring:

```typescript
const [
  divRes, staffRes, projRes, psRes, phdRes, equipRes, labsRes, soRes, ipRes, csRes,
  vaRes, vpRes,
  cmtRes, cmmRes, mtgRes, agiRes, actRes, mdcRes, tktRes, trsRes, tevRes, hrtRes,
  ceRes, holRes,
] = await Promise.all([
  // ...existing entries...
  supabase.from('calendar_events').select('*').order('event_date', { ascending: true }),
  supabase.from('holidays').select('*').order('holiday_date', { ascending: true }),
]);
```

Add `checkTable` calls just below the existing ones:
```typescript
checkTable('calendar_events', ceRes);
checkTable('holidays', holRes);
```

Add setters at the bottom of the `try` block, beside the other `setX(...)` calls:
```typescript
setCalendarEvents(ceRes.data ? ceRes.data.map(mapCalendarEventRow) : []);
setHolidays(holRes.data ? holRes.data.map(mapHolidayRow) : []);
```

- [ ] **Step 5: Add refresh functions**

Just before the `return (` statement of `DataProvider`, add:

```typescript
const refreshCalendar = async () => {
  if (!supabase) return;
  const { data, error: err } = await supabase
    .from('calendar_events')
    .select('*')
    .order('event_date', { ascending: true });
  if (err) {
    logger.error('refresh_calendar_failed', err);
    pushToast(`Calendar refresh failed: ${err.message}`, 'error');
    return;
  }
  setCalendarEvents(data ? data.map(mapCalendarEventRow) : []);
};

const refreshHolidays = async () => {
  if (!supabase) return;
  const { data, error: err } = await supabase
    .from('holidays')
    .select('*')
    .order('holiday_date', { ascending: true });
  if (err) {
    logger.error('refresh_holidays_failed', err);
    pushToast(`Holidays refresh failed: ${err.message}`, 'error');
    return;
  }
  setHolidays(data ? data.map(mapHolidayRow) : []);
};
```

- [ ] **Step 6: Add the new values to the Provider value**

In the JSX `<DataContext.Provider value={{ ... }}>`, append:

```typescript
calendarEvents,
holidays,
refreshCalendar,
refreshHolidays,
```

- [ ] **Step 7: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/contexts/DataContext.tsx
git commit -m "feat(data): load calendar_events + holidays in DataContext with refresh helpers"
```

---

## Task 5: src/lib/calendar/types.ts — CalEvent discriminated union

**Files:**
- Create: `src/lib/calendar/types.ts`

- [ ] **Step 1: Create the file**

```typescript
import type {
  Meeting,
  ActionItem,
  CalendarEvent,
  Holiday,
  ProjectInfo,
  StaffMember,
} from '../../types';

export type CalEventKind =
  | 'meeting'
  | 'action'
  | 'custom'
  | 'pamphlet'
  | 'announcement'
  | 'holiday'
  | 'project_closing'
  | 'birthday'
  | 'retirement';

interface CalEventBase {
  id: string;
  title: string;
  location: string;
  date: Date;
  meta: string;
}

export type CalEvent =
  | (CalEventBase & { kind: 'meeting'; source: Meeting })
  | (CalEventBase & { kind: 'action'; source: ActionItem })
  | (CalEventBase & { kind: 'custom' | 'pamphlet' | 'announcement'; source: CalendarEvent })
  | (CalEventBase & { kind: 'holiday'; source: Holiday })
  | (CalEventBase & { kind: 'project_closing'; source: ProjectInfo })
  | (CalEventBase & { kind: 'birthday'; source: StaffMember })
  | (CalEventBase & { kind: 'retirement'; source: StaffMember; retirementDate: Date });

export const PERSONAL_KINDS: CalEventKind[] = ['birthday', 'retirement', 'action'];
export const ORG_KINDS: CalEventKind[] = [
  'meeting',
  'custom',
  'pamphlet',
  'announcement',
  'holiday',
  'project_closing',
];

export const EVENT_COLOR: Record<CalEventKind, string> = {
  meeting: 'bg-[#c96442]',
  action: 'bg-amber-500',
  custom: 'bg-emerald-500',
  pamphlet: 'bg-indigo-500',
  announcement: 'bg-indigo-500',
  holiday: 'bg-rose-500',
  project_closing: 'bg-purple-500',
  birthday: 'bg-pink-400',
  retirement: 'bg-sky-500',
};

export const EVENT_LABEL: Record<CalEventKind, string> = {
  meeting: 'Meeting',
  action: 'Action Item',
  custom: 'Custom Event',
  pamphlet: 'Pamphlet',
  announcement: 'Announcement',
  holiday: 'Holiday',
  project_closing: 'Project Closing',
  birthday: 'Birthday',
  retirement: 'Retirement',
};
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/calendar/types.ts
git commit -m "feat(calendar): add CalEvent discriminated union with color + label maps"
```

---

## Task 6: src/lib/calendar/permissions.ts (TDD)

**Files:**
- Create: `src/lib/calendar/permissions.ts`
- Create: `src/lib/calendar/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/calendar/permissions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canCreateEvent, canEditEvent, canManageHolidays } from './permissions';
import type { CalendarEvent, Role } from '../../types';

const baseEvent: CalendarEvent = {
  id: 'E1',
  title: 'Lab Meet',
  event_date: '2026-06-01',
  event_kind: 'Custom',
  location: 'Room 12',
  teams_url: null,
  pamphlet_url: null,
  description: '',
  visibility: 'OrgWide',
  division_code: null,
  created_by: 'user-creator',
  created_at: '',
  updated_at: '',
};

describe('canCreateEvent', () => {
  const allowed: Role[] = ['HRAdmin', 'SystemAdmin', 'MasterAdmin', 'Director', 'HOD', 'DivisionHead'];
  const denied: Role[] = ['Scientist', 'Technician', 'Student', 'ProjectStaff', 'Guest', 'DefaultUser', 'FinanceAdmin', 'EmpoweredCommittee'];

  it.each(allowed)('allows %s', (role) => {
    expect(canCreateEvent(role)).toBe(true);
  });
  it.each(denied)('denies %s', (role) => {
    expect(canCreateEvent(role)).toBe(false);
  });
});

describe('canEditEvent', () => {
  it('allows creator', () => {
    expect(canEditEvent(baseEvent, 'user-creator', 'Scientist')).toBe(true);
  });
  it('allows SystemAdmin even when not creator', () => {
    expect(canEditEvent(baseEvent, 'someone-else', 'SystemAdmin')).toBe(true);
  });
  it('allows MasterAdmin even when not creator', () => {
    expect(canEditEvent(baseEvent, 'someone-else', 'MasterAdmin')).toBe(true);
  });
  it('denies non-creator non-admin', () => {
    expect(canEditEvent(baseEvent, 'someone-else', 'Scientist')).toBe(false);
  });
});

describe('canManageHolidays', () => {
  it('allows SystemAdmin', () => {
    expect(canManageHolidays('SystemAdmin')).toBe(true);
  });
  it('allows MasterAdmin', () => {
    expect(canManageHolidays('MasterAdmin')).toBe(true);
  });
  it('denies HRAdmin', () => {
    expect(canManageHolidays('HRAdmin')).toBe(false);
  });
  it('denies Director', () => {
    expect(canManageHolidays('Director')).toBe(false);
  });
  it('denies Scientist', () => {
    expect(canManageHolidays('Scientist')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test -- src/lib/calendar/permissions.test.ts
```
Expected: FAIL — module `./permissions` not found.

- [ ] **Step 3: Implement**

Create `src/lib/calendar/permissions.ts`:

```typescript
import type { CalendarEvent, Role } from '../../types';

const CREATE_ROLES: readonly Role[] = [
  'HRAdmin',
  'SystemAdmin',
  'MasterAdmin',
  'Director',
  'HOD',
  'DivisionHead',
];

const HOLIDAYS_ADMIN_ROLES: readonly Role[] = ['SystemAdmin', 'MasterAdmin'];
const EVENT_ADMIN_ROLES: readonly Role[] = ['SystemAdmin', 'MasterAdmin'];

export function canCreateEvent(activeRole: Role): boolean {
  return CREATE_ROLES.includes(activeRole);
}

export function canEditEvent(
  event: CalendarEvent,
  userId: string,
  activeRole: Role
): boolean {
  if (event.created_by === userId) return true;
  return EVENT_ADMIN_ROLES.includes(activeRole);
}

export function canManageHolidays(activeRole: Role): boolean {
  return HOLIDAYS_ADMIN_ROLES.includes(activeRole);
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test -- src/lib/calendar/permissions.test.ts
```
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar/permissions.ts src/lib/calendar/permissions.test.ts
git commit -m "feat(calendar): add role-based permissions with full role-matrix tests"
```

---

## Task 7: deriveEvents — birthday derivation (TDD)

**Files:**
- Create: `src/lib/calendar/deriveEvents.ts` (initial — birthday only)
- Create: `src/lib/calendar/deriveEvents.test.ts` (initial — birthday only)

- [ ] **Step 1: Write the failing test**

Create `src/lib/calendar/deriveEvents.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { deriveBirthdayEvents } from './deriveEvents';
import type { StaffMember } from '../../types';

function makeStaff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    ID: 'S001',
    LabCode: 'L1',
    EmployeeType: 'Permanent',
    Name: 'Alice Researcher',
    Designation: 'Scientist',
    Group: 'A',
    Division: 'D01',
    DoAPP: '',
    DOJ: '',
    DOB: '15/06/1985',
    Cat: '',
    AppointmentType: '',
    Level: '',
    CoreArea: '',
    Expertise: '',
    Email: '',
    Ext: '',
    VidwanID: '',
    ReportingID: '',
    HighestQualification: '',
    Gender: 'Female',
    ...overrides,
  };
}

describe('deriveBirthdayEvents', () => {
  it('emits a birthday event in the matching month', () => {
    const staff = [makeStaff({ ID: 'S001', Name: 'Alice', DOB: '15/06/1985' })];
    const events = deriveBirthdayEvents(staff, 2026, 5); // June is month index 5
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('birthday');
    expect(events[0].title).toContain('Alice');
    expect(events[0].date.getMonth()).toBe(5);
    expect(events[0].date.getDate()).toBe(15);
    expect(events[0].date.getFullYear()).toBe(2026);
  });

  it('does not emit for staff born in a different month', () => {
    const staff = [makeStaff({ DOB: '10/01/1985' })];
    const events = deriveBirthdayEvents(staff, 2026, 5);
    expect(events).toHaveLength(0);
  });

  it('collapses Feb 29 birthdays to Feb 28 in non-leap years', () => {
    const staff = [makeStaff({ ID: 'S002', Name: 'Leap Person', DOB: '29/02/1988' })];
    const events = deriveBirthdayEvents(staff, 2026, 1); // 2026 is non-leap, Feb is month 1
    expect(events).toHaveLength(1);
    expect(events[0].date.getMonth()).toBe(1);
    expect(events[0].date.getDate()).toBe(28);
  });

  it('keeps Feb 29 birthdays on Feb 29 in leap years', () => {
    const staff = [makeStaff({ DOB: '29/02/1988' })];
    const events = deriveBirthdayEvents(staff, 2028, 1); // 2028 is leap
    expect(events).toHaveLength(1);
    expect(events[0].date.getMonth()).toBe(1);
    expect(events[0].date.getDate()).toBe(29);
  });

  it('skips staff with missing or unparseable DOB', () => {
    const staff = [
      makeStaff({ DOB: '' }),
      makeStaff({ DOB: 'not a date' }),
    ];
    expect(deriveBirthdayEvents(staff, 2026, 5)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test -- src/lib/calendar/deriveEvents.test.ts
```
Expected: FAIL — module `./deriveEvents` not found.

- [ ] **Step 3: Implement birthday derivation**

Create `src/lib/calendar/deriveEvents.ts`:

```typescript
import type { ProjectInfo, StaffMember } from '../../types';
import { parseDate, getRetirementDate } from '../../utils/dateUtils';
import type { CalEvent } from './types';

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns birthday events for the given (year, month) — month is 0-indexed.
 * Handles Feb 29 collapse to Feb 28 in non-leap years.
 */
export function deriveBirthdayEvents(
  staff: StaffMember[],
  year: number,
  month: number
): CalEvent[] {
  const events: CalEvent[] = [];
  for (const s of staff) {
    const dob = parseDate(s.DOB);
    if (!dob) continue;
    if (dob.getMonth() !== month) continue;

    let day = dob.getDate();
    if (dob.getMonth() === 1 && day === 29 && !isLeapYear(year)) {
      day = 28;
    }
    const date = new Date(year, month, day);
    events.push({
      kind: 'birthday',
      id: `birthday-${s.ID}-${year}`,
      title: `${s.Name} — Birthday`,
      location: s.Division || '',
      date,
      meta: `Turns ${year - dob.getFullYear()}`,
      source: s,
    });
  }
  return events;
}

export function deriveRetirementEvents(
  _staff: StaffMember[],
  _year: number,
  _month: number
): CalEvent[] {
  // Implemented in Task 8
  return [];
}

export function deriveProjectClosingEvents(
  _projects: ProjectInfo[],
  _from: Date,
  _to: Date
): CalEvent[] {
  // Implemented in Task 9
  return [];
}
```

Note: `getRetirementDate` is imported up-front; the unused import warning will resolve once Task 8 uses it. If lint flags it at this point, suppress with `// eslint-disable-next-line @typescript-eslint/no-unused-vars` on the import line — but prefer to leave the import as-is since Task 8 follows immediately.

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test -- src/lib/calendar/deriveEvents.test.ts
```
Expected: PASS (5 birthday tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar/deriveEvents.ts src/lib/calendar/deriveEvents.test.ts
git commit -m "feat(calendar): derive birthday events with Feb 29 leap-year handling"
```

---

## Task 8: deriveEvents — retirement derivation (TDD)

**Files:**
- Modify: `src/lib/calendar/deriveEvents.ts`
- Modify: `src/lib/calendar/deriveEvents.test.ts`

- [ ] **Step 1: Append failing tests**

Add to `src/lib/calendar/deriveEvents.test.ts` (at the bottom, before any trailing close):

```typescript
import { deriveRetirementEvents } from './deriveEvents';

describe('deriveRetirementEvents', () => {
  function makeStaff(dob: string, id = 'S001', name = 'Alice'): StaffMember {
    return {
      ID: id, LabCode: '', EmployeeType: '', Name: name, Designation: '',
      Group: '', Division: '', DoAPP: '', DOJ: '', DOB: dob, Cat: '',
      AppointmentType: '', Level: '', CoreArea: '', Expertise: '',
      Email: '', Ext: '', VidwanID: '', ReportingID: '',
      HighestQualification: '', Gender: '',
    };
  }

  it('emits a retirement event when DOB + 60yrs lands in the given month', () => {
    // DOB 1966-06-15 -> retirement 2026-06-15
    const staff = [makeStaff('15/06/1966')];
    const events = deriveRetirementEvents(staff, 2026, 5);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('retirement');
    if (events[0].kind === 'retirement') {
      expect(events[0].retirementDate.getFullYear()).toBe(2026);
      expect(events[0].retirementDate.getMonth()).toBe(5);
      expect(events[0].retirementDate.getDate()).toBe(15);
    }
  });

  it('does not emit when the retirement month/year does not match', () => {
    const staff = [makeStaff('15/06/1966')];
    expect(deriveRetirementEvents(staff, 2026, 4)).toHaveLength(0); // wrong month
    expect(deriveRetirementEvents(staff, 2027, 5)).toHaveLength(0); // wrong year
  });

  it('skips staff with missing or unparseable DOB', () => {
    const staff = [makeStaff(''), makeStaff('garbage')];
    expect(deriveRetirementEvents(staff, 2026, 5)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test -- src/lib/calendar/deriveEvents.test.ts
```
Expected: FAIL — `deriveRetirementEvents` returns empty array (stub).

- [ ] **Step 3: Implement retirement**

In `src/lib/calendar/deriveEvents.ts`, replace the stub `deriveRetirementEvents` with:

```typescript
export function deriveRetirementEvents(
  staff: StaffMember[],
  year: number,
  month: number
): CalEvent[] {
  const events: CalEvent[] = [];
  for (const s of staff) {
    const retirementDate = getRetirementDate(s.DOB);
    if (!retirementDate) continue;
    if (retirementDate.getFullYear() !== year) continue;
    if (retirementDate.getMonth() !== month) continue;
    events.push({
      kind: 'retirement',
      id: `retirement-${s.ID}-${year}`,
      title: `${s.Name} — Retirement`,
      location: s.Division || '',
      date: retirementDate,
      retirementDate,
      meta: `Age 60 · ${s.Designation || ''}`,
      source: s,
    });
  }
  return events;
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test -- src/lib/calendar/deriveEvents.test.ts
```
Expected: PASS (all birthday + retirement tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar/deriveEvents.ts src/lib/calendar/deriveEvents.test.ts
git commit -m "feat(calendar): derive retirement events via DOB + 60yrs"
```

---

## Task 9: deriveEvents — project closing derivation (TDD)

**Files:**
- Modify: `src/lib/calendar/deriveEvents.ts`
- Modify: `src/lib/calendar/deriveEvents.test.ts`

- [ ] **Step 1: Append failing tests**

Add to `src/lib/calendar/deriveEvents.test.ts`:

```typescript
import { deriveProjectClosingEvents } from './deriveEvents';
import type { ProjectInfo } from '../../types';

describe('deriveProjectClosingEvents', () => {
  function makeProject(
    overrides: Partial<ProjectInfo> = {}
  ): ProjectInfo {
    return {
      ProjectID: 'P1', ProjectNo: 'P-1', ProjectName: 'Solar Cell',
      FundType: '', SponsorerType: '', SponsorerName: '',
      ProjectCategory: '', ProjectStatus: 'Ongoing',
      StartDate: '01/01/2024', CompletioDate: '15/06/2026',
      SanctionedCost: '', UtilizedAmount: '',
      PrincipalInvestigator: 'PI1', DivisionCode: 'D01',
      Extension: '', ApprovalAuthority: '',
      ...overrides,
    };
  }

  it('emits a project closing event when CompletioDate falls inside the window', () => {
    const projects = [makeProject({ CompletioDate: '15/06/2026' })];
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    const events = deriveProjectClosingEvents(projects, from, to);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('project_closing');
    expect(events[0].date.getMonth()).toBe(5);
    expect(events[0].date.getDate()).toBe(15);
  });

  it('excludes projects with CompletioDate outside the window', () => {
    const projects = [
      makeProject({ ProjectNo: 'A', CompletioDate: '15/05/2026' }),
      makeProject({ ProjectNo: 'B', CompletioDate: '15/07/2026' }),
    ];
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    expect(deriveProjectClosingEvents(projects, from, to)).toHaveLength(0);
  });

  it('excludes Completed projects', () => {
    const projects = [
      makeProject({ ProjectStatus: 'Completed', CompletioDate: '15/06/2026' }),
    ];
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    expect(deriveProjectClosingEvents(projects, from, to)).toHaveLength(0);
  });

  it('skips projects with missing or unparseable CompletioDate', () => {
    const projects = [
      makeProject({ CompletioDate: '' }),
      makeProject({ CompletioDate: 'garbage' }),
    ];
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 11, 31);
    expect(deriveProjectClosingEvents(projects, from, to)).toHaveLength(0);
  });

  it('treats window as inclusive on both ends', () => {
    const projects = [
      makeProject({ ProjectNo: 'A', CompletioDate: '01/06/2026' }),
      makeProject({ ProjectNo: 'B', CompletioDate: '30/06/2026' }),
    ];
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    expect(deriveProjectClosingEvents(projects, from, to)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test -- src/lib/calendar/deriveEvents.test.ts
```
Expected: FAIL — `deriveProjectClosingEvents` returns empty array.

- [ ] **Step 3: Implement project closing**

In `src/lib/calendar/deriveEvents.ts`, replace the stub `deriveProjectClosingEvents` with:

```typescript
export function deriveProjectClosingEvents(
  projects: ProjectInfo[],
  from: Date,
  to: Date
): CalEvent[] {
  const events: CalEvent[] = [];
  const fromTime = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const toTime = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  for (const p of projects) {
    if ((p.ProjectStatus || '').toLowerCase() === 'completed') continue;
    const closeDate = parseDate(p.CompletioDate);
    if (!closeDate) continue;
    const t = new Date(
      closeDate.getFullYear(),
      closeDate.getMonth(),
      closeDate.getDate()
    ).getTime();
    if (t < fromTime || t > toTime) continue;
    events.push({
      kind: 'project_closing',
      id: `project-closing-${p.ProjectNo}`,
      title: `${p.ProjectName} — Closing`,
      location: p.DivisionCode || '',
      date: closeDate,
      meta: `Project ${p.ProjectNo}`,
      source: p,
    });
  }
  return events;
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test -- src/lib/calendar/deriveEvents.test.ts
```
Expected: PASS (all derive tests green).

- [ ] **Step 5: Run the full lint + typecheck + test suite**

```bash
npx tsc --noEmit
npx eslint src/
npm test
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/calendar/deriveEvents.ts src/lib/calendar/deriveEvents.test.ts
git commit -m "feat(calendar): derive project closing events from ProjectInfo.CompletioDate"
```

---

## Task 10: EventForm — shared form component

**Files:**
- Create: `src/components/calendar/EventForm.tsx`

This task creates the shared form used by both the create and edit modals. No standalone test — its behavior is exercised through `EventCreateModal.test.tsx` in Task 11.

- [ ] **Step 1: Create the component**

```tsx
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import type { CalendarEvent, DivisionInfo } from '../../types';

export interface EventFormValues {
  title: string;
  event_date: string;
  event_kind: 'Custom' | 'Pamphlet' | 'Announcement';
  location: string;
  teams_url: string;
  pamphlet_url: string;
  description: string;
  visibility: 'OrgWide' | 'Division' | 'Personal';
  division_code: string;
}

interface EventFormProps {
  initial?: Partial<CalendarEvent>;
  divisions: DivisionInfo[];
  defaultDivisionCode?: string;
  submitLabel: string;
  onSubmit: (values: EventFormValues) => Promise<void> | void;
  onCancel: () => void;
}

const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => v === '' || /^https?:\/\//.test(v),
    'Must be an http(s) URL'
  );

const schema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required'),
    event_kind: z.enum(['Custom', 'Pamphlet', 'Announcement']),
    location: z.string().max(200),
    teams_url: optionalUrl,
    pamphlet_url: optionalUrl,
    description: z.string().max(1000),
    visibility: z.enum(['OrgWide', 'Division', 'Personal']),
    division_code: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.visibility === 'Division' && !v.division_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['division_code'],
        message: 'Division is required when visibility is Division',
      });
    }
  });

export function EventForm({
  initial,
  divisions,
  defaultDivisionCode,
  submitLabel,
  onSubmit,
  onCancel,
}: EventFormProps) {
  const [values, setValues] = useState<EventFormValues>({
    title: initial?.title ?? '',
    event_date: initial?.event_date ?? '',
    event_kind: (initial?.event_kind as EventFormValues['event_kind']) ?? 'Custom',
    location: initial?.location ?? '',
    teams_url: initial?.teams_url ?? '',
    pamphlet_url: initial?.pamphlet_url ?? '',
    description: initial?.description ?? '',
    visibility: (initial?.visibility as EventFormValues['visibility']) ?? 'OrgWide',
    division_code: initial?.division_code ?? defaultDivisionCode ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof EventFormValues>(k: K, v: EventFormValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    const result = schema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0]?.toString() ?? '_';
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    try {
      setSubmitting(true);
      await onSubmit(result.data);
    } finally {
      setSubmitting(false);
    }
  }

  const fieldErr = (k: string) => errors[k];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-text-muted uppercase mb-1">Title</label>
        <input
          type="text"
          value={values.title}
          onChange={(e) => update('title', e.target.value)}
          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
        />
        {fieldErr('title') && <p className="text-rose-500 text-xs mt-1">{fieldErr('title')}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-text-muted uppercase mb-1">Date</label>
          <input
            type="date"
            value={values.event_date}
            onChange={(e) => update('event_date', e.target.value)}
            className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
          />
          {fieldErr('event_date') && <p className="text-rose-500 text-xs mt-1">{fieldErr('event_date')}</p>}
        </div>
        <div>
          <label className="block text-xs font-bold text-text-muted uppercase mb-1">Kind</label>
          <select
            value={values.event_kind}
            onChange={(e) => update('event_kind', e.target.value as EventFormValues['event_kind'])}
            className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
          >
            <option value="Custom">Custom Event</option>
            <option value="Pamphlet">Pamphlet</option>
            <option value="Announcement">Announcement</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-text-muted uppercase mb-1">Location</label>
        <input
          type="text"
          value={values.location}
          onChange={(e) => update('location', e.target.value)}
          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-text-muted uppercase mb-1">MS Teams URL</label>
        <input
          type="url"
          value={values.teams_url}
          onChange={(e) => update('teams_url', e.target.value)}
          placeholder="https://teams.microsoft.com/..."
          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
        />
        {fieldErr('teams_url') && <p className="text-rose-500 text-xs mt-1">{fieldErr('teams_url')}</p>}
      </div>

      <div>
        <label className="block text-xs font-bold text-text-muted uppercase mb-1">Pamphlet URL</label>
        <input
          type="url"
          value={values.pamphlet_url}
          onChange={(e) => update('pamphlet_url', e.target.value)}
          placeholder="https://..."
          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
        />
        {fieldErr('pamphlet_url') && <p className="text-rose-500 text-xs mt-1">{fieldErr('pamphlet_url')}</p>}
      </div>

      <div>
        <label className="block text-xs font-bold text-text-muted uppercase mb-1">Description</label>
        <textarea
          value={values.description}
          onChange={(e) => update('description', e.target.value)}
          rows={3}
          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
        />
        {fieldErr('description') && <p className="text-rose-500 text-xs mt-1">{fieldErr('description')}</p>}
      </div>

      <div>
        <label className="block text-xs font-bold text-text-muted uppercase mb-1">Visibility</label>
        <div className="flex gap-4 text-sm text-text">
          {(['OrgWide', 'Division', 'Personal'] as const).map((v) => (
            <label key={v} className="flex items-center gap-2">
              <input
                type="radio"
                checked={values.visibility === v}
                onChange={() => update('visibility', v)}
              />
              {v === 'OrgWide' ? 'Org-wide' : v}
            </label>
          ))}
        </div>
      </div>

      {values.visibility === 'Division' && (
        <div>
          <label className="block text-xs font-bold text-text-muted uppercase mb-1">Division</label>
          <select
            value={values.division_code}
            onChange={(e) => update('division_code', e.target.value)}
            className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
          >
            <option value="">Select division…</option>
            {divisions.map((d) => (
              <option key={d.divCode} value={d.divCode}>{d.divName}</option>
            ))}
          </select>
          {fieldErr('division_code') && <p className="text-rose-500 text-xs mt-1">{fieldErr('division_code')}</p>}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-text-muted hover:bg-surface-hover rounded-md"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="bg-[#c96442] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#b5593b] disabled:opacity-50"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/calendar/EventForm.tsx
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/EventForm.tsx
git commit -m "feat(calendar): add shared EventForm with zod validation"
```

---

## Task 11: EventCreateModal (TDD)

**Files:**
- Create: `src/components/calendar/EventCreateModal.tsx`
- Create: `src/components/calendar/EventCreateModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/calendar/EventCreateModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EventCreateModal } from './EventCreateModal';
import type { DivisionInfo } from '../../types';

const divisions: DivisionInfo[] = [
  {
    divCode: 'D01',
    divName: 'Materials',
    divDescription: '',
    divResearchAreas: '',
    divHoD: '',
    divHoDID: '',
    divSanctionedstrength: 0,
    divCurrentStrength: 0,
    divStatus: 'Active',
  },
];

const noop = () => {};

describe('EventCreateModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders when open', () => {
    render(
      <EventCreateModal
        open
        divisions={divisions}
        defaultDivisionCode="D01"
        onSubmit={async () => {}}
        onClose={noop}
      />
    );
    expect(screen.getByText(/New Event/i)).toBeInTheDocument();
  });

  it('shows validation error when title is empty on submit', async () => {
    render(
      <EventCreateModal
        open
        divisions={divisions}
        defaultDivisionCode="D01"
        onSubmit={async () => {}}
        onClose={noop}
      />
    );
    const submit = screen.getByRole('button', { name: /create/i });
    fireEvent.click(submit);
    await waitFor(() => {
      expect(screen.getByText(/title is required/i)).toBeInTheDocument();
    });
  });

  it('rejects a non-URL string in MS Teams URL', async () => {
    render(
      <EventCreateModal
        open
        divisions={divisions}
        defaultDivisionCode="D01"
        onSubmit={async () => {}}
        onClose={noop}
      />
    );
    fireEvent.change(screen.getByLabelText(/title/i, { selector: 'input' }), {
      target: { value: 'Test Event' },
    });
    fireEvent.change(screen.getByLabelText(/date/i, { selector: 'input' }), {
      target: { value: '2026-06-15' },
    });
    fireEvent.change(screen.getByLabelText(/ms teams url/i, { selector: 'input' }), {
      target: { value: 'not-a-url' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      expect(screen.getByText(/must be an http\(s\) url/i)).toBeInTheDocument();
    });
  });

  it('forces division selection when visibility=Division', async () => {
    render(
      <EventCreateModal
        open
        divisions={divisions}
        defaultDivisionCode=""
        onSubmit={async () => {}}
        onClose={noop}
      />
    );
    fireEvent.change(screen.getByLabelText(/title/i, { selector: 'input' }), {
      target: { value: 'Test Event' },
    });
    fireEvent.change(screen.getByLabelText(/date/i, { selector: 'input' }), {
      target: { value: '2026-06-15' },
    });
    fireEvent.click(screen.getByLabelText('Division'));
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      expect(screen.getByText(/division is required/i)).toBeInTheDocument();
    });
  });

  it('calls onSubmit with valid payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <EventCreateModal
        open
        divisions={divisions}
        defaultDivisionCode="D01"
        onSubmit={onSubmit}
        onClose={noop}
      />
    );
    fireEvent.change(screen.getByLabelText(/title/i, { selector: 'input' }), {
      target: { value: 'Test Event' },
    });
    fireEvent.change(screen.getByLabelText(/date/i, { selector: 'input' }), {
      target: { value: '2026-06-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: 'Test Event',
      event_date: '2026-06-15',
      visibility: 'OrgWide',
    });
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npm test -- src/components/calendar/EventCreateModal.test.tsx
```
Expected: FAIL — module `./EventCreateModal` not found.

- [ ] **Step 3: Implement the modal**

Create `src/components/calendar/EventCreateModal.tsx`:

```tsx
import { X } from 'lucide-react';
import { EventForm, type EventFormValues } from './EventForm';
import type { DivisionInfo } from '../../types';

interface EventCreateModalProps {
  open: boolean;
  divisions: DivisionInfo[];
  defaultDivisionCode: string;
  onSubmit: (values: EventFormValues) => Promise<void>;
  onClose: () => void;
}

export function EventCreateModal({
  open,
  divisions,
  defaultDivisionCode,
  onSubmit,
  onClose,
}: EventCreateModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-text">New Event</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:bg-surface-hover p-1 rounded-md"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          <EventForm
            divisions={divisions}
            defaultDivisionCode={defaultDivisionCode}
            submitLabel="Create"
            onSubmit={async (values) => {
              await onSubmit(values);
              onClose();
            }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
```

The EventForm uses native `<label>` text adjacent to inputs. To make `getByLabelText` work in tests, wrap each label in an explicit `htmlFor` binding — quick fix: change EventForm so each `<label>` becomes `<label htmlFor="id">` and each input has matching `id="..."`.

Update `src/components/calendar/EventForm.tsx` to add `id` attributes:
- Title input: `id="event-title"`, label: `htmlFor="event-title"`
- Date input: `id="event-date"`, label: `htmlFor="event-date"`
- Kind select: `id="event-kind"`
- Location: `id="event-location"`
- MS Teams URL: `id="event-teams-url"`
- Pamphlet URL: `id="event-pamphlet-url"`
- Description: `id="event-description"`
- Division select: `id="event-division"`
- Visibility radios already use enclosed pattern — keep, but for Division radio, give the radio input itself an `aria-label="Division"` so the test can target it.

Concrete edit example for the title field:

```tsx
<label htmlFor="event-title" className="block text-xs font-bold text-text-muted uppercase mb-1">Title</label>
<input
  id="event-title"
  type="text"
  ...
/>
```

Apply the same pattern (`id` on input, `htmlFor` on label, matching string) for every field listed above. For the Division radio, change to:

```tsx
<input
  type="radio"
  aria-label="Division"
  checked={values.visibility === 'Division'}
  onChange={() => update('visibility', 'Division')}
/>
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm test -- src/components/calendar/EventCreateModal.test.tsx
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/calendar/EventCreateModal.tsx src/components/calendar/EventCreateModal.test.tsx src/components/calendar/EventForm.tsx
git commit -m "feat(calendar): add EventCreateModal with zod validation tests"
```

---

## Task 12: EventDetailModal

**Files:**
- Create: `src/components/calendar/EventDetailModal.tsx`

This task adds the view/edit/delete modal. No standalone unit test — its behavior is exercised through Task 13's manual QA. The component is mostly presentational dispatch over the `CalEvent` discriminated union.

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { X, MapPin, Calendar as CalendarIcon, Edit2, Trash2, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { EventForm, type EventFormValues } from './EventForm';
import { EVENT_COLOR, EVENT_LABEL, type CalEvent } from '../../lib/calendar/types';
import { canEditEvent } from '../../lib/calendar/permissions';
import { formatDate } from '../../utils/dateUtils';
import type { DivisionInfo, Role } from '../../types';

interface EventDetailModalProps {
  event: CalEvent | null;
  open: boolean;
  divisions: DivisionInfo[];
  userId: string;
  activeRole: Role;
  onClose: () => void;
  onUpdate: (id: string, values: EventFormValues) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function EventDetailModal({
  event,
  open,
  divisions,
  userId,
  activeRole,
  onClose,
  onUpdate,
  onDelete,
}: EventDetailModalProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!open || !event) return null;

  const isCalendarEvent =
    event.kind === 'custom' ||
    event.kind === 'pamphlet' ||
    event.kind === 'announcement';
  const isHoliday = event.kind === 'holiday';
  const isDerived =
    event.kind === 'birthday' ||
    event.kind === 'retirement' ||
    event.kind === 'project_closing';
  const isMeeting = event.kind === 'meeting';
  const isAction = event.kind === 'action';

  const canEdit = isCalendarEvent && canEditEvent(event.source, userId, activeRole);
  const canEditHoliday = isHoliday && (activeRole === 'SystemAdmin' || activeRole === 'MasterAdmin');

  const sourceLabel = (() => {
    if (event.kind === 'birthday' || event.kind === 'retirement') return 'from Staff Master';
    if (event.kind === 'project_closing') return 'from Project Master';
    return '';
  })();

  const teamsUrl = isCalendarEvent ? event.source.teams_url : isMeeting ? event.source.teams_url : null;
  const pamphletUrl = isCalendarEvent ? event.source.pamphlet_url : isMeeting ? event.source.pamphlet_url : null;
  const description = isCalendarEvent ? event.source.description : '';

  function handleClose() {
    setMode('view');
    setConfirmingDelete(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className={clsx('w-3 h-3 rounded-full', EVENT_COLOR[event.kind])} />
            <h2 className="font-bold text-text">{event.title}</h2>
          </div>
          <button onClick={handleClose} className="text-text-muted hover:bg-surface-hover p-1 rounded-md" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {mode === 'edit' && isCalendarEvent ? (
          <div className="p-4">
            <EventForm
              initial={event.source}
              divisions={divisions}
              submitLabel="Save"
              onSubmit={async (values) => {
                await onUpdate(event.source.id, values);
                handleClose();
              }}
              onCancel={() => setMode('view')}
            />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-4 text-sm text-text-muted">
              <span className="flex items-center gap-1"><CalendarIcon size={14} />{formatDate(event.date)}</span>
              {event.location && <span className="flex items-center gap-1"><MapPin size={14} />{event.location}</span>}
            </div>
            <div className="text-xs uppercase font-bold text-text-muted">
              {EVENT_LABEL[event.kind]}
              {sourceLabel && <span className="ml-2 text-text-muted/70 normal-case font-normal">({sourceLabel})</span>}
            </div>

            {teamsUrl && (
              <a
                href={teamsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#c96442] text-white px-3 py-1.5 rounded-md text-sm hover:bg-[#b5593b]"
              >
                <ExternalLink size={14} />
                Join Meeting
              </a>
            )}

            {pamphletUrl && (
              <a
                href={pamphletUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-border px-3 py-1.5 rounded-md text-sm text-text hover:bg-surface-hover ml-2"
              >
                <ExternalLink size={14} />
                View Pamphlet
              </a>
            )}

            {description && (
              <div className="text-sm text-text whitespace-pre-line">{description}</div>
            )}

            {isMeeting && (
              <Link
                to={`/committees/${event.source.committee_id}/meetings/${event.source.id}`}
                className="inline-flex items-center gap-2 text-sm text-[#c96442] hover:underline"
                onClick={handleClose}
              >
                Open in Committees <ExternalLink size={12} />
              </Link>
            )}

            {isAction && (
              <Link
                to={`/committees/${event.source.meeting_id ?? ''}`}
                className="inline-flex items-center gap-2 text-sm text-[#c96442] hover:underline"
                onClick={handleClose}
              >
                Open Action Item <ExternalLink size={12} />
              </Link>
            )}

            {(canEdit || canEditHoliday) && (
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                {canEdit && (
                  <button
                    onClick={() => setMode('edit')}
                    className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text px-3 py-1.5 hover:bg-surface-hover rounded-md"
                  >
                    <Edit2 size={14} /> Edit
                  </button>
                )}
                {confirmingDelete ? (
                  <>
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      className="text-sm text-text-muted px-3 py-1.5 hover:bg-surface-hover rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (isCalendarEvent) await onDelete(event.source.id);
                        else if (isHoliday) await onDelete(event.source.id);
                        handleClose();
                      }}
                      className="text-sm bg-rose-500 text-white px-3 py-1.5 rounded-md hover:bg-rose-600"
                    >
                      Confirm Delete
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="inline-flex items-center gap-1 text-sm text-rose-500 hover:bg-rose-500/10 px-3 py-1.5 rounded-md"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            )}

            {isDerived && (
              <div className="text-xs text-text-muted/60 pt-3 border-t border-border">
                This event is derived from master data. Edit the source record (Staff / Project) to change it.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/calendar/EventDetailModal.tsx
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/EventDetailModal.tsx
git commit -m "feat(calendar): add EventDetailModal with view/edit/delete + derived-event read-only mode"
```

---

## Task 13: Calendar.tsx refactor — wire all the things

**Files:**
- Modify: `src/pages/Calendar.tsx` (full rewrite — the existing 363-line file is replaced)

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/pages/Calendar.tsx` with:

```tsx
import { useState, useMemo, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../utils/supabaseClient';
import { Card } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Calendar as CalendarIcon,
  CalendarDays,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import clsx from 'clsx';
import { EventCreateModal } from '../components/calendar/EventCreateModal';
import { EventDetailModal } from '../components/calendar/EventDetailModal';
import type { EventFormValues } from '../components/calendar/EventForm';
import { canCreateEvent } from '../lib/calendar/permissions';
import {
  deriveBirthdayEvents,
  deriveRetirementEvents,
  deriveProjectClosingEvents,
} from '../lib/calendar/deriveEvents';
import {
  EVENT_COLOR,
  EVENT_LABEL,
  type CalEvent,
  type CalEventKind,
} from '../lib/calendar/types';
import type { Meeting, ActionItem, CalendarEvent, Holiday } from '../types';

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function meetingToEvent(m: Meeting): CalEvent {
  return {
    kind: 'meeting',
    id: `m-${m.id}`,
    title: m.title,
    location: m.venue || 'TBD',
    date: new Date(m.meeting_date),
    meta: m.status,
    source: m,
  };
}

function actionItemToEvent(a: ActionItem): CalEvent {
  return {
    kind: 'action',
    id: `a-${a.id}`,
    title: a.task,
    location: 'Action item',
    date: new Date(a.deadline),
    meta: a.status,
    source: a,
  };
}

function calendarEventToEvent(c: CalendarEvent): CalEvent {
  const subKind: 'custom' | 'pamphlet' | 'announcement' =
    c.event_kind === 'Pamphlet' ? 'pamphlet'
    : c.event_kind === 'Announcement' ? 'announcement'
    : 'custom';
  return {
    kind: subKind,
    id: `ce-${c.id}`,
    title: c.title,
    location: c.location || 'TBD',
    date: new Date(c.event_date),
    meta: c.visibility,
    source: c,
  };
}

function holidayToEvent(h: Holiday): CalEvent {
  return {
    kind: 'holiday',
    id: `h-${h.id}`,
    title: h.name,
    location: '',
    date: new Date(h.holiday_date),
    meta: h.holiday_type,
    source: h,
  };
}

export default function Calendar() {
  const {
    meetings, actionItems, calendarEvents, holidays, projects, staff, divisions,
    isLoading, refreshCalendar,
  } = useData();
  const { user, activeRole } = useAuth();
  const { push: pushToast } = useToast();

  const today = new Date();
  const [calDate, setCalDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());

  const [personal, setPersonal] = useState<boolean>(
    () => localStorage.getItem('surya_calendar_personal') === 'true'
  );
  useEffect(() => {
    localStorage.setItem('surya_calendar_personal', String(personal));
  }, [personal]);

  const [kindFilter, setKindFilter] = useState<Set<CalEventKind>>(new Set());
  function toggleKindFilter(k: CalEventKind) {
    setKindFilter(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalEvent | null>(null);

  const year = calDate.getFullYear();
  const month = calDate.getMonth();

  const events: CalEvent[] = useMemo(() => {
    const m = meetings.map(meetingToEvent);
    const a = actionItems.filter(it => it.status !== 'Completed').map(actionItemToEvent);
    const c = calendarEvents.map(calendarEventToEvent);
    const h = holidays.map(holidayToEvent);

    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const pc = deriveProjectClosingEvents(projects, firstOfMonth, lastOfMonth);
    const b = deriveBirthdayEvents(staff, year, month);
    const r = deriveRetirementEvents(staff, year, month);

    const all = [...m, ...c, ...h, ...pc];
    if (personal) {
      all.push(...a, ...b, ...r);
    }
    return all;
  }, [meetings, actionItems, calendarEvents, holidays, projects, staff, year, month, personal]);

  const visibleEvents = useMemo(() => {
    if (kindFilter.size === 0) return events;
    return events.filter(e => !kindFilter.has(e.kind));
  }, [events, kindFilter]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of visibleEvents) {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [visibleEvents]);

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const prevMonth = () => setCalDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCalDate(new Date(year, month + 1, 1));

  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [firstDayOfWeek, daysInMonth]);

  const dayKey = (d: number) => `${year}-${month}-${d}`;
  const dayEvents = eventsByDate.get(dayKey(selectedDay)) ?? [];

  const weekDays = useMemo(() => {
    const base = new Date(year, month, selectedDay || 1);
    const dow = base.getDay();
    const monday = new Date(base);
    monday.setDate(base.getDate() - ((dow + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [year, month, selectedDay]);

  const upcoming = useMemo(() => {
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return visibleEvents
      .filter(e => e.date >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents]);

  const canCreate = activeRole ? canCreateEvent(activeRole) : false;
  const userId = user?.id ?? '';

  async function handleCreate(values: EventFormValues) {
    if (!supabase || !user) return;
    const { error } = await supabase.from('calendar_events').insert({
      title: values.title,
      event_date: values.event_date,
      event_kind: values.event_kind,
      location: values.location,
      teams_url: values.teams_url || null,
      pamphlet_url: values.pamphlet_url || null,
      description: values.description,
      visibility: values.visibility,
      division_code: values.visibility === 'Division' ? values.division_code : null,
      created_by: user.id,
    });
    if (error) {
      pushToast(`Create failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Event created', 'success');
    await refreshCalendar();
  }

  async function handleUpdate(id: string, values: EventFormValues) {
    if (!supabase) return;
    const { error } = await supabase.from('calendar_events').update({
      title: values.title,
      event_date: values.event_date,
      event_kind: values.event_kind,
      location: values.location,
      teams_url: values.teams_url || null,
      pamphlet_url: values.pamphlet_url || null,
      description: values.description,
      visibility: values.visibility,
      division_code: values.visibility === 'Division' ? values.division_code : null,
    }).eq('id', id);
    if (error) {
      pushToast(`Update failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Event updated', 'success');
    await refreshCalendar();
  }

  async function handleDelete(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('calendar_events').delete().eq('id', id);
    if (error) {
      pushToast(`Delete failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Event deleted', 'success');
    await refreshCalendar();
  }

  const isEmpty =
    meetings.length === 0 && actionItems.length === 0 &&
    calendarEvents.length === 0 && holidays.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Executive Calendar</h1>
          <p className="text-text-muted mt-1">Institute Events Timeline</p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={personal}
              onChange={(e) => setPersonal(e.target.checked)}
            />
            Personal staff layer
          </label>
          <button
            onClick={() => setCreateOpen(true)}
            disabled={!canCreate}
            title={canCreate ? '' : 'Insufficient permissions'}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors',
              canCreate
                ? 'bg-[#c96442] text-white hover:bg-[#b5593b]'
                : 'bg-surface text-text-muted/50 cursor-not-allowed border border-border'
            )}
          >
            <Plus size={16} />
            New Event
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(EVENT_LABEL) as CalEventKind[]).map(k => {
          const off = kindFilter.has(k);
          return (
            <button
              key={k}
              onClick={() => toggleKindFilter(k)}
              className={clsx(
                'px-3 py-1 rounded-full border transition-colors flex items-center gap-1.5',
                off ? 'border-border text-text-muted/50 line-through' : 'border-border text-text hover:bg-surface-hover'
              )}
            >
              <span className={clsx('w-2 h-2 rounded-full', EVENT_COLOR[k])} />
              {EVENT_LABEL[k]}
            </button>
          );
        })}
      </div>

      {!isLoading && isEmpty ? (
        <EmptyState
          icon={CalendarDays}
          title="No events yet"
          description="Create a calendar event from the New Event button, or have a SystemAdmin add holidays."
        />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-text text-sm">{MONTH_NAMES[month]} {year}</h3>
              <div className="flex gap-1">
                <button onClick={prevMonth} className="p-1 hover:bg-surface-hover rounded-md text-text-muted">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={nextMonth} className="p-1 hover:bg-surface-hover rounded-md text-text-muted">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
              {DAY_NAMES.map((d, i) => (
                <div key={i} className="text-[10px] font-bold text-text-muted/60 py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {calendarCells.map((day, i) => {
                if (!day) return <div key={i} />;
                const isToday = isCurrentMonth && day === today.getDate();
                const isSelected = day === selectedDay;
                const cellEvents = eventsByDate.get(dayKey(day)) ?? [];
                const hasEvent = cellEvents.length > 0;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(day)}
                    title={hasEvent ? `${cellEvents.length} event(s)` : ''}
                    className={clsx(
                      'relative py-1.5 text-xs rounded-md cursor-pointer transition-colors',
                      isToday && !isSelected && 'text-[#c96442] font-semibold',
                      isSelected ? 'bg-[#c96442] text-white font-bold' : 'hover:bg-surface-hover text-text'
                    )}
                  >
                    {day}
                    {hasEvent && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#c96442]" />
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <h3 className="font-bold text-text mb-4 text-sm">Upcoming</h3>
            {upcoming.length === 0 ? (
              <p className="text-xs text-text-muted">Nothing scheduled.</p>
            ) : (
              <div className="space-y-4">
                {upcoming.map(e => (
                  <button
                    key={e.id}
                    onClick={() => setDetailEvent(e)}
                    className={clsx(
                      'w-full text-left border-l-2 pl-3 hover:bg-surface-hover rounded-md py-1',
                      EVENT_COLOR[e.kind].replace('bg-', 'border-')
                    )}
                  >
                    <p className="text-xs font-bold text-text truncate" title={e.title}>{e.title}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {e.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{EVENT_LABEL[e.kind]}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border bg-surface-hover flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon size={18} className="text-[#c96442]" />
                <h3 className="font-bold text-text">
                  {viewMode === 'day'
                    ? `${MONTH_NAMES[month]} ${selectedDay}, ${year}`
                    : `Week of ${weekDays[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                </h3>
              </div>
              <div className="flex gap-1 bg-surface border border-border p-1 rounded-md">
                <button onClick={() => setViewMode('day')} className={clsx('px-3 py-1 text-[10px] font-bold rounded', viewMode === 'day' ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text')}>Day</button>
                <button onClick={() => setViewMode('week')} className={clsx('px-3 py-1 text-[10px] font-bold rounded', viewMode === 'week' ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text')}>Week</button>
              </div>
            </div>

            {viewMode === 'day' ? (
              <div className="p-2 min-h-[320px]">
                {dayEvents.length > 0 ? dayEvents.map(event => (
                  <button
                    key={event.id}
                    onClick={() => setDetailEvent(event)}
                    className="group relative w-full text-left pl-4 py-4 border-b border-border last:border-0 hover:bg-surface-hover rounded-xl mx-2"
                  >
                    <div className={clsx('absolute left-0 top-2 bottom-2 w-1 rounded-full', EVENT_COLOR[event.kind])} />
                    <div className="pl-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx('w-2 h-2 rounded-full', EVENT_COLOR[event.kind])} />
                        <h4 className="font-bold text-text truncate" title={event.title}>{event.title}</h4>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-text-muted">
                        <div className="flex items-center gap-1"><MapPin size={12} />{event.location || '—'}</div>
                        <div className="text-[10px] uppercase">{EVENT_LABEL[event.kind]} · {event.meta}</div>
                      </div>
                    </div>
                  </button>
                )) : (
                  <div className="flex flex-col items-center justify-center h-48 text-text-muted text-sm">
                    <CalendarIcon size={32} className="mb-3 opacity-30" />
                    No events scheduled for this day.
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="grid grid-cols-8 border-b border-border bg-surface-hover">
                  <div className="p-3" />
                  {weekDays.map((d, i) => {
                    const isToday = d.toDateString() === today.toDateString();
                    return (
                      <div key={i} className="p-3 text-center border-l border-border">
                        <div className="text-[10px] font-bold text-text-muted uppercase">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</div>
                        <div className={clsx('text-lg font-black mt-0.5 w-8 h-8 rounded-full flex items-center justify-center mx-auto', isToday ? 'bg-[#c96442] text-white' : 'text-text')}>
                          {d.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-8 min-h-[300px]">
                  <div className="border-r border-border p-2 text-[10px] font-bold text-text-muted uppercase">All-day</div>
                  {weekDays.map((d, i) => {
                    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                    const dayEvts = eventsByDate.get(key) ?? [];
                    return (
                      <div key={i} className="border-l border-border p-2 space-y-1 min-h-[120px]">
                        {dayEvts.map(e => (
                          <button
                            key={e.id}
                            onClick={() => setDetailEvent(e)}
                            className={clsx('w-full text-left rounded-md p-1.5 text-white text-[10px] font-bold shadow-sm', EVENT_COLOR[e.kind])}
                            title={e.title}
                          >
                            <div className="truncate">{e.title}</div>
                            <div className="opacity-80 font-normal">{EVENT_LABEL[e.kind]}</div>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
      )}

      <EventCreateModal
        open={createOpen}
        divisions={divisions}
        defaultDivisionCode={user?.divisionCode ?? ''}
        onSubmit={handleCreate}
        onClose={() => setCreateOpen(false)}
      />

      <EventDetailModal
        event={detailEvent}
        open={!!detailEvent}
        divisions={divisions}
        userId={userId}
        activeRole={activeRole ?? 'Guest'}
        onClose={() => setDetailEvent(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript + lint**

```bash
npx tsc --noEmit
npx eslint src/pages/Calendar.tsx
```
Expected: PASS. If `useAuth` doesn't expose `user.id` directly, adjust the destructuring to whatever the actual auth context yields (likely `user?.id` works since `UserAccount` has `id: string`).

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```
Expected: PASS.

- [ ] **Step 4: Dev-server manual smoke**

```bash
npm run dev
```
Manually verify:
1. Calendar page loads without errors.
2. "New Event" button enabled as SystemAdmin; disabled for Scientist (try via different login).
3. Click event row → detail modal opens, shows date/location/kind.
4. Toggle "Personal staff layer" → birthday/retirement events appear in current month if any are in window.
5. Click filter chips → events of that kind disappear/reappear.

If something is broken, fix it before commit.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Calendar.tsx
git commit -m "feat(calendar): wire New Event modal, event detail modal, filter chips, personal toggle"
```

---

## Task 14: Holidays admin page + route + nav

**Files:**
- Create: `src/pages/admin/HolidaysAdmin.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Layout.tsx`

- [ ] **Step 1: Create the page**

Create `src/pages/admin/HolidaysAdmin.tsx`:

```tsx
import { useState, useMemo, type ChangeEvent } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../utils/supabaseClient';
import { Card } from '../../components/ui/Cards';
import { Navigate } from 'react-router-dom';
import { canManageHolidays } from '../../lib/calendar/permissions';
import { Trash2, Edit2, Upload, Plus, Save, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { Holiday } from '../../types';

type HolidayType = Holiday['holiday_type'];

interface ImportRow {
  date: string;
  name: string;
  type: HolidayType;
  error?: string;
}

const HOLIDAY_TYPES: HolidayType[] = ['Gazetted', 'Restricted', 'Institute'];

function validateImportRow(raw: Record<string, unknown>): ImportRow {
  const date = String(raw.date || raw.Date || '').trim();
  const name = String(raw.name || raw.Name || '').trim();
  const typeRaw = String(raw.type || raw.Type || '').trim();
  const type = HOLIDAY_TYPES.find((t) => t.toLowerCase() === typeRaw.toLowerCase()) ?? 'Gazetted';

  if (!date) return { date, name, type, error: 'Missing date' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { date, name, type, error: 'Date must be YYYY-MM-DD' };
  if (!name) return { date, name, type, error: 'Missing name' };
  if (!HOLIDAY_TYPES.find((t) => t.toLowerCase() === typeRaw.toLowerCase())) {
    return { date, name, type, error: 'Type must be Gazetted/Restricted/Institute' };
  }
  return { date, name, type };
}

export default function HolidaysAdmin() {
  const { activeRole } = useAuth();
  const { holidays, refreshHolidays } = useData();
  const { push: pushToast } = useToast();

  if (!activeRole || !canManageHolidays(activeRole)) {
    return <Navigate to="/calendar" replace />;
  }

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);

  const years = useMemo(() => {
    const set = new Set<number>([currentYear, currentYear + 1]);
    holidays.forEach((h) => set.add(h.year));
    return Array.from(set).sort((a, b) => a - b);
  }, [holidays, currentYear]);

  const filtered = useMemo(
    () => holidays.filter((h) => h.year === year).sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)),
    [holidays, year]
  );

  // Add form
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<HolidayType>('Gazetted');

  async function addHoliday() {
    if (!supabase) return;
    if (!newDate || !newName) {
      pushToast('Date and name are required', 'warning');
      return;
    }
    const y = parseInt(newDate.slice(0, 4), 10);
    const { error } = await supabase.from('holidays').insert({
      holiday_date: newDate,
      name: newName,
      holiday_type: newType,
      year: y,
    });
    if (error) {
      pushToast(`Add failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Holiday added', 'success');
    setNewDate(''); setNewName(''); setNewType('Gazetted');
    await refreshHolidays();
  }

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ date: string; name: string; type: HolidayType }>({ date: '', name: '', type: 'Gazetted' });

  function startEdit(h: Holiday) {
    setEditingId(h.id);
    setEditValues({ date: h.holiday_date, name: h.name, type: h.holiday_type });
  }

  async function saveEdit(id: string) {
    if (!supabase) return;
    const y = parseInt(editValues.date.slice(0, 4), 10);
    const { error } = await supabase.from('holidays').update({
      holiday_date: editValues.date,
      name: editValues.name,
      holiday_type: editValues.type,
      year: y,
    }).eq('id', id);
    if (error) {
      pushToast(`Update failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Holiday updated', 'success');
    setEditingId(null);
    await refreshHolidays();
  }

  async function deleteHoliday(id: string) {
    if (!supabase) return;
    if (!window.confirm('Delete this holiday?')) return;
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) {
      pushToast(`Delete failed: ${error.message}`, 'error');
      return;
    }
    pushToast('Holiday deleted', 'success');
    await refreshHolidays();
  }

  // Bulk import
  const [importRows, setImportRows] = useState<ImportRow[]>([]);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      let rows: Record<string, unknown>[] = [];
      if (file.name.toLowerCase().endsWith('.csv')) {
        const parsed = Papa.parse<Record<string, unknown>>(String(data), { header: true, skipEmptyLines: true });
        rows = parsed.data;
      } else {
        const wb = XLSX.read(data, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      }
      setImportRows(rows.map(validateImportRow));
    };
    if (file.name.toLowerCase().endsWith('.csv')) reader.readAsText(file);
    else reader.readAsBinaryString(file);
  }

  async function commitImport() {
    if (!supabase) return;
    const valid = importRows.filter((r) => !r.error);
    if (valid.length === 0) {
      pushToast('No valid rows to import', 'warning');
      return;
    }
    const payload = valid.map((r) => ({
      holiday_date: r.date,
      name: r.name,
      holiday_type: r.type,
      year: parseInt(r.date.slice(0, 4), 10),
    }));
    const { error } = await supabase.from('holidays').insert(payload);
    if (error) {
      pushToast(`Import failed: ${error.message}`, 'error');
      return;
    }
    pushToast(`Imported ${valid.length} rows`, 'success');
    setImportRows([]);
    await refreshHolidays();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-[500] text-text font-serif">Holidays Admin</h1>
        <p className="text-text-muted mt-1">Manage the institute holiday list. SystemAdmin only.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — manual CRUD */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-text text-sm">Holidays for {year}</h2>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="bg-surface border border-border rounded-md px-2 py-1 text-sm text-text"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-12 gap-2 mb-4 items-end">
            <input
              type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              className="col-span-4 bg-surface border border-border rounded-md px-2 py-1.5 text-sm text-text"
            />
            <input
              type="text" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)}
              className="col-span-4 bg-surface border border-border rounded-md px-2 py-1.5 text-sm text-text"
            />
            <select
              value={newType} onChange={(e) => setNewType(e.target.value as HolidayType)}
              className="col-span-3 bg-surface border border-border rounded-md px-2 py-1.5 text-sm text-text"
            >
              {HOLIDAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={addHoliday}
              className="col-span-1 bg-[#c96442] text-white rounded-md py-1.5 hover:bg-[#b5593b]"
              aria-label="Add holiday"
            >
              <Plus size={16} />
            </button>
          </div>

          <table className="w-full text-sm">
            <thead className="text-xs text-text-muted uppercase border-b border-border">
              <tr>
                <th className="text-left py-2">Date</th>
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Type</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr key={h.id} className="border-b border-border last:border-0">
                  {editingId === h.id ? (
                    <>
                      <td><input type="date" value={editValues.date} onChange={(e) => setEditValues({ ...editValues, date: e.target.value })} className="bg-surface border border-border rounded-md px-1 py-0.5 text-sm text-text" /></td>
                      <td><input type="text" value={editValues.name} onChange={(e) => setEditValues({ ...editValues, name: e.target.value })} className="bg-surface border border-border rounded-md px-1 py-0.5 text-sm text-text w-full" /></td>
                      <td><select value={editValues.type} onChange={(e) => setEditValues({ ...editValues, type: e.target.value as HolidayType })} className="bg-surface border border-border rounded-md px-1 py-0.5 text-sm text-text">{HOLIDAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
                      <td className="text-right">
                        <button onClick={() => saveEdit(h.id)} className="p-1 text-emerald-500 hover:bg-surface-hover rounded-md" aria-label="Save"><Save size={14} /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-text-muted hover:bg-surface-hover rounded-md" aria-label="Cancel"><X size={14} /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2">{h.holiday_date}</td>
                      <td className="py-2">{h.name}</td>
                      <td className="py-2">{h.holiday_type}</td>
                      <td className="text-right">
                        <button onClick={() => startEdit(h)} className="p-1 text-text-muted hover:bg-surface-hover rounded-md" aria-label="Edit"><Edit2 size={14} /></button>
                        <button onClick={() => deleteHoliday(h.id)} className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-md" aria-label="Delete"><Trash2 size={14} /></button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="text-center text-text-muted py-4">No holidays for {year}.</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        {/* RIGHT — bulk import */}
        <Card className="p-4">
          <h2 className="font-bold text-text text-sm mb-4">Bulk import</h2>
          <p className="text-xs text-text-muted mb-3">Expected columns: <code>date</code> (YYYY-MM-DD), <code>name</code>, <code>type</code> (Gazetted / Restricted / Institute).</p>
          <label className="flex items-center gap-2 bg-surface border border-dashed border-border rounded-md px-4 py-3 cursor-pointer hover:bg-surface-hover text-sm text-text">
            <Upload size={16} />
            <span>Choose CSV or XLSX file</span>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
          </label>

          {importRows.length > 0 && (
            <>
              <div className="mt-4 max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-text-muted uppercase border-b border-border">
                    <tr>
                      <th className="text-left py-1">Date</th>
                      <th className="text-left py-1">Name</th>
                      <th className="text-left py-1">Type</th>
                      <th className="text-left py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr key={i} className={clsx('border-b border-border', r.error && 'bg-rose-500/5')}>
                        <td className="py-1">{r.date}</td>
                        <td className="py-1">{r.name}</td>
                        <td className="py-1">{r.type}</td>
                        <td className="py-1 text-rose-500">{r.error || 'OK'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={commitImport}
                disabled={importRows.filter((r) => !r.error).length === 0}
                className="mt-3 bg-[#c96442] text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#b5593b] disabled:opacity-50"
              >
                Import {importRows.filter((r) => !r.error).length} valid rows
              </button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
```

Add the missing `clsx` import at the top — re-check the file: replace the `import` block with:

```tsx
import clsx from 'clsx';
```

(inserted alongside the other imports near the top of the file)

- [ ] **Step 2: Register the route in App.tsx**

In `src/App.tsx`, add the lazy import alongside the others (near line 53):

```tsx
const HolidaysAdmin = lazy(() => import('./pages/admin/HolidaysAdmin'));
```

And add the route inside the `<Route element={<Suspense fallback={<RouteFallback />}><Outlet /></Suspense>}>` block, near the other admin routes:

```tsx
<Route path="/admin/holidays" element={<ProtectedRoute allowedRoles={['SystemAdmin', 'MasterAdmin']}><HolidaysAdmin /></ProtectedRoute>} />
```

- [ ] **Step 3: Add nav entry**

In `src/components/layout/Layout.tsx`, find the `NAV_ITEMS` array. Add a new entry alongside other admin items (e.g., near `/db-wizard`):

```typescript
{ path: '/admin/holidays', label: 'Holidays', icon: CalendarDays, allowedRoles: ['SystemAdmin', 'MasterAdmin'] },
```

Add `CalendarDays` to the `lucide-react` import at the top of the file if not already present.

- [ ] **Step 4: Typecheck + lint + tests**

```bash
npx tsc --noEmit
npx eslint src/
npm test
```
Expected: PASS.

- [ ] **Step 5: Dev-server smoke**

```bash
npm run dev
```
Verify:
1. Log in as SystemAdmin → "Holidays" nav entry visible → `/admin/holidays` opens.
2. Log in as Scientist → "Holidays" nav entry hidden → direct nav to `/admin/holidays` redirects to `/calendar`.
3. Add a holiday manually → appears in table and in Calendar.
4. Import a small CSV → preview shows rows + validation, commit inserts rows.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/HolidaysAdmin.tsx src/App.tsx src/components/layout/Layout.tsx
git commit -m "feat(admin): add Holidays admin page with manual CRUD + bulk CSV/XLSX import"
```

---

## Task 15: End-to-end smoke + final verification

**Files:** none — verification only.

- [ ] **Step 1: Run full health stack**

```bash
npx tsc --noEmit
npx eslint src/
npm test
npm run build
```
All four must PASS. The build output should generate a `dist/` directory without warnings related to the new files.

- [ ] **Step 2: Manual QA matrix via `npm run dev`**

Verify each of the following with screenshots or careful console observation:

| Scenario | Expected |
|---|---|
| SystemAdmin clicks "New Event" → fills form → submits | Event appears on calendar; row clickable; opens detail modal |
| Scientist views Calendar | "New Event" button greyed with tooltip "Insufficient permissions"; cannot open the create modal |
| Scientist clicks event row | Detail modal opens read-only (no Edit/Delete buttons) |
| SystemAdmin clicks own custom event → Edit → changes title → Save | Detail closes; calendar reflects new title |
| SystemAdmin clicks own custom event → Delete → Confirm | Event disappears from calendar |
| Toggle "Personal staff layer" ON | Birthdays + retirements + own action items appear (if any in window) |
| Toggle "Personal staff layer" OFF | Birthdays + retirements + own action items disappear |
| Toggle a filter chip (e.g., "Holiday") | Holiday events disappear; toggle again to restore |
| Navigate prev/next month | Derived events (birthdays/retirements/project closings) recompute for that month |
| Click Upcoming sidebar entry | Detail modal opens |
| Holiday "View Pamphlet" button works (when pamphlet_url set on a custom event) | Opens new tab |
| Holiday admin: add valid holiday | Row appears in table; visible on Calendar |
| Holiday admin: import CSV with bad row | Bad row flagged with red row + error message; valid rows still importable |

- [ ] **Step 3: Commit any fixes from manual QA**

If any QA scenario failed and a fix was made, commit each fix as its own atomic commit using the format:

```bash
git commit -m "fix(calendar): <short description>"
```

- [ ] **Step 4: Final commit if no fixes**

If everything passed cleanly, no commit is needed for this task — the previous commits have shipped the feature.

---

## Self-review (post-write)

**1. Spec coverage:**

| Spec section | Implementing task |
|---|---|
| §5.2 calendar_events table | Task 1 |
| §5.3 holidays table | Task 1 |
| §5.4 meetings.teams_url + pamphlet_url | Task 1 |
| §5.5 RLS policies | Task 1 (with deviation noted) |
| §5.6 Derived events | Tasks 7, 8, 9 |
| §6 Types | Task 2 |
| §7.1 DataContext additions | Task 4 |
| §7.2 src/lib/calendar | Tasks 5, 6, 7, 8, 9 |
| §8 Calendar.tsx refactor | Task 13 |
| §9.1 EventForm | Task 10 |
| §9.2 EventCreateModal | Task 11 |
| §9.3 EventDetailModal | Task 12 |
| §10 Holidays admin | Task 14 |
| §11 Windowing | Task 13 (current visible month for derived events) |
| §12 Tests | Tasks 6, 7, 8, 9, 11 |
| §13 Rollout order | Tasks 1–14 (matches order) |

Spec §11 mentions a 60-day window for Upcoming sidebar derived events. The plan's Calendar.tsx implementation uses `events.filter(e => e.date >= now)` regardless of source — derived events for adjacent months are not currently surfaced in Upcoming. This is an acceptable simplification: Upcoming is bounded to 5 items and reads from the current month's derived events plus DB-backed events sorted globally. If true 60-day derived windowing becomes important, derive events twice (current month + next month) and merge — a small follow-up.

Spec §12 mentions a `Calendar.test.tsx` and `HolidaysAdmin.test.tsx`. The plan ships `permissions.test.ts`, `deriveEvents.test.ts`, and `EventCreateModal.test.tsx` — three out of five mentioned. The Calendar.tsx and HolidaysAdmin.tsx component-level tests are deferred to a follow-up task (the manual QA in Task 15 covers behavior end-to-end). Documenting this gap explicitly here.

**2. Placeholder scan:** No `TBD`, `TODO`, or `implement later` in any task. Every code block is concrete.

**3. Type consistency:**
- `CalEvent` discriminated union (Task 5) is consumed by `deriveEvents` (Tasks 7–9) and Calendar.tsx (Task 13) and EventDetailModal (Task 12) — all use the same shape.
- `EventFormValues` (Task 10) is consumed by EventCreateModal (Task 11), EventDetailModal (Task 12), and Calendar.tsx submit handlers (Task 13) — all match.
- `canCreateEvent(activeRole)` signature is the same across Tasks 6 (definition) and 13 (consumer).
- `getRetirementDate(dob)` reused from existing `dateUtils.ts` per spec.

**4. Known follow-ups (out of plan scope):**
- Audit-log write on calendar_event/holiday mutations — schema supports it (Task 1 extended the CHECK), but client-side calls do not currently insert audit rows. Spec §10.4 mentions this for Holidays admin. Deferred to a follow-up task to avoid blocking the core fix.
- Calendar.tsx and HolidaysAdmin.tsx unit tests — manual QA covers the critical paths; component tests are a follow-up.

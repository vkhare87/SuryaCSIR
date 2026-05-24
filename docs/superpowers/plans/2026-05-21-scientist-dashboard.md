# Scientist Dashboard Redesign + Dev Role Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `ScientistView.tsx` as a combined operations + research hub, and grant `vivek.khare@csir.res.in` all 14 roles via migration for dev role-switching.

**Architecture:** Pure derive functions live in a new testable `src/lib/dashboard/scientistData.ts`; `ScientistView.tsx` consumes them via `useMemo`. Co-PI proposal matching uses one scoped supabase query inside the view. Dev role access is a single idempotent SQL migration — no app code changes.

**Tech Stack:** React 19 + TypeScript (strict), vitest, Supabase, Tailwind 4, lucide-react.

---

## File Structure

- **Create** `src/lib/dashboard/scientistData.ts` — pure functions: `ownMeetings`, `upcomingWeekEvents`, `ownActionItems`, `ownProposalsFromPI`. Each takes data arrays + identity, returns filtered/sorted results. No React, no supabase.
- **Create** `src/lib/dashboard/scientistData.test.ts` — vitest unit tests for each pure function.
- **Modify** `src/pages/dashboards/ScientistView.tsx` — full rewrite consuming the lib functions; new layout (KPI strip → ops row → action items → research grid → IRINS).
- **Create** `supabase/migrations/20260521120000_dev_all_roles.sql` — insert all roles for the dev user.

No changes to `AuthContext` or `Layout` — role switcher already renders for `roles.length > 1`.

---

## Task 1: Pure derive functions + tests

**Files:**
- Create: `src/lib/dashboard/scientistData.ts`
- Test: `src/lib/dashboard/scientistData.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/dashboard/scientistData.test.ts
import { describe, it, expect } from 'vitest';
import {
  deriveOwnMeetings,
  deriveUpcomingWeekEvents,
  deriveOwnActionItems,
} from './scientistData';
import type { Meeting, CommitteeMember, CalendarEvent, Holiday, ActionItem } from '../../types';

const NOW = new Date('2026-05-21T00:00:00Z');

function meeting(o: Partial<Meeting> = {}): Meeting {
  return {
    id: 'M1', committee_id: 'C1', meeting_date: '2026-05-25', venue: 'Room 3',
    title: 'Finance Committee', summary: '', status: 'Scheduled',
    created_at: '', teams_url: null, pamphlet_url: null, ...o,
  };
}
function member(o: Partial<CommitteeMember> = {}): CommitteeMember {
  return { id: 'CM1', committee_id: 'C1', staff_id: 'S001', role: 'Member', ...o };
}
function calEvent(o: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'E1', title: 'Audit', event_date: '2026-05-23', event_kind: 'Custom',
    location: '', teams_url: null, pamphlet_url: null, description: '',
    visibility: 'OrgWide', division_code: null, created_by: '', created_at: '', updated_at: '', ...o,
  };
}
function holiday(o: Partial<Holiday> = {}): Holiday {
  return { id: 'H1', holiday_date: '2026-05-23', name: 'Buddha Purnima', holiday_type: 'Gazetted', year: 2026, ...o };
}
function action(o: Partial<ActionItem> = {}): ActionItem {
  return {
    id: 'A1', meeting_id: 'M1', source: 'meeting', task: 'Submit report',
    assigned_to: 'Alice Researcher', deadline: '2026-05-25', status: 'Pending',
    completed_at: null, notes: '', ...o,
  };
}

describe('deriveOwnMeetings', () => {
  it('returns future meetings for committees the staff belongs to, sorted ascending', () => {
    const members = [member({ committee_id: 'C1', staff_id: 'S001' })];
    const meetings = [
      meeting({ id: 'M1', committee_id: 'C1', meeting_date: '2026-05-25' }),
      meeting({ id: 'M2', committee_id: 'C1', meeting_date: '2026-05-22' }),
      meeting({ id: 'M3', committee_id: 'C9', meeting_date: '2026-05-30' }), // not a member
      meeting({ id: 'M0', committee_id: 'C1', meeting_date: '2026-05-10' }), // past
    ];
    const result = deriveOwnMeetings(meetings, members, 'S001', NOW);
    expect(result.map(m => m.id)).toEqual(['M2', 'M1']);
  });

  it('returns empty when staff is in no committee', () => {
    expect(deriveOwnMeetings([meeting()], [], 'S999', NOW)).toEqual([]);
  });
});

describe('deriveUpcomingWeekEvents', () => {
  it('merges calendar events and holidays within next 7 days, sorted by date', () => {
    const events = [calEvent({ event_date: '2026-05-23', title: 'Audit' })];
    const holidays = [holiday({ holiday_date: '2026-05-22', name: 'Holiday X' })];
    const result = deriveUpcomingWeekEvents(events, holidays, NOW);
    expect(result.map(r => r.label)).toEqual(['Holiday X', 'Audit']);
    expect(result[0].kind).toBe('HOL');
    expect(result[1].kind).toBe('EVT');
  });

  it('excludes items more than 7 days out or in the past', () => {
    const events = [
      calEvent({ event_date: '2026-05-10' }), // past
      calEvent({ event_date: '2026-06-30' }), // too far
    ];
    expect(deriveUpcomingWeekEvents(events, [], NOW)).toEqual([]);
  });
});

describe('deriveOwnActionItems', () => {
  it('returns non-completed items assigned to the staff name, sorted by deadline', () => {
    const items = [
      action({ id: 'A1', assigned_to: 'Alice Researcher', deadline: '2026-05-25', status: 'Pending' }),
      action({ id: 'A2', assigned_to: 'Alice Researcher', deadline: '2026-05-22', status: 'InProgress' }),
      action({ id: 'A3', assigned_to: 'Alice Researcher', status: 'Completed' }), // done -> excluded
      action({ id: 'A4', assigned_to: 'Bob Other' }), // someone else
    ];
    const result = deriveOwnActionItems(items, 'Alice Researcher');
    expect(result.map(i => i.id)).toEqual(['A2', 'A1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dashboard/scientistData.test.ts`
Expected: FAIL — "Failed to resolve import './scientistData'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/dashboard/scientistData.ts
import type { Meeting, CommitteeMember, CalendarEvent, Holiday, ActionItem } from '../../types';
import { staffNameMatchesAuthor } from '../../utils/dateUtils';

/** Parse a YYYY-MM-DD string to a Date at UTC midnight. Returns null if invalid. */
function parseISODate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Future meetings for committees the staff belongs to, ascending by date. */
export function deriveOwnMeetings(
  meetings: Meeting[],
  members: CommitteeMember[],
  staffId: string,
  now: Date,
): Meeting[] {
  const myCommittees = new Set(
    members.filter(m => m.staff_id === staffId).map(m => m.committee_id),
  );
  return meetings
    .filter(m => myCommittees.has(m.committee_id))
    .filter(m => {
      const d = parseISODate(m.meeting_date);
      return d !== null && d.getTime() >= now.getTime();
    })
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date));
}

export interface WeekEvent {
  id: string;
  label: string;
  date: string;
  kind: 'HOL' | 'EVT';
}

/** Calendar events + holidays within the next 7 days, ascending by date. */
export function deriveUpcomingWeekEvents(
  events: CalendarEvent[],
  holidays: Holiday[],
  now: Date,
): WeekEvent[] {
  const start = now.getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  const inWindow = (iso: string): boolean => {
    const d = parseISODate(iso);
    return d !== null && d.getTime() >= start && d.getTime() <= end;
  };

  const hol: WeekEvent[] = holidays
    .filter(h => inWindow(h.holiday_date))
    .map(h => ({ id: h.id, label: h.name, date: h.holiday_date, kind: 'HOL' as const }));

  const evt: WeekEvent[] = events
    .filter(e => inWindow(e.event_date))
    .map(e => ({ id: e.id, label: e.title, date: e.event_date, kind: 'EVT' as const }));

  return [...hol, ...evt].sort((a, b) => a.date.localeCompare(b.date));
}

/** Non-completed action items assigned to this staff name, ascending by deadline. */
export function deriveOwnActionItems(items: ActionItem[], staffName: string): ActionItem[] {
  if (!staffName) return [];
  return items
    .filter(i => i.status !== 'Completed')
    .filter(i => staffNameMatchesAuthor(staffName, i.assigned_to))
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dashboard/scientistData.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/scientistData.ts src/lib/dashboard/scientistData.test.ts
git commit -m "feat: add scientist dashboard derive functions with tests"
```

---

## Task 2: Rewrite ScientistView with combined hub layout

**Files:**
- Modify: `src/pages/dashboards/ScientistView.tsx` (full rewrite)

- [ ] **Step 1: Replace the file contents**

```tsx
// src/pages/dashboards/ScientistView.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, BookOpen, FileText, CalendarDays, ClipboardList, Users, Lightbulb,
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { supabase } from '../../utils/supabaseClient';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import { EmptyState } from '../../components/ui/EmptyState';
import ScientistProfile from '../../components/ScientistProfile';
import {
  deriveOwnMeetings, deriveUpcomingWeekEvents, deriveOwnActionItems,
} from '../../lib/dashboard/scientistData';

export function ScientistView() {
  const {
    staff, projects, projectStaff, phDStudents,
    meetings, committeeMembers, actionItems, calendarEvents, holidays,
  } = useData();
  const { proposals } = useProposals();
  const { user } = useAuth();

  const ownStaff = staff.find(s => s.Email === user?.email);
  const ownName = ownStaff?.Name ?? '';
  const ownStaffId = ownStaff?.ID ?? '';

  // Co-PI proposal IDs — one scoped query keyed on this staff member.
  const [coPiProposalIds, setCoPiProposalIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    async function loadCoPI() {
      if (!supabase || !ownStaffId) { setCoPiProposalIds(new Set()); return; }
      const { data, error } = await supabase
        .from('proposal_copis')
        .select('proposal_id')
        .eq('staff_id', ownStaffId);
      if (error) { console.error('[scientist-dashboard] co-PI load failed', error); return; }
      if (!cancelled) setCoPiProposalIds(new Set((data ?? []).map(r => r.proposal_id as string)));
    }
    loadCoPI();
    return () => { cancelled = true; };
  }, [ownStaffId]);

  const now = useMemo(() => new Date(), []);

  const ownMeetings = useMemo(
    () => deriveOwnMeetings(meetings, committeeMembers, ownStaffId, now).slice(0, 5),
    [meetings, committeeMembers, ownStaffId, now],
  );
  const weekEvents = useMemo(
    () => deriveUpcomingWeekEvents(calendarEvents, holidays, now),
    [calendarEvents, holidays, now],
  );
  const ownActionItems = useMemo(
    () => deriveOwnActionItems(actionItems, ownName),
    [actionItems, ownName],
  );
  const ownProjectNos = useMemo(() => {
    const links = projectStaff.filter(ps => ps.StaffName === ownName);
    return new Set(links.map(ps => ps.ProjectNo));
  }, [projectStaff, ownName]);
  const ownProjects = useMemo(
    () => projects.filter(p => ownProjectNos.has(p.ProjectNo)),
    [projects, ownProjectNos],
  );
  const supervisedPhDs = useMemo(
    () => phDStudents.filter(p => p.SupervisorName === ownName),
    [phDStudents, ownName],
  );
  const ownProposals = useMemo(
    () => proposals.filter(p => p.piUserId === user?.id || coPiProposalIds.has(p.id)),
    [proposals, user?.id, coPiProposalIds],
  );

  if (!ownStaff) {
    return (
      <div className="space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif">
            Scientist Dashboard
          </h1>
        </div>
        <div className="bg-surface border border-border rounded-[12px] p-8 text-center">
          <p className="text-sm font-medium text-text-muted">
            Staff record not linked to this account — contact System Admin.
          </p>
          <p className="text-xs text-text-muted mt-2">
            Signed in as: <span className="font-mono">{user?.email ?? 'Unknown'}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif">
          My Research Portfolio
        </h1>
        <p className="text-text-muted mt-1 text-sm font-medium">
          {ownStaff.Name} — {ownStaff.Designation}, Division {ownStaff.Division}
        </p>
      </div>

      {/* --- 1. KPI strip --- */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Upcoming Meetings" value={ownMeetings.length} icon={<CalendarDays size={18} />} sublabel="Committees you sit on" />
        <KpiCard label="Open Action Items" value={ownActionItems.length} icon={<ClipboardList size={18} />} sublabel="Assigned to you" />
        <KpiCard label="Events This Week" value={weekEvents.length} icon={<CalendarDays size={18} />} sublabel="Next 7 days" />
      </div>

      {/* --- 2. Operations row --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Meetings */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">Upcoming Meetings</h2>
          </div>
          <div className="p-4 space-y-3">
            {ownMeetings.map(m => (
              <div key={m.id} className="border-l-2 border-terracotta pl-3">
                <div className="text-sm font-semibold text-text">{m.title}</div>
                <div className="text-xs text-text-muted">{m.meeting_date}{m.venue ? ` · ${m.venue}` : ''}</div>
              </div>
            ))}
            {ownMeetings.length === 0 && (
              <p className="text-xs text-text-muted italic py-4 text-center">No upcoming meetings.</p>
            )}
          </div>
        </Card>

        {/* This Week */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">This Week</h2>
          </div>
          <div className="p-4 space-y-3">
            {weekEvents.map(e => (
              <div key={`${e.kind}-${e.id}`} className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  e.kind === 'HOL' ? 'bg-[#f0f8f0] text-[#3a7a3a]' : 'bg-[#fdf0e8] text-terracotta'
                }`}>{e.kind}</span>
                <span className="text-sm text-text">{e.label}</span>
                <span className="text-xs text-text-muted ml-auto">{e.date}</span>
              </div>
            ))}
            {weekEvents.length === 0 && (
              <p className="text-xs text-text-muted italic py-4 text-center">Nothing scheduled this week.</p>
            )}
          </div>
        </Card>
      </div>

      {/* --- 3. Action Items (full width) --- */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">My Action Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-hover">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Task</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Deadline</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ownActionItems.slice(0, 10).map(a => (
                <tr key={a.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-6 py-3 text-text font-medium">{a.task}</td>
                  <td className="px-6 py-3 text-text-muted text-xs">{a.deadline || '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      a.status === 'InProgress' ? 'bg-[#fdf0e8] text-terracotta' : 'bg-surface-hover text-text-muted'
                    }`}>{a.status}</span>
                  </td>
                </tr>
              ))}
              {ownActionItems.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-6 text-center text-text-muted text-xs italic">No open action items.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* --- 4. Research portfolio grid --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Projects */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Briefcase size={16} className="text-terracotta" />
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">My Projects</h2>
          </div>
          <div className="p-4 space-y-3">
            {ownProjects.map(p => (
              <div key={p.ProjectID} className="border-b border-border last:border-0 pb-2 last:pb-0">
                <div className="text-sm font-medium text-text">{p.ProjectName}</div>
                <div className="text-xs text-text-muted">
                  {[p.ProjectStatus, p.SponsorerName, p.CompletioDate].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
            {ownProjects.length === 0 && (
              <p className="text-xs text-text-muted italic py-4 text-center">No project involvement found.</p>
            )}
          </div>
        </Card>

        {/* PhD Supervisees */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <BookOpen size={16} className="text-terracotta" />
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">PhD Supervisees</h2>
          </div>
          <div className="p-4 space-y-3">
            {supervisedPhDs.map(p => (
              <div key={p.EnrollmentNo} className="border-b border-border last:border-0 pb-2 last:pb-0">
                <div className="text-sm font-medium text-text">{p.StudentName}</div>
                <div className="text-xs text-text-muted">
                  {[p.Specialization, p.CurrentStatus].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
            {supervisedPhDs.length === 0 && (
              <p className="text-xs text-text-muted italic py-4 text-center">No PhD supervisees found.</p>
            )}
          </div>
        </Card>

        {/* Proposals */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Lightbulb size={16} className="text-terracotta" />
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">My Proposals</h2>
          </div>
          <div className="p-4 space-y-3">
            {ownProposals.map(p => (
              <Link key={p.id} to={`/proposals/${p.id}`} className="block border-b border-border last:border-0 pb-2 last:pb-0 hover:bg-surface-hover -mx-2 px-2 rounded transition-colors">
                <div className="text-sm font-medium text-text">{p.title}</div>
                <div className="text-xs text-text-muted">
                  {p.status} · {p.piUserId === user?.id ? 'PI' : 'Co-PI'}
                </div>
              </Link>
            ))}
            {ownProposals.length === 0 && (
              <p className="text-xs text-text-muted italic py-4 text-center">No proposals found.</p>
            )}
          </div>
        </Card>
      </div>

      {/* --- 5. IRINS Research Profile --- */}
      {ownStaff.VidwanID && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={20} className="text-terracotta" />
            <h2 className="text-lg font-[500] text-text font-serif">Research Output (via IRINS)</h2>
          </div>
          <ScientistProfile vidwanId={ownStaff.VidwanID} />
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `Users` import is unused, remove it — `noUnusedLocals` will flag it. Verify the import list matches icons actually used: `Briefcase, BookOpen, FileText, CalendarDays, ClipboardList, Lightbulb`. Remove `Users`.)

- [ ] **Step 3: Fix unused import**

Remove `Users,` from the lucide-react import line (it is not used in the JSX). Re-run `npx tsc --noEmit` — expect clean.

- [ ] **Step 4: Lint**

Run: `npx eslint src/pages/dashboards/ScientistView.tsx`
Expected: no errors.

- [ ] **Step 5: Run full test suite (no regressions)**

Run: `npx vitest run`
Expected: all existing tests + Task 1 tests pass.

- [ ] **Step 6: Manual smoke check**

Run: `npm run dev`. Log in as a scientist account. Confirm: KPI strip shows 3 counts, ops row + action items render, research grid shows projects/PhD/proposals, no console errors. If account has no linked staff record, the "not linked" fallback shows — expected.

- [ ] **Step 7: Commit**

```bash
git add src/pages/dashboards/ScientistView.tsx
git commit -m "feat: rebuild scientist dashboard as combined operations + research hub"
```

---

## Task 3: Dev role access migration

**Files:**
- Create: `supabase/migrations/20260521120000_dev_all_roles.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260521120000_dev_all_roles.sql
-- Grants all application roles to vivek.khare@csir.res.in for development
-- role-switching. Idempotent: safe to re-run. Resolves auth UUID by email.

DO $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_roles text[] := ARRAY[
    'Director', 'DivisionHead', 'HOD', 'Scientist', 'Technician',
    'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin', 'Student',
    'ProjectStaff', 'Guest', 'DefaultUser', 'EmpoweredCommittee'
  ];
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'vivek.khare@csir.res.in';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User vivek.khare@csir.res.in not found in auth.users — skipping role grant.';
    RETURN;
  END IF;

  FOREACH v_role IN ARRAY v_roles LOOP
    INSERT INTO public.user_roles (user_id, role, division_code)
    VALUES (v_user_id, v_role, NULL)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  -- Ensure a profile row exists with a sensible active role for dev.
  UPDATE public.user_profiles SET active_role = 'SystemAdmin' WHERE user_id = v_user_id;

  RAISE NOTICE 'Granted % roles to vivek.khare@csir.res.in', array_length(v_roles, 1);
END $$;
```

- [ ] **Step 2: Verify role-name validity against the schema**

Confirm `user_roles.role` accepts these exact strings. Check `supabase/migrations/00000000000000_init.sql` for the `role` column definition (enum or text + CHECK). If it is a Postgres enum, the strings above must match the enum labels exactly. Read the init file:

Run: search `00000000000000_init.sql` for `user_roles` and `CREATE TYPE` / `role`. Adjust any mismatched label (e.g. casing) to match the schema before applying.

- [ ] **Step 3: Verify `user_profiles` column name**

Confirm the profile table is `public.user_profiles` with column `active_role` and key `user_id` (per CLAUDE.md). If the PK/lookup column differs, fix the `UPDATE` accordingly.

- [ ] **Step 4: Apply the migration**

Apply via the Supabase SQL Editor as the `postgres` role (bypasses RLS), or `supabase db push` if the CLI is linked. Paste the migration body. Expect the NOTICE: "Granted 14 roles to vivek.khare@csir.res.in".

- [ ] **Step 5: Verify in DB**

Run in SQL Editor:
```sql
SELECT role FROM public.user_roles
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'vivek.khare@csir.res.in')
ORDER BY role;
```
Expected: 14 rows.

- [ ] **Step 6: Verify in app**

Log in as `vivek.khare@csir.res.in`. Confirm the role-switcher dropdown appears in the header (top-right, next to profile) and lists all 14 roles. Switch to a few roles and confirm each routes to its dashboard via `ROLE_ROUTES`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260521120000_dev_all_roles.sql
git commit -m "feat: grant all roles to dev user for role-switching"
```

---

## Self-Review Notes

- **Spec coverage:** Meetings (Task 2 §2), This-week events (§2), Action items (§3), Projects+sponsor+completion (§4), PhD+specialization (§4), Proposals PI/Co-PI (§4 + co-PI query), dev role access (Task 3). All covered.
- **Removed from old view:** Publications KPI + Instruments KPI/table dropped per widget selection. Instruments remain reachable via Facilities nav. IRINS profile retained.
- **Type consistency:** `deriveOwnMeetings/deriveUpcomingWeekEvents/deriveOwnActionItems` signatures identical between Task 1 def and Task 2 calls. `WeekEvent.kind` is `'HOL' | 'EVT'`. `ActionItem.status` uses `Completed/InProgress/Pending` (not `Done`). `Meeting` uses `title`/`venue`/`meeting_date`. `Proposal` uses `piUserId`/`status`/`title`.
- **Risk:** `proposals` list from context does not eager-load `coPIs`; co-PI matching relies on the scoped `proposal_copis` query in Task 2 Step 1 — verified `proposal_copis.staff_id` exists (see `ProposalsContext.getProposal`).

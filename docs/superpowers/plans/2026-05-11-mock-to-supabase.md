# Mock → Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every demo dataset out of `mockData.ts` / `pmsMockData.ts` into Supabase via `seed.sql`, then delete the mock fallback path entirely. Replace it with role-aware `EmptyState` UI on each list page.

**Architecture:** Two-wave delivery. Wave 1 (PR-B1) is purely additive — a throwaway TS generator emits SQL `INSERT` blocks for the seven entity groups missing from the current seed, the blocks are reviewed manually and appended to `supabase/seed.sql`. Wave 2 (PR-B2) removes the `useMock` branch in `DataContext`, deletes the mock files, and renders an `EmptyState` whenever a query returns zero rows.

**Tech Stack:** TypeScript 5.9, Vite 8, React 19, Supabase JS client, PostgreSQL, Vitest, Tailwind CSS 4, `clsx`, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-05-11-mock-to-supabase-design.md`

---

## File Structure

| Path | Wave | Responsibility |
|------|------|----------------|
| `scripts/generate-seed.ts` | B1 | Throwaway Node script — reads `mockData.ts` + `pmsMockData.ts` and prints SQL `INSERT` blocks to stdout. Run once. |
| `supabase/seed.sql` | B1 | Existing file — append generated blocks under a `DEMO SEED (generated)` divider in dependency order. |
| `src/components/ui/EmptyState.tsx` | B2 | New shared primitive. One responsibility: render an empty-state card with optional role-gated CTA. |
| `src/components/ui/EmptyState.test.tsx` | B2 | Vitest unit tests for `EmptyState`. |
| `src/contexts/DataContext.tsx` | B2 | Modify — remove `useMock` branch, drop mock imports, keep error path unchanged. |
| `src/pages/HumanCapital.tsx` | B2 | Modify — render `EmptyState` when `staff.length === 0 && !isLoading`. |
| `src/pages/Projects.tsx` | B2 | Modify — empty state for `projects`. |
| `src/pages/PhDTracker.tsx` | B2 | Modify — empty state for `phDStudents`. |
| `src/pages/Divisions.tsx` | B2 | Modify — empty state for `divisions`. |
| `src/pages/Facilities.tsx` | B2 | Modify — empty state for `equipment`. |
| `src/pages/Intelligence.tsx` | B2 | Modify — per-chart empty cards for `scientificOutputs` and `ipIntelligence`. |
| `src/pages/Calendar.tsx` | B2 | Modify — empty state for combined `meetings + actionItems`. |
| `src/pages/Recruitment.tsx` | B2 | Modify — empty state for `vacancyAdvertisements`. |
| `src/utils/mockData.ts` | B2 | DELETE. |
| `src/utils/pmsMockData.ts` | B2 | DELETE iff zero remaining references after PMS pages are checked. |

---

## Wave 1 — PR-B1: Seed expansion

Wave 1 ships a single PR. No app code changes. Mock fallback still works after this PR.

### Task 1: Scaffold the seed generator

**Files:**
- Create: `scripts/generate-seed.ts`

- [ ] **Step 1: Create the script with serialization helpers**

```typescript
// scripts/generate-seed.ts
//
// Throwaway script — emits the SQL block that is appended to
// supabase/seed.sql. Run once with: npx tsx scripts/generate-seed.ts > /tmp/seed-block.sql
// Review the output, then paste under the "DEMO SEED (generated)" divider in
// supabase/seed.sql. Delete this script after merge (or keep + add an npm
// script — see Task 4).

import {
  mockCommittees, mockCommitteeMembers, mockMeetings, mockAgendaItems,
  mockActionItems, mockMeetingDocuments,
  mockTickets, mockTicketResponses, mockTicketEvents,
  mockVacancyAdvertisements, mockVacancyPosts,
} from '../src/utils/mockData';

// --- SQL value serialization ---------------------------------------------

function sqlVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (Array.isArray(v)) {
    // PostgreSQL ARRAY[...] literal of strings/numbers.
    const items = v.map(x => (typeof x === 'number' ? String(x) : `'${String(x).replace(/'/g, "''")}'`));
    return `ARRAY[${items.join(', ')}]`;
  }
  if (typeof v === 'object') {
    // JSONB column — emit as quoted JSON string.
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insertBlock<T extends Record<string, unknown>>(
  table: string,
  columns: string[],
  rows: T[],
  options: { quoteIdent?: boolean; onConflict?: string } = {}
): string {
  if (rows.length === 0) return `-- ${table}: no rows\n`;
  const quoted = options.quoteIdent ? columns.map(c => `"${c}"`) : columns;
  const values = rows.map(r => `    (${columns.map(c => sqlVal(r[c])).join(', ')})`).join(',\n');
  const conflict = options.onConflict ? `\n${options.onConflict}` : '';
  return `\n-- ${table}\nINSERT INTO public.${table}\n    (${quoted.join(', ')})\nVALUES\n${values}${conflict};\n`;
}

// --- Emit each block in dependency order ---------------------------------

const out: string[] = [];

out.push('-- ============================================================');
out.push('-- DEMO SEED (generated by scripts/generate-seed.ts)');
out.push('-- Generated on first run; review then commit. Do not hand-edit.');
out.push('-- ============================================================');

out.push(insertBlock('committees',
  ['id', 'name', 'committee_type', 'mandate', 'chairperson_id', 'secretary_id', 'status', 'formed_date', 'created_at'],
  mockCommittees,
  { onConflict: 'ON CONFLICT (id) DO NOTHING' }
));

out.push(insertBlock('committee_members',
  ['id', 'committee_id', 'staff_id', 'role'],
  mockCommitteeMembers,
  { onConflict: 'ON CONFLICT (id) DO NOTHING' }
));

out.push(insertBlock('meetings',
  ['id', 'committee_id', 'meeting_date', 'venue', 'title', 'summary', 'status', 'created_at'],
  mockMeetings,
  { onConflict: 'ON CONFLICT (id) DO NOTHING' }
));

out.push(insertBlock('agenda_items',
  ['id', 'meeting_id', 'sequence', 'title', 'description', 'decision'],
  mockAgendaItems,
  { onConflict: 'ON CONFLICT (id) DO NOTHING' }
));

out.push(insertBlock('action_items',
  ['id', 'meeting_id', 'description', 'owner_id', 'due_date', 'status', 'created_at'],
  mockActionItems,
  { onConflict: 'ON CONFLICT (id) DO NOTHING' }
));

out.push(insertBlock('meeting_documents',
  ['id', 'meeting_id', 'file_name', 'file_path', 'uploaded_by', 'uploaded_at'],
  mockMeetingDocuments,
  { onConflict: 'ON CONFLICT (id) DO NOTHING' }
));

out.push(insertBlock('tickets',
  ['id', 'token', 'subject', 'category', 'urgency', 'description', 'submitted_by', 'assigned_to', 'status', 'created_at', 'updated_at', 'resolved_at'],
  mockTickets,
  { onConflict: 'ON CONFLICT (id) DO NOTHING' }
));

out.push(insertBlock('ticket_responses',
  ['id', 'ticket_id', 'author_id', 'message', 'created_at'],
  mockTicketResponses,
  { onConflict: 'ON CONFLICT (id) DO NOTHING' }
));

out.push(insertBlock('ticket_events',
  ['id', 'ticket_id', 'event_type', 'actor_id', 'details', 'created_at'],
  mockTicketEvents,
  { onConflict: 'ON CONFLICT (id) DO NOTHING' }
));

// Recruitment uses camelCase columns — verify against init.sql before running.
out.push(insertBlock('vacancy_advertisements',
  ['id', 'title', 'description', 'designation', 'division', 'numberOfPositions', 'qualifications', 'salary', 'applicationDeadline', 'createdAt', 'status'],
  mockVacancyAdvertisements,
  { quoteIdent: true, onConflict: 'ON CONFLICT (id) DO NOTHING' }
));

out.push(insertBlock('vacancy_posts',
  ['id', 'vacancyId', 'candidateName', 'email', 'phoneNumber', 'qualifications', 'experience', 'applicationDate', 'status', 'notes'],
  mockVacancyPosts,
  { quoteIdent: true, onConflict: 'ON CONFLICT (id) DO NOTHING' }
));

console.log(out.join('\n'));
```

- [ ] **Step 2: Commit the generator scaffold**

```bash
git add scripts/generate-seed.ts
git commit -m "feat(seed): scaffold throwaway generator for mock -> seed.sql"
```

### Task 2: Verify column names against the live schema

The generator's column lists must match `supabase/migrations/*.sql` exactly. Mismatched names will fail at `psql` time.

**Files:**
- Read-only check against: `supabase/migrations/00000000000000_init.sql`, `supabase/migrations/20260507000000_committees_helpdesk.sql`, `supabase/migrations/20260511000000_helpdesk_hr_privacy.sql`

- [ ] **Step 1: For each table in the generator, open the matching migration and confirm column names**

Run:

```powershell
grep -n "CREATE TABLE public.committees\|CREATE TABLE public.committee_members\|CREATE TABLE public.meetings\|CREATE TABLE public.agenda_items\|CREATE TABLE public.action_items\|CREATE TABLE public.meeting_documents\|CREATE TABLE public.tickets\|CREATE TABLE public.ticket_responses\|CREATE TABLE public.ticket_events\|CREATE TABLE public.vacancy_advertisements\|CREATE TABLE public.vacancy_posts" supabase/migrations/*.sql
```

For each `CREATE TABLE` hit, open the migration file and compare its column list against the corresponding `insertBlock(...)` columns array in `generate-seed.ts`. Fix any mismatch (drop columns not present in schema; add NULLs for required columns mock data lacks).

- [ ] **Step 2: Specifically verify the `vacancy_*` quoting choice**

Recruitment tables may use snake_case OR camelCase. Open `supabase/migrations/00000000000000_init.sql` and search for `CREATE TABLE public.vacancy`. Note the exact column quoting. If columns are snake_case (`number_of_positions`, etc.), set `quoteIdent: false` and rename keys via a mapping object in the generator. If columns are camelCase (`"numberOfPositions"`), leave `quoteIdent: true`.

- [ ] **Step 3: Commit any generator fixes**

```bash
git add scripts/generate-seed.ts
git commit -m "fix(seed): align generator columns with live schema"
```

### Task 3: Run the generator and append output to seed.sql

**Files:**
- Modify: `supabase/seed.sql` (append only)

- [ ] **Step 1: Run the generator and capture output**

```powershell
npx tsx scripts/generate-seed.ts > tmp-seed-block.sql
```

Expected: `tmp-seed-block.sql` contains 11 `INSERT INTO public.<table>` blocks plus the `DEMO SEED` banner.

- [ ] **Step 2: Sanity check the output**

Run:

```powershell
Get-Content tmp-seed-block.sql | Select-String -Pattern "^INSERT INTO" | Measure-Object
```

Expected: count `>= 9` (committees, committee_members, meetings, action_items, meeting_documents, tickets, ticket_responses, ticket_events, vacancy_advertisements, vacancy_posts; agenda_items may be 0 if `mockAgendaItems` is empty). If lower, re-check Task 2.

- [ ] **Step 3: Append to `supabase/seed.sql`**

Open `supabase/seed.sql`. Find the line `-- END OF SEED DATA` near the bottom. Insert the contents of `tmp-seed-block.sql` *before* that line. Save.

- [ ] **Step 4: Delete the temp file**

```powershell
Remove-Item tmp-seed-block.sql
```

### Task 4: Verify the seed loads cleanly

**Files:**
- Read-only check.

- [ ] **Step 1: Reset the local Supabase database and load the seed**

Requires Supabase CLI configured for the project. From repo root:

```powershell
supabase db reset
```

The `db reset` command auto-runs `seed.sql`. Expected: zero errors. Common failure modes:
- `null value in column "X" violates not-null constraint` → that column is required by schema but mock data has NULL. Either add a default in the generator or backfill in mock.
- `insert or update on table "X" violates foreign key constraint` → a referenced ID (staff/division/etc.) doesn't exist. Verify the existing seed.sql earlier blocks include all referenced IDs.

- [ ] **Step 2: Count rows per table**

```powershell
supabase db execute "SELECT 'committees' AS t, COUNT(*) FROM public.committees UNION ALL SELECT 'meetings', COUNT(*) FROM public.meetings UNION ALL SELECT 'tickets', COUNT(*) FROM public.tickets UNION ALL SELECT 'vacancy_advertisements', COUNT(*) FROM public.vacancy_advertisements;"
```

Expected: `committees=5, meetings≈12, tickets=20, vacancy_advertisements=5`. Adjust mock count expectations to whatever the source file actually contains (verify by reading `mockData.ts`).

- [ ] **Step 3: Decide on generator retention**

The spec defaulted to "delete after first run." Take one of two paths:

**Path A — delete (spec default):**
```bash
git rm scripts/generate-seed.ts
```

**Path B — retain:**
Add to `package.json` under `scripts`:
```json
"seed:generate": "tsx scripts/generate-seed.ts"
```

Pick Path A unless the team later asks for it. Document the choice in the commit message.

- [ ] **Step 4: Commit PR-B1**

```bash
git add supabase/seed.sql
git add scripts/generate-seed.ts  # or git rm, per Path A vs B
git add package.json  # only if Path B
git commit -m "feat(seed): expand seed.sql with committees, meetings, tickets, vacancies

Adds INSERT blocks for committees, committee_members, meetings, agenda_items,
action_items, meeting_documents, tickets, ticket_responses, ticket_events,
vacancy_advertisements, and vacancy_posts derived from src/utils/mockData.ts.

Part 1 of sub-project B (mock -> Supabase). No app code touched in this PR;
mock fallback in DataContext still works.

Spec: docs/superpowers/specs/2026-05-11-mock-to-supabase-design.md
Plan: docs/superpowers/plans/2026-05-11-mock-to-supabase.md"
```

---

## Wave 2 — PR-B2: Kill mock fallback + empty-state UI

PR-B2 starts after PR-B1 merges. Wave 2 IS a behavior change.

### Task 5: Build the `EmptyState` primitive (TDD)

**Files:**
- Create: `src/components/ui/EmptyState.tsx`
- Test: `src/components/ui/EmptyState.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/EmptyState.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <MemoryRouter>
        <EmptyState title="No staff records" description="Upload via Data Management." />
      </MemoryRouter>
    );
    expect(screen.getByText('No staff records')).toBeInTheDocument();
    expect(screen.getByText('Upload via Data Management.')).toBeInTheDocument();
  });

  it('renders the CTA link when action is provided', () => {
    render(
      <MemoryRouter>
        <EmptyState title="No staff" action={{ label: 'Upload data', to: '/data' }} />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: 'Upload data' });
    expect(link).toHaveAttribute('href', '/data');
  });

  it('omits CTA when action is undefined', () => {
    render(
      <MemoryRouter>
        <EmptyState title="No data" />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders the icon when provided', () => {
    render(
      <MemoryRouter>
        <EmptyState title="No data" icon={Inbox} />
      </MemoryRouter>
    );
    expect(document.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```powershell
npx vitest run src/components/ui/EmptyState.test.tsx
```

Expected: `FAIL` with `Cannot find module './EmptyState'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/ui/EmptyState.tsx
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; to: string };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        'rounded-[12px] border border-dashed border-border bg-surface',
        'px-6 py-12 gap-3',
        className
      )}
    >
      {Icon ? <Icon className="w-10 h-10 text-text-muted" aria-hidden="true" /> : null}
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description ? <p className="text-sm text-text-muted max-w-md">{description}</p> : null}
      {action ? (
        <Link
          to={action.to}
          className="mt-2 inline-flex items-center rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the test — expect pass**

```powershell
npx vitest run src/components/ui/EmptyState.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/EmptyState.tsx src/components/ui/EmptyState.test.tsx
git commit -m "feat(ui): add EmptyState primitive for zero-row list pages"
```

### Task 6: Wire `EmptyState` into HumanCapital, Projects, PhDTracker

Three similar pages. One commit per page keeps reviews small.

**Files:**
- Modify: `src/pages/HumanCapital.tsx`, `src/pages/Projects.tsx`, `src/pages/PhDTracker.tsx`

- [ ] **Step 1: HumanCapital — add empty-state branch**

Find the section that renders the main staff list/table. Just before that JSX, add (placement near the top of the rendered body, after the page header):

```tsx
import { Users } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../contexts/AuthContext';
// ... existing imports

// inside the component, after `const { staff, isLoading } = useData();`
const { hasPermission } = useAuth();
const canUpload = hasPermission(['HRAdmin', 'SystemAdmin', 'MasterAdmin']);

// where the staff list is currently rendered, wrap in:
{!isLoading && staff.length === 0 ? (
  <EmptyState
    icon={Users}
    title="No staff records"
    description="Staff data hasn't been loaded yet."
    action={canUpload ? { label: 'Upload via Data Management', to: '/data' } : undefined}
  />
) : (
  /* existing list/table JSX */
)}
```

Use the existing `useAuth()` hook (it's already imported by other pages — confirm or add the import).

- [ ] **Step 2: Projects — same pattern**

```tsx
import { Briefcase } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../contexts/AuthContext';

// ...
const { projects, isLoading } = useData();
const { hasPermission } = useAuth();
const canUpload = hasPermission(['HRAdmin', 'SystemAdmin', 'MasterAdmin']);

{!isLoading && projects.length === 0 ? (
  <EmptyState
    icon={Briefcase}
    title="No projects"
    description="Project data hasn't been loaded yet."
    action={canUpload ? { label: 'Upload via Data Management', to: '/data' } : undefined}
  />
) : (
  /* existing JSX */
)}
```

- [ ] **Step 3: PhDTracker — same pattern**

```tsx
import { GraduationCap } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../contexts/AuthContext';

// ...
const { phDStudents, isLoading } = useData();
const { hasPermission } = useAuth();
const canUpload = hasPermission(['HRAdmin', 'SystemAdmin', 'MasterAdmin']);

{!isLoading && phDStudents.length === 0 ? (
  <EmptyState
    icon={GraduationCap}
    title="No PhD students"
    description="Student records haven't been loaded yet."
    action={canUpload ? { label: 'Upload via Data Management', to: '/data' } : undefined}
  />
) : (
  /* existing JSX */
)}
```

- [ ] **Step 4: Run lint + vitest**

```powershell
npm run lint
npx vitest run
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/HumanCapital.tsx src/pages/Projects.tsx src/pages/PhDTracker.tsx
git commit -m "feat(pages): empty states for staff, projects, PhD students"
```

### Task 7: Wire `EmptyState` into Divisions, Facilities, Calendar, Recruitment, Intelligence

Same pattern, role-gated CTAs differ per page.

**Files:**
- Modify: `src/pages/Divisions.tsx`, `src/pages/Facilities.tsx`, `src/pages/Calendar.tsx`, `src/pages/Recruitment.tsx`, `src/pages/Intelligence.tsx`

- [ ] **Step 1: Divisions — no upload CTA (managed by admin SQL)**

```tsx
import { Building2 } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

{!isLoading && divisions.length === 0 ? (
  <EmptyState
    icon={Building2}
    title="No divisions configured"
    description="Contact your administrator to configure institute divisions."
  />
) : (
  /* existing JSX */
)}
```

- [ ] **Step 2: Facilities — upload CTA for HRAdmin+**

```tsx
import { Wrench } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../contexts/AuthContext';

const { hasPermission } = useAuth();
const canUpload = hasPermission(['HRAdmin', 'SystemAdmin', 'MasterAdmin']);

{!isLoading && equipment.length === 0 ? (
  <EmptyState
    icon={Wrench}
    title="No equipment registered"
    description="Equipment records haven't been loaded yet."
    action={canUpload ? { label: 'Upload via Data Management', to: '/data' } : undefined}
  />
) : (
  /* existing JSX */
)}
```

- [ ] **Step 3: Calendar — links to Committees**

```tsx
import { CalendarDays } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

const isEmpty = meetings.length === 0 && actionItems.length === 0;

{!isLoading && isEmpty ? (
  <EmptyState
    icon={CalendarDays}
    title="No meetings or action items"
    description="Create a meeting or action item from the Committees workspace."
  />
) : (
  /* existing JSX */
)}
```

(If Committees page exists, the `to` would be `/committees`. Verify in `Layout.tsx` `NAV_ITEMS`. If absent, omit the `action` prop.)

- [ ] **Step 4: Recruitment — upload CTA for HRAdmin+**

```tsx
import { Megaphone } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../contexts/AuthContext';

const { hasPermission } = useAuth();
const canManage = hasPermission(['HRAdmin', 'SystemAdmin', 'MasterAdmin']);

{!isLoading && vacancyAdvertisements.length === 0 ? (
  <EmptyState
    icon={Megaphone}
    title="No active vacancies"
    description={canManage ? 'Create a vacancy advertisement to start recruiting.' : 'There are no open positions at this time.'}
    action={canManage ? { label: 'Upload via Data Management', to: '/data' } : undefined}
  />
) : (
  /* existing JSX */
)}
```

- [ ] **Step 5: Intelligence — per-chart empty cards**

Intelligence renders multiple charts. Each chart that consumes `scientificOutputs` or `ipIntelligence` should render an `EmptyState` (with `className="h-64"` to keep grid height stable) when its data array is empty.

```tsx
import { BarChart3 } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

// Replace the chart body conditionally:
{scientificOutputs.length === 0 ? (
  <EmptyState
    icon={BarChart3}
    title="No publications"
    description="Scientific output data hasn't been loaded yet."
    className="h-64"
  />
) : (
  /* existing chart JSX */
)}
```

Repeat for IP intelligence chart, replacing icon/title.

- [ ] **Step 6: Run lint + vitest + dev preview**

```powershell
npm run lint
npx vitest run
npm run build
```

Expected: all green. Open the dev server (`npm run dev`) and clear Supabase data manually (`TRUNCATE public.staff CASCADE;` etc.) for one entity at a time to spot-check the empty-state UI renders correctly. Restore data via `supabase db reset`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Divisions.tsx src/pages/Facilities.tsx src/pages/Calendar.tsx src/pages/Recruitment.tsx src/pages/Intelligence.tsx
git commit -m "feat(pages): empty states for divisions, facilities, calendar, recruitment, intelligence"
```

### Task 8: Remove the mock branch from `DataContext`

**Files:**
- Modify: `src/contexts/DataContext.tsx`

- [ ] **Step 1: Drop mock imports**

In `src/contexts/DataContext.tsx`, delete lines 47-67 (the entire `import { mockDivisions, mockStaff, ... } from '../utils/mockData';` block).

- [ ] **Step 2: Replace the mock-or-Supabase fork with Supabase-only**

Find the `loadData` function body, currently around lines 160-247. Replace the body with:

```typescript
const loadData = async () => {
  setIsLoading(true);
  setError(null);
  try {
    if (!provisioned || !supabase) {
      // Backend not configured — render empty everywhere; pages will show EmptyState.
      setError('Backend not configured. Go to Setup.');
      setDivisions([]);
      setStaff([]);
      setProjects([]);
      setProjectStaff([]);
      setPhDStudents([]);
      setContractStaff([]);
      setEquipment([]);
      setLabs([]);
      setScientificOutputs([]);
      setIPIntelligence([]);
      setVacancyAdvertisements([]);
      setVacancyPosts([]);
      setCommittees([]);
      setMeetings([]);
      setActionItems([]);
      setMeetingDocs([]);
      setTickets([]);
      setTicketResponses([]);
      setTicketEvents([]);
      return;
    }

    const [
      divRes, staffRes, projRes, psRes, phdRes, equipRes, labsRes, soRes, ipRes, csRes,
      vaRes, vpRes,
      cmtRes, cmmRes, mtgRes, agiRes, actRes, mdcRes, tktRes, trsRes, tevRes,
    ] = await Promise.all([
      supabase.from('divisions').select('*'),
      supabase.from('staff').select('*'),
      supabase.from('projects').select('*'),
      supabase.from('project_staff').select('*'),
      supabase.from('phd_students').select('*'),
      supabase.from('equipment').select('*'),
      supabase.from('labs').select('*'),
      supabase.from('scientific_outputs').select('*'),
      supabase.from('ip_intelligence').select('*'),
      supabase.from('contract_staff').select('*'),
      supabase.from('vacancy_advertisements').select('*').order('created_at', { ascending: false }),
      supabase.from('vacancy_posts').select('*'),
      supabase.from('committees').select('*'),
      supabase.from('committee_members').select('*'),
      supabase.from('meetings').select('*'),
      supabase.from('agenda_items').select('*'),
      supabase.from('action_items').select('*'),
      supabase.from('meeting_documents').select('*'),
      supabase.from('tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('ticket_responses').select('*'),
      supabase.from('ticket_events').select('*'),
    ]);

    void cmmRes;
    void agiRes;

    const rawStaff = staffRes.data ? staffRes.data.map(mapStaffRow) : [];
    const rawProjects = projRes.data ? projRes.data.map(mapProjectRow) : [];
    const rawEquipment = equipRes.data ? equipRes.data.map(mapEquipmentRow) : [];

    setDivisions(divRes.data ? divRes.data.map(mapDivisionRow) : []);
    setStaff(scopeData(rawStaff, role, divisionCode));
    setProjects(scopeProjects(rawProjects, role, divisionCode));
    setProjectStaff(psRes.data ? psRes.data.map(mapProjectStaffRow) : []);
    setPhDStudents(phdRes.data ? phdRes.data.map(mapPhDStudentRow) : []);
    setContractStaff(csRes.data ? csRes.data.map(mapContractStaffRow) : []);
    setEquipment(scopeData(rawEquipment, role, divisionCode));
    setLabs(labsRes.data ? labsRes.data.map(mapLabRow) : []);
    setScientificOutputs(soRes.data ? soRes.data.map(mapScientificOutputRow) : []);
    setIPIntelligence(ipRes.data ? ipRes.data.map(mapIPIntelligenceRow) : []);
    setVacancyAdvertisements(vaRes.data ? vaRes.data.map(mapVacancyAdvertisementRow) : []);
    setVacancyPosts(vpRes.data ? vpRes.data.map(mapVacancyPostRow) : []);
    setCommittees(cmtRes.data ? cmtRes.data.map(mapCommitteeRow) : []);
    setMeetings(mtgRes.data ? mtgRes.data.map(mapMeetingRow) : []);
    setActionItems(actRes.data ? actRes.data.map(mapActionItemRow) : []);
    setMeetingDocs(mdcRes.data ? mdcRes.data.map(mapMeetingDocumentRow) : []);
    setTickets(tktRes.data ? tktRes.data.map(mapTicketRow) : []);
    setTicketResponses(trsRes.data ? trsRes.data.map(mapTicketResponseRow) : []);
    setTicketEvents(tevRes.data ? tevRes.data.map(mapTicketEventRow) : []);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load data';
    setError(message);
    logger.error('data_load_failed', err, { role, divisionCode });
    setDivisions([]);
    setStaff([]);
    setProjects([]);
    setProjectStaff([]);
    setPhDStudents([]);
    setContractStaff([]);
    setEquipment([]);
    setLabs([]);
    setScientificOutputs([]);
    setIPIntelligence([]);
    setVacancyAdvertisements([]);
    setVacancyPosts([]);
    setCommittees([]);
    setMeetings([]);
    setActionItems([]);
    setMeetingDocs([]);
    setTickets([]);
    setTicketResponses([]);
    setTicketEvents([]);
  } finally {
    setIsLoading(false);
  }
};
```

This removes the `useMock` boolean, the `dev-admin` data bypass, and the entire `else` mock branch. Auth dev-admin bypass elsewhere is untouched.

- [ ] **Step 2.1: Drop the now-unused `user` destructure if no longer used**

The `useAuth()` call retrieved `user`. After removing the `useMock` check, `user` may be unused. Lint will flag it. Drop it from the destructure: `const { role, divisionCode } = useAuth();`.

- [ ] **Step 3: Run lint, vitest, build**

```powershell
npm run lint
npx vitest run
npm run build
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/DataContext.tsx
git commit -m "refactor(data): remove mock fallback branch from DataContext

Mock fallback path deleted. When backend is not provisioned or Supabase
errors, every entity collection resolves to []. Pages render EmptyState.
The dev-admin auth bypass remains; only the data bypass is removed."
```

### Task 9: Delete `mockData.ts` and `pmsMockData.ts`

**Files:**
- Delete: `src/utils/mockData.ts`
- Delete (conditional): `src/utils/pmsMockData.ts`

- [ ] **Step 1: Find every remaining importer**

```powershell
grep -rn "from '.*utils/mockData'" src
grep -rn "from '.*utils/pmsMockData'" src
```

If only test files / generator script remain (and generator was deleted in Task 4 Path A), proceed.

- [ ] **Step 2: Resolve any leftover imports**

For each importer found, either:
- Delete the import line if the referenced symbol is now dead code, OR
- Replace the mock symbol usage with a `useData()` call (only do this if the file is a React component running inside `DataProvider`), OR
- Inline the small literal needed (e.g., a single constant) into the consuming file as named constant.

Do NOT keep `mockData.ts` "just for tests" — tests should mock at the `useData` boundary or use factory functions, not import the demo dataset.

- [ ] **Step 3: Delete the files**

```bash
git rm src/utils/mockData.ts
git rm src/utils/pmsMockData.ts  # only if grep confirmed zero importers; otherwise resolve first
```

- [ ] **Step 4: Run typecheck, lint, vitest, build**

```powershell
npx tsc -b --noEmit
npm run lint
npx vitest run
npm run build
```

Expected: green. TypeScript will catch any stragglers.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(data): delete mockData.ts and pmsMockData.ts

Mock data is now sourced exclusively from supabase/seed.sql. Removing the
mock files eliminates the dead branch and ~1500 lines of duplicated content."
```

### Task 10: End-to-end smoke

**Files:** none modified.

- [ ] **Step 1: Reset DB and seed**

```powershell
supabase db reset
```

- [ ] **Step 2: Start dev server**

```powershell
npm run dev
```

- [ ] **Step 3: Manually verify each list page**

Open the app in the browser, log in as a seeded SystemAdmin, and visit each of these routes. Confirm rows render (not empty, not errors):
- `/staff`
- `/projects`
- `/phd`
- `/divisions`
- `/facilities`
- `/intelligence`
- `/calendar`
- `/recruitment`

- [ ] **Step 4: Verify empty-state behaviour**

In a Supabase SQL shell, run for one entity at a time:

```sql
TRUNCATE public.staff CASCADE;
```

Reload `/staff` — expect EmptyState with the upload CTA. Restore: `supabase db reset`.

Repeat for one other entity (e.g. `vacancy_advertisements`) to confirm the role-gated CTA is correct as different user roles.

- [ ] **Step 5: Commit if any UI tweaks were needed**

If steps 3-4 surfaced any styling or copy issues, commit fixes:

```bash
git add src/components/ui/EmptyState.tsx src/pages/*.tsx
git commit -m "fix(empty-state): adjustments after smoke testing"
```

- [ ] **Step 6: Open the PR**

```powershell
git push -u origin claude/vigorous-darwin-e54a91
gh pr create --title "feat(data): mock → Supabase migration + empty-state UI (sub-project B)" --body "Closes the mock fallback path. PR-B2 of sub-project B.

## Summary
- Removed the useMock branch from DataContext
- Deleted src/utils/mockData.ts and src/utils/pmsMockData.ts
- Added shared EmptyState UI primitive with role-gated CTAs
- Wired EmptyState into 8 list pages

## Test plan
- [x] supabase db reset; npm run dev; verify all list pages render
- [x] TRUNCATE per-table; verify EmptyState renders with correct CTA per role
- [x] npm run lint && npm run build pass
- [x] npx vitest run all tests pass

Spec: docs/superpowers/specs/2026-05-11-mock-to-supabase-design.md
Plan: docs/superpowers/plans/2026-05-11-mock-to-supabase.md"
```

---

## Self-Review

**Spec coverage check:**
- "Demo data into Supabase" → Tasks 1-4 (Wave 1). ✓
- "Empty state UI per page" → Tasks 5-7. ✓
- "Kill mock fallback" → Task 8. ✓
- "Delete mockData.ts/pmsMockData.ts" → Task 9. ✓
- "Smoke test" → Task 10. ✓
- "EmptyState role-gated CTA" → Tasks 5-7 use `hasPermission()`. ✓

**Placeholder scan:** no TBDs, no "implement later." All code blocks contain complete content. Task 2 leaves column-list verification as a *runtime* check against migrations — acceptable because the result is "fix and re-run," not a placeholder.

**Type consistency:** `EmptyState` props match between definition (Task 5 Step 3) and usage (Tasks 6-7). `mapStaffRow`, `mapProjectRow` etc. remain imported (still exist in `dataMapper.ts`, untouched). `useAuth().hasPermission` signature matches existing call sites.

**Known fragilities:**
- Task 2 depends on the migration files being readable; if column names diverged from `mockData.ts` shape, generator needs per-table key remapping.
- Task 4 Step 1 requires Supabase CLI installed locally. If not, fall back to pasting `seed.sql` into Supabase SQL Editor.

No issues found that require rewriting tasks.

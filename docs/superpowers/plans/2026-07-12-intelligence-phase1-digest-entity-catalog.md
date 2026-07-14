# Intelligence Phase 1: Executive Digest + Entity Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship phase 1 of the SURYA intelligence roadmap — (a) finish and extend the proactive executive digest on the dashboard, (b) add entity-lookup functions to the Ask SURYA structured-analytics catalog.

**Architecture:** Digest = pure client-side derivation over already-loaded `useData()` arrays (pattern established by `src/lib/digest/dataHealth.ts`), rendered by the existing `DataHealthDigest` component. Entity catalog = new whitelisted functions in `rag/analytics.py` following the existing `ANALYTICS`/`CATALOG` dict pattern — the router LLM can then route "who is X / what does X work on" questions to deterministic, RLS-scoped lookups instead of document retrieval.

**Tech Stack:** React 19 + TS 5.9 strict (vitest for tests), Python (pytest) for `rag/`. No new dependencies.

## Global Constraints

- TypeScript: `strict`, `verbatimModuleSyntax` — type-only imports MUST use `import type { ... }`.
- HR DB columns are quoted CamelCase (`"Name"`, `"Division"`, `"ProjectNo"`, `"CompletioDate"` — the typo is real and intentional). Never "fix" the casing.
- `rag/analytics.py` rule: NO free-form SQL. Plain `select` then filter in Python (existing `ponytail:` comment in that file documents this). New functions must be added to BOTH `ANALYTICS` and `CATALOG` dicts — `test_catalog_mirrors_analytics` enforces the mirror.
- Python: run with `py -3.12` (Python 3.14 is the machine default and breaks native deps; analytics tests are pure-python but stay consistent).
- Frontend tests: `npx vitest run <file>` for one file, `npm test` for all.
- Frontend pages consume data via `useData()` only — never Supabase directly.
- Commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Working directory: repo root `C:\Users\HP\Desktop\Claude\Surya` for npm/npx; `cd rag` first for pytest/eval commands.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/divisions/freshness.ts` + `.test.ts` | already written (uncommitted) | per-division data-health scoring |
| `src/lib/digest/dataHealth.ts` + `.test.ts` | modify (add `sortAndCap`) | data-health digest items + severity sort/cap helper |
| `src/lib/digest/executive.ts` (create) + `.test.ts` (create) | create | executive digest rules: projects ending, PhD milestones overdue, vacancies closing |
| `src/components/DataHealthDigest.tsx` | modify | render merged data-health + executive items |
| `src/pages/Dashboard.tsx`, `src/pages/DivisionsAnalytics.tsx`, `src/pages/dashboards/DirectorView.tsx` | already modified (uncommitted) | digest mount + freshness UI |
| `rag/analytics.py` | modify | 4 new entity functions + catalog entries |
| `rag/tests/test_analytics.py` | modify | tests for the 4 new functions |
| `rag/eval/gold.jsonl` | modify | routing gold questions for new functions |

---

### Task 1: Verify and commit the in-flight data-health digest work

The working tree already contains a complete, untested-in-CI feature: `src/lib/divisions/freshness.ts(+test)`, `src/lib/digest/dataHealth.ts(+test)`, `src/components/DataHealthDigest.tsx`, and wiring diffs in `Dashboard.tsx`, `DirectorView.tsx`, `DivisionsAnalytics.tsx`. Nothing to write — verify green, then commit as the baseline for Tasks 2–3.

**Files:**
- Commit (no edits): all seven paths above.

**Interfaces:**
- Produces: `DigestItem { id, severity: 'urgent'|'warning'|'info', title, detail, href }` and `buildDataHealthDigest(role, divisionCode, freshness)` from `src/lib/digest/dataHealth.ts`; `instituteFreshness(divisions, data)` from `src/lib/divisions/freshness.ts`. Tasks 2–3 build on these exact shapes.

- [ ] **Step 1: Run the existing tests for the in-flight files**

Run: `npx vitest run src/lib/divisions/freshness.test.ts src/lib/digest/dataHealth.test.ts`
Expected: all tests PASS. If any fail, fix the implementation (not the test) before proceeding — the tests were written with the feature.

- [ ] **Step 2: Typecheck and lint the whole tree**

Run: `npx tsc --noEmit && npx eslint src/`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit the in-flight work**

```bash
git add src/lib/divisions/freshness.ts src/lib/divisions/freshness.test.ts src/lib/digest src/components/DataHealthDigest.tsx src/pages/Dashboard.tsx src/pages/DivisionsAnalytics.tsx src/pages/dashboards/DirectorView.tsx
git commit -m "feat(digest): division data-freshness scoring + data-health digest on dashboard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Executive digest rules (`src/lib/digest/executive.ts`)

Three deterministic rules over `useData()` arrays: active projects past/near end date, overdue PhD milestones, open vacancies closing soon. Same role-scoping philosophy as `dataHealth.ts`: stewards (Director, HRAdmin, SystemAdmin, MasterAdmin) see institute-wide; DivisionHead/HOD see only their division's projects (milestone/vacancy rules are steward-only — those records have no cheap division linkage).

**Files:**
- Create: `src/lib/digest/executive.ts`
- Test: `src/lib/digest/executive.test.ts`

**Interfaces:**
- Consumes: `DigestItem` type from `./dataHealth`; `parseDate(value: string | null | undefined): Date | null` from `../../utils/dateUtils`; entity types `ProjectInfo`, `PhDMilestone`, `VacancyAdvertisement`, `Role` from `../../types`.
- Produces: `buildExecutiveDigest(role: Role, divisionCode: string | null, data: ExecutiveDigestData, today?: Date): DigestItem[]` and `interface ExecutiveDigestData { projects: ProjectInfo[]; phdMilestones: PhDMilestone[]; vacancyAdvertisements: VacancyAdvertisement[] }`. Task 3 imports both.

- [ ] **Step 1: Write the failing test**

Create `src/lib/digest/executive.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildExecutiveDigest, type ExecutiveDigestData } from './executive';
import type { ProjectInfo, PhDMilestone, VacancyAdvertisement } from '../../types';

const TODAY = new Date('2026-07-12');

const project = (over: Partial<ProjectInfo>): ProjectInfo => ({
  ProjectID: 'P1', ProjectNo: 'GAP-001', ProjectName: 'Test', FundType: '',
  SponsorerType: '', SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Ongoing',
  StartDate: '2025-01-01', CompletioDate: '2027-01-01', SanctionedCost: '',
  UtilizedAmount: '', PrincipalInvestigator: '', DivisionCode: 'CMD',
  Extension: '', ApprovalAuthority: '', ...over,
});

const milestone = (over: Partial<PhDMilestone>): PhDMilestone => ({
  id: 'm1', enrollmentNo: 'E1', milestone: 'Coursework', ...over,
});

const vacancy = (over: Partial<VacancyAdvertisement>): VacancyAdvertisement => ({
  id: 'v1', title: 'JRF Post', description: '', designation: 'JRF', division: 'CMD',
  numberOfPositions: 1, qualifications: '', applicationDeadline: '2026-07-20',
  createdAt: '2026-06-01', status: 'Open', staffCategory: 'Project',
  driveStage: 'Advertised', ...over,
});

const empty: ExecutiveDigestData = { projects: [], phdMilestones: [], vacancyAdvertisements: [] };

describe('buildExecutiveDigest', () => {
  it('returns nothing for non-steward roles', () => {
    const data = { ...empty, projects: [project({ CompletioDate: '2026-07-01' })] };
    expect(buildExecutiveDigest('Scientist', null, data, TODAY)).toEqual([]);
  });

  it('flags active projects past end date as urgent', () => {
    const data = { ...empty, projects: [project({ CompletioDate: '2026-07-01' })] };
    const items = buildExecutiveDigest('Director', null, data, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('urgent');
    expect(items[0].title).toContain('1 active project');
    expect(items[0].detail).toContain('GAP-001');
    expect(items[0].href).toBe('/projects');
  });

  it('flags projects ending within 60 days as warning', () => {
    const data = { ...empty, projects: [project({ CompletioDate: '2026-08-15' })] };
    const items = buildExecutiveDigest('Director', null, data, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('warning');
  });

  it('ignores completed/closed projects and unparseable dates', () => {
    const data = { ...empty, projects: [
      project({ CompletioDate: '2026-07-01', ProjectStatus: 'Completed' }),
      project({ ProjectID: 'P2', ProjectNo: 'GAP-002', CompletioDate: '' }),
    ] };
    expect(buildExecutiveDigest('Director', null, data, TODAY)).toEqual([]);
  });

  it('scopes DivisionHead to own division projects and skips institute rules', () => {
    const data: ExecutiveDigestData = {
      projects: [
        project({ CompletioDate: '2026-07-01', DivisionCode: 'CMD' }),
        project({ ProjectID: 'P2', ProjectNo: 'GAP-002', CompletioDate: '2026-07-01', DivisionCode: 'LWMD' }),
      ],
      phdMilestones: [milestone({ dueDate: '2026-06-01' })],
      vacancyAdvertisements: [vacancy({})],
    };
    const items = buildExecutiveDigest('DivisionHead', 'CMD', data, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].detail).toContain('GAP-001');
    expect(items[0].detail).not.toContain('GAP-002');
  });

  it('flags overdue PhD milestones (unset completedDate, past due) for stewards', () => {
    const data = { ...empty, phdMilestones: [
      milestone({ dueDate: '2026-06-01' }),
      milestone({ id: 'm2', dueDate: '2026-06-01', completedDate: '2026-06-10' }),
      milestone({ id: 'm3' }), // no dueDate — ignored
    ] };
    const items = buildExecutiveDigest('Director', null, data, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('1 PhD milestone');
    expect(items[0].href).toBe('/phd');
  });

  it('flags open vacancies with deadline within 14 days', () => {
    const data = { ...empty, vacancyAdvertisements: [
      vacancy({ applicationDeadline: '2026-07-20' }),
      vacancy({ id: 'v2', applicationDeadline: '2026-09-01' }),
      vacancy({ id: 'v3', applicationDeadline: '2026-07-20', status: 'Closed' }),
    ] };
    const items = buildExecutiveDigest('Director', null, data, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('1 vacancy');
    expect(items[0].href).toBe('/recruitment');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/digest/executive.test.ts`
Expected: FAIL — "Failed to resolve import ./executive" (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/digest/executive.ts`:

```typescript
import { parseDate } from '../../utils/dateUtils';
import type { Role, ProjectInfo, PhDMilestone, VacancyAdvertisement } from '../../types';
import type { DigestItem } from './dataHealth';

const STEWARD_ROLES: Role[] = ['Director', 'HRAdmin', 'SystemAdmin', 'MasterAdmin'];
const DAY_MS = 86_400_000;
const plural = (n: number) => (n === 1 ? '' : 's');

function daysUntil(raw: string | undefined, today: Date): number | null {
  const d = raw ? parseDate(raw) : null;
  return d ? Math.floor((d.getTime() - today.getTime()) / DAY_MS) : null;
}

const isClosed = (status: string) =>
  ['completed', 'closed'].includes(status.trim().toLowerCase());

export interface ExecutiveDigestData {
  projects: ProjectInfo[];
  phdMilestones: PhDMilestone[];
  vacancyAdvertisements: VacancyAdvertisement[];
}

/**
 * Proactive executive alerts derived from loaded records: projects at/near end
 * date, overdue PhD milestones, vacancies about to close. Pure derivation like
 * buildDataHealthDigest — items vanish when the underlying record is resolved.
 */
export function buildExecutiveDigest(
  role: Role,
  divisionCode: string | null,
  data: ExecutiveDigestData,
  today: Date = new Date(),
): DigestItem[] {
  const divScoped = (role === 'DivisionHead' || role === 'HOD') && !!divisionCode;
  if (!divScoped && !STEWARD_ROLES.includes(role)) return [];

  const projects = divScoped
    ? data.projects.filter(p => p.DivisionCode === divisionCode)
    : data.projects;

  const items: DigestItem[] = [];

  const overdue: ProjectInfo[] = [];
  const ending: ProjectInfo[] = [];
  for (const p of projects) {
    if (isClosed(p.ProjectStatus)) continue;
    const days = daysUntil(p.CompletioDate, today);
    if (days === null) continue;
    if (days < 0) overdue.push(p);
    else if (days <= 60) ending.push(p);
  }
  if (overdue.length > 0) items.push({
    id: 'exec-projects-overdue',
    severity: 'urgent',
    title: `${overdue.length} active project${plural(overdue.length)} past end date`,
    detail: overdue.slice(0, 3).map(p => p.ProjectNo).join(', '),
    href: '/projects',
  });
  if (ending.length > 0) items.push({
    id: 'exec-projects-ending',
    severity: 'warning',
    title: `${ending.length} project${plural(ending.length)} ending within 60 days`,
    detail: ending.slice(0, 3).map(p => p.ProjectNo).join(', '),
    href: '/projects',
  });

  // ponytail: milestone/vacancy rules are steward-only — scoping them to a
  // division needs joins these records don't carry; add if HoDs ask.
  if (!divScoped) {
    const lateMilestones = data.phdMilestones.filter(m => {
      if (m.completedDate) return false;
      const days = daysUntil(m.dueDate, today);
      return days !== null && days < 0;
    });
    if (lateMilestones.length > 0) items.push({
      id: 'exec-phd-overdue',
      severity: 'warning',
      title: `${lateMilestones.length} PhD milestone${plural(lateMilestones.length)} overdue`,
      detail: [...new Set(lateMilestones.map(m => m.milestone))].slice(0, 3).join(', '),
      href: '/phd',
    });

    const closing = data.vacancyAdvertisements.filter(v => {
      if (v.status !== 'Open') return false;
      const days = daysUntil(v.applicationDeadline, today);
      return days !== null && days >= 0 && days <= 14;
    });
    if (closing.length > 0) items.push({
      id: 'exec-vacancy-closing',
      severity: 'info',
      title: `${closing.length} vacanc${closing.length === 1 ? 'y closes' : 'ies close'} within 14 days`,
      detail: closing.slice(0, 3).map(v => v.title).join(', '),
      href: '/recruitment',
    });
  }

  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/digest/executive.test.ts`
Expected: PASS (7 tests). Note the vacancy test: deadline `2026-07-20` is 8 days from `TODAY` — inside the 14-day window.

- [ ] **Step 5: Commit**

```bash
git add src/lib/digest/executive.ts src/lib/digest/executive.test.ts
git commit -m "feat(digest): executive rules — projects at end date, overdue PhD milestones, closing vacancies

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Merge executive items into the dashboard digest

Add a severity sort + cap helper to `dataHealth.ts`, then render both digests through the existing `DataHealthDigest` component (already mounted in `Dashboard.tsx` — no page changes).

**Files:**
- Modify: `src/lib/digest/dataHealth.ts` (append helper at end of file)
- Modify: `src/lib/digest/dataHealth.test.ts` (append test)
- Modify: `src/components/DataHealthDigest.tsx`

**Interfaces:**
- Consumes: `buildExecutiveDigest`, `ExecutiveDigestData` from Task 2; `useData()` fields `projects`, `phdMilestones`, `vacancyAdvertisements` (all exist in DataContext).
- Produces: `sortAndCap(items: DigestItem[], cap?: number): DigestItem[]` exported from `dataHealth.ts`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/digest/dataHealth.test.ts` (inside the file, new top-level describe):

```typescript
describe('sortAndCap', () => {
  const item = (id: string, severity: DigestSeverity): DigestItem =>
    ({ id, severity, title: id, detail: '', href: '/x' });

  it('orders urgent > warning > info and caps at 7 by default', () => {
    const items = [
      item('i1', 'info'), item('w1', 'warning'), item('u1', 'urgent'),
      item('i2', 'info'), item('u2', 'urgent'), item('w2', 'warning'),
      item('i3', 'info'), item('i4', 'info'),
    ];
    const out = sortAndCap(items);
    expect(out).toHaveLength(7);
    expect(out.map(i => i.severity)).toEqual(
      ['urgent', 'urgent', 'warning', 'warning', 'info', 'info', 'info']);
  });
});
```

Adjust the file's existing import line to include the new names, e.g.:

```typescript
import { buildDataHealthDigest, sortAndCap, type DigestItem, type DigestSeverity } from './dataHealth';
```

(Keep whatever the file already imports; only add `sortAndCap` and the two types if not present.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/digest/dataHealth.test.ts`
Expected: FAIL — `sortAndCap` is not exported.

- [ ] **Step 3: Implement `sortAndCap`**

Append to `src/lib/digest/dataHealth.ts`:

```typescript
const SEVERITY_RANK: Record<DigestSeverity, number> = { urgent: 0, warning: 1, info: 2 };

/** Severity-ordered, capped list for the dashboard card — worst first, max 7. */
export function sortAndCap(items: DigestItem[], cap = 7): DigestItem[] {
  return [...items]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, cap);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/digest/dataHealth.test.ts`
Expected: PASS (existing tests + new one).

- [ ] **Step 5: Wire executive digest into the component**

In `src/components/DataHealthDigest.tsx`, replace the `useMemo` block and its imports so both digests merge. Final imports delta:

```typescript
import { buildDataHealthDigest, sortAndCap, type DigestSeverity } from '../lib/digest/dataHealth';
import { buildExecutiveDigest } from '../lib/digest/executive';
```

Destructure the extra arrays from `useData()`:

```typescript
const { divisions, staff, projects, scientificOutputs, ipIntelligence, mous, techTransfers, phDStudents, phdMilestones, vacancyAdvertisements } = useData();
```

Replace the `items` memo body:

```typescript
const items = useMemo(() => {
  if (!user) return [];
  const freshness = instituteFreshness(divisions, {
    staff, projects, scientificOutputs, ipIntelligence, mous, techTransfers, phDStudents,
  });
  return sortAndCap([
    ...buildExecutiveDigest(user.activeRole, divisionCode, { projects, phdMilestones, vacancyAdvertisements }),
    ...buildDataHealthDigest(user.activeRole, divisionCode, freshness),
  ]);
}, [user, divisionCode, divisions, staff, projects, scientificOutputs, ipIntelligence, mous, techTransfers, phDStudents, phdMilestones, vacancyAdvertisements]);
```

Also update the card heading from `Data Health` to `Needs Attention` (the card now covers more than data health) — the `<h2>` text only, nothing else.

- [ ] **Step 6: Typecheck, lint, full test run**

Run: `npx tsc --noEmit && npx eslint src/ && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/digest/dataHealth.ts src/lib/digest/dataHealth.test.ts src/components/DataHealthDigest.tsx
git commit -m "feat(digest): merge executive alerts into dashboard digest, severity-sorted, capped at 7

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Entity catalog functions — `staff_profile` and `projects_for_staff`

Port the join logic from `src/lib/relations.ts` (client-side, tested) to two whitelisted analytics functions. Same conventions as every function in `rag/analytics.py`: `(params, client) -> Answer`, plain selects, Python-side filtering, `(source: ... table)` suffix.

**Files:**
- Modify: `rag/analytics.py` (add two functions before the `ANALYTICS` dict; add entries to `ANALYTICS` and `CATALOG`)
- Modify: `rag/tests/test_analytics.py`

**Interfaces:**
- Consumes: existing helpers `_rows(client, table, columns)` and `Answer(text, mode, citations)` in `analytics.py`.
- Produces: catalog names `staff_profile` (param `name`, required) and `projects_for_staff` (param `name`, required). Task 6 references these names in gold questions.

- [ ] **Step 1: Add a multi-table fake client and write the failing tests**

The existing `_FakeClient` returns the same rows for every table; these functions read 2–3 tables. Append to `rag/tests/test_analytics.py`:

```python
class _FakeMultiClient:
    """Per-table rows: _FakeMultiClient({'staff': [...], 'projects': [...]})."""
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        return _FakeTable(self._tables.get(name, []))


_STAFF = [
    {"ID": "S001", "Name": "Anil Sharma", "Designation": "Sr. Scientist",
     "Division": "CMD", "CoreArea": "Composites", "Expertise": "polymer composites",
     "Email": "anil@ampri.res.in"},
    {"ID": "S002", "Name": "Rekha Sharma", "Designation": "Scientist",
     "Division": "LWMD", "CoreArea": "Metallurgy", "Expertise": "alloys",
     "Email": "rekha@ampri.res.in"},
]

_PROJECTS = [
    {"ProjectNo": "GAP-001", "ProjectName": "Composite Panels", "DivisionCode": "CMD",
     "ProjectStatus": "Ongoing", "PrincipalInvestigator": "Anil Sharma"},
    {"ProjectNo": "GAP-002", "ProjectName": "Alloy Study", "DivisionCode": "LWMD",
     "ProjectStatus": "Ongoing", "PrincipalInvestigator": "Rekha Sharma"},
    {"ProjectNo": "GAP-003", "ProjectName": "Waste Valorisation", "DivisionCode": "LWMD",
     "ProjectStatus": "Completed", "PrincipalInvestigator": "S002"},
]

_PROJECT_STAFF = [
    {"ProjectNo": "GAP-002", "StaffName": "Anil Sharma"},
]


def test_staff_profile_unique_match():
    ans = run_analytics("staff_profile", {"name": "anil"},
                        _FakeMultiClient({"staff": _STAFF}))
    assert "Anil Sharma" in ans.text
    assert "Sr. Scientist" in ans.text
    assert "CMD" in ans.text
    assert "Rekha" not in ans.text


def test_staff_profile_ambiguous_lists_candidates():
    ans = run_analytics("staff_profile", {"name": "sharma"},
                        _FakeMultiClient({"staff": _STAFF}))
    assert "Anil Sharma" in ans.text
    assert "Rekha Sharma" in ans.text


def test_staff_profile_no_match_and_missing_param():
    client = _FakeMultiClient({"staff": _STAFF})
    assert "No staff member matching" in run_analytics("staff_profile", {"name": "zzz"}, client).text
    assert "No staff name supplied" in run_analytics("staff_profile", {}, client).text


def test_projects_for_staff_pi_by_name_and_id_plus_team_membership():
    client = _FakeMultiClient({"staff": _STAFF, "projects": _PROJECTS,
                               "project_staff": _PROJECT_STAFF})
    # Anil: PI of GAP-001, team member of GAP-002.
    ans = run_analytics("projects_for_staff", {"name": "anil sharma"}, client)
    assert "GAP-001" in ans.text and "GAP-002" in ans.text
    assert "GAP-003" not in ans.text
    # Rekha: PI of GAP-002 by name and GAP-003 by staff ID.
    ans2 = run_analytics("projects_for_staff", {"name": "rekha"}, client)
    assert "GAP-002" in ans2.text and "GAP-003" in ans2.text


def test_projects_for_staff_unknown_person():
    client = _FakeMultiClient({"staff": _STAFF, "projects": _PROJECTS,
                               "project_staff": _PROJECT_STAFF})
    assert "No staff member matching" in run_analytics(
        "projects_for_staff", {"name": "zzz"}, client).text
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd rag && py -3.12 -m pytest tests/test_analytics.py -v`
Expected: new tests FAIL with `ValueError: Not a whitelisted analytics function: staff_profile`; all pre-existing tests still PASS.

- [ ] **Step 3: Implement both functions**

In `rag/analytics.py`, add above the `ANALYTICS` dict:

```python
def _match_staff(rows, needle):
    """Substring match on Name, exact on ID — mirrors relations.ts norm() logic."""
    n = needle.strip().lower()
    return [r for r in rows
            if n in str(r.get("Name") or "").lower()
            or n == str(r.get("ID") or "").lower()]


def _staff_profile(params, client) -> Answer:
    name = str(params.get("name") or "").strip()
    if not name:
        return Answer("No staff name supplied. (source: staff table)", "structured", [])
    rows = _rows(client, "staff",
                 "ID, Name, Designation, Division, CoreArea, Expertise, Email")
    matches = _match_staff(rows, name)
    if not matches:
        return Answer(f"No staff member matching '{name}'. (source: staff table)",
                      "structured", [])
    if len(matches) > 1:
        listing = "; ".join(
            f"{r.get('Name')} ({r.get('Designation') or '—'}, div {r.get('Division') or '—'})"
            for r in matches[:10])
        return Answer(f"{len(matches)} staff match '{name}' — {listing}. "
                      "Ask again with a fuller name. (source: staff table)",
                      "structured", [])
    r = matches[0]
    return Answer(f"{r.get('Name')} — {r.get('Designation') or '—'}, "
                  f"division {r.get('Division') or '—'}, "
                  f"core area {r.get('CoreArea') or '—'}, "
                  f"expertise {r.get('Expertise') or '—'}, "
                  f"email {r.get('Email') or '—'}. (source: staff table)",
                  "structured", [])


def _projects_for_staff(params, client) -> Answer:
    name = str(params.get("name") or "").strip()
    if not name:
        return Answer("No staff name supplied. (source: staff, projects tables)",
                      "structured", [])
    people = _match_staff(_rows(client, "staff", "ID, Name"), name)
    if not people:
        return Answer(f"No staff member matching '{name}'. (source: staff table)",
                      "structured", [])
    person = people[0]
    full = str(person.get("Name") or "").strip().lower()
    sid = str(person.get("ID") or "").strip().lower()
    projects = _rows(client, "projects",
                     "ProjectNo, ProjectName, ProjectStatus, PrincipalInvestigator")
    team_nos = {str(r.get("ProjectNo"))
                for r in _rows(client, "project_staff", "ProjectNo, StaffName")
                if str(r.get("StaffName") or "").strip().lower() == full}
    led, member = [], []
    for p in projects:
        pi = str(p.get("PrincipalInvestigator") or "").strip().lower()
        if pi and pi in (full, sid):
            led.append(p)
        elif str(p.get("ProjectNo")) in team_nos:
            member.append(p)
    if not led and not member:
        return Answer(f"{person.get('Name')} has no recorded projects. "
                      "(source: projects, project_staff tables)", "structured", [])
    fmt = lambda p: (f"{p.get('ProjectNo')} {p.get('ProjectName') or ''} "
                     f"[{p.get('ProjectStatus') or '—'}]").strip()
    parts = []
    if led:
        parts.append(f"leads {len(led)}: " + "; ".join(fmt(p) for p in led[:10]))
    if member:
        parts.append(f"team member on {len(member)}: " + "; ".join(fmt(p) for p in member[:10]))
    return Answer(f"{person.get('Name')} — " + ". ".join(parts) +
                  ". (source: projects, project_staff tables)", "structured", [])
```

Add to `ANALYTICS`:

```python
    "staff_profile": _staff_profile,
    "projects_for_staff": _projects_for_staff,
```

Add to `CATALOG`:

```python
    "staff_profile": "Profile of one named staff member — designation, division, core area, expertise, email; required param 'name'. Answers 'who is X'.",
    "projects_for_staff": "Projects a named staff member leads (as PI) or works on as team member; required param 'name'. Answers 'what is X working on'.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd rag && py -3.12 -m pytest tests/test_analytics.py -v`
Expected: all PASS, including `test_catalog_mirrors_analytics`.

- [ ] **Step 5: Commit**

```bash
git add rag/analytics.py rag/tests/test_analytics.py
git commit -m "feat(rag): staff_profile + projects_for_staff entity lookups in analytics catalog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Entity catalog functions — `division_summary` and `project_team`

**Files:**
- Modify: `rag/analytics.py`
- Modify: `rag/tests/test_analytics.py`

**Interfaces:**
- Consumes: `_rows`, `_counts`, `_fmt_counts`, `_match_staff` (Task 4), `_FakeMultiClient` fixture (Task 4).
- Produces: catalog names `division_summary` (param `division_code`, required) and `project_team` (param `project_no` or `project_name`, one required).

- [ ] **Step 1: Write the failing tests**

Append to `rag/tests/test_analytics.py` (reuses `_STAFF`, `_PROJECTS`, `_PROJECT_STAFF`, `_FakeMultiClient` from Task 4):

```python
_DIVISIONS = [
    {"divCode": "CMD", "divName": "Composites & Materials", "divHoD": "Anil Sharma",
     "divCurrentStrength": 12, "divSanctionedstrength": 15},
]


def test_division_summary():
    client = _FakeMultiClient({"divisions": _DIVISIONS, "staff": _STAFF,
                               "projects": _PROJECTS})
    ans = run_analytics("division_summary", {"division_code": "cmd"}, client)
    assert "Composites & Materials" in ans.text
    assert "Anil Sharma" in ans.text          # HoD
    assert "strength 12/15" in ans.text
    assert "staff on record: 1" in ans.text   # only Anil is in CMD
    assert "Ongoing: 1" in ans.text           # GAP-001


def test_division_summary_unknown_code_and_missing_param():
    client = _FakeMultiClient({"divisions": _DIVISIONS})
    assert "No division with code" in run_analytics(
        "division_summary", {"division_code": "XXX"}, client).text
    assert "No division code supplied" in run_analytics(
        "division_summary", {}, client).text


def test_project_team_by_number():
    client = _FakeMultiClient({"projects": _PROJECTS, "staff": _STAFF,
                               "project_staff": _PROJECT_STAFF})
    ans = run_analytics("project_team", {"project_no": "GAP-002"}, client)
    assert "Alloy Study" in ans.text
    assert "PI: Rekha Sharma" in ans.text
    assert "Anil Sharma" in ans.text          # team member


def test_project_team_by_name_fragment():
    client = _FakeMultiClient({"projects": _PROJECTS, "staff": _STAFF,
                               "project_staff": _PROJECT_STAFF})
    ans = run_analytics("project_team", {"project_name": "composite"}, client)
    assert "GAP-001" in ans.text
    assert "PI: Anil Sharma" in ans.text


def test_project_team_not_found():
    client = _FakeMultiClient({"projects": _PROJECTS})
    assert "No project matching" in run_analytics(
        "project_team", {"project_no": "GAP-999"}, client).text
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd rag && py -3.12 -m pytest tests/test_analytics.py -v`
Expected: new tests FAIL with `Not a whitelisted analytics function`; everything else PASS.

- [ ] **Step 3: Implement both functions**

Add to `rag/analytics.py` (after `_projects_for_staff`):

```python
def _division_summary(params, client) -> Answer:
    code = str(params.get("division_code") or "").strip()
    if not code:
        return Answer("No division code supplied. (source: divisions table)",
                      "structured", [])
    divisions = _rows(client, "divisions",
                      "divCode, divName, divHoD, divCurrentStrength, divSanctionedstrength")
    div = next((d for d in divisions
                if str(d.get("divCode") or "").lower() == code.lower()), None)
    if div is None:
        return Answer(f"No division with code '{code}'. (source: divisions table)",
                      "structured", [])
    dc = str(div.get("divCode"))
    staff_count = sum(1 for r in _rows(client, "staff", "Division")
                      if str(r.get("Division") or "") == dc)
    proj_rows = [r for r in _rows(client, "projects", "DivisionCode, ProjectStatus")
                 if str(r.get("DivisionCode") or "") == dc]
    return Answer(f"{div.get('divName')} ({dc}) — HoD {div.get('divHoD') or '—'}, "
                  f"strength {div.get('divCurrentStrength')}/{div.get('divSanctionedstrength')} "
                  f"(current/sanctioned), staff on record: {staff_count}, "
                  f"projects by status: {_fmt_counts(_counts(proj_rows, 'ProjectStatus'))}. "
                  "(source: divisions, staff, projects tables)", "structured", [])


def _project_team(params, client) -> Answer:
    no = str(params.get("project_no") or "").strip()
    name = str(params.get("project_name") or "").strip().lower()
    if not no and not name:
        return Answer("No project number or name supplied. (source: projects table)",
                      "structured", [])
    projects = _rows(client, "projects",
                     "ProjectNo, ProjectName, ProjectStatus, PrincipalInvestigator")
    if no:
        proj = next((p for p in projects
                     if str(p.get("ProjectNo") or "").lower() == no.lower()), None)
    else:
        proj = next((p for p in projects
                     if name in str(p.get("ProjectName") or "").lower()), None)
    if proj is None:
        return Answer(f"No project matching '{no or params.get('project_name')}'. "
                      "(source: projects table)", "structured", [])
    pi_raw = str(proj.get("PrincipalInvestigator") or "").strip()
    pi_matches = _match_staff(_rows(client, "staff", "ID, Name"), pi_raw) if pi_raw else []
    pi_name = pi_matches[0].get("Name") if pi_matches else (pi_raw or "—")
    team = [str(r.get("StaffName"))
            for r in _rows(client, "project_staff", "ProjectNo, StaffName")
            if str(r.get("ProjectNo")) == str(proj.get("ProjectNo"))]
    team_str = "; ".join(team) if team else "none recorded"
    return Answer(f"{proj.get('ProjectNo')} {proj.get('ProjectName') or ''} "
                  f"[{proj.get('ProjectStatus') or '—'}] — PI: {pi_name}; "
                  f"team: {team_str}. (source: projects, project_staff tables)",
                  "structured", [])
```

Add to `ANALYTICS`:

```python
    "division_summary": _division_summary,
    "project_team": _project_team,
```

Add to `CATALOG`:

```python
    "division_summary": "One division's summary — head of division, current/sanctioned strength, staff count, project counts by status; required param 'division_code'.",
    "project_team": "PI and team members of one project; param 'project_no' (exact) or 'project_name' (fragment). Answers 'who works on project X'.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd rag && py -3.12 -m pytest tests/test_analytics.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add rag/analytics.py rag/tests/test_analytics.py
git commit -m "feat(rag): division_summary + project_team entity lookups in analytics catalog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Routing gold questions for the new catalog entries

The eval harness measures router accuracy; every new catalog function ships with gold questions so regressions surface.

**Files:**
- Modify: `rag/eval/gold.jsonl` (append lines)

**Interfaces:**
- Consumes: catalog names from Tasks 4–5 (`staff_profile`, `projects_for_staff`, `division_summary`, `project_team`).

- [ ] **Step 1: Append gold questions**

Append to `rag/eval/gold.jsonl` (one JSON object per line, matching the file's existing shape — `question` + `expected_mode`):

```jsonl
{"question": "Who is Dr. Anil Sharma?", "expected_mode": "structured"}
{"question": "Give me the profile of a scientist named Rekha Sharma", "expected_mode": "structured"}
{"question": "What projects is Anil Sharma working on?", "expected_mode": "structured"}
{"question": "Which projects does Rekha Sharma lead?", "expected_mode": "structured"}
{"question": "Give me a summary of the CMD division", "expected_mode": "structured"}
{"question": "Who heads the LWMD division and how many staff does it have?", "expected_mode": "structured"}
{"question": "Who is on the team of project GAP-001?", "expected_mode": "structured"}
{"question": "Who is the PI of the composite panels project?", "expected_mode": "structured"}
```

- [ ] **Step 2: Validate the gold file**

Run: `cd rag && py -3.12 eval/validate_gold.py`
Expected: exit 0. (The validator lints JSONL shape and modes; these entries have no `expected_citation`, so no corpus resolution is needed.)

- [ ] **Step 3: Commit**

```bash
git add rag/eval/gold.jsonl
git commit -m "test(rag): gold routing questions for entity catalog functions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Deferred (explicitly out of phase 1)

- PMS-cycle digest rule — PMS data isn't in `useData()`; needs its own wiring. Add when digest proves itself.
- Digest dismissals table, LLM narration, per-role email digest — V2 items from the roadmap.
- Fuzzy name matching in `_match_staff` — substring match first; upgrade only if eval shows misses.

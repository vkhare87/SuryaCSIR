# Project Staff Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Analytics tab to `/staff/project` with tenure, contract-runway, project/PI headcount, and designation/intake charts that click-through to filter the List tab.

**Architecture:** Pure selectors in `projectStaffMetrics.ts` (unit-tested) feed a presentational `ProjectStaffAnalytics` grid built on the existing viz kit. `ProjectStaffRoster` owns tab + facet-filter state; chart clicks set a facet and switch to the filtered List tab.

**Tech Stack:** React 19 + TS strict, recharts via viz kit, Tailwind 4 tokens, vitest, React Router 7.

---

## File Structure

- `src/utils/projectStaffMetrics.ts` (new) — `parseDurationEnd` + 9 pure selectors.
- `src/utils/projectStaffMetrics.test.ts` (new) — selector tests.
- `src/pages/ProjectStaffAnalytics.tsx` (new) — chart grid, named export, props `onFacet`/`onDivision`.
- `src/pages/ProjectStaffRoster.tsx` (modify) — tab bar, `activeTab`/`facet` state, facet chip, extend filtering, render analytics tab.

---

### Task 1: projectStaffMetrics selectors

**Files:**
- Create: `src/utils/projectStaffMetrics.ts`
- Create: `src/utils/projectStaffMetrics.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/utils/projectStaffMetrics.test.ts
import { describe, it, expect } from 'vitest';
import type { ProjectStaff } from '../types';
import {
  parseDurationEnd,
  getTenureYears,
  getAvgTenure,
  getContractRunway,
  getHeadcountByProject,
  getHeadcountByPI,
  getDesignationMix,
  getHiresByCycle,
  getJoiningByYear,
  getDivisionMix,
} from './projectStaffMetrics';

const ps = (o: Partial<ProjectStaff>): ProjectStaff => ({
  id: '', ProjectNo: '', StaffName: '', Designation: '', RecruitmentCycle: '',
  DateOfJoining: '', DateOfProjectDuration: '', PIName: '', DivisionCode: '', ...o,
});
const NOW = new Date('2026-05-25');

describe('parseDurationEnd', () => {
  it('parses the end of a "START to END" range', () => {
    expect(parseDurationEnd('2023-08-15 to 2025-08-14')?.getFullYear()).toBe(2025);
  });
  it('returns null when no " to " present', () => {
    expect(parseDurationEnd('2 years')).toBeNull();
  });
  it('returns null for empty', () => expect(parseDurationEnd('')).toBeNull());
});

describe('getTenureYears', () => {
  it('computes years since joining, drops bad/negative', () => {
    const r = getTenureYears([ps({ DateOfJoining: '2024-05-25' }), ps({ DateOfJoining: '' }), ps({ DateOfJoining: '2030-01-01' })], NOW);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo(2, 1);
  });
});

describe('getAvgTenure', () => {
  it('averages to 1 dp, 0 when none', () => {
    expect(getAvgTenure([ps({ DateOfJoining: '2024-05-25' }), ps({ DateOfJoining: '2022-05-25' })], NOW)).toBeCloseTo(3, 1);
    expect(getAvgTenure([], NOW)).toBe(0);
  });
});

describe('getContractRunway', () => {
  it('buckets by months to contract end', () => {
    const r = getContractRunway([
      ps({ DateOfProjectDuration: '2024-01-01 to 2026-06-30' }), // ~1mo -> <3mo
      ps({ DateOfProjectDuration: '2024-01-01 to 2027-06-30' }), // >12mo
      ps({ DateOfProjectDuration: '2020-01-01 to 2021-01-01' }), // expired -> skipped
    ], NOW);
    const map = Object.fromEntries(r.map((d) => [d.label, d.value]));
    expect(map['<3mo']).toBe(1);
    expect(map['>12mo']).toBe(1);
  });
});

describe('grouping selectors', () => {
  const sample = [
    ps({ ProjectNo: 'A', PIName: 'Dr X', Designation: 'JRF', RecruitmentCycle: '2024-I', DivisionCode: 'ARC', DateOfJoining: '2024-03-01' }),
    ps({ ProjectNo: 'A', PIName: 'Dr X', Designation: 'SRF', RecruitmentCycle: '2023-II', DivisionCode: 'ARC', DateOfJoining: '2023-03-01' }),
    ps({ ProjectNo: 'B', PIName: 'Dr Y', Designation: 'JRF', RecruitmentCycle: '2024-I', DivisionCode: 'NST', DateOfJoining: '2024-06-01' }),
  ];
  it('headcount by project desc', () => {
    expect(getHeadcountByProject(sample)[0]).toEqual({ label: 'A', value: 2 });
  });
  it('headcount by PI desc', () => {
    expect(getHeadcountByPI(sample)[0]).toEqual({ label: 'Dr X', value: 2 });
  });
  it('designation mix', () => {
    expect(getDesignationMix(sample).find((d) => d.label === 'JRF')!.value).toBe(2);
  });
  it('hires by cycle sorted asc', () => {
    expect(getHiresByCycle(sample).map((d) => d.label)).toEqual(['2023-II', '2024-I']);
  });
  it('joining by year asc', () => {
    expect(getJoiningByYear(sample)).toEqual([{ label: '2023', value: 1 }, { label: '2024', value: 2 }]);
  });
  it('division mix', () => {
    expect(getDivisionMix(sample).find((d) => d.label === 'ARC')!.value).toBe(2);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/utils/projectStaffMetrics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/utils/projectStaffMetrics.ts
import type { CategoryDatum } from '../components/viz/CategoryBar';
import type { TrendPoint } from '../components/viz/TrendLine';
import { parseDate, diffInDays } from './dateUtils';
import type { ProjectStaff } from '../types';

export function parseDurationEnd(duration: string): Date | null {
  if (!duration) return null;
  const idx = duration.toLowerCase().indexOf(' to ');
  if (idx === -1) return null;
  return parseDate(duration.slice(idx + 4).trim());
}

export function getTenureYears(staff: ProjectStaff[], now: Date = new Date()): number[] {
  const out: number[] = [];
  for (const s of staff) {
    const d = parseDate(s.DateOfJoining);
    if (!d) continue;
    const yrs = diffInDays(now, d) / 365.25;
    if (Number.isFinite(yrs) && yrs >= 0) out.push(yrs);
  }
  return out;
}

export function getAvgTenure(staff: ProjectStaff[], now: Date = new Date()): number {
  const t = getTenureYears(staff, now);
  if (t.length === 0) return 0;
  return Math.round((t.reduce((a, b) => a + b, 0) / t.length) * 10) / 10;
}

export function getContractRunway(staff: ProjectStaff[], now: Date = new Date()): CategoryDatum[] {
  const buckets: Record<string, number> = { '<3mo': 0, '3–6mo': 0, '6–12mo': 0, '>12mo': 0 };
  for (const s of staff) {
    const end = parseDurationEnd(s.DateOfProjectDuration);
    if (!end) continue;
    const months = diffInDays(end, now) / 30.44;
    if (months < 0) continue;
    if (months < 3) buckets['<3mo']++;
    else if (months < 6) buckets['3–6mo']++;
    else if (months < 12) buckets['6–12mo']++;
    else buckets['>12mo']++;
  }
  return Object.entries(buckets).map(([label, value]) => ({ label, value }));
}

function countBy(staff: ProjectStaff[], key: (s: ProjectStaff) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of staff) {
    const k = key(s) || 'Unspecified';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function getHeadcountByProject(staff: ProjectStaff[]): CategoryDatum[] {
  return Array.from(countBy(staff, (s) => s.ProjectNo), ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
}

export function getHeadcountByPI(staff: ProjectStaff[]): CategoryDatum[] {
  return Array.from(countBy(staff, (s) => s.PIName), ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
}

export function getDesignationMix(staff: ProjectStaff[]): CategoryDatum[] {
  return Array.from(countBy(staff, (s) => s.Designation), ([label, value]) => ({ label, value })).sort(
    (a, b) => b.value - a.value,
  );
}

export function getHiresByCycle(staff: ProjectStaff[]): CategoryDatum[] {
  return Array.from(countBy(staff, (s) => s.RecruitmentCycle), ([label, value]) => ({ label, value })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

export function getJoiningByYear(staff: ProjectStaff[]): TrendPoint[] {
  const m = new Map<number, number>();
  for (const s of staff) {
    const d = parseDate(s.DateOfJoining);
    if (!d) continue;
    const y = d.getFullYear();
    m.set(y, (m.get(y) ?? 0) + 1);
  }
  return Array.from(m, ([y, value]) => ({ label: String(y), value })).sort((a, b) => a.label.localeCompare(b.label));
}

export function getDivisionMix(staff: ProjectStaff[]): CategoryDatum[] {
  return Array.from(countBy(staff, (s) => s.DivisionCode), ([label, value]) => ({ label, value })).sort(
    (a, b) => b.value - a.value,
  );
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/utils/projectStaffMetrics.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/projectStaffMetrics.ts src/utils/projectStaffMetrics.test.ts
git commit -m "feat: project staff analytics selectors"
```

---

### Task 2: ProjectStaffAnalytics grid

**Files:**
- Create: `src/pages/ProjectStaffAnalytics.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/pages/ProjectStaffAnalytics.tsx
import { useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { ChartCard } from '../components/viz/ChartCard';
import { CategoryBar } from '../components/viz/CategoryBar';
import { CategoryDonut } from '../components/viz/CategoryDonut';
import { Histogram } from '../components/viz/Histogram';
import { TrendLine } from '../components/viz/TrendLine';
import {
  getTenureYears,
  getAvgTenure,
  getContractRunway,
  getHeadcountByProject,
  getHeadcountByPI,
  getDesignationMix,
  getHiresByCycle,
  getJoiningByYear,
  getDivisionMix,
} from '../utils/projectStaffMetrics';

export type FacetDim = 'project' | 'pi' | 'designation' | 'cycle';
export interface Facet {
  dim: FacetDim;
  value: string;
}

interface ProjectStaffAnalyticsProps {
  onFacet: (facet: Facet) => void;
  onDivision: (code: string) => void;
}

export function ProjectStaffAnalytics({ onFacet, onDivision }: ProjectStaffAnalyticsProps) {
  const { projectStaff } = useData();

  const tenure = useMemo(() => getTenureYears(projectStaff), [projectStaff]);
  const avgTenure = useMemo(() => getAvgTenure(projectStaff), [projectStaff]);
  const runway = useMemo(() => getContractRunway(projectStaff), [projectStaff]);
  const byProject = useMemo(() => getHeadcountByProject(projectStaff), [projectStaff]);
  const byPI = useMemo(() => getHeadcountByPI(projectStaff), [projectStaff]);
  const designation = useMemo(() => getDesignationMix(projectStaff), [projectStaff]);
  const byCycle = useMemo(() => getHiresByCycle(projectStaff), [projectStaff]);
  const joining = useMemo(() => getJoiningByYear(projectStaff), [projectStaff]);
  const division = useMemo(() => getDivisionMix(projectStaff), [projectStaff]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Service tenure" subtitle={`years since joining · avg ${avgTenure}y`}>
        <Histogram values={tenure} xLabel="years" yLabel="staff" />
      </ChartCard>
      <ChartCard title="Contract runway" subtitle="months to project-duration end">
        <CategoryBar data={runway} />
      </ChartCard>
      <ChartCard title="Headcount by project" subtitle="click to filter the list">
        <CategoryBar data={byProject} onSelect={(d) => onFacet({ dim: 'project', value: d.label })} />
      </ChartCard>
      <ChartCard title="Headcount by PI" subtitle="click to filter the list">
        <CategoryBar data={byPI} horizontal onSelect={(d) => onFacet({ dim: 'pi', value: d.label })} />
      </ChartCard>
      <ChartCard title="Designation mix" subtitle="click to filter the list">
        <CategoryDonut data={designation} onSelect={(d) => onFacet({ dim: 'designation', value: d.label })} />
      </ChartCard>
      <ChartCard title="Hires by recruitment cycle" subtitle="click to filter the list">
        <CategoryBar data={byCycle} onSelect={(d) => onFacet({ dim: 'cycle', value: d.label })} />
      </ChartCard>
      <ChartCard title="Joining trend by year">
        <TrendLine data={joining} yLabel="hires" />
      </ChartCard>
      <ChartCard title="Division distribution" subtitle="click to filter the list">
        <CategoryDonut data={division} onSelect={(d) => onDivision(d.label)} />
      </ChartCard>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProjectStaffAnalytics.tsx
git commit -m "feat: project staff analytics chart grid"
```

---

### Task 3: ProjectStaffRoster tabs + facet filtering

**Files:**
- Modify: `src/pages/ProjectStaffRoster.tsx`

- [ ] **Step 1: Rewrite ProjectStaffRoster**

Add `activeTab` ('list'|'analytics') and `facet` state. Tab bar uses the app's pill pattern
(`bg-[#c96442] text-white` active). List filtering adds the facet predicate. A facet chip renders when set.

```tsx
import { useState, useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { DataTable } from '../components/ui/DataTable';
import { Card, Badge } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import { Search, Filter, UsersRound, X } from 'lucide-react';
import type { ProjectStaff } from '../types';
import { ProjectStaffAnalytics, type Facet } from './ProjectStaffAnalytics';

const FACET_FIELD: Record<Facet['dim'], keyof ProjectStaff> = {
  project: 'ProjectNo',
  pi: 'PIName',
  designation: 'Designation',
  cycle: 'RecruitmentCycle',
};
const FACET_LABEL: Record<Facet['dim'], string> = {
  project: 'Project',
  pi: 'PI',
  designation: 'Designation',
  cycle: 'Cycle',
};

export default function ProjectStaffRoster() {
  const { projectStaff, divisions } = useData();
  const [activeTab, setActiveTab] = useState<'list' | 'analytics'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [facet, setFacet] = useState<Facet | null>(null);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return projectStaff.filter((member) => {
      const matchesSearch =
        (member.StaffName?.toLowerCase() || '').includes(q) ||
        (member.Designation?.toLowerCase() || '').includes(q) ||
        (member.ProjectNo?.toLowerCase() || '').includes(q) ||
        (member.PIName?.toLowerCase() || '').includes(q);
      const matchesDivision = selectedDivision === 'ALL' || member.DivisionCode === selectedDivision;
      const matchesFacet = !facet || (member[FACET_FIELD[facet.dim]] || '') === facet.value;
      return matchesSearch && matchesDivision && matchesFacet;
    });
  }, [projectStaff, searchTerm, selectedDivision, facet]);

  const columns = [
    {
      header: 'Name & Designation',
      cell: (m: ProjectStaff) => (
        <div>
          <div className="font-semibold text-text">{m.StaffName}</div>
          <div className="text-xs text-text-muted mt-0.5">{m.Designation || '—'}</div>
        </div>
      ),
    },
    {
      header: 'Project',
      accessorKey: 'ProjectNo' as const,
      cell: (m: ProjectStaff) => <span className="font-mono text-xs text-text-muted">{m.ProjectNo || '—'}</span>,
    },
    {
      header: 'Principal Investigator',
      accessorKey: 'PIName' as const,
      cell: (m: ProjectStaff) => <span className="text-sm text-text">{m.PIName || '—'}</span>,
    },
    {
      header: 'Division',
      accessorKey: 'DivisionCode' as const,
      cell: (m: ProjectStaff) => {
        const div = divisions.find((d) => d.divCode === m.DivisionCode);
        return <Badge variant="info">{div ? div.divCode : m.DivisionCode || '—'}</Badge>;
      },
    },
    {
      header: 'Joining',
      accessorKey: 'DateOfJoining' as const,
      cell: (m: ProjectStaff) => <span className="text-sm text-text-muted">{m.DateOfJoining || '—'}</span>,
    },
  ];

  const tabBtn = (tab: 'list' | 'analytics', label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        activeTab === tab ? 'bg-[#c96442] text-white' : 'text-text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Project Staff</h1>
          <p className="text-text-muted mt-1">Project-funded personnel, separate from permanent staff</p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {tabBtn('list', 'List')}
          {tabBtn('analytics', 'Analytics')}
        </div>
      </div>

      {activeTab === 'analytics' ? (
        <ProjectStaffAnalytics
          onFacet={(f) => {
            setFacet(f);
            setActiveTab('list');
          }}
          onDivision={(code) => {
            setSelectedDivision(code);
            setActiveTab('list');
          }}
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
              <input
                type="text"
                placeholder="Search name, project, PI..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm w-full sm:w-64"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
              <select
                value={selectedDivision}
                onChange={(e) => setSelectedDivision(e.target.value)}
                className="pl-9 pr-8 py-2 bg-surface border border-border rounded-lg focus:ring-2 focus:ring-[#3898ec] outline-none text-sm appearance-none cursor-pointer"
              >
                <option value="ALL">All Divisions</option>
                {divisions.map((d) => (
                  <option key={d.divCode} value={d.divCode}>
                    {d.divCode} - {d.divName}
                  </option>
                ))}
              </select>
            </div>
            {facet && (
              <button
                onClick={() => setFacet(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#c96442]/10 text-[#c96442] rounded-lg text-xs font-medium"
              >
                {FACET_LABEL[facet.dim]}: {facet.value}
                <X size={12} />
              </button>
            )}
          </div>

          <Card className="p-0 overflow-hidden">
            {projectStaff.length === 0 ? (
              <EmptyState
                icon={UsersRound}
                title="No project staff records"
                description="Project staff data hasn't been loaded yet."
              />
            ) : (
              <DataTable
                data={filtered}
                columns={columns}
                keyExtractor={(item) => item.id}
                itemsPerPage={12}
                className="border-0 shadow-none bg-transparent"
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npx eslint src/pages/ProjectStaffRoster.tsx src/pages/ProjectStaffAnalytics.tsx && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Full test run**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ProjectStaffRoster.tsx
git commit -m "feat: project staff analytics tab with click-to-filter"
```

- [ ] **Step 5: Manual verify (browser, as DivisionHead)**

Navigate `#/staff/project`: Analytics tab renders 8 charts; click a project/PI/designation/cycle bar →
lands on List filtered with a chip; clear chip resets; division donut sets the division dropdown.

---

## Self-Review Notes

- **Spec coverage:** tabs (Task 3), all 8 charts + selectors (Tasks 1-2), click-to-filter facet + chip
  (Task 3), division-drives-dropdown (Tasks 2-3). Covered.
- **Type consistency:** `Facet`/`FacetDim` defined in `ProjectStaffAnalytics.tsx`, imported by roster;
  `FACET_FIELD` maps to real `ProjectStaff` keys.
- **No schema/route changes** — confirmed.

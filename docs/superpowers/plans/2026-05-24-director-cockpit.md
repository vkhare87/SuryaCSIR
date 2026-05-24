# Director Decision Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `DirectorView` into a decision cockpit — attention flags + decision charts across Project/Finance, Research, and Equipment/Ops — keeping the raw counts as a compact KPI strip and the division table below.

**Architecture:** Pure derived-metric selectors in `src/utils/directorMetrics.ts` (unit-tested) feed presentational section components that reuse the existing `src/components/viz/*` kit. Flags drill to existing pages via React Router `useNavigate`. Thresholds live in `DirectorView` state, persisted to `localStorage`. No schema/RLS/write changes.

**Tech Stack:** React 19 + TS strict, recharts via viz kit, Tailwind 4 semantic tokens, vitest + @testing-library, React Router 7 HashRouter.

---

## File Structure

- `src/utils/parseCost.ts` (new) — shared `parseCost` string→number helper, extracted from `ProjectsAnalytics.tsx`.
- `src/utils/directorMetrics.ts` (new) — thresholds type/defaults/keys + all pure cockpit selectors.
- `src/utils/directorMetrics.test.ts` (new) — vitest coverage for selectors + flag boundaries.
- `src/components/dashboard/ThresholdControls.tsx` (new) — presentational tunable-threshold inputs.
- `src/components/dashboard/AttentionStrip.tsx` (new) — derived flag tiles, drill navigation.
- `src/components/dashboard/ProjectFinanceSection.tsx` (new)
- `src/components/dashboard/ResearchSection.tsx` (new)
- `src/components/dashboard/EquipmentOpsSection.tsx` (new)
- `src/pages/dashboards/DirectorView.tsx` (modify) — own threshold state, assemble cockpit + retained KPI strip + table; remove scorecards grid and comparison chart.
- `src/pages/ProjectsAnalytics.tsx` (modify) — import shared `parseCost`, drop local copy.

Conventions: all derived data in `useMemo`; semantic tokens only; named exports for utils/components; `import type` for types; `useData()` only.

---

### Task 1: Extract shared `parseCost`

**Files:**
- Create: `src/utils/parseCost.ts`
- Create: `src/utils/parseCost.test.ts`
- Modify: `src/pages/ProjectsAnalytics.tsx` (remove local `parseCost`, import shared)

- [ ] **Step 1: Write failing test**

```typescript
// src/utils/parseCost.test.ts
import { describe, it, expect } from 'vitest';
import { parseCost } from './parseCost';

describe('parseCost', () => {
  it('parses plain numbers', () => expect(parseCost('1500')).toBe(1500));
  it('strips currency and separators', () => expect(parseCost('₹ 1,250.50 L')).toBeCloseTo(1250.5));
  it('returns 0 for empty/undefined', () => {
    expect(parseCost('')).toBe(0);
    expect(parseCost(undefined)).toBe(0);
  });
  it('returns 0 for non-numeric', () => expect(parseCost('N/A')).toBe(0));
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/utils/parseCost.test.ts`
Expected: FAIL — cannot find module `./parseCost`.

- [ ] **Step 3: Implement**

```typescript
// src/utils/parseCost.ts
/** Parse a loose cost string (e.g. "₹ 1,250.50 L") to a number. Returns 0 if unparseable. */
export function parseCost(s: string | undefined): number {
  if (!s) return 0;
  const v = parseFloat(s.replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(v) ? v : 0;
}
```

- [ ] **Step 4: Refactor ProjectsAnalytics**

In `src/pages/ProjectsAnalytics.tsx`: delete the local `function parseCost(...)` (lines ~12-16) and add `import { parseCost } from '../utils/parseCost';` with the other util imports.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/utils/parseCost.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/parseCost.ts src/utils/parseCost.test.ts src/pages/ProjectsAnalytics.tsx
git commit -m "refactor: extract shared parseCost util"
```

---

### Task 2: directorMetrics — thresholds + project/finance selectors

**Files:**
- Create: `src/utils/directorMetrics.ts`
- Create: `src/utils/directorMetrics.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/utils/directorMetrics.test.ts
import { describe, it, expect } from 'vitest';
import type { ProjectInfo } from '../types';
import {
  DEFAULT_THRESHOLDS,
  getProjectFlags,
  getInstituteUtilization,
  getUtilizationByDivision,
} from './directorMetrics';

const proj = (o: Partial<ProjectInfo>): ProjectInfo => ({
  ProjectID: '', ProjectNo: '', ProjectName: '', FundType: '', SponsorerType: '',
  SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Active', StartDate: '',
  CompletioDate: '', SanctionedCost: '', UtilizedAmount: '', PrincipalInvestigator: '',
  DivisionCode: '', Extension: '', ApprovalAuthority: '', ...o,
});
const NOW = new Date('2026-05-24');

describe('getProjectFlags', () => {
  it('flags overdue active projects', () => {
    const r = getProjectFlags([proj({ CompletioDate: '2026-01-01' })], DEFAULT_THRESHOLDS, NOW);
    expect(r.overdue).toHaveLength(1);
  });
  it('flags ending-soon within window, not beyond', () => {
    const within = getProjectFlags([proj({ CompletioDate: '2026-06-10' })], DEFAULT_THRESHOLDS, NOW);
    const beyond = getProjectFlags([proj({ CompletioDate: '2027-01-01' })], DEFAULT_THRESHOLDS, NOW);
    expect(within.endingSoon).toHaveLength(1);
    expect(beyond.endingSoon).toHaveLength(0);
  });
  it('flags low burn below threshold, skips zero-sanctioned', () => {
    const low = getProjectFlags([proj({ SanctionedCost: '100', UtilizedAmount: '10' })], DEFAULT_THRESHOLDS, NOW);
    const zero = getProjectFlags([proj({ SanctionedCost: '0', UtilizedAmount: '0' })], DEFAULT_THRESHOLDS, NOW);
    expect(low.lowBurn).toHaveLength(1);
    expect(zero.lowBurn).toHaveLength(0);
  });
  it('ignores non-active projects for date flags', () => {
    const r = getProjectFlags([proj({ ProjectStatus: 'Completed', CompletioDate: '2026-01-01' })], DEFAULT_THRESHOLDS, NOW);
    expect(r.overdue).toHaveLength(0);
  });
});

describe('getInstituteUtilization', () => {
  it('sums and computes pct', () => {
    const r = getInstituteUtilization([
      proj({ SanctionedCost: '100', UtilizedAmount: '40' }),
      proj({ SanctionedCost: '100', UtilizedAmount: '60' }),
    ]);
    expect(r.pct).toBe(50);
  });
  it('guards divide-by-zero', () => {
    expect(getInstituteUtilization([proj({ SanctionedCost: '0' })]).pct).toBe(0);
  });
});

describe('getUtilizationByDivision', () => {
  it('groups pct per division sorted desc', () => {
    const r = getUtilizationByDivision([
      proj({ DivisionCode: 'A', SanctionedCost: '100', UtilizedAmount: '90' }),
      proj({ DivisionCode: 'B', SanctionedCost: '100', UtilizedAmount: '10' }),
    ]);
    expect(r[0]).toEqual({ label: 'A', value: 90 });
    expect(r[1]).toEqual({ label: 'B', value: 10 });
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/utils/directorMetrics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (project/finance portion)**

```typescript
// src/utils/directorMetrics.ts
import type { CategoryDatum } from '../components/viz/CategoryBar';
import type { GanttItem } from '../components/viz/GanttLite';
import { parseDate, diffInDays } from './dateUtils';
import { parseCost } from './parseCost';
import type { ProjectInfo } from '../types';

export interface DirectorThresholds {
  lowBurnPct: number;
  endingDays: number;
  amcDays: number;
}

export const DEFAULT_THRESHOLDS: DirectorThresholds = { lowBurnPct: 40, endingDays: 90, amcDays: 60 };

export const THRESHOLD_KEYS = {
  lowBurnPct: 'surya_director_low_burn_pct',
  endingDays: 'surya_director_ending_days',
  amcDays: 'surya_director_amc_days',
} as const;

export interface ProjectFlags {
  overdue: ProjectInfo[];
  endingSoon: ProjectInfo[];
  lowBurn: ProjectInfo[];
}

export function getProjectFlags(
  projects: ProjectInfo[],
  t: DirectorThresholds,
  now: Date = new Date(),
): ProjectFlags {
  const overdue: ProjectInfo[] = [];
  const endingSoon: ProjectInfo[] = [];
  const lowBurn: ProjectInfo[] = [];
  for (const p of projects) {
    if (p.ProjectStatus !== 'Active') continue;
    const end = parseDate(p.CompletioDate);
    if (end) {
      const days = diffInDays(end, now);
      if (days < 0) overdue.push(p);
      else if (days <= t.endingDays) endingSoon.push(p);
    }
    const sanctioned = parseCost(p.SanctionedCost);
    const utilized = parseCost(p.UtilizedAmount);
    if (sanctioned > 0 && (utilized / sanctioned) * 100 < t.lowBurnPct) lowBurn.push(p);
  }
  return { overdue, endingSoon, lowBurn };
}

export function getInstituteUtilization(projects: ProjectInfo[]): {
  sanctioned: number;
  utilized: number;
  pct: number;
} {
  let sanctioned = 0;
  let utilized = 0;
  for (const p of projects) {
    sanctioned += parseCost(p.SanctionedCost);
    utilized += parseCost(p.UtilizedAmount);
  }
  return { sanctioned, utilized, pct: sanctioned > 0 ? Math.round((utilized / sanctioned) * 100) : 0 };
}

export function getUtilizationByDivision(projects: ProjectInfo[]): CategoryDatum[] {
  const m = new Map<string, { s: number; u: number }>();
  for (const p of projects) {
    const k = p.DivisionCode || 'Unspecified';
    const cur = m.get(k) ?? { s: 0, u: 0 };
    cur.s += parseCost(p.SanctionedCost);
    cur.u += parseCost(p.UtilizedAmount);
    m.set(k, cur);
  }
  return Array.from(m, ([label, { s, u }]) => ({ label, value: s > 0 ? Math.round((u / s) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function getActiveProjectGantt(projects: ProjectInfo[]): GanttItem[] {
  return projects
    .filter((p) => p.ProjectStatus === 'Active')
    .map((p): GanttItem | null => {
      const s = parseDate(p.StartDate);
      const e = parseDate(p.CompletioDate);
      if (!s || !e) return null;
      return { name: (p.ProjectName || p.ProjectNo || '—').slice(0, 24), start: s, end: e };
    })
    .filter((x): x is GanttItem => x !== null)
    .slice(0, 15);
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/utils/directorMetrics.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/directorMetrics.ts src/utils/directorMetrics.test.ts
git commit -m "feat: director project/finance metric selectors"
```

---

### Task 3: directorMetrics — research selectors

**Files:**
- Modify: `src/utils/directorMetrics.ts`
- Modify: `src/utils/directorMetrics.test.ts`

- [ ] **Step 1: Append failing tests**

```typescript
// add imports
import { getPublicationTrend, getIpPipeline, getOutputByDivision, getAvgImpactByDivision, getOutputPerScientist } from './directorMetrics';
import type { ScientificOutput, IPIntelligence } from '../types';
import type { DivisionMetric } from './analytics';

const out = (o: Partial<ScientificOutput>): ScientificOutput => ({
  id: '', title: '', authors: [], journal: '', year: 2025, divisionCode: '', ...o,
});

describe('getPublicationTrend', () => {
  it('counts by year ascending', () => {
    const r = getPublicationTrend([out({ year: 2024 }), out({ year: 2025 }), out({ year: 2025 })]);
    expect(r).toEqual([{ label: '2024', value: 1 }, { label: '2025', value: 2 }]);
  });
});

describe('getIpPipeline', () => {
  it('returns Filed/Published/Granted counts', () => {
    const ip = (s: IPIntelligence['status']): IPIntelligence => ({
      id: '', title: '', type: 'Patent', status: s, filingDate: '', inventors: [], divisionCode: '',
    });
    const r = getIpPipeline([ip('Filed'), ip('Filed'), ip('Granted')]);
    expect(r).toEqual([{ name: 'Filed', value: 2 }, { name: 'Published', value: 0 }, { name: 'Granted', value: 1 }]);
  });
});

describe('getAvgImpactByDivision', () => {
  it('averages impact factor, ignores null', () => {
    const r = getAvgImpactByDivision([
      out({ divisionCode: 'A', impactFactor: 2 }),
      out({ divisionCode: 'A', impactFactor: 4 }),
      out({ divisionCode: 'A' }),
    ]);
    expect(r[0]).toEqual({ label: 'A', value: 3 });
  });
});

describe('getOutputPerScientist', () => {
  it('divides outputs by staff', () => {
    const metrics = [{ divCode: 'A', divName: '', staffCount: 2, activeProjectCount: 0, projectCount: 0, scientificOutputCount: 6, phdStudentCount: 0, equipmentCount: 0 }] as DivisionMetric[];
    expect(getOutputPerScientist(metrics)[0]).toEqual({ label: 'A', value: 3 });
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/utils/directorMetrics.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement (append to directorMetrics.ts)**

```typescript
import type { TrendPoint } from '../components/viz/TrendLine';
import type { FunnelStage } from '../components/viz/Funnel';
import type { ScientificOutput, IPIntelligence } from '../types';
import type { DivisionMetric } from './analytics';

const IP_STAGES: IPIntelligence['status'][] = ['Filed', 'Published', 'Granted'];

export function getPublicationTrend(outputs: ScientificOutput[]): TrendPoint[] {
  const m = new Map<number, number>();
  for (const o of outputs) {
    if (!o.year) continue;
    m.set(o.year, (m.get(o.year) ?? 0) + 1);
  }
  return Array.from(m, ([y, value]) => ({ label: String(y), value })).sort((a, b) => a.label.localeCompare(b.label));
}

export function getIpPipeline(ip: IPIntelligence[]): FunnelStage[] {
  return IP_STAGES.map((name) => ({ name, value: ip.filter((i) => i.status === name).length }));
}

export function getOutputByDivision(outputs: ScientificOutput[]): CategoryDatum[] {
  const m = new Map<string, number>();
  for (const o of outputs) {
    const k = o.divisionCode || 'Unspecified';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function getAvgImpactByDivision(outputs: ScientificOutput[]): CategoryDatum[] {
  const m = new Map<string, { sum: number; n: number }>();
  for (const o of outputs) {
    if (o.impactFactor == null) continue;
    const k = o.divisionCode || 'Unspecified';
    const c = m.get(k) ?? { sum: 0, n: 0 };
    c.sum += o.impactFactor;
    c.n += 1;
    m.set(k, c);
  }
  return Array.from(m, ([label, { sum, n }]) => ({ label, value: n > 0 ? Math.round((sum / n) * 100) / 100 : 0 })).sort(
    (a, b) => b.value - a.value,
  );
}

export function getOutputPerScientist(metrics: DivisionMetric[]): CategoryDatum[] {
  return metrics
    .map((m) => ({
      label: m.divCode,
      value: m.staffCount > 0 ? Math.round((m.scientificOutputCount / m.staffCount) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}
```

(Note: `CategoryDatum` already imported in Task 2. Add the new `import type` lines at the top with the others.)

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/utils/directorMetrics.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/directorMetrics.ts src/utils/directorMetrics.test.ts
git commit -m "feat: director research metric selectors"
```

---

### Task 4: directorMetrics — equipment/ops selectors

**Files:**
- Modify: `src/utils/directorMetrics.ts`
- Modify: `src/utils/directorMetrics.test.ts`

- [ ] **Step 1: Append failing tests**

```typescript
import { getEquipmentUptime, getEquipmentFlags, getAmcExpiryList, getTicketUrgencyMix, getOpsFlags } from './directorMetrics';
import type { Equipment, Ticket, ActionItem } from '../types';

const equip = (o: Partial<Equipment>): Equipment => ({
  UInsID: '', Name: '', EndUse: '', Division: '', IndenterName: '', OperatorName: '',
  Location: '', WorkingStatus: 'Working', Movable: '', RequirementInstallation: '',
  Justification: '', Remark: '', ...o,
});
const NOW2 = new Date('2026-05-24');

describe('getEquipmentUptime', () => {
  it('counts working vs total', () => {
    const r = getEquipmentUptime([equip({}), equip({ WorkingStatus: 'Under Maintenance' })]);
    expect(r).toEqual({ working: 1, total: 2 });
  });
});

describe('getEquipmentFlags', () => {
  it('flags non-working (not blank) and amc within window', () => {
    const r = getEquipmentFlags(
      [equip({ WorkingStatus: 'Under Maintenance' }), equip({ WorkingStatus: '' }), equip({ amc_end_date: '2026-06-10' })],
      DEFAULT_THRESHOLDS, NOW2,
    );
    expect(r.down).toHaveLength(1);
    expect(r.amcExpiring).toHaveLength(1);
  });
});

describe('getTicketUrgencyMix', () => {
  it('counts open tickets by urgency, drops zeros', () => {
    const tk = (o: Partial<Ticket>): Ticket => ({
      id: '', token: '', subject: '', category: 'Infrastructure', urgency: 'High',
      description: '', submitted_by: '', assigned_to: null, status: 'Open',
      created_at: '', updated_at: '', resolved_at: null, ...o,
    });
    const r = getTicketUrgencyMix([tk({ urgency: 'High' }), tk({ urgency: 'Critical', status: 'Closed' })]);
    expect(r).toEqual([{ label: 'High', value: 1 }]);
  });
});

describe('getOpsFlags', () => {
  it('flags overdue incomplete actions', () => {
    const a = (o: Partial<ActionItem>): ActionItem => ({
      id: '', meeting_id: null, source: 'manual', task: '', assigned_to: '',
      deadline: '2026-01-01', status: 'Pending', completed_at: null, notes: '', ...o,
    });
    const r = getOpsFlags([], [a({}), a({ status: 'Completed' })], NOW2);
    expect(r.overdueActions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/utils/directorMetrics.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement (append)**

```typescript
import { isWithinMonths } from './dateUtils';
import type { Equipment, Ticket, ActionItem, TicketUrgency } from '../types';

const WORKING = 'Working';

export function getEquipmentUptime(equipment: Equipment[]): { working: number; total: number } {
  return { working: equipment.filter((e) => e.WorkingStatus === WORKING).length, total: equipment.length };
}

export interface EquipmentFlags {
  down: Equipment[];
  amcExpiring: Equipment[];
}

export function getEquipmentFlags(
  equipment: Equipment[],
  t: DirectorThresholds,
  now: Date = new Date(),
): EquipmentFlags {
  const down = equipment.filter((e) => e.WorkingStatus && e.WorkingStatus !== WORKING);
  const amcExpiring = equipment.filter((e) => {
    const d = parseDate(e.amc_end_date);
    if (!d) return false;
    const days = diffInDays(d, now);
    return days >= 0 && days <= t.amcDays;
  });
  return { down, amcExpiring };
}

export function getAmcExpiryList(equipment: Equipment[], months = 6): Equipment[] {
  return equipment
    .filter((e) => {
      const d = parseDate(e.amc_end_date);
      return d ? isWithinMonths(d, months) : false;
    })
    .sort((a, b) => parseDate(a.amc_end_date)!.getTime() - parseDate(b.amc_end_date)!.getTime());
}

const URGENCY_ORDER: TicketUrgency[] = ['Critical', 'High', 'Medium', 'Low'];

function isOpenTicket(tk: Ticket): boolean {
  return tk.status === 'Open' || tk.status === 'InProgress';
}

export function getTicketUrgencyMix(tickets: Ticket[]): CategoryDatum[] {
  const open = tickets.filter(isOpenTicket);
  return URGENCY_ORDER.map((u) => ({ label: u, value: open.filter((tk) => tk.urgency === u).length })).filter(
    (d) => d.value > 0,
  );
}

export function getOpsFlags(
  tickets: Ticket[],
  actionItems: ActionItem[],
  now: Date = new Date(),
): { criticalTickets: Ticket[]; overdueActions: ActionItem[] } {
  const criticalTickets = tickets.filter(
    (tk) => isOpenTicket(tk) && (tk.urgency === 'High' || tk.urgency === 'Critical'),
  );
  const overdueActions = actionItems.filter((a) => {
    if (a.status === 'Completed') return false;
    const d = parseDate(a.deadline);
    return d ? diffInDays(d, now) < 0 : false;
  });
  return { criticalTickets, overdueActions };
}
```

(Merge the new `import type` names into the existing top-of-file import lines rather than duplicating.)

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/utils/directorMetrics.test.ts && npx tsc --noEmit`
Expected: PASS (all directorMetrics describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/utils/directorMetrics.ts src/utils/directorMetrics.test.ts
git commit -m "feat: director equipment/ops metric selectors"
```

---

### Task 5: ThresholdControls component

**Files:**
- Create: `src/components/dashboard/ThresholdControls.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/dashboard/ThresholdControls.tsx
import type { DirectorThresholds } from '../../utils/directorMetrics';

interface ThresholdControlsProps {
  thresholds: DirectorThresholds;
  onChange: (next: DirectorThresholds) => void;
  onReset: () => void;
}

interface FieldProps {
  label: string;
  value: number;
  suffix: string;
  onChange: (v: number) => void;
}

function Field({ label, value, suffix, onChange }: FieldProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-text-muted">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm text-text tabular-nums"
      />
      <span>{suffix}</span>
    </label>
  );
}

export function ThresholdControls({ thresholds, onChange, onReset }: ThresholdControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[12px] border border-border bg-surface px-4 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Alert thresholds</span>
      <Field label="Low burn" value={thresholds.lowBurnPct} suffix="%" onChange={(v) => onChange({ ...thresholds, lowBurnPct: v })} />
      <Field label="Ending in" value={thresholds.endingDays} suffix="days" onChange={(v) => onChange({ ...thresholds, endingDays: v })} />
      <Field label="AMC in" value={thresholds.amcDays} suffix="days" onChange={(v) => onChange({ ...thresholds, amcDays: v })} />
      <button onClick={onReset} className="ml-auto text-xs font-medium text-brand-blue hover:underline">
        Reset
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `text-brand-blue` is not a defined token, fall back to `text-text` — verify against `src/index.css`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ThresholdControls.tsx
git commit -m "feat: director threshold controls component"
```

---

### Task 6: AttentionStrip component

**Files:**
- Create: `src/components/dashboard/AttentionStrip.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/dashboard/AttentionStrip.tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { KpiTile } from '../viz/KpiTile';
import {
  getProjectFlags,
  getEquipmentFlags,
  getOpsFlags,
  type DirectorThresholds,
} from '../../utils/directorMetrics';

interface AttentionStripProps {
  thresholds: DirectorThresholds;
}

interface Flag {
  label: string;
  count: number;
  accent: 'negative' | 'warning';
  to: string;
}

export function AttentionStrip({ thresholds }: AttentionStripProps) {
  const { projects, equipment, tickets, actionItems } = useData();

  const flags = useMemo<Flag[]>(() => {
    const pf = getProjectFlags(projects, thresholds);
    const ef = getEquipmentFlags(equipment, thresholds);
    const of = getOpsFlags(tickets, actionItems);
    const all: Flag[] = [
      { label: 'Overdue projects', count: pf.overdue.length, accent: 'negative', to: '/projects' },
      { label: 'Ending soon', count: pf.endingSoon.length, accent: 'warning', to: '/projects' },
      { label: 'Low fund burn', count: pf.lowBurn.length, accent: 'warning', to: '/projects' },
      { label: 'Equipment down', count: ef.down.length, accent: 'negative', to: '/facilities' },
      { label: 'AMC expiring', count: ef.amcExpiring.length, accent: 'warning', to: '/facilities' },
      { label: 'Critical tickets', count: of.criticalTickets.length, accent: 'negative', to: '/helpdesk' },
      { label: 'Overdue actions', count: of.overdueActions.length, accent: 'warning', to: '/committees' },
    ];
    return all.filter((f) => f.count > 0);
  }, [projects, equipment, tickets, actionItems, thresholds]);

  const navigate = useNavigate();

  if (flags.length === 0) {
    return (
      <KpiTile
        label="Needs attention"
        value="All clear"
        sublabel="No flags at current thresholds"
        accent="positive"
        icon={<CheckCircle2 size={18} />}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {flags.map((f) => (
        <button key={f.label} onClick={() => navigate(f.to)} className="text-left focus:outline-none">
          <KpiTile label={f.label} value={f.count} accent={f.accent} icon={<AlertTriangle size={18} />} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/AttentionStrip.tsx
git commit -m "feat: director attention strip with drill navigation"
```

---

### Task 7: ProjectFinanceSection

**Files:**
- Create: `src/components/dashboard/ProjectFinanceSection.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/dashboard/ProjectFinanceSection.tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { ChartCard } from '../viz/ChartCard';
import { ProgressRing } from '../viz/ProgressRing';
import { CategoryBar } from '../viz/CategoryBar';
import { Treemap } from '../viz/Treemap';
import { GanttLite } from '../viz/GanttLite';
import { parseCost } from '../../utils/parseCost';
import {
  getInstituteUtilization,
  getUtilizationByDivision,
  getActiveProjectGantt,
} from '../../utils/directorMetrics';

export function ProjectFinanceSection() {
  const { projects } = useData();
  const navigate = useNavigate();

  const util = useMemo(() => getInstituteUtilization(projects), [projects]);
  const byDiv = useMemo(() => getUtilizationByDivision(projects), [projects]);
  const gantt = useMemo(() => getActiveProjectGantt(projects), [projects]);
  const sponsorers = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projects) {
      const k = p.SponsorerName || 'Unspecified';
      m.set(k, (m.get(k) ?? 0) + parseCost(p.SanctionedCost));
    }
    return Array.from(m, ([name, size]) => ({ name, size })).filter((d) => d.size > 0).sort((a, b) => b.size - a.size).slice(0, 12);
  }, [projects]);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-text uppercase tracking-wide">Project &amp; Finance</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Fund utilization" subtitle="institute-wide, utilized vs sanctioned">
          <div className="flex items-center justify-center min-h-[200px]">
            <ProgressRing value={util.utilized} max={util.sanctioned} size={160} label="utilized" />
          </div>
        </ChartCard>
        <ChartCard title="Utilization % by division">
          <CategoryBar data={byDiv} horizontal onSelect={() => navigate('/divisions')} />
        </ChartCard>
        <ChartCard title="Active projects timeline" subtitle="start → completion (top 15)" className="lg:col-span-2">
          <GanttLite items={gantt} onClick={() => navigate('/projects')} />
        </ChartCard>
        <ChartCard title="Top sponsorers" subtitle="sized by sanctioned cost" className="lg:col-span-2">
          <Treemap data={sponsorers} onClick={() => navigate('/projects')} />
        </ChartCard>
      </div>
    </section>
  );
}
```

(Verify `Treemap` prop names against `src/components/viz/Treemap.tsx` — it takes `data: { name; size }[]` and `onClick`. Adjust if the signature differs.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ProjectFinanceSection.tsx
git commit -m "feat: director project/finance section"
```

---

### Task 8: ResearchSection

**Files:**
- Create: `src/components/dashboard/ResearchSection.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/dashboard/ResearchSection.tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { ChartCard } from '../viz/ChartCard';
import { TrendLine } from '../viz/TrendLine';
import { Funnel } from '../viz/Funnel';
import { CategoryBar } from '../viz/CategoryBar';
import { getDivisionMetrics } from '../../utils/analytics';
import {
  getPublicationTrend,
  getIpPipeline,
  getAvgImpactByDivision,
  getOutputPerScientist,
} from '../../utils/directorMetrics';

export function ResearchSection() {
  const { scientificOutputs, ipIntelligence, divisions, staff, projects, phDStudents, equipment } = useData();
  const navigate = useNavigate();

  const trend = useMemo(() => getPublicationTrend(scientificOutputs), [scientificOutputs]);
  const pipeline = useMemo(() => getIpPipeline(ipIntelligence), [ipIntelligence]);
  const avgImpact = useMemo(() => getAvgImpactByDivision(scientificOutputs), [scientificOutputs]);
  const perScientist = useMemo(() => {
    const metrics = getDivisionMetrics({ divisions, staff, projects, phDStudents, scientificOutputs, equipment });
    return getOutputPerScientist(metrics);
  }, [divisions, staff, projects, phDStudents, scientificOutputs, equipment]);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-text uppercase tracking-wide">Research Productivity</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Publications by year">
          <TrendLine data={trend} yLabel="outputs" />
        </ChartCard>
        <ChartCard title="IP pipeline" subtitle="Filed → Published → Granted">
          <Funnel data={pipeline} />
        </ChartCard>
        <ChartCard title="Avg impact factor by division">
          <CategoryBar data={avgImpact} horizontal onSelect={() => navigate('/divisions')} />
        </ChartCard>
        <ChartCard title="Output per scientist by division">
          <CategoryBar data={perScientist} horizontal onSelect={() => navigate('/divisions')} />
        </ChartCard>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/ResearchSection.tsx
git commit -m "feat: director research section"
```

---

### Task 9: EquipmentOpsSection

**Files:**
- Create: `src/components/dashboard/EquipmentOpsSection.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/dashboard/EquipmentOpsSection.tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { ChartCard } from '../viz/ChartCard';
import { ProgressRing } from '../viz/ProgressRing';
import { CategoryDonut } from '../viz/CategoryDonut';
import { formatDate, parseDate } from '../../utils/dateUtils';
import {
  getEquipmentUptime,
  getAmcExpiryList,
  getTicketUrgencyMix,
  getOpsFlags,
} from '../../utils/directorMetrics';

export function EquipmentOpsSection() {
  const { equipment, tickets, actionItems } = useData();
  const navigate = useNavigate();

  const uptime = useMemo(() => getEquipmentUptime(equipment), [equipment]);
  const amc = useMemo(() => getAmcExpiryList(equipment, 6), [equipment]);
  const urgency = useMemo(() => getTicketUrgencyMix(tickets), [tickets]);
  const overdueActions = useMemo(() => getOpsFlags(tickets, actionItems).overdueActions, [tickets, actionItems]);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-text uppercase tracking-wide">Equipment &amp; Operations</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Equipment uptime" subtitle="working vs total">
          <div className="flex items-center justify-center min-h-[200px]">
            <ProgressRing value={uptime.working} max={uptime.total} size={160} label="working" />
          </div>
        </ChartCard>
        <ChartCard title="Open tickets by urgency">
          <CategoryDonut data={urgency} onSelect={() => navigate('/helpdesk')} />
        </ChartCard>
        <ChartCard title="AMC expiring (next 6 months)">
          {amc.length === 0 ? (
            <p className="text-xs text-text-muted italic py-8 text-center">No AMC contracts expiring.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {amc.slice(0, 8).map((e) => (
                <li key={e.UInsID} className="flex justify-between py-2 cursor-pointer hover:bg-surface-hover px-1" onClick={() => navigate(`/facilities/${e.UInsID}`)}>
                  <span className="truncate text-text">{e.Name}</span>
                  <span className="text-text-muted tabular-nums">{formatDate(parseDate(e.amc_end_date))}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="Overdue action items">
          {overdueActions.length === 0 ? (
            <p className="text-xs text-text-muted italic py-8 text-center">No overdue actions.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {overdueActions.slice(0, 8).map((a) => (
                <li key={a.id} className="flex justify-between py-2 cursor-pointer hover:bg-surface-hover px-1" onClick={() => navigate('/committees')}>
                  <span className="truncate text-text">{a.task}</span>
                  <span className="text-text-muted tabular-nums">{formatDate(parseDate(a.deadline))}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </section>
  );
}
```

(Verify `surface-hover` token exists in `src/index.css`; if not use `hover:bg-[var(--color-surface-hover)]` or drop the hover class.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/EquipmentOpsSection.tsx
git commit -m "feat: director equipment/ops section"
```

---

### Task 10: Assemble DirectorView

**Files:**
- Modify: `src/pages/dashboards/DirectorView.tsx`

- [ ] **Step 1: Rewrite DirectorView**

Replace the file with: header → compact KPI strip (keep the existing 5 `KpiCard`s) → `ThresholdControls` → `AttentionStrip` → 3 sections → division breakdown table (keep existing). Remove the division scorecards grid and the division comparison `BarChart`. Threshold state owns localStorage.

```tsx
import { useEffect, useState } from 'react';
import { Users, Briefcase, BookOpen, Wrench, Microscope } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { KpiCard } from '../../components/ui/KpiCard';
import { ThresholdControls } from '../../components/dashboard/ThresholdControls';
import { AttentionStrip } from '../../components/dashboard/AttentionStrip';
import { ProjectFinanceSection } from '../../components/dashboard/ProjectFinanceSection';
import { ResearchSection } from '../../components/dashboard/ResearchSection';
import { EquipmentOpsSection } from '../../components/dashboard/EquipmentOpsSection';
import {
  DEFAULT_THRESHOLDS,
  THRESHOLD_KEYS,
  type DirectorThresholds,
} from '../../utils/directorMetrics';

function loadThresholds(): DirectorThresholds {
  const read = (key: string, fallback: number) => {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    lowBurnPct: read(THRESHOLD_KEYS.lowBurnPct, DEFAULT_THRESHOLDS.lowBurnPct),
    endingDays: read(THRESHOLD_KEYS.endingDays, DEFAULT_THRESHOLDS.endingDays),
    amcDays: read(THRESHOLD_KEYS.amcDays, DEFAULT_THRESHOLDS.amcDays),
  };
}

export function DirectorView() {
  const { staff, projects, phDStudents, equipment, scientificOutputs, divisions } = useData();
  const [thresholds, setThresholds] = useState<DirectorThresholds>(loadThresholds);

  useEffect(() => {
    localStorage.setItem(THRESHOLD_KEYS.lowBurnPct, String(thresholds.lowBurnPct));
    localStorage.setItem(THRESHOLD_KEYS.endingDays, String(thresholds.endingDays));
    localStorage.setItem(THRESHOLD_KEYS.amcDays, String(thresholds.amcDays));
  }, [thresholds]);

  const activeProjects = projects.filter((p) => p.ProjectStatus === 'Active').length;

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">Director's Dashboard</h1>
        <p className="text-[#87867f] mt-1 text-sm font-medium">CSIR-AMPRI — Institute-Wide Decision Cockpit</p>
      </div>

      {/* Compact KPI strip (retained counts) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Staff" value={staff.length} icon={<Users size={18} />} sublabel="Permanent personnel" />
        <KpiCard label="Active Projects" value={activeProjects} icon={<Briefcase size={18} />} sublabel={`of ${projects.length} total`} />
        <KpiCard label="PhD Students" value={phDStudents.length} icon={<BookOpen size={18} />} sublabel="Enrolled scholars" />
        <KpiCard label="Equipment" value={equipment.length} icon={<Wrench size={18} />} sublabel="Instruments & facilities" />
        <KpiCard label="Scientific Outputs" value={scientificOutputs.length} icon={<Microscope size={18} />} sublabel="Publications & IP" />
      </div>

      <ThresholdControls
        thresholds={thresholds}
        onChange={setThresholds}
        onReset={() => setThresholds(DEFAULT_THRESHOLDS)}
      />

      <AttentionStrip thresholds={thresholds} />
      <ProjectFinanceSection />
      <ResearchSection />
      <EquipmentOpsSection />

      {/* Division breakdown table (retained) */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f0eee6]">
          <h2 className="text-base font-semibold text-[#4d4c48] uppercase tracking-wide">Division Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f5f4ed]">
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Division</th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Name</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Current Strength</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Sanctioned</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#87867f]">Head of Division</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eee6]">
              {divisions.map((div) => (
                <tr key={div.divCode} className="hover:bg-[#f5f4ed] transition-colors">
                  <td className="px-6 py-4 font-semibold text-[#c96442] font-mono text-xs">{div.divCode}</td>
                  <td className="px-6 py-4 text-[#4d4c48] font-medium">{div.divName}</td>
                  <td className="px-6 py-4 text-right text-[#141413] font-semibold">{div.divCurrentStrength}</td>
                  <td className="px-6 py-4 text-right text-[#87867f]">{div.divSanctionedstrength}</td>
                  <td className="px-6 py-4 text-right text-[#4d4c48]">{div.divHoD}</td>
                </tr>
              ))}
              {divisions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[#87867f] text-xs italic">No division data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npx eslint src/pages/dashboards/DirectorView.tsx src/components/dashboard/ && npx tsc --noEmit`
Expected: no errors. (`getDivisionMetrics` import removed from DirectorView since scorecards/chart gone — confirm no unused-import errors.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboards/DirectorView.tsx
git commit -m "feat: assemble director decision cockpit"
```

---

### Task 11: Full verification

- [ ] **Step 1: Run full suite + lint + build**

Run: `npx vitest run && npx eslint src/ && npx tsc --noEmit`
Expected: all tests pass, no lint/type errors.

- [ ] **Step 2: Manual verify in browser**

Start dev server (`npm run dev`), log in as a Director (dev bypass `admin@dev.local`), confirm:
- Compact KPI strip renders the 5 counts.
- Threshold inputs change → attention flags recompute live; values persist on reload.
- With empty data: "All clear" tile + charts show ChartEmpty (no crash).
- Each flag tile and chart click navigates to the correct route (`/projects`, `/facilities`, `/helpdesk`, `/committees`, `/divisions`, `/facilities/:id`).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: director cockpit verification adjustments"
```

---

## Self-Review Notes

- **Spec coverage:** attention strip (all 7 flags), 3 domains with every listed chart, tunable thresholds + localStorage, compact KPI strip + retained table, scorecards/comparison-chart removal, drill-down-only — all mapped to tasks 2-10.
- **No schema/RLS/write changes** — confirmed; only reads via `useData()` and navigation.
- **Verify-before-use flagged inline:** `Treemap` props (Task 7), `brand-blue`/`surface-hover` tokens (Tasks 5/9), `formatDate(parseDate(...))` accepts `Date | null`.

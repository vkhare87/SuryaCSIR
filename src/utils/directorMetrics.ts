import type { CategoryDatum } from '../components/viz/CategoryBar';
import type { GanttItem } from '../components/viz/GanttLite';
import type { TrendPoint } from '../components/viz/TrendLine';
import type { FunnelStage } from '../components/viz/Funnel';
import { parseDate, diffInDays, isWithinMonths } from './dateUtils';
import { parseCost } from './parseCost';
import type { DivisionMetric } from './analytics';
import type {
  ProjectInfo,
  ScientificOutput,
  IPIntelligence,
  Equipment,
  Ticket,
  ActionItem,
  TicketUrgency,
} from '../types';

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

// --- 1. Project & Finance ---

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
  return Array.from(m, ([label, { s, u }]) => ({ label, value: s > 0 ? Math.round((u / s) * 100) : 0 })).sort(
    (a, b) => b.value - a.value,
  );
}

export interface GanttWindow {
  start: Date;
  end: Date;
}

/** Calendar window starting Jan 1 of the current year, spanning `years` full years. */
export function getGanttWindow(years: number, now: Date = new Date()): GanttWindow {
  const y = now.getFullYear();
  return { start: new Date(y, 0, 1), end: new Date(y + years - 1, 11, 31, 23, 59, 59) };
}

export function getActiveProjectGantt(projects: ProjectInfo[], window?: GanttWindow): GanttItem[] {
  const items = projects
    .filter((p) => p.ProjectStatus === 'Active')
    .map((p): { name: string; start: Date; end: Date } | null => {
      const s = parseDate(p.StartDate);
      const e = parseDate(p.CompletioDate);
      if (!s || !e || e.getTime() < s.getTime()) return null;
      return { name: (p.ProjectName || p.ProjectNo || '—').slice(0, 24), start: s, end: e };
    })
    .filter((x): x is { name: string; start: Date; end: Date } => x !== null);

  if (!window) return items.slice(0, 15);

  const ws = window.start.getTime();
  const we = window.end.getTime();
  return items
    .filter((it) => it.end.getTime() >= ws && it.start.getTime() <= we)
    .map((it) => ({
      name: it.name,
      start: new Date(Math.max(it.start.getTime(), ws)),
      end: new Date(Math.min(it.end.getTime(), we)),
    }))
    .slice(0, 15);
}

// --- 2. Research Productivity ---

const IP_STAGES: IPIntelligence['status'][] = ['Filed', 'Published', 'Granted'];

/**
 * Publication counts per year, ascending. When `years` is given, restrict to the last
 * `years` calendar years (ending this year) and emit a point for every year, zero-filled.
 */
export function getPublicationTrend(
  outputs: ScientificOutput[],
  years?: number,
  now: Date = new Date(),
): TrendPoint[] {
  const counts = new Map<number, number>();
  for (const o of outputs) {
    if (!o.year) continue;
    counts.set(o.year, (counts.get(o.year) ?? 0) + 1);
  }
  if (years == null) {
    return Array.from(counts, ([y, value]) => ({ label: String(y), value })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }
  const cy = now.getFullYear();
  const startY = cy - years + 1;
  const pts: TrendPoint[] = [];
  for (let y = startY; y <= cy; y++) pts.push({ label: String(y), value: counts.get(y) ?? 0 });
  return pts;
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

// --- 3. Equipment & Operations ---

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

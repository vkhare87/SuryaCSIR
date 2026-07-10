import { parseDate } from '../../utils/dateUtils';
import { parseCost } from '../../utils/parseCost';
import type { ProjectInfo } from '../../types';

// SPA twin of rag/analytics.py _project_budget_variance — same thresholds so
// Ask SURYA and this panel never disagree on what counts as a breach.
const VARIANCE_PP = 25;
const EXHAUSTION_PCT = 90;

export type BudgetFlag = 'overrun' | 'exhaustion' | 'ahead' | 'behind';

export interface BudgetWatchRow {
  project: ProjectInfo;
  flag: BudgetFlag;
  utilizationPct: number;
  elapsedPct: number | null;
  variancePp: number | null;
}

/** Review triggers, not verdicts: R&D spend is stepwise (equipment purchases),
 * so a linear-burn variance is a prompt to look, never proof of a problem. */
export function budgetWatch(projects: ProjectInfo[], today: Date = new Date()): BudgetWatchRow[] {
  const rows: BudgetWatchRow[] = [];
  for (const p of projects) {
    if (['completed', 'closed'].includes(p.ProjectStatus.trim().toLowerCase())) continue;
    const sanctioned = parseCost(p.SanctionedCost);
    if (sanctioned <= 0) continue;
    const utilizationPct = parseCost(p.UtilizedAmount) / sanctioned * 100;

    if (utilizationPct > 100) {
      rows.push({ project: p, flag: 'overrun', utilizationPct, elapsedPct: null, variancePp: null });
      continue;
    }
    const start = parseDate(p.StartDate);
    const end = parseDate(p.CompletioDate);
    if (start && end && end > start) {
      const elapsedPct = Math.max(0, Math.min(100,
        (today.getTime() - start.getTime()) / (end.getTime() - start.getTime()) * 100));
      const variancePp = utilizationPct - elapsedPct;
      if (Math.abs(variancePp) >= VARIANCE_PP) {
        rows.push({
          project: p, flag: variancePp > 0 ? 'ahead' : 'behind',
          utilizationPct, elapsedPct, variancePp,
        });
      }
    } else if (utilizationPct >= EXHAUSTION_PCT) {
      rows.push({ project: p, flag: 'exhaustion', utilizationPct, elapsedPct: null, variancePp: null });
    }
  }
  const severity = (r: BudgetWatchRow) =>
    r.flag === 'overrun' ? Infinity : Math.abs(r.variancePp ?? r.utilizationPct);
  return rows.sort((a, b) => severity(b) - severity(a));
}

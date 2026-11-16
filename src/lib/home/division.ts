import type { ProjectInfo } from '../../types';
import { isActiveProject } from '../projects/stage';
import { parseDate, diffInDays } from '../../utils/dateUtils';
import { parseCost } from '../../utils/parseCost';
import type { HomeMilestone } from './api';
import { localIso } from './today';

export const ENDING_SOON_DAYS = 60;
/** Money use may trail time use by this many points before the project is flagged. */
export const MONEY_GAP_POINTS = 25;

export interface ProjectReading {
  /** Share of the project's time that is used, 0–100; null when a date is missing. */
  timePct: number | null;
  /** Share of the sanctioned money that is used, 0–100; null when no sanctioned cost or no spent amount is recorded. */
  moneyPct: number | null;
  /** Why the head should look. Empty when the project is on course. */
  reasons: string[];
  /** Worst first: late beats ending soon beats a money gap. */
  weight: number;
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Reads one running project: time used, money used, and the reasons it needs the head. */
export function readProject(p: ProjectInfo, milestones: HomeMilestone[], now: Date = new Date()): ProjectReading {
  const start = parseDate(p.StartDate);
  const end = parseDate(p.CompletioDate);
  const sanctioned = parseCost(p.SanctionedCost);
  const timePct = start && end && end > start
    ? clampPct((diffInDays(now, start) / diffInDays(end, start)) * 100) : null;
  const utilized = parseCost(p.UtilizedAmount);
  // No spent amount on record is missing data, not zero spending: give no figure and no flag.
  const moneyPct = sanctioned > 0 && utilized > 0 ? clampPct((utilized / sanctioned) * 100) : null;

  const reasons: string[] = [];
  let weight = 0;
  if (!isActiveProject(p)) return { timePct, moneyPct, reasons, weight };

  const daysLeft = end ? diffInDays(end, now) : null;
  if (daysLeft !== null && daysLeft < 0) {
    reasons.push(`${-daysLeft} days past its end date`);
    weight += 100;
  } else if (daysLeft !== null && daysLeft <= ENDING_SOON_DAYS) {
    reasons.push(`ends in ${daysLeft} days`);
    weight += 40;
  }
  const today = localIso(now);
  const late = milestones.filter(m => (m.status === 'PLANNED' || m.status === 'PROPOSED') && m.targetDate < today).length;
  if (late > 0) {
    reasons.push(`${late} ${late === 1 ? 'milestone' : 'milestones'} late`);
    weight += 60;
  }
  if (timePct !== null && moneyPct !== null && timePct - moneyPct > MONEY_GAP_POINTS) {
    reasons.push(`time ${timePct}% used, money ${moneyPct}%`);
    weight += 20;
  }
  return { timePct, moneyPct, reasons, weight };
}

export interface FlaggedProject { project: ProjectInfo; reading: ProjectReading }

/** Running projects that need the head, worst first, and the count of those on course. */
export function projectsByException(
  projects: ProjectInfo[], milestones: HomeMilestone[], now: Date = new Date(),
): { flagged: FlaggedProject[]; onCourse: number } {
  const byProject = new Map<string, HomeMilestone[]>();
  for (const m of milestones) byProject.set(m.projectId, [...(byProject.get(m.projectId) ?? []), m]);
  const running = projects.filter(isActiveProject);
  const flagged = running
    .map(project => ({ project, reading: readProject(project, byProject.get(project.ProjectID) ?? [], now) }))
    .filter(f => f.reading.reasons.length > 0)
    .sort((a, b) => b.reading.weight - a.reading.weight);
  return { flagged, onCourse: running.length - flagged.length };
}

export interface DivisionRow {
  code: string;
  running: number;
  /** Running projects that need attention. */
  flagged: number;
  /** Vacant sanctioned posts; null when no posts are entered for the division. */
  vacant: number | null;
}

/** One row per division that has a flagged project or a vacant post, worst first, and the count of the rest. */
export function divisionRollup(
  projects: ProjectInfo[], milestones: HomeMilestone[], vacantByDivision: ReadonlyMap<string, number>,
  now: Date = new Date(),
): { rows: DivisionRow[]; onCourse: number } {
  const byProject = new Map<string, HomeMilestone[]>();
  for (const m of milestones) byProject.set(m.projectId, [...(byProject.get(m.projectId) ?? []), m]);
  const rows = new Map<string, DivisionRow>();
  const row = (code: string) => {
    if (!rows.has(code)) rows.set(code, { code, running: 0, flagged: 0, vacant: vacantByDivision.get(code) ?? null });
    return rows.get(code) as DivisionRow;
  };
  for (const code of vacantByDivision.keys()) row(code);
  for (const p of projects) {
    if (!isActiveProject(p) || !p.DivisionCode) continue;
    const r = row(p.DivisionCode);
    r.running += 1;
    if (readProject(p, byProject.get(p.ProjectID) ?? [], now).reasons.length > 0) r.flagged += 1;
  }
  const all = [...rows.values()];
  const needs = all.filter(r => r.flagged > 0 || (r.vacant ?? 0) > 0)
    .sort((a, b) => b.flagged - a.flagged || (b.vacant ?? 0) - (a.vacant ?? 0) || a.code.localeCompare(b.code));
  return { rows: needs, onCourse: all.length - needs.length };
}

import { normalizePersonName } from '../../utils/analytics';
import { parseDate } from '../../utils/dateUtils';
import type {
  ScientificOutput, IPIntelligence, ProjectInfo, PhDStudent, TechTransfer,
} from '../../types';

// Descriptive trajectory only — per-year activity counts and WORD flags.
// Deliberately NO composite number, index, or rank of a person: the codebase's
// standing position (see proposals/trackRecord.ts) is that scoring people
// creates gaming incentives and is a governance question, not a math one. The
// 2026 PMS guidelines place scoring exclusively with committees. Flags help a
// human notice a pattern; they never stand in for a score.

export interface YearCounts {
  year: number;
  publications: number;
  projectsStarted: number;
  ipFiled: number;
  studentsSupervised: number;   // PhD supervisions active/started that year (by StartDate proxy: enrollment not dated, so counted once in the current window — see note)
  techTransfers: number;
}

export type TrajectoryFlag =
  | 'output-rising'
  | 'output-flat'
  | 'output-declining'
  | 'new-collaboration-cluster'
  | 'supervision-load-up'
  | 'budget-overrun-history'
  | 'duty-days-below-90-candidate';

export interface ScientistTrajectory {
  series: YearCounts[];
  flags: TrajectoryFlag[];
}

function yearOf(raw: string | null | undefined): number | null {
  const d = raw ? parseDate(raw) : null;
  return d ? d.getFullYear() : null;
}

/**
 * Per-year activity series for one scientist plus descriptive pattern flags.
 * `dutyDays` is the recorded value from the current PMS report (manual entry —
 * no attendance module); passing a value below 90 raises the candidate flag so
 * an evaluator checks the 90-day minimum-duty rule.
 */
export function buildTrajectory(params: {
  scientistName: string;
  publications: ScientificOutput[];
  ipAssets: IPIntelligence[];
  linkedProjects: ProjectInfo[];
  supervisedPhDs: PhDStudent[];
  techTransfers: TechTransfer[];
  /** Co-author pair count in the most recent year vs prior — drives the
   * new-collaboration-cluster flag. Optional; omit to skip that flag. */
  recentCollaboratorCount?: number;
  priorCollaboratorCount?: number;
  dutyDays?: number | null;
}): ScientistTrajectory {
  const {
    scientistName, publications, ipAssets, linkedProjects, supervisedPhDs,
    techTransfers, recentCollaboratorCount, priorCollaboratorCount, dutyDays,
  } = params;
  const nameKey = normalizePersonName(scientistName);

  const byYear = new Map<number, YearCounts>();
  const bump = (year: number | null, field: keyof Omit<YearCounts, 'year'>) => {
    if (year === null) return;
    const row = byYear.get(year) ?? {
      year, publications: 0, projectsStarted: 0, ipFiled: 0,
      studentsSupervised: 0, techTransfers: 0,
    };
    row[field] += 1;
    byYear.set(year, row);
  };

  for (const p of publications) bump(p.year || null, 'publications');
  for (const i of ipAssets) bump(yearOf(i.filingDate), 'ipFiled');
  for (const pr of linkedProjects) {
    if (nameKey && normalizePersonName(pr.PrincipalInvestigator).includes(nameKey)) {
      bump(yearOf(pr.StartDate), 'projectsStarted');
    }
  }
  for (const t of techTransfers) bump(yearOf(t.agreementDate), 'techTransfers');
  // PhD enrollments carry no reliable start year on the record; count active
  // supervisions into the latest series year so the load is visible without
  // inventing a date. ponytail: refine if enrollment dates get captured.

  const series = [...byYear.values()].sort((a, b) => a.year - b.year);
  if (series.length && supervisedPhDs.length) {
    series[series.length - 1].studentsSupervised = supervisedPhDs.length;
  }

  const flags: TrajectoryFlag[] = [];

  // Output trend: total activity (pubs + ip + projects + transfers) in the last
  // year vs the previous year, when at least two years of data exist.
  if (series.length >= 2) {
    const total = (y: YearCounts) => y.publications + y.ipFiled + y.projectsStarted + y.techTransfers;
    const last = total(series[series.length - 1]);
    const prev = total(series[series.length - 2]);
    if (last > prev) flags.push('output-rising');
    else if (last < prev) flags.push('output-declining');
    else flags.push('output-flat');
  }

  if (recentCollaboratorCount !== undefined && priorCollaboratorCount !== undefined
      && recentCollaboratorCount > priorCollaboratorCount) {
    flags.push('new-collaboration-cluster');
  }

  if (supervisedPhDs.length >= 4) flags.push('supervision-load-up');

  const overrun = linkedProjects.some(p => {
    const s = parseFloat(String(p.SanctionedCost).replace(/[^0-9.]/g, ''));
    const u = parseFloat(String(p.UtilizedAmount).replace(/[^0-9.]/g, ''));
    return s > 0 && u > s;
  });
  if (overrun) flags.push('budget-overrun-history');

  if (dutyDays !== undefined && dutyDays !== null && dutyDays < 90) {
    flags.push('duty-days-below-90-candidate');
  }

  return { series, flags };
}

import { personNamesMatch } from '../../utils/analytics';
import { parseCost } from '../../utils/parseCost';
import type { ProjectInfo } from '../../types';
import { isCompletedProject } from '../projects/stage';

// Descriptive facts only — deliberately NO composite score. Small-n (a PI may
// have 3 past projects) makes a score noise, and scoring scientists creates
// gaming incentives. Governance question, not a math one.
export interface TrackRecordRow {
  project: ProjectInfo;
  utilizationPct: number | null;
  extended: boolean;
}

export interface PiTrackRecord {
  rows: TrackRecordRow[];
  completedCount: number;
  extendedCount: number;
}

const NO_EXTENSION = new Set(['', 'no', 'nil', 'na', 'n/a', 'none', '-', '--']);

function isExtended(extension: string): boolean {
  return !NO_EXTENSION.has(extension.trim().toLowerCase());
}

/** Past projects of a PI with budget/timeline facts. `linked` = the projects
 * are already the PI's own (by link), so the name is not matched. */
export function piTrackRecord(projects: ProjectInfo[], piName: string, linked = false): PiTrackRecord | null {
  if (!linked && !piName.trim()) return null;
  const rows: TrackRecordRow[] = projects
    .filter(p => linked || personNamesMatch(p.PrincipalInvestigator, piName))
    .map(p => {
      const sanctioned = parseCost(p.SanctionedCost);
      const utilized = parseCost(p.UtilizedAmount);
      return {
        project: p,
        utilizationPct: sanctioned > 0 && utilized > 0 ? utilized / sanctioned * 100 : null,
        extended: isExtended(p.Extension),
      };
    });
  if (rows.length === 0) return null;
  return {
    rows,
    completedCount: rows.filter(r => isCompletedProject(r.project)).length,
    extendedCount: rows.filter(r => r.extended).length,
  };
}

import type { ChartFilter } from '../../utils/useChartFilter';
import type { ProjectInfo } from '../../types';

export const PROJECT_DIM_LABELS: Record<string, string> = {
  fundType: 'Fund type', status: 'Status', sponsorer: 'Sponsorer', pi: 'PI', division: 'Division',
};

/** Value a project shows under each chart dimension — blanks bucket the same way charts label them. */
export function projectDimValue(p: ProjectInfo, dim: string): string | null {
  switch (dim) {
    case 'fundType':  return p.FundType || 'Unspecified';
    case 'status':    return p.ProjectStatus;
    case 'sponsorer': return p.SponsorerName || 'Unspecified';
    case 'pi':        return p.PrincipalInvestigator || 'Unassigned';
    case 'division':  return p.DivisionCode;
    default:          return null;
  }
}

/** Shared by analytics charts and the projects list so their counts agree. Unknown dims match everything. */
export function matchesProjectFilter(p: ProjectInfo, f: ChartFilter | null): boolean {
  if (!f || !(f.dim in PROJECT_DIM_LABELS)) return true;
  return projectDimValue(p, f.dim) === f.value;
}

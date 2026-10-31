import type { ChartFilter } from '../../utils/useChartFilter';
import type { StaffMember } from '../../types';

export const STAFF_DIM_LABELS: Record<string, string> = {
  division: 'Division', designation: 'Designation', group: 'Group',
};

/** Shared by Staff Analytics charts and the Human Capital list so their counts agree. Unknown dims match everything. */
export function matchesStaffFilter(s: StaffMember, f: ChartFilter | null): boolean {
  if (!f) return true;
  switch (f.dim) {
    case 'division':    return (s.Division || 'Unspecified') === f.value;
    case 'designation': return (s.Designation || 'Unspecified') === f.value;
    case 'group':       return (s.Group || 'Unspecified') === f.value;
    default:            return true;
  }
}

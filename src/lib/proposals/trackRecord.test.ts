import { describe, it, expect } from 'vitest';
import { piTrackRecord } from './trackRecord';
import type { ProjectInfo } from '../../types';

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    ProjectID: over.ProjectNo ?? 'p', ProjectNo: 'p', ProjectName: 'P', FundType: '',
    SponsorerType: '', SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Completed',
    StartDate: '', CompletioDate: '', SanctionedCost: '', UtilizedAmount: '',
    PrincipalInvestigator: 'Dr. A. K. Sharma', DivisionCode: 'CMD', Extension: '',
    ApprovalAuthority: '', ...over,
  };
}

describe('piTrackRecord', () => {
  it('matches PI across name variants and computes utilization + extension facts', () => {
    const r = piTrackRecord([
      proj({ ProjectNo: 'A', PrincipalInvestigator: 'A. K. Sharma', SanctionedCost: '100', UtilizedAmount: '80' }),
      proj({ ProjectNo: 'B', PrincipalInvestigator: 'Dr. B. Gupta' }),
      proj({ ProjectNo: 'C', SanctionedCost: '200', UtilizedAmount: '210', Extension: 'Yes, 6 months' }),
    ], 'Dr. A. K. Sharma');
    expect(r).not.toBeNull();
    expect(r!.rows.map(x => x.project.ProjectNo).sort()).toEqual(['A', 'C']);
    const a = r!.rows.find(x => x.project.ProjectNo === 'A')!;
    expect(a.utilizationPct).toBe(80);
    expect(a.extended).toBe(false);
    const c = r!.rows.find(x => x.project.ProjectNo === 'C')!;
    expect(c.utilizationPct).toBe(105);
    expect(c.extended).toBe(true);
    expect(r!.extendedCount).toBe(1);
    expect(r!.completedCount).toBe(2);
  });

  it('treats missing cost data as utilization null, never zero', () => {
    const r = piTrackRecord([proj({ SanctionedCost: '', UtilizedAmount: '' })], 'A. K. Sharma');
    expect(r!.rows[0].utilizationPct).toBeNull();
  });

  it('extension flags: blank, "no", "nil", "-" are NOT extensions', () => {
    const r = piTrackRecord([
      proj({ ProjectNo: 'A', Extension: 'No' }),
      proj({ ProjectNo: 'B', Extension: 'NIL' }),
      proj({ ProjectNo: 'C', Extension: '-' }),
      proj({ ProjectNo: 'D', Extension: '1 year' }),
    ], 'A. K. Sharma');
    expect(r!.extendedCount).toBe(1);
  });

  it('returns null when PI has no past projects or name is blank', () => {
    expect(piTrackRecord([proj({})], 'Dr. Nobody')).toBeNull();
    expect(piTrackRecord([proj({})], '')).toBeNull();
  });
});

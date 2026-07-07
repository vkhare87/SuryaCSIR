import { describe, it, expect } from 'vitest';
import { commercialisationSummary } from './commercialisation';
import type { IPIntelligence, ProjectInfo } from '../../types';

function ip(over: Partial<IPIntelligence>): IPIntelligence {
  return { id: 'i', title: 'IP', type: 'Patent', status: 'Filed', filingDate: '2024-01-01',
           inventors: [], divisionCode: 'CMD', ...over };
}
function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    ProjectID: 'p', ProjectNo: 'p', ProjectName: '', FundType: '', SponsorerType: '',
    SponsorerName: '', ProjectCategory: '', ProjectStatus: '', StartDate: '',
    CompletioDate: '', SanctionedCost: '0', UtilizedAmount: '', PrincipalInvestigator: '',
    DivisionCode: '', Extension: '', ApprovalAuthority: '', ...over,
  };
}

describe('commercialisationSummary', () => {
  it('counts granted patents as licensable assets', () => {
    const s = commercialisationSummary(
      [ip({ id: 'a', status: 'Granted', title: 'Nano filter' }), ip({ id: 'b', status: 'Filed' })],
      [],
    );
    expect(s.grantedPatents).toBe(1);
    expect(s.filedPatents).toBe(1);
    expect(s.licensableAssets).toEqual([{ title: 'Nano filter', type: 'Patent', divisionCode: 'CMD' }]);
  });

  it('sums external sponsored income', () => {
    const s = commercialisationSummary([], [
      proj({ FundType: 'Consultancy', SanctionedCost: '1200000' }),
      proj({ FundType: 'Sponsored', SanctionedCost: '800000' }),
      proj({ FundType: 'GAP', SanctionedCost: '999' }),
    ]);
    expect(s.externalProjects).toBe(2);
    expect(s.externalValue).toBe(2000000);
  });
});

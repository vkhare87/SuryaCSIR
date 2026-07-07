import { describe, it, expect } from 'vitest';
import { commercialisationSummary } from './commercialisation';
import type { IPIntelligence, ProjectInfo, TechTransfer } from '../../types';

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

function tt(over: Partial<TechTransfer>): TechTransfer {
  return { id: 't', technologyTitle: 'T', licensee: 'L', licenseeType: 'Industry',
           agreementType: 'License', agreementDate: '2025-01-01', status: 'Active',
           divisionCode: 'SCMD', ...over };
}

describe('commercialisationSummary — tech transfers', () => {
  it('counts and sums non-terminated transfers', () => {
    const s = commercialisationSummary([], [], [
      tt({ valueLakhs: 25.5 }), tt({ valueLakhs: 10 }),
      tt({ status: 'Terminated', valueLakhs: 99 }),
    ]);
    expect(s.transferCount).toBe(2);
    expect(s.transferValueLakhs).toBe(35.5);
  });
  it('defaults to zero when transfers omitted', () => {
    const s = commercialisationSummary([], []);
    expect(s.transferCount).toBe(0);
    expect(s.transferValueLakhs).toBe(0);
  });
});

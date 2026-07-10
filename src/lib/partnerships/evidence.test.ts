import { describe, it, expect } from 'vitest';
import { mouEvidence } from './evidence';
import type { MoU, ProjectInfo, TechTransfer } from '../../types';

function mou(over: Partial<MoU>): MoU {
  return {
    id: 'm1', partnerName: 'IIT Delhi', partnerType: 'Academic', purpose: '',
    signedDate: '2022-01-01', validUntil: '2027-01-01', status: 'Active',
    divisionCode: 'CMD', ...over,
  };
}

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    ProjectID: over.ProjectNo ?? 'p', ProjectNo: 'p', ProjectName: 'P', FundType: '',
    SponsorerType: '', SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Ongoing',
    StartDate: '2023-06-01', CompletioDate: '', SanctionedCost: '', UtilizedAmount: '',
    PrincipalInvestigator: '', DivisionCode: 'CMD', Extension: '', ApprovalAuthority: '',
    ...over,
  };
}

function tt(over: Partial<TechTransfer>): TechTransfer {
  return {
    id: 't1', technologyTitle: 'T', licensee: 'IIT Delhi', licenseeType: 'Industry',
    agreementType: 'License', agreementDate: '2023-06-01', status: 'Active',
    divisionCode: 'CMD', ...over,
  };
}

describe('mouEvidence', () => {
  it('finds linked project, sponsor-matched projects in window, licensee-matched transfers', () => {
    const e = mouEvidence(
      mou({ linkedProjectNo: 'LP1' }),
      [
        proj({ ProjectNo: 'LP1', SponsorerName: 'DST' }),
        proj({ ProjectNo: 'SP1', SponsorerName: 'IIT-Delhi' }),      // hyphen variant matches
        proj({ ProjectNo: 'OUT', SponsorerName: 'IIT Delhi', StartDate: '2021-01-01' }), // pre-window
        proj({ ProjectNo: 'NONE', SponsorerName: 'CSIR HQ' }),
      ],
      [tt({}), tt({ id: 't2', licensee: 'BHEL', agreementDate: '2023-06-01' })],
    );
    expect(e.linkedProject?.ProjectNo).toBe('LP1');
    expect(e.sponsoredProjects.map(p => p.ProjectNo)).toEqual(['SP1']);
    expect(e.techTransfers.map(t => t.id)).toEqual(['t1']);
    expect(e.total).toBe(3);
  });

  it('linked project counts even when its dates fall outside the window', () => {
    const e = mouEvidence(
      mou({ linkedProjectNo: 'LP1' }),
      [proj({ ProjectNo: 'LP1', StartDate: '2019-01-01' })],
      [],
    );
    expect(e.linkedProject?.ProjectNo).toBe('LP1');
    expect(e.total).toBe(1);
  });

  it('no double count: linked project excluded from sponsor matches', () => {
    const e = mouEvidence(
      mou({ linkedProjectNo: 'LP1' }),
      [proj({ ProjectNo: 'LP1', SponsorerName: 'IIT Delhi' })],
      [],
    );
    expect(e.total).toBe(1);
    expect(e.sponsoredProjects).toEqual([]);
  });

  it('unparseable MOU dates: matches counted regardless of window', () => {
    const e = mouEvidence(
      mou({ signedDate: '', validUntil: '' }),
      [proj({ ProjectNo: 'SP1', SponsorerName: 'IIT Delhi', StartDate: '2015-01-01' })],
      [],
    );
    expect(e.sponsoredProjects).toHaveLength(1);
  });

  it('short partner tokens do not false-positive on unrelated sponsors', () => {
    const e = mouEvidence(
      mou({ partnerName: 'GE' }),
      [proj({ SponsorerName: 'GENERAL ELECTRIC INDIA' }), proj({ ProjectNo: 'X', SponsorerName: 'GEOLOGY DEPT' })],
      [],
    );
    // substring 'ge' would match both — normalized whole-string containment must not
    expect(e.sponsoredProjects.map(p => p.ProjectNo)).toEqual([]);
  });
});

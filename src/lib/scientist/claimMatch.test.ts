import { describe, it, expect } from 'vitest';
import { matchClaims } from './claimMatch';
import type { ScientificOutput, IPIntelligence, ProjectInfo } from '../../types';
import type { PMSReportSection } from '../../types/pms';

function section(sectionKey: string, items: Record<string, string>[]): PMSReportSection {
  return { id: sectionKey, reportId: 'r1', sectionKey, data: { items }, updatedAt: '' };
}

const pub = (over: Partial<ScientificOutput>): ScientificOutput => ({
  id: 'p1', title: 'Graphene supercapacitor electrodes', authors: ['A. Researcher'],
  journal: 'J. Mat', year: 2025, divisionCode: 'AMD', ...over,
});
const ip = (over: Partial<IPIntelligence>): IPIntelligence => ({
  id: 'i1', title: 'Self-healing coating', type: 'Patent', status: 'Filed',
  filingDate: '2025-03-01', inventors: ['A. Researcher'], divisionCode: 'AMD', ...over,
});
const proj = (over: Partial<ProjectInfo>): ProjectInfo => ({
  ProjectID: 'PR1', ProjectNo: 'P-1', ProjectName: 'Lightweight Mg alloy chassis',
  FundType: '', SponsorerType: '', SponsorerName: '', ProjectCategory: '',
  ProjectStatus: 'Active', StartDate: '2024-01-01', CompletioDate: '', SanctionedCost: '',
  UtilizedAmount: '', PrincipalInvestigator: 'A. Researcher', DivisionCode: 'AMD',
  Extension: '', ApprovalAuthority: '', ...over,
});

const base = {
  scientistName: 'A. Researcher',
  scientificOutputs: [] as ScientificOutput[],
  ipIntelligence: [] as IPIntelligence[],
  projects: [] as ProjectInfo[],
};

describe('matchClaims', () => {
  it('corroborates a publication claim that matches a record (title + year)', () => {
    const r = matchClaims({
      ...base,
      sections: [section('section_i1', [{ title: 'Graphene supercapacitor electrodes', year: '2025' }])],
      scientificOutputs: [pub({})],
    });
    expect(r.claims[0].status).toBe('corroborated');
    expect(r.claims[0].matchedRecordId).toBe('p1');
    expect(r.corroborated).toBe(1);
  });

  it('tolerates punctuation / word-order noise in titles', () => {
    const r = matchClaims({
      ...base,
      sections: [section('section_i1', [{ title: 'Supercapacitor electrodes: graphene-based!', year: '2025' }])],
      scientificOutputs: [pub({})],
    });
    expect(r.claims[0].status).toBe('corroborated');
  });

  it('flags no-matching-record when nothing matches and year is within data horizon', () => {
    const r = matchClaims({
      ...base,
      sections: [section('section_i1', [{ title: 'Totally unrelated quantum work', year: '2024' }])],
      scientificOutputs: [pub({ year: 2025 })],  // horizon 2025, claim 2024 <= horizon
    });
    expect(r.claims[0].status).toBe('no-matching-record');
    expect(r.noMatchingRecord).toBe(1);
  });

  it('flags new-to-system when claim year is after the latest institutional record', () => {
    const r = matchClaims({
      ...base,
      sections: [section('section_i1', [{ title: 'Brand new 2026 study', year: '2026' }])],
      scientificOutputs: [pub({ year: 2024 })],  // horizon 2024, claim 2026 > horizon
    });
    expect(r.claims[0].status).toBe('new-to-system');
    expect(r.newToSystem).toBe(1);
  });

  it('does NOT corroborate same title but different year (guards duplicates across years)', () => {
    const r = matchClaims({
      ...base,
      sections: [section('section_i1', [{ title: 'Graphene supercapacitor electrodes', year: '2023' }])],
      scientificOutputs: [pub({ year: 2025 })],  // record 2025, claim 2023
    });
    expect(r.claims[0].status).toBe('no-matching-record');
  });

  it('only counts the appraisee\'s own records, not the whole institute', () => {
    const r = matchClaims({
      ...base,
      sections: [section('section_i1', [{ title: 'Graphene supercapacitor electrodes', year: '2025' }])],
      scientificOutputs: [pub({ authors: ['Someone Else'] })],
    });
    // record exists but belongs to another author → not corroborated
    expect(r.claims[0].status).not.toBe('corroborated');
  });

  it('matches a name variant (Dr. prefix) between claim owner and record author', () => {
    const r = matchClaims({
      ...base,
      scientistName: 'Dr. A. Researcher',
      sections: [section('section_i1', [{ title: 'Graphene supercapacitor electrodes', year: '2025' }])],
      scientificOutputs: [pub({ authors: ['A. Researcher'] })],
    });
    expect(r.claims[0].status).toBe('corroborated');
  });

  it('corroborates project and IP claims against their record types', () => {
    const r = matchClaims({
      ...base,
      sections: [
        section('section_i2', [{ title: 'Lightweight Mg alloy chassis', fundingBody: '', amount: '', role: 'PI' }]),
        section('section_i3', [{ title: 'Self-healing coating', filingNo: '', status: 'Filed', year: '2025' }]),
      ],
      projects: [proj({})],
      ipIntelligence: [ip({})],
    });
    const kinds = Object.fromEntries(r.claims.map(c => [c.kind, c.status]));
    expect(kinds.project).toBe('corroborated');
    expect(kinds.ip).toBe('corroborated');
  });

  it('skips blank-title rows', () => {
    const r = matchClaims({
      ...base,
      sections: [section('section_i1', [{ title: '  ', year: '2025' }, { title: '', year: '' }])],
    });
    expect(r.claims).toHaveLength(0);
  });

  it('returns empty summary when no cross-checkable sections present', () => {
    const r = matchClaims({ ...base, sections: [section('section_iv', [])] });
    expect(r.claims).toHaveLength(0);
    expect(r.corroborated + r.noMatchingRecord + r.newToSystem).toBe(0);
  });
});

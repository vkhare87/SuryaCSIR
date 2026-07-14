import { describe, it, expect } from 'vitest';
import { divisionFreshness, instituteFreshness } from './freshness';
import type { DossierData } from './dossier';
import type { DivisionInfo, StaffMember, ProjectInfo, ScientificOutput } from '../../types';

const NOW = 2026;

function division(over: Partial<DivisionInfo>): DivisionInfo {
  return {
    divCode: 'CMD', divName: 'Advanced Materials', divDescription: '', divResearchAreas: '',
    divHoD: '', divHoDID: '', divSanctionedstrength: 10, divCurrentStrength: 8,
    divStatus: 'Active', ...over,
  };
}

function staff(over: Partial<StaffMember>): StaffMember {
  return {
    ID: 's1', LabCode: '', EmployeeType: '', Name: 'Dr. A', Designation: 'Scientist',
    Group: '', Division: 'CMD', DoAPP: '', DOJ: '', DOB: '', Cat: '', AppointmentType: '',
    Level: '', CoreArea: '', Expertise: '', Email: 'a@ampri.res.in', Ext: '', VidwanID: '',
    ReportingID: '', HighestQualification: '', Gender: '', ...over,
  };
}

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    ProjectID: over.ProjectNo ?? 'p', ProjectNo: 'p', ProjectName: 'Proj', FundType: '',
    SponsorerType: '', SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Active',
    StartDate: '2025-01-15', CompletioDate: '', SanctionedCost: '', UtilizedAmount: '',
    PrincipalInvestigator: 'Dr. A', DivisionCode: 'CMD', Extension: '', ApprovalAuthority: '',
    ...over,
  };
}

const pub = (year: number): ScientificOutput => ({
  id: `pub${year}`, title: `Paper ${year}`, authors: ['Dr. A'], journal: 'J', year,
  divisionCode: 'CMD',
});

function data(over: Partial<DossierData>): DossierData {
  return {
    staff: [], projects: [], scientificOutputs: [], ipIntelligence: [],
    mous: [], techTransfers: [], phDStudents: [], ...over,
  };
}

describe('divisionFreshness', () => {
  it('scores 100 with all core sections present and fields filled', () => {
    const f = divisionFreshness(division({}), data({
      staff: [staff({})], projects: [proj({})], scientificOutputs: [pub(2026)],
    }), NOW);
    expect(f.completeness).toBe(100);
    expect(f.gaps).toEqual([]);
  });

  it('scores 0 and reads empty with no records at all', () => {
    const f = divisionFreshness(division({}), data({}), NOW);
    expect(f.completeness).toBe(0);
    expect(f.staleness).toBe('empty');
    expect(f.latestRecordYear).toBeNull();
    expect(f.gaps).toContain('no staff recorded');
    expect(f.gaps).toContain('no projects recorded');
    expect(f.gaps).toContain('no publications recorded');
  });

  it('ignores records from other divisions', () => {
    const f = divisionFreshness(division({}), data({
      staff: [staff({ Division: 'OTHER' })],
      projects: [proj({ DivisionCode: 'OTHER' })],
      scientificOutputs: [{ ...pub(2026), divisionCode: 'OTHER' }],
    }), NOW);
    expect(f.completeness).toBe(0);
    expect(f.latestRecordYear).toBeNull();
  });

  it('flags missing PI and start date as field gaps', () => {
    const f = divisionFreshness(division({}), data({
      projects: [proj({ PrincipalInvestigator: '', StartDate: '' }), proj({ ProjectNo: 'q' })],
    }), NOW);
    expect(f.gaps).toContain('1/2 projects missing PI');
    expect(f.gaps).toContain('1/2 projects missing start date');
  });

  it('bands staleness by latest record year', () => {
    const at = (year: number) =>
      divisionFreshness(division({}), data({ scientificOutputs: [pub(year)] }), NOW).staleness;
    expect(at(2026)).toBe('fresh');
    expect(at(2025)).toBe('fresh');
    expect(at(2023)).toBe('aging');
    expect(at(2022)).toBe('stale');
  });

  it('takes latest year across projects, publications, and IP filings', () => {
    const f = divisionFreshness(division({}), data({
      projects: [proj({ StartDate: '2020-06-01' })],
      scientificOutputs: [pub(2021)],
      ipIntelligence: [{
        id: 'ip1', title: 'Patent', type: 'Patent', status: 'Filed',
        filingDate: '2024-03-01', inventors: [], divisionCode: 'CMD',
      }],
    }), NOW);
    expect(f.latestRecordYear).toBe(2024);
  });
});

describe('instituteFreshness', () => {
  it('sorts worst first', () => {
    const full = data({ staff: [staff({})], projects: [proj({})], scientificOutputs: [pub(2026)] });
    const out = instituteFreshness(
      [division({ divCode: 'CMD' }), division({ divCode: 'EMP', divName: 'Empty Div' })],
      full, NOW,
    );
    expect(out[0].divCode).toBe('EMP');
    expect(out[1].divCode).toBe('CMD');
  });
});

import { describe, it, expect } from 'vitest';
import { buildDossier } from './dossier';
import type { DivisionInfo, StaffMember, ProjectInfo, ScientificOutput, IPIntelligence, MoU, TechTransfer, PhDStudent } from '../../types';

const division: DivisionInfo = {
  divCode: 'CMD', divName: 'Advanced Materials', divDescription: '', divResearchAreas: '',
  divHoD: 'Dr. H. Singh', divHoDID: 'S1', divSanctionedstrength: 10, divCurrentStrength: 8,
  divStatus: 'Active',
};

function staff(over: Partial<StaffMember>): StaffMember {
  return {
    ID: 's1', LabCode: '', EmployeeType: '', Name: 'Dr. A', Designation: 'Scientist',
    Group: '', Division: 'CMD', DoAPP: '', DOJ: '', DOB: '', Cat: '', AppointmentType: '',
    Level: '', CoreArea: 'Coatings', Expertise: '', Email: '', Ext: '', VidwanID: '',
    ReportingID: '', HighestQualification: '', Gender: '', ...over,
  };
}

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    ProjectID: over.ProjectNo ?? 'p', ProjectNo: 'p', ProjectName: 'Proj', FundType: '',
    SponsorerType: '', SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Completed',
    StartDate: '2020-01-15', CompletioDate: '', SanctionedCost: '100', UtilizedAmount: '',
    PrincipalInvestigator: 'Dr. A', DivisionCode: 'CMD', Extension: '', ApprovalAuthority: '',
    ...over,
  };
}

const pub = (year: number): ScientificOutput => ({
  id: `pub${year}`, title: `Paper ${year}`, authors: ['Dr. A'], journal: 'J', year,
  divisionCode: 'CMD',
});

const data = {
  staff: [staff({}), staff({ ID: 's2', Division: 'OTHER' })],
  projects: [proj({}), proj({ ProjectNo: 'X', DivisionCode: 'OTHER' })],
  scientificOutputs: [pub(2020), pub(2023)],
  ipIntelligence: [] as IPIntelligence[],
  mous: [] as MoU[],
  techTransfers: [] as TechTransfer[],
  phDStudents: [] as PhDStudent[],
};

describe('buildDossier', () => {
  it('includes only the division slice and all section headers', () => {
    const md = buildDossier(division, data);
    expect(md).toContain('# Handover dossier — Advanced Materials (CMD)');
    expect(md).toContain('Dr. A');
    expect(md).not.toContain('OTHER');
    for (const h of ['## Staff', '## Projects', '## Publications', '## Record coverage']) {
      expect(md).toContain(h);
    }
  });

  it('discloses zero-record years between first and last activity', () => {
    const md = buildDossier(division, data);
    // pubs 2020 & 2023, project 2020 -> 2021, 2022 have no records
    expect(md).toMatch(/2021.*no records/i);
    expect(md).toMatch(/2022.*no records/i);
    expect(md).toContain('gaps may reflect missing/un-ingested records, not inactivity');
  });

  it('handles a division with no data without throwing', () => {
    const md = buildDossier(division, {
      staff: [], projects: [], scientificOutputs: [], ipIntelligence: [],
      mous: [], techTransfers: [], phDStudents: [],
    });
    expect(md).toContain('None recorded');
  });
});

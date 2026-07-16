import { describe, it, expect } from 'vitest';
import { buildScientistDossier } from './dossier';
import { buildScientistBrief } from './brief';
import type {
  StaffMember, ProjectInfo, ScientificOutput, IPIntelligence,
} from '../../types';
import type { PMSReport, PMSReportSection } from '../../types/pms';

const member: StaffMember = {
  ID: 'S1', LabCode: '', EmployeeType: '', Name: 'A. Researcher', Designation: 'Scientist E',
  Group: 'Scientific', Division: 'AMD', DoAPP: '', DOJ: '', DOB: '', Cat: '', AppointmentType: '',
  Level: '', CoreArea: 'Energy Materials', Expertise: '', Email: 'a@x.in', Ext: '', VidwanID: '',
  ReportingID: '', HighestQualification: '', Gender: '',
};

const pub = (year: number, cites: number): ScientificOutput => ({
  id: `p${year}`, title: `Study ${year}`, authors: ['A. Researcher'], journal: 'j', year,
  citationCount: cites, divisionCode: 'AMD',
});
const activeProject: ProjectInfo = {
  ProjectID: 'PR1', ProjectNo: 'P-1', ProjectName: 'Graphene electrodes', FundType: '',
  SponsorerType: '', SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Active',
  StartDate: '2024-01-01', CompletioDate: '', SanctionedCost: '', UtilizedAmount: '',
  PrincipalInvestigator: 'A. Researcher', DivisionCode: 'AMD', Extension: '', ApprovalAuthority: '',
};
const ipRec: IPIntelligence = {
  id: 'i1', title: 'Coating', type: 'Patent', status: 'Granted', filingDate: '2024-06-01',
  inventors: ['A. Researcher'], divisionCode: 'AMD',
};

const baseData = {
  staffId: 'S1',
  staff: [member],
  projects: [activeProject],
  projectStaff: [],
  phDStudents: [],
  scientificOutputs: [pub(2023, 10), pub(2024, 25)],
  ipIntelligence: [ipRec],
  equipment: [],
  techTransfers: [],
  mous: [],
};

describe('buildScientistDossier', () => {
  it('returns null for an unknown staff id', () => {
    expect(buildScientistDossier({ ...baseData, staffId: 'ZZZ' })).toBeNull();
  });

  it('assembles present work, impact, and trajectory', () => {
    const d = buildScientistDossier(baseData)!;
    expect(d.member.ID).toBe('S1');
    expect(d.present.activeProjects).toHaveLength(1);
    expect(d.impact.publications).toHaveLength(2);
    expect(d.impact.citationTotal).toBe(35);
    expect(d.impact.grantedPatents).toBe(1);
    expect(d.trajectory.series.length).toBeGreaterThan(0);
  });

  it('records name-based join disclosure', () => {
    const d = buildScientistDossier(baseData)!;
    expect(d.joinBasis.publications).toBe('name');
    expect(d.joinBasis.staff).toBe('id');
  });

  it('runs claim corroboration when a report + sections are supplied', () => {
    const report = { id: 'r1', dutyDays: 120 } as PMSReport;
    const sections: PMSReportSection[] = [
      { id: 's1', reportId: 'r1', sectionKey: 'section_i1',
        data: { items: [{ title: 'Study 2024', year: '2024' }] }, updatedAt: '' },
    ];
    const d = buildScientistDossier({ ...baseData, report, sections })!;
    expect(d.claims).not.toBeNull();
    expect(d.claims!.corroborated).toBe(1);
  });

  it('leaves claims null when no report supplied', () => {
    expect(buildScientistDossier(baseData)!.claims).toBeNull();
  });

  it('raises the duty-days flag from a report below 90', () => {
    const report = { id: 'r1', dutyDays: 40 } as PMSReport;
    const d = buildScientistDossier({ ...baseData, report, sections: [] })!;
    expect(d.trajectory.flags).toContain('duty-days-below-90-candidate');
  });
});

describe('buildScientistBrief', () => {
  it('renders a markdown brief with disclosure footer and no score', () => {
    const d = buildScientistDossier(baseData)!;
    const md = buildScientistBrief(d);
    expect(md).toContain('# Pre-evaluation brief — A. Researcher');
    expect(md).toContain('How to read this brief');
    expect(md).toContain('≠ false');
    // honesty guard: brief must never present a score/grade for the person
    expect(md.toLowerCase()).not.toContain('recommended score');
    expect(md.toLowerCase()).not.toContain('suggested score');
  });

  it('shows corroboration counts when claims present', () => {
    const report = { id: 'r1', dutyDays: 120 } as PMSReport;
    const sections: PMSReportSection[] = [
      { id: 's1', reportId: 'r1', sectionKey: 'section_i1',
        data: { items: [{ title: 'Study 2024', year: '2024' }, { title: 'Ghost paper', year: '2024' }] }, updatedAt: '' },
    ];
    const d = buildScientistDossier({ ...baseData, report, sections })!;
    const md = buildScientistBrief(d);
    expect(md).toContain('1 corroborated');
    expect(md).toContain('No matching institutional record');
  });
});

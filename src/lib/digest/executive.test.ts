import { describe, it, expect } from 'vitest';
import { buildExecutiveDigest, type ExecutiveDigestData } from './executive';
import type { ProjectInfo, PhDMilestone, VacancyAdvertisement } from '../../types';

const TODAY = new Date('2026-07-12');

const project = (over: Partial<ProjectInfo>): ProjectInfo => ({
  ProjectID: 'P1', ProjectNo: 'GAP-001', ProjectName: 'Test', FundType: '',
  SponsorerType: '', SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Ongoing',
  StartDate: '2025-01-01', CompletioDate: '2027-01-01', SanctionedCost: '',
  UtilizedAmount: '', PrincipalInvestigator: '', DivisionCode: 'CMD',
  Extension: '', ApprovalAuthority: '', ...over,
});

const milestone = (over: Partial<PhDMilestone>): PhDMilestone => ({
  id: 'm1', enrollmentNo: 'E1', milestone: 'Coursework', ...over,
});

const vacancy = (over: Partial<VacancyAdvertisement>): VacancyAdvertisement => ({
  id: 'v1', title: 'JRF Post', description: '', designation: 'JRF', division: 'CMD',
  numberOfPositions: 1, qualifications: '', applicationDeadline: '2026-07-20',
  createdAt: '2026-06-01', status: 'Open', staffCategory: 'Project',
  driveStage: 'Advertised', ...over,
});

const empty: ExecutiveDigestData = { projects: [], phdMilestones: [], vacancyAdvertisements: [] };

describe('buildExecutiveDigest', () => {
  it('returns nothing for non-steward roles', () => {
    const data = { ...empty, projects: [project({ CompletioDate: '2026-07-01' })] };
    expect(buildExecutiveDigest('Scientist', null, data, TODAY)).toEqual([]);
  });

  it('flags active projects past end date as urgent', () => {
    const data = { ...empty, projects: [project({ CompletioDate: '2026-07-01' })] };
    const items = buildExecutiveDigest('Director', null, data, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('urgent');
    expect(items[0].title).toContain('1 active project');
    expect(items[0].detail).toContain('GAP-001');
    expect(items[0].href).toBe('/projects');
  });

  it('flags projects ending within 60 days as warning', () => {
    const data = { ...empty, projects: [project({ CompletioDate: '2026-08-15' })] };
    const items = buildExecutiveDigest('Director', null, data, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('warning');
  });

  it('ignores completed/closed projects and unparseable dates', () => {
    const data = { ...empty, projects: [
      project({ CompletioDate: '2026-07-01', ProjectStatus: 'Completed' }),
      project({ ProjectID: 'P2', ProjectNo: 'GAP-002', CompletioDate: '' }),
    ] };
    expect(buildExecutiveDigest('Director', null, data, TODAY)).toEqual([]);
  });

  it('scopes DivisionHead to own division projects and skips institute rules', () => {
    const data: ExecutiveDigestData = {
      projects: [
        project({ CompletioDate: '2026-07-01', DivisionCode: 'CMD' }),
        project({ ProjectID: 'P2', ProjectNo: 'GAP-002', CompletioDate: '2026-07-01', DivisionCode: 'LWMD' }),
      ],
      phdMilestones: [milestone({ dueDate: '2026-06-01' })],
      vacancyAdvertisements: [vacancy({})],
    };
    const items = buildExecutiveDigest('DivisionHead', 'CMD', data, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].detail).toContain('GAP-001');
    expect(items[0].detail).not.toContain('GAP-002');
  });

  it('flags overdue PhD milestones (unset completedDate, past due) for stewards', () => {
    const data = { ...empty, phdMilestones: [
      milestone({ dueDate: '2026-06-01' }),
      milestone({ id: 'm2', dueDate: '2026-06-01', completedDate: '2026-06-10' }),
      milestone({ id: 'm3' }), // no dueDate — ignored
    ] };
    const items = buildExecutiveDigest('Director', null, data, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('1 PhD milestone');
    expect(items[0].href).toBe('/phd');
  });

  it('flags open vacancies with deadline within 14 days', () => {
    const data = { ...empty, vacancyAdvertisements: [
      vacancy({ applicationDeadline: '2026-07-20' }),
      vacancy({ id: 'v2', applicationDeadline: '2026-09-01' }),
      vacancy({ id: 'v3', applicationDeadline: '2026-07-20', status: 'Closed' }),
    ] };
    const items = buildExecutiveDigest('Director', null, data, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('1 vacancy');
    expect(items[0].href).toBe('/recruitment');
  });
});

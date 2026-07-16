import { describe, it, expect } from 'vitest';
import { buildTrajectory } from './trajectory';
import type { ScientificOutput, IPIntelligence, ProjectInfo, PhDStudent, TechTransfer } from '../../types';

const pub = (year: number): ScientificOutput => ({
  id: `p${year}${Math.random()}`, title: 't', authors: ['A. Researcher'],
  journal: 'j', year, divisionCode: 'AMD',
});
const student = (n: number): PhDStudent => ({
  EnrollmentNo: `E${n}`, StudentName: `S${n}`, Specialization: '', SupervisorName: 'A. Researcher',
  CoSupervisorName: '', FellowshipDetails: '', CurrentStatus: 'Ongoing', ThesisTitle: '',
  ProjectNo: '', DivisionCode: 'AMD',
});
const projectOverrun = (): ProjectInfo => ({
  ProjectID: 'PR1', ProjectNo: 'P-1', ProjectName: 'x', FundType: '', SponsorerType: '',
  SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Active', StartDate: '2024-01-01',
  CompletioDate: '', SanctionedCost: '1000000', UtilizedAmount: '1500000',
  PrincipalInvestigator: 'A. Researcher', DivisionCode: 'AMD', Extension: '', ApprovalAuthority: '',
});

const base = {
  scientistName: 'A. Researcher',
  publications: [] as ScientificOutput[],
  ipAssets: [] as IPIntelligence[],
  linkedProjects: [] as ProjectInfo[],
  supervisedPhDs: [] as PhDStudent[],
  techTransfers: [] as TechTransfer[],
};

describe('buildTrajectory', () => {
  it('builds a per-year publication series', () => {
    const t = buildTrajectory({ ...base, publications: [pub(2023), pub(2024), pub(2024)] });
    expect(t.series.find(y => y.year === 2024)?.publications).toBe(2);
    expect(t.series.find(y => y.year === 2023)?.publications).toBe(1);
  });

  it('flags output-rising when the last year exceeds the previous', () => {
    const t = buildTrajectory({ ...base, publications: [pub(2023), pub(2024), pub(2024)] });
    expect(t.flags).toContain('output-rising');
  });

  it('flags output-declining when the last year is lower', () => {
    const t = buildTrajectory({ ...base, publications: [pub(2023), pub(2023), pub(2024)] });
    expect(t.flags).toContain('output-declining');
  });

  it('flags output-flat when equal', () => {
    const t = buildTrajectory({ ...base, publications: [pub(2023), pub(2024)] });
    expect(t.flags).toContain('output-flat');
  });

  it('emits no trend flag with fewer than two years', () => {
    const t = buildTrajectory({ ...base, publications: [pub(2024)] });
    expect(t.flags.some(f => f.startsWith('output-'))).toBe(false);
  });

  it('flags supervision-load-up at 4+ students', () => {
    const t = buildTrajectory({ ...base, supervisedPhDs: [student(1), student(2), student(3), student(4)] });
    expect(t.flags).toContain('supervision-load-up');
  });

  it('flags budget-overrun-history when utilized exceeds sanctioned', () => {
    const t = buildTrajectory({ ...base, linkedProjects: [projectOverrun()] });
    expect(t.flags).toContain('budget-overrun-history');
  });

  it('flags duty-days-below-90-candidate only when duty days recorded below 90', () => {
    expect(buildTrajectory({ ...base, dutyDays: 45 }).flags).toContain('duty-days-below-90-candidate');
    expect(buildTrajectory({ ...base, dutyDays: 120 }).flags).not.toContain('duty-days-below-90-candidate');
    expect(buildTrajectory({ ...base, dutyDays: null }).flags).not.toContain('duty-days-below-90-candidate');
  });

  it('flags new-collaboration-cluster when recent collaborators exceed prior', () => {
    const t = buildTrajectory({ ...base, recentCollaboratorCount: 5, priorCollaboratorCount: 2 });
    expect(t.flags).toContain('new-collaboration-cluster');
  });

  it('never emits a numeric score field (descriptive only)', () => {
    const t = buildTrajectory({ ...base, publications: [pub(2024)] });
    expect(t).not.toHaveProperty('score');
    expect(t).not.toHaveProperty('rank');
  });
});

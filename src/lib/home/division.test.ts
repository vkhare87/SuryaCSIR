import { describe, expect, it } from 'vitest';
import type { ProjectInfo } from '../../types';
import type { HomeMilestone } from './api';
import { projectsByException, readProject } from './division';

const NOW = new Date(2026, 10, 13, 9, 0); // 13 Nov 2026
const project = (id: string, over: Partial<ProjectInfo> = {}): ProjectInfo => ({
  ProjectID: id, ProjectNo: id, ProjectName: `Project ${id}`, ProjectStatus: 'Ongoing', stage: 'ACTIVE',
  StartDate: '2025-11-13', CompletioDate: '2027-11-13', SanctionedCost: '100', UtilizedAmount: '50', ...over,
} as ProjectInfo);
const milestone = (projectId: string, targetDate: string, status: HomeMilestone['status']): HomeMilestone =>
  ({ id: `${projectId}-${targetDate}`, projectId, title: 'm', targetDate, status });

describe('readProject', () => {
  it('reads time and money and finds nothing wrong on a healthy project', () => {
    expect(readProject(project('A'), [], NOW)).toMatchObject({ timePct: 50, moneyPct: 50, reasons: [] });
  });
  it('flags a project past its end date', () => {
    const r = readProject(project('A', { CompletioDate: '2026-11-03' }), [], NOW);
    expect(r.reasons).toContain('10 days past its end date');
  });
  it('flags a project that ends within 60 days, and not one that ends later', () => {
    expect(readProject(project('A', { CompletioDate: '2026-12-13' }), [], NOW).reasons).toContain('ends in 30 days');
    expect(readProject(project('A', { CompletioDate: '2027-02-13', UtilizedAmount: '90' }), [], NOW).reasons).toEqual([]);
  });
  it('counts late milestones; achieved and future ones do not count', () => {
    const r = readProject(project('A'), [
      milestone('A', '2026-10-01', 'PLANNED'), milestone('A', '2026-10-02', 'ACHIEVED'), milestone('A', '2027-01-01', 'PLANNED'),
    ], NOW);
    expect(r.reasons).toEqual(['1 milestone late']);
  });
  it('flags money that trails time by more than 25 points', () => {
    expect(readProject(project('A', { UtilizedAmount: '10' }), [], NOW).reasons).toEqual(['time 50% used, money 10%']);
    expect(readProject(project('A', { UtilizedAmount: '25' }), [], NOW).reasons).toEqual([]);
  });
  it('gives no figure where the data is missing, and never a reason for a finished project', () => {
    expect(readProject(project('A', { StartDate: '', SanctionedCost: '' }), [], NOW)).toMatchObject({ timePct: null, moneyPct: null });
    expect(readProject(project('A', { stage: 'CLOSED', ProjectStatus: 'Completed', CompletioDate: '2020-01-01' }), [], NOW).reasons).toEqual([]);
  });
});

describe('projectsByException', () => {
  it('lists only projects that need the head, worst first, and counts the rest', () => {
    const out = projectsByException([
      project('ok'),
      project('soon', { CompletioDate: '2026-12-13' }),
      project('past', { CompletioDate: '2026-11-03' }),
      project('done', { stage: 'CLOSED', ProjectStatus: 'Completed', CompletioDate: '2020-01-01' }),
    ], [], NOW);
    expect(out.flagged.map(f => f.project.ProjectID)).toEqual(['past', 'soon']);
    expect(out.onCourse).toBe(1);
  });
});

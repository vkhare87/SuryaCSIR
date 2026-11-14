import { describe, expect, it } from 'vitest';
import type { ProjectInfo } from '../../types';
import type { ProjectReport } from '../../types/projectReport';
import type { MyAction } from '../dashboard/myActions';
import { precheck } from './prechecks';

const NOW = new Date(2026, 10, 14, 9, 0);
const act = (id: string): MyAction => ({ id, kind: 'progress-report', due: null, label: id, detail: '', link: '/' });
const project = { ProjectID: 'P1', ProjectNo: 'GAP-1', ProjectStatus: 'Ongoing', stage: 'ACTIVE', StartDate: '2025-11-14', CompletioDate: '2027-11-14', SanctionedCost: '100', UtilizedAmount: '50' } as ProjectInfo;
const report = { id: 'r1', projectNo: 'GAP-1', dueDate: '2026-11-10' } as ProjectReport;

describe('precheck', () => {
  it('reads time, money and milestones for a progress report under review', () => {
    expect(precheck(act('pr-review-r1'), { projects: [project], progressReports: [report], milestones: [], now: NOW }))
      .toEqual({ text: 'No finding on time, money or milestones · was due 2026-11-10', finding: false });
    expect(precheck(act('pr-review-r1'), {
      projects: [project], progressReports: [report], now: NOW,
      milestones: [{ id: 'm', projectId: 'P1', title: 'm', targetDate: '2026-10-01', status: 'PLANNED' }],
    })).toEqual({ text: '1 milestone late · was due 2026-11-10', finding: true });
  });

  it('gives no line for kinds it cannot check, or when the record is not loaded', () => {
    expect(precheck(act('prop-review-1'), { projects: [project], progressReports: [report], milestones: [], now: NOW })).toBeNull();
    expect(precheck(act('pr-review-zz'), { projects: [project], progressReports: [report], milestones: [], now: NOW })).toBeNull();
  });
});

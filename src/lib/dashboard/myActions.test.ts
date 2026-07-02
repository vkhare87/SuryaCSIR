import { describe, it, expect } from 'vitest';
import { deriveMyActions, type MyActionsInput } from './myActions';
import type { PMSReport, PMSEvaluation } from '../../types/pms';
import type { Proposal } from '../../types/proposal';
import type { ProjectReport } from '../../types/projectReport';
import type { ActionItem, Ticket } from '../../types';

const base: MyActionsInput = {
  userId: 'u1',
  staffName: 'Dr. A Kumar',
  role: 'Scientist',
  reports: [],
  evaluations: [],
  proposals: [],
  progressReports: [],
  actionItems: [],
  tickets: [],
};

const progressReport = (over: Partial<ProjectReport>): ProjectReport => ({
  id: 'g1', projectNo: 'P1', projectName: 'Coating', divisionCode: 'D1',
  periodType: 'Q', periodLabel: 'Q1 2026-27', dueDate: '2026-08-01', status: 'DRAFT',
  objectivesProgress: '', milestones: '', expenditureSummary: '', outcomes: '', remarks: '',
  reviewNotes: null, reviewedBy: null, reviewedAt: null,
  submittedBy: 'u1', submittedAt: null, createdAt: '', updatedAt: '', ...over,
});

const report = (over: Partial<PMSReport>): PMSReport => ({
  id: 'r1', cycleId: 'c1', scientistId: 'u1', status: 'DRAFT',
  periodFrom: null, periodTo: null, selfScore: null, submittedAt: null,
  signatureUrl: null, createdAt: '', updatedAt: '', ...over,
});

const evaluation = (over: Partial<PMSEvaluation>): PMSEvaluation => ({
  id: 'e1', reportId: 'r1', evaluatorId: 'u1', status: 'PENDING',
  scores: {}, comments: null, createdAt: '', updatedAt: '', ...over,
});

const proposal = (over: Partial<Proposal>): Proposal => ({
  id: 'p1', proposalCode: 'PC1', title: 'Nano coating', acronym: null,
  domainTheme: '', fundType: '', sponsorType: '', sponsorName: '',
  projectCategory: '', proposedStartDate: '', proposedDurationMonths: 12,
  requestedBudget: 0, piUserId: 'u1', piName: '', divisionCode: '',
  abstract: '', problemStatement: '', objectives: '', expectedOutcomes: '',
  currentTrl: null, targetTrl: null, status: 'DRAFT', ...over,
} as Proposal);

const actionItem = (over: Partial<ActionItem>): ActionItem => ({
  id: 'a1', meeting_id: null, source: 'manual', task: 'Prepare agenda',
  assigned_to: 'Dr. A Kumar', deadline: '2026-07-10', status: 'Pending',
  completed_at: null, notes: '', ...over,
});

const ticket = (over: Partial<Ticket>): Ticket => ({
  id: 't1', token: 'TK-1', subject: 'AC not working', category: 'Infrastructure',
  urgency: 'Medium', description: '', submitted_by: 'u9', assigned_to: 'u1',
  status: 'Open', created_at: '', updated_at: '', resolved_at: null, ...over,
} as Ticket);

describe('deriveMyActions', () => {
  it('returns empty for no inputs', () => {
    expect(deriveMyActions(base)).toEqual([]);
  });

  it('surfaces own draft PMS report, not others or submitted', () => {
    const out = deriveMyActions({
      ...base,
      reports: [
        report({}),
        report({ id: 'r2', scientistId: 'u2' }),
        report({ id: 'r3', status: 'SUBMITTED' }),
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].link).toBe('/pms/reports/r1/edit');
  });

  it('surfaces pending evaluations assigned to me', () => {
    const out = deriveMyActions({
      ...base,
      evaluations: [
        evaluation({}),
        evaluation({ id: 'e2', status: 'COMPLETED' }),
        evaluation({ id: 'e3', evaluatorId: 'u2' }),
      ],
    });
    expect(out.map(a => a.id)).toEqual(['eval-e1']);
  });

  it('surfaces own draft/revision proposals; review queue only for reviewer roles', () => {
    const proposals = [
      proposal({}),
      proposal({ id: 'p2', status: 'REVISION_REQUESTED' }),
      proposal({ id: 'p3', piUserId: 'u2', status: 'SUBMITTED' }),
    ];
    const scientist = deriveMyActions({ ...base, proposals });
    expect(scientist.map(a => a.id).sort()).toEqual(['prop-p1', 'prop-p2']);

    const admin = deriveMyActions({ ...base, role: 'HRAdmin', proposals });
    expect(admin.map(a => a.id)).toContain('prop-review-p3');
  });

  it('surfaces own draft/revision progress reports; review queue only for reviewers', () => {
    const progressReports = [
      progressReport({}),
      progressReport({ id: 'g2', status: 'REVISION_REQUESTED' }),
      progressReport({ id: 'g3', submittedBy: 'u2', status: 'SUBMITTED' }),
    ];
    const scientist = deriveMyActions({ ...base, progressReports });
    expect(scientist.map(a => a.id).sort()).toEqual(['pr-g1', 'pr-g2']);

    const hod = deriveMyActions({ ...base, role: 'HOD', progressReports });
    expect(hod.map(a => a.id)).toContain('pr-review-g3');
  });

  it('surfaces assigned action items and open tickets, sorted due-first', () => {
    const out = deriveMyActions({
      ...base,
      actionItems: [actionItem({}), actionItem({ id: 'a2', status: 'Completed' })],
      tickets: [ticket({}), ticket({ id: 't2', status: 'Resolved' })],
    });
    expect(out.map(a => a.id)).toEqual(['ai-a1', 'tk-t1']); // dated action item first
  });
});

import { describe, it, expect } from 'vitest';
import { lifecycleThreads, stageOfProposal } from './lifecycle';
import type { Proposal } from '../../types/proposal';
import type { ProjectInfo } from '../../types';
import type { ProjectReport } from '../../types/projectReport';

const prop = (over: Partial<Proposal>): Proposal => ({
  id: 'p1', proposalCode: 'PC-1', title: 'Nano coatings', acronym: null,
  domainTheme: '', fundType: '', sponsorType: '', sponsorName: '',
  projectCategory: '', proposedStartDate: '', proposedDurationMonths: 12,
  requestedBudget: 0, piUserId: 'u', piName: '', divisionCode: 'LWMD',
  abstract: '', problemStatement: '', objectives: '', expectedOutcomes: '',
  currentTrl: null, targetTrl: null, status: 'DRAFT', reviewBody: null,
  reviewSentDate: null, revisionNotes: null, rejectionReason: null,
  sanctionedAmount: null, sanctionDate: null, omNumber: null, omDate: null,
  linkedProjectNo: null, archived: false, createdAt: '', updatedAt: '',
  submittedAt: null, createdBy: 'u', lastStatusChangeBy: null, lastStatusChangeAt: null,
  ...over,
});

const proj = (over: Partial<ProjectInfo>): ProjectInfo => ({
  ProjectID: 'GAP-1', ProjectNo: 'GAP-1', ProjectName: 'Nano coatings', FundType: '',
  SponsorerType: '', SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Ongoing',
  StartDate: '', CompletioDate: '', SanctionedCost: '', UtilizedAmount: '',
  PrincipalInvestigator: '', DivisionCode: 'LWMD', Extension: '', ApprovalAuthority: '',
  ...over,
});

const rep = (over: Partial<ProjectReport>): ProjectReport => ({
  id: 'r1', projectNo: 'GAP-1', projectName: '', divisionCode: null,
  periodType: 'QUARTERLY', periodLabel: 'Q1 2026', dueDate: null, status: 'SUBMITTED',
  objectivesProgress: '', milestones: '', expenditureSummary: '', outcomes: '',
  remarks: '', reviewNotes: null, reviewedBy: null,
  ...over,
} as ProjectReport);

describe('stageOfProposal', () => {
  it('maps proposal statuses to lifecycle stages', () => {
    expect(stageOfProposal('DRAFT')).toBe('Concept');
    expect(stageOfProposal('SUBMITTED')).toBe('Under Evaluation');
    expect(stageOfProposal('UNDER_REVIEW')).toBe('Under Evaluation');
    expect(stageOfProposal('REVISION_REQUESTED')).toBe('Under Evaluation');
    expect(stageOfProposal('RECOMMENDED')).toBe('Under Evaluation');
    expect(stageOfProposal('APPROVED')).toBe('Sanctioned');
    expect(stageOfProposal('OM_ISSUED')).toBe('Sanctioned');
    expect(stageOfProposal('LINKED')).toBe('Execution');
    expect(stageOfProposal('REJECTED')).toBe('Dropped');
    expect(stageOfProposal('ARCHIVED')).toBe('Dropped');
  });
});

describe('lifecycleThreads', () => {
  it('links proposal → project → reports into one Execution thread', () => {
    const threads = lifecycleThreads(
      [prop({ status: 'LINKED', linkedProjectNo: 'GAP-1' })],
      [proj({})],
      [rep({}), rep({ id: 'r2', periodLabel: 'Q2 2026' })],
    );
    expect(threads).toHaveLength(1);
    expect(threads[0].stage).toBe('Execution');
    expect(threads[0].projectNo).toBe('GAP-1');
    expect(threads[0].reportCount).toBe(2);
    expect(threads[0].lastReport).toBe('Q2 2026');
  });

  it('completed project → Completed stage', () => {
    const threads = lifecycleThreads(
      [prop({ status: 'LINKED', linkedProjectNo: 'GAP-1' })],
      [proj({ ProjectStatus: 'Completed' })], [],
    );
    expect(threads[0].stage).toBe('Completed');
  });

  it('projects without proposals still appear as Execution threads', () => {
    const threads = lifecycleThreads([], [proj({ ProjectNo: 'OLP-9', ProjectName: 'Legacy' })], []);
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe('Legacy');
    expect(threads[0].stage).toBe('Execution');
  });

  it('unlinked proposals appear at their proposal stage', () => {
    const threads = lifecycleThreads([prop({ status: 'SUBMITTED' })], [], []);
    expect(threads[0].stage).toBe('Under Evaluation');
    expect(threads[0].projectNo).toBeUndefined();
  });
});

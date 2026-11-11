import type { ProjectInfo } from '../../types';
import type { Proposal } from '../../types/proposal';
import { projectStage } from './stage';
import type { ClosureItem, MyChangeStep, PortfolioRow } from '../../types/projectFile';

export interface PmeDeskItem {
  key: 'vetting' | 'unclassified' | 'sanction' | 'awaiting-funds' | 'milestones' | 'overdue' | 'minutes' | 'changes' | 'closure' | 'archive' | 'no-stage' | 'no-track';
  label: string;
  detail: string;
  count: number;
  to: string;
}

/** The PME work queue. Every row is a count of things waiting on PME; rows with nothing waiting are dropped. */
export function pmeDeskItems(
  proposals: Proposal[], projects: ProjectInfo[], milestonesWaiting = 0,
  portfolio: Pick<PortfolioRow, 'overdue' | 'minutesOverdue'>[] = [],
  changeSteps: Pick<MyChangeStep, 'projectId'>[] = [],
  closureSteps: Pick<ClosureItem, 'projectId' | 'item'>[] = [],
): PmeDeskItem[] {
  const closing = closureSteps.filter(c => c.item === 'step');
  const items: PmeDeskItem[] = [
    {
      key: 'vetting',
      label: 'Proposals awaiting vetting',
      detail: 'Submitted by the PI and not yet taken up',
      count: proposals.filter(p => p.status === 'SUBMITTED').length,
      to: '/proposals',
    },
    {
      key: 'unclassified',
      label: 'Proposals in review without a track',
      detail: 'Submitted before tracks existed — choose ULIP or HQ so review can continue',
      count: proposals.filter(p => !p.track && ['SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED', 'APPROVED', 'OM_ISSUED'].includes(p.status)).length,
      to: '/proposals',
    },
    {
      key: 'sanction',
      label: 'Approved proposals to sanction',
      detail: 'Record the sanction order; the project is created from the proposal',
      count: proposals.filter(p => p.status === 'APPROVED' || p.status === 'OM_ISSUED').length,
      to: '/proposals',
    },
    {
      key: 'awaiting-funds',
      label: 'Sanctioned projects with no money received yet',
      detail: 'Record the first release; the project then becomes active',
      count: projects.filter(p => projectStage(p) === 'SANCTIONED').length,
      to: '/projects',
    },
    {
      key: 'milestones',
      label: 'Milestones waiting on PME',
      detail: 'Proposed by a PI, or reported done',
      count: milestonesWaiting,
      to: '/projects',
    },
    {
      key: 'overdue',
      label: 'Reviews and progress reports overdue',
      detail: 'Owed by the schedule and not yet held or filed',
      count: portfolio.reduce((n, r) => n + r.overdue, 0),
      to: '/portfolio',
    },
    {
      key: 'minutes',
      label: 'Minutes overdue',
      detail: 'Reviews held without their signed minutes filed in time',
      count: portfolio.reduce((n, r) => n + r.minutesOverdue, 0),
      to: '/portfolio',
    },
    {
      key: 'changes',
      label: 'Change requests waiting on PME',
      detail: 'Vet the request, or record the committee or HQ decision with its signed scan',
      count: changeSteps.length,
      to: changeSteps.length === 1 ? `/projects/${encodeURIComponent(changeSteps[0].projectId)}?tab=changes` : '/projects',
    },
    {
      key: 'closure',
      label: 'Completion reports waiting on PME',
      detail: 'Vet the report, or record the committee or approving authority\'s decision',
      count: closing.length,
      to: closing.length === 1 ? `/projects/${encodeURIComponent(closing[0].projectId)}?tab=closure` : '/projects',
    },
    {
      key: 'archive',
      label: 'Closed projects to archive',
      detail: 'Publish the approved completion report to the archive and Ask SURYA',
      count: projects.filter(p => projectStage(p) === 'CLOSED' || projectStage(p) === 'FORECLOSED').length,
      to: '/projects',
    },
    {
      key: 'no-stage',
      label: 'Projects with an unrecognised status',
      detail: 'The status text maps to no stage — set it on the project',
      count: projects.filter(p => projectStage(p) === null).length,
      to: '/projects',
    },
    {
      key: 'no-track',
      label: 'Projects not yet classified',
      detail: 'Neither ULIP nor HQ scheme recorded',
      count: projects.filter(p => !p.track).length,
      to: '/projects',
    },
  ];
  return items.filter(i => i.count > 0);
}

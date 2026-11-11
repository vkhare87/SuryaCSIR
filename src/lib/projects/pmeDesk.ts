import type { ProjectInfo } from '../../types';
import type { Proposal } from '../../types/proposal';
import { projectStage } from './stage';

export interface PmeDeskItem {
  key: 'vetting' | 'unclassified' | 'sanction' | 'awaiting-funds' | 'milestones' | 'no-stage' | 'no-track';
  label: string;
  detail: string;
  count: number;
  to: string;
}

/** The PME work queue. Every row is a count of things waiting on PME; rows with nothing waiting are dropped. */
export function pmeDeskItems(proposals: Proposal[], projects: ProjectInfo[], milestonesWaiting = 0): PmeDeskItem[] {
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

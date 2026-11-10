import type { ProjectInfo } from '../../types';
import type { Proposal } from '../../types/proposal';
import { projectStage } from './stage';

export interface PmeDeskItem {
  key: 'vetting' | 'sanction' | 'no-stage' | 'no-track';
  label: string;
  detail: string;
  count: number;
  to: string;
}

/** The PME work queue. Every row is a count of things waiting on PME; rows with nothing waiting are dropped. */
export function pmeDeskItems(proposals: Proposal[], projects: ProjectInfo[]): PmeDeskItem[] {
  const items: PmeDeskItem[] = [
    {
      key: 'vetting',
      label: 'Proposals awaiting vetting',
      detail: 'Submitted by the PI and not yet taken up',
      count: proposals.filter(p => p.status === 'SUBMITTED').length,
      to: '/proposals',
    },
    {
      key: 'sanction',
      label: 'Sanctions awaiting a project record',
      detail: 'Sanction order issued, project not yet linked',
      count: proposals.filter(p => p.status === 'OM_ISSUED').length,
      to: '/proposals',
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

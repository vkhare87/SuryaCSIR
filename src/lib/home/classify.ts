import type { MyAction } from '../dashboard/myActions';

export type HomeGroup = 'research' | 'admin' | 'committee';

export interface HomeAction extends MyAction {
  group: HomeGroup;
  minutes: number;
  quickWin: boolean;
  priority?: boolean;
  consequence: string;
}

const ACTION_META: Record<
  MyAction['kind'],
  { group: HomeGroup; minutes: number; quickWin: boolean; consequence: string }
> = {
  'pms-draft':       { group: 'admin',     minutes: 15, quickWin: false, consequence: 'Self-appraisal window is open in PMS.' },
  'pms-evaluation':  { group: 'admin',     minutes: 10, quickWin: false, consequence: 'Evaluation deadline is tracked in PMS.' },
  'proposal':        { group: 'research',  minutes: 10, quickWin: false, consequence: 'Proposal awaits your revision or review.' },
  'action-item':     { group: 'committee', minutes: 2,  quickWin: true,  consequence: 'Open items are listed at the next committee meeting.' },
  'ticket':          { group: 'admin',     minutes: 5,  quickWin: false, consequence: 'Helpdesk ticket stays open until answered.' },
  'progress-report': { group: 'research',  minutes: 15, quickWin: false, consequence: 'At 7 days overdue, the HoD is notified.' },
  'project-review':  { group: 'research',  minutes: 10, quickWin: false, consequence: 'Scheduled review slot awaits completion.' },
  'project-change':  { group: 'research',  minutes: 2,  quickWin: true,  consequence: 'Project change request waits on your step.' },
  'project-closure': { group: 'research',  minutes: 2,  quickWin: true,  consequence: 'Completion dossier waits on your sign-off.' },
  'retirement':      { group: 'admin',     minutes: 2,  quickWin: true,  consequence: 'Superannuation transition falls within 6 months.' },
  'contract-end':    { group: 'admin',     minutes: 2,  quickWin: true,  consequence: 'Contract end date falls within 60 days.' },
  'contribution':    { group: 'admin',     minutes: 2,  quickWin: true,  consequence: 'Data update request stays open in My Work.' },
};

export function classifyAction(action: MyAction): HomeAction {
  const meta = ACTION_META[action.kind];
  return {
    ...action,
    group: meta.group,
    minutes: meta.minutes,
    quickWin: meta.quickWin,
    consequence: meta.consequence,
  };
}

export function summarizeByGroup(actions: HomeAction[]): Record<HomeGroup, number> {
  const summary: Record<HomeGroup, number> = { research: 0, admin: 0, committee: 0 };
  for (const a of actions) summary[a.group] += 1;
  return summary;
}

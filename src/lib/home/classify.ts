import type { MyAction } from '../dashboard/myActions';

export type HomeGroup = 'research' | 'admin' | 'committee';

export interface Classified {
  group: HomeGroup;
  /** Rough minutes to finish one item of this kind. */
  minutes: number;
}

// ponytail: a fixed table per kind (plan question 5); revise from real completion times later.
const KINDS: Record<MyAction['kind'], Classified> = {
  'proposal':        { group: 'research',  minutes: 30 },
  'progress-report': { group: 'research',  minutes: 30 },
  'project-review':  { group: 'research',  minutes: 20 },
  'project-change':  { group: 'research',  minutes: 10 },
  'project-closure': { group: 'research',  minutes: 45 },
  'pms-draft':       { group: 'admin',     minutes: 45 },
  'pms-evaluation':  { group: 'admin',     minutes: 20 },
  'ticket':          { group: 'admin',     minutes: 5 },
  'contribution':    { group: 'admin',     minutes: 2 },
  'retirement':      { group: 'admin',     minutes: 2 },
  'contract-end':    { group: 'admin',     minutes: 2 },
  'action-item':     { group: 'committee', minutes: 15 },
};

export const QUICK_WIN_MINUTES = 2;

/** Group and time estimate for an action, by its kind. */
export function classify(action: Pick<MyAction, 'kind'>): Classified {
  return KINDS[action.kind];
}

/** How many open actions fall in each group. */
export function countByGroup(actions: Pick<MyAction, 'kind'>[]): Record<HomeGroup, number> {
  const out: Record<HomeGroup, number> = { research: 0, admin: 0, committee: 0 };
  for (const a of actions) out[classify(a).group] += 1;
  return out;
}

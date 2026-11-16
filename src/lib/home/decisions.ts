import type { MyAction } from '../dashboard/myActions';
import { daysUntil } from './today';

/** An item that waits on this person's decision: an approval, a review, a step to record. */
export function isDecision(a: MyAction): boolean {
  return a.since !== undefined || a.id.startsWith('closure-step-');
}

export interface DecisionRow { action: MyAction; days: number | null }

/**
 * The decision queue: oldest first, by days waiting. It cannot be re-sorted (HOD-HOME-PLAN §4).
 * ponytail: built from the open action list in the browser; my_decisions() in SQL when Ask SURYA or the Director's roll-up needs it.
 */
export function decisionQueue(actions: MyAction[], now: Date = new Date()): DecisionRow[] {
  return actions
    .filter(isDecision)
    .map(a => ({ action: a, days: a.since ? Math.max(0, -daysUntil(a.since.slice(0, 10), now)) : null }))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
}

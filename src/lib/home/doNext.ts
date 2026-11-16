import type { MyAction } from '../dashboard/myActions';
import { classify, QUICK_WIN_MINUTES } from './classify';
import { localIso } from './today';

/**
 * Orders actions for the home screen: overdue first, then by due date, then undated.
 * A tie goes to the shorter job.
 */
export function rankActions(actions: MyAction[], now: Date = new Date()): MyAction[] {
  const today = localIso(now);
  const bucket = (a: MyAction) => (!a.due ? 2 : a.due < today ? 0 : 1);
  return [...actions].sort((a, b) =>
    bucket(a) - bucket(b)
    || (a.due ?? '').localeCompare(b.due ?? '')
    || classify(a).minutes - classify(b).minutes);
}

/** Items that take two minutes or less. */
export function quickWins(ranked: MyAction[]): MyAction[] {
  return ranked.filter(a => classify(a).minutes <= QUICK_WIN_MINUTES);
}

/** The single next item: the first ranked item that is not a quick win, else the first item. */
export function doNext(ranked: MyAction[]): MyAction | null {
  return ranked.find(a => classify(a).minutes > QUICK_WIN_MINUTES) ?? ranked[0] ?? null;
}

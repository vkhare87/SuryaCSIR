import type { PortfolioRow, ReviewDecision, ReviewSlot, SlotKind } from '../../types/projectFile';

export const DECISION_LABELS: Record<ReviewDecision, string> = {
  CONTINUE: 'Continue', CONTINUE_WITH_CHANGES: 'Continue with changes', HOLD: 'Put on hold',
  FORECLOSURE_RECOMMENDED: 'Recommend foreclosure',
  GO: 'Go', CONDITIONAL_GO: 'Conditional go', KILL: 'Kill', RECYCLE: 'Recycle',
};

/** Decisions a review of this kind can take (mirrors project_slot_record). */
export function decisionsFor(kind: SlotKind): ReviewDecision[] {
  return kind === 'STAGE_GATE'
    ? ['GO', 'CONDITIONAL_GO', 'HOLD', 'KILL', 'RECYCLE']
    : ['CONTINUE', 'CONTINUE_WITH_CHANGES', 'HOLD', 'FORECLOSURE_RECOMMENDED'];
}

export type SlotState = 'done' | 'overdue' | 'due-soon' | 'upcoming' | 'minutes-overdue';

/** Where a slot stands today. "Due soon" is within 30 days. */
export function slotState(s: Pick<ReviewSlot, 'status' | 'dueDate' | 'minutesDue'>, today: string): SlotState {
  if (s.status === 'DONE') return s.minutesDue && s.minutesDue < today ? 'minutes-overdue' : 'done';
  if (s.dueDate < today) return 'overdue';
  const soon = new Date(`${today}T00:00:00`);
  soon.setDate(soon.getDate() + 30);
  return s.dueDate <= soon.toISOString().slice(0, 10) ? 'due-soon' : 'upcoming';
}

export type Health = 'on-track' | 'watch' | 'behind';

/**
 * A plain reading of a portfolio row, for sorting and a single badge. Not a
 * score: "behind" means something is overdue, or spending or milestones lag
 * time elapsed by more than 25 points; "watch" by more than 10.
 */
export function portfolioHealth(r: Pick<PortfolioRow, 'overdue' | 'minutesOverdue' | 'elapsedPct' | 'sanctionedCost' | 'spent' | 'milestonesTotal' | 'milestonesAchieved'>): Health {
  if (r.overdue > 0 || r.minutesOverdue > 0) return 'behind';
  if (r.elapsedPct === null) return 'on-track';
  const gaps: number[] = [];
  if (r.sanctionedCost && r.sanctionedCost > 0) gaps.push(r.elapsedPct - (100 * r.spent) / r.sanctionedCost);
  if (r.milestonesTotal > 0) gaps.push(r.elapsedPct - (100 * r.milestonesAchieved) / r.milestonesTotal);
  const worst = Math.max(0, ...gaps);
  return worst > 25 ? 'behind' : worst > 10 ? 'watch' : 'on-track';
}

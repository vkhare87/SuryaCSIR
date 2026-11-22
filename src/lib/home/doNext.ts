import type { HomeAction } from './classify';

/** Tomorrow snooze is refused on priorities and on or after the item's due date. */
export function canSnoozeForTomorrow(action: HomeAction, todayIso: string): boolean {
  if (action.priority) return false;
  if (action.due && action.due <= todayIso) return false;
  return true;
}

/**
 * Ranks pending items: open priorities by wanted-by date -> overdue items ->
 * soonest due -> ties go to shorter time estimate.
 */
export function rankHomeActions(
  actions: HomeAction[],
  snoozedIds: ReadonlySet<string>,
  todayIso: string,
): HomeAction[] {
  const active = actions.filter((a) => !snoozedIds.has(a.id) || !canSnoozeForTomorrow(a, todayIso));

  return [...active].sort((a, b) => {
    const aPri = a.priority ? 0 : 1;
    const bPri = b.priority ? 0 : 1;
    if (aPri !== bPri) return aPri - bPri;

    const aOverdue = a.due && a.due < todayIso ? 0 : 1;
    const bOverdue = b.due && b.due < todayIso ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;

    if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
    if (a.due && !b.due) return -1;
    if (!a.due && b.due) return 1;

    if (a.minutes !== b.minutes) return a.minutes - b.minutes;
    return a.label.localeCompare(b.label);
  });
}

export function pickDoNext(
  actions: HomeAction[],
  snoozedIds: ReadonlySet<string>,
  todayIso: string,
): HomeAction | null {
  return rankHomeActions(actions, snoozedIds, todayIso)[0] ?? null;
}

export interface TodayProgress {
  done: number;
  total: number;
  pending: number;
  pct: number;
}

export function computeTodayProgress(
  pendingCount: number,
  doneTodayIds: Iterable<string>,
): TodayProgress {
  const done = new Set(doneTodayIds).size;
  const pending = Math.max(0, pendingCount);
  const total = done + pending;
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  return { done, total, pending, pct };
}

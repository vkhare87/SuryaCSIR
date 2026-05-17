import { useCallback, useMemo, useState } from 'react';

export type TimeRangeKey = 'all' | '7d' | '30d' | '90d' | '1y' | 'fy' | 'custom';

export interface TimeRange {
  key: TimeRangeKey;
  start: Date | null;
  end: Date | null;
}

const MS_DAY = 86_400_000;

function startOfFinancialYear(now: Date): Date {
  // Indian FY: 1 April → 31 March
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(y, 3, 1);
}

export function rangeFromKey(key: TimeRangeKey, now: Date = new Date()): TimeRange {
  if (key === 'all') return { key, start: null, end: null };
  if (key === 'custom') return { key, start: null, end: null };
  const end = now;
  let start: Date;
  switch (key) {
    case '7d':
      start = new Date(now.getTime() - 7 * MS_DAY);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * MS_DAY);
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * MS_DAY);
      break;
    case '1y':
      start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    case 'fy':
      start = startOfFinancialYear(now);
      break;
  }
  return { key, start, end };
}

export function inRange(date: Date | string | null | undefined, range: TimeRange): boolean {
  if (!date) return false;
  if (range.start === null && range.end === null) return true;
  const t = typeof date === 'string' ? Date.parse(date) : date.getTime();
  if (!Number.isFinite(t)) return false;
  if (range.start && t < range.start.getTime()) return false;
  if (range.end && t > range.end.getTime()) return false;
  return true;
}

export function useTimeRange(initial: TimeRangeKey = 'all') {
  const [key, setKey] = useState<TimeRangeKey>(initial);
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);

  const range = useMemo<TimeRange>(() => {
    if (key === 'custom') return { key, start: customStart, end: customEnd };
    return rangeFromKey(key);
  }, [key, customStart, customEnd]);

  const predicate = useCallback(
    (d: Date | string | null | undefined) => inRange(d, range),
    [range],
  );

  return { range, key, setKey, customStart, customEnd, setCustomStart, setCustomEnd, predicate };
}

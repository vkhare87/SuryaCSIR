const MS_PER_DAY = 86400000;

/** YYYY-MM-DD in the browser's own time zone. */
export function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from today to an ISO date. Negative when the date is past. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.round((Date.parse(`${iso}T00:00:00`) - Date.parse(`${localIso(now)}T00:00:00`)) / MS_PER_DAY);
}

/** Items seen earlier today that are no longer open. */
export function doneToday(seenToday: string[], openNow: string[]): number {
  const open = new Set(openNow);
  return seenToday.filter(id => !open.has(id)).length;
}

/** Every item seen today so far: what was seen before plus what is open now. */
export function mergeSeen(seenToday: string[], openNow: string[]): string[] {
  return [...new Set([...seenToday, ...openNow])];
}

export type DayMark = 'deadline' | 'meeting' | 'event' | 'holiday';

export interface DayCell {
  iso: string;
  /** One letter: M T W T F S S. */
  letter: string;
  dayOfMonth: number;
  isToday: boolean;
  marks: Record<DayMark, number>;
}

/** Seven days starting today, with a count of each kind of mark per day. */
export function weekStrip(items: { date: string; mark: DayMark }[], now: Date = new Date()): DayCell[] {
  const cells: DayCell[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    cells.push({
      iso: localIso(d),
      letter: 'SMTWTFS'[d.getDay()],
      dayOfMonth: d.getDate(),
      isToday: i === 0,
      marks: { deadline: 0, meeting: 0, event: 0, holiday: 0 },
    });
  }
  const byIso = new Map(cells.map(c => [c.iso, c]));
  for (const it of items) {
    const cell = byIso.get(it.date);
    if (cell) cell.marks[it.mark] += 1;
  }
  return cells;
}

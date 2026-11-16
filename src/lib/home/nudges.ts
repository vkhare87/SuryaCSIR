import type { ProjectReport } from '../../types/projectReport';
import type { MyAction } from '../dashboard/myActions';
import { leaveYear } from './people';
import { localIso } from './today';

// --- 1. Tomorrow: hide an item until the next working day ---

/** The next day that is not a Saturday, a Sunday or a holiday. */
export function nextWorkingDay(today: string, holidays: string[]): string {
  const off = new Set(holidays);
  const d = new Date(`${today}T00:00:00`);
  do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6 || off.has(localIso(d)));
  return localIso(d);
}

/** Tomorrow is offered only before the due date, never on or after it. */
export function canSnooze(a: MyAction, today: string): boolean {
  return a.due === null || a.due > today;
}

/** Items whose snooze has not ended. */
export function snoozedIds(snoozes: Record<string, string>, today: string): Set<string> {
  return new Set(Object.entries(snoozes).filter(([, until]) => until > today).map(([id]) => id));
}

// ponytail: a per-viewer convenience kept in this browser, like the done-today ring; a home_snoozes table if it must follow the person between devices.
const key = (userId: string) => `surya_home_snooze_${userId}`;
export function readSnoozes(userId: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(key(userId)) ?? '{}') as Record<string, string>; } catch { return {}; }
}
export function writeSnoozes(userId: string, s: Record<string, string>, today: string) {
  const live = Object.fromEntries(Object.entries(s).filter(([, until]) => until > today));
  try { localStorage.setItem(key(userId), JSON.stringify(live)); } catch { /* private window */ }
}

// --- 2. Honest consequence: say only what the server does ---

export const HEAD_TOLD_AFTER_DAYS = 7;

/** A progress report slot (the only kind home_overdue_sweep acts on). */
export const isProgressSlot = (a: MyAction) => a.id.startsWith('slot-') && a.link === '/reports/new';

/** What happens next for a progress report, from the escalation sweep; null for other kinds. */
export function consequenceLine(a: MyAction, daysLeft: number): string | null {
  if (!isProgressSlot(a) || a.due === null) return null;
  if (daysLeft <= -HEAD_TOLD_AFTER_DAYS) return 'Your head of division has been told.';
  const d = new Date(`${a.due}T00:00:00`);
  d.setDate(d.getDate() + HEAD_TOLD_AFTER_DAYS);
  return `On ${localIso(d)} your head of division is told.`;
}

// --- 3. Quiet record: my own on-time count ---

/** Progress reports I sent in this year (1 April – 31 March) and how many went on or before their due date. */
export function onTimeRecord(reports: ProjectReport[], userId: string, today: string): { sent: number; onTime: number } {
  const yr = leaveYear(today);
  const sent = reports.filter(r => r.submittedBy === userId && r.submittedAt && r.dueDate
    && r.submittedAt.slice(0, 10) >= yr.from && r.submittedAt.slice(0, 10) <= yr.to);
  return { sent: sent.length, onTime: sent.filter(r => (r.submittedAt as string).slice(0, 10) <= (r.dueDate as string)).length };
}

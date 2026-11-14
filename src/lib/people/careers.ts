import { parseDate } from '../../utils/dateUtils';
import type { CareerEventInput } from './api';

export const CAREER_KINDS = ['APPOINTMENT', 'PROMOTION', 'TRANSFER', 'DEPUTATION', 'TRAINING', 'ASSESSMENT', 'RETIREMENT'] as const;

const pick = (r: Record<string, string>, ...keys: string[]) => {
  const k = Object.keys(r).find(x => keys.includes(x.trim().toLowerCase().replace(/[^a-z]/g, '')));
  return k ? String(r[k] ?? '').trim() : '';
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Rows of an establishment export → career events. Columns are matched
 * loosely (Staff ID / ID, Kind / Event, Date / Effective On, Order, Summary).
 * A row with an unknown kind or a date that does not parse is returned in
 * `bad` with the reason, never guessed.
 */
export function careerRowsFromSheet(rows: Record<string, string>[]): { events: CareerEventInput[]; bad: { row: number; reason: string }[] } {
  const events: CareerEventInput[] = [];
  const bad: { row: number; reason: string }[] = [];
  rows.forEach((r, i) => {
    const staffId = pick(r, 'staffid', 'id', 'employeeid', 'empid');
    const kind = pick(r, 'kind', 'event', 'type').toUpperCase();
    const date = parseDate(pick(r, 'date', 'effectiveon', 'effectivedate', 'with effect from', 'wef'));
    if (!staffId) bad.push({ row: i + 2, reason: 'No staff ID' });
    else if (!(CAREER_KINDS as readonly string[]).includes(kind)) bad.push({ row: i + 2, reason: `Unknown kind "${kind}"` });
    else if (!date) bad.push({ row: i + 2, reason: 'Date missing or not readable' });
    else {
      const order = pick(r, 'order', 'orderref', 'orderno');
      const summary = pick(r, 'summary', 'detail', 'remarks');
      events.push({ staff_id: staffId, kind, effective_on: iso(date), ...(order ? { order_ref: order } : {}), ...(summary ? { detail: { summary } } : {}) });
    }
  });
  return { events, bad };
}

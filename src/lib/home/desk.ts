import type { CalendarEvent, Holiday, Meeting } from '../../types';
import type { MyAction } from '../dashboard/myActions';
import { localIso } from './today';

export interface DeskRow {
  /** Stable key, shared with the role half so one item shows in one place. */
  key: string;
  date: string;
  kind: 'holiday' | 'meeting' | 'event' | 'due';
  title: string;
  detail: string;
  link: string | null;
}

/** Key of an action, a meeting, an event and a holiday, as both halves of the page name them. */
export const deskKey = {
  action: (id: string) => `action:${id}`,
  meeting: (id: string) => `meeting:${id}`,
  event: (id: string) => `event:${id}`,
  holiday: (id: string) => `holiday:${id}`,
};

export interface MyDayInput {
  events: CalendarEvent[];
  holidays: Holiday[];
  /** Meetings of committees the person sits on. */
  meetings: Meeting[];
  actions: MyAction[];
  now?: Date;
  /** How many days to cover, today included. */
  days?: number;
}

const ORDER: Record<DeskRow['kind'], number> = { holiday: 0, meeting: 1, event: 2, due: 3 };

/** What is on the person's day: holidays, own meetings, events and things due, in date order. */
export function myDay({ events, holidays, meetings, actions, now = new Date(), days = 2 }: MyDayInput): DeskRow[] {
  const from = localIso(now);
  const to = localIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days - 1));
  const inRange = (iso: string) => iso >= from && iso <= to;
  const rows: DeskRow[] = [
    ...holidays.filter(h => inRange(h.holiday_date)).map((h): DeskRow => ({
      key: deskKey.holiday(h.id), date: h.holiday_date, kind: 'holiday', title: h.name, detail: 'Holiday', link: null,
    })),
    ...meetings.filter(m => m.status !== 'Cancelled' && inRange(m.meeting_date)).map((m): DeskRow => ({
      key: deskKey.meeting(m.id), date: m.meeting_date, kind: 'meeting', title: m.title, detail: m.venue,
      link: `/committees/${m.committee_id}/meetings/${m.id}`,
    })),
    ...events.filter(e => e.event_kind !== 'Announcement' && inRange(e.event_date)).map((e): DeskRow => ({
      key: deskKey.event(e.id), date: e.event_date, kind: 'event', title: e.title, detail: e.location, link: '/calendar',
    })),
    ...actions.filter(a => a.due !== null && inRange(a.due)).map((a): DeskRow => ({
      key: deskKey.action(a.id), date: a.due as string, kind: 'due', title: a.label, detail: a.detail, link: a.link,
    })),
  ];
  return rows.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind]);
}

/** Rows the role half does not already show, and how many it does. */
export function withoutClaimed<T extends { key: string }>(rows: T[], claimed: ReadonlySet<string>): { rows: T[]; hidden: number } {
  const kept = rows.filter(r => !claimed.has(r.key));
  return { rows: kept, hidden: rows.length - kept.length };
}

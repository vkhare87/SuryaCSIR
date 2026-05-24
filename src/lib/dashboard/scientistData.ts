import type { Meeting, CommitteeMember, CalendarEvent, Holiday, ActionItem } from '../../types';
import { staffNameMatchesAuthor } from '../../utils/dateUtils';

/** Parse a YYYY-MM-DD string to a Date at UTC midnight. Returns null if invalid. */
function parseISODate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Future meetings for committees the staff belongs to, ascending by date. */
export function deriveOwnMeetings(
  meetings: Meeting[],
  members: CommitteeMember[],
  staffId: string,
  now: Date,
): Meeting[] {
  const myCommittees = new Set(
    members.filter(m => m.staff_id === staffId).map(m => m.committee_id),
  );
  return meetings
    .filter(m => myCommittees.has(m.committee_id))
    .filter(m => {
      const d = parseISODate(m.meeting_date);
      return d !== null && d.getTime() >= now.getTime();
    })
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date));
}

export interface WeekEvent {
  id: string;
  label: string;
  date: string;
  kind: 'HOL' | 'EVT';
}

/** Calendar events + holidays within the next 7 days, ascending by date. */
export function deriveUpcomingWeekEvents(
  events: CalendarEvent[],
  holidays: Holiday[],
  now: Date,
): WeekEvent[] {
  const start = now.getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  const inWindow = (iso: string): boolean => {
    const d = parseISODate(iso);
    return d !== null && d.getTime() >= start && d.getTime() <= end;
  };

  const hol: WeekEvent[] = holidays
    .filter(h => inWindow(h.holiday_date))
    .map(h => ({ id: h.id, label: h.name, date: h.holiday_date, kind: 'HOL' as const }));

  const evt: WeekEvent[] = events
    .filter(e => inWindow(e.event_date))
    .map(e => ({ id: e.id, label: e.title, date: e.event_date, kind: 'EVT' as const }));

  return [...hol, ...evt].sort((a, b) => a.date.localeCompare(b.date));
}

/** Non-completed action items assigned to this staff name, ascending by deadline. */
export function deriveOwnActionItems(items: ActionItem[], staffName: string): ActionItem[] {
  if (!staffName) return [];
  return items
    .filter(i => i.status !== 'Completed')
    .filter(i => staffNameMatchesAuthor(staffName, i.assigned_to))
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
}

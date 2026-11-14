import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Holiday, Meeting } from '../../types';
import type { MyAction } from '../dashboard/myActions';
import { deskKey, myDay, withoutClaimed } from './desk';

const NOW = new Date(2026, 10, 13, 9, 0); // Fri 13 Nov 2026
const event = (id: string, date: string, kind: CalendarEvent['event_kind'] = 'Custom') =>
  ({ id, title: `event ${id}`, event_date: date, event_kind: kind, location: 'Hall' } as CalendarEvent);
const meeting = (id: string, date: string, status: Meeting['status'] = 'Scheduled') =>
  ({ id, committee_id: 'c1', meeting_date: date, title: `meeting ${id}`, venue: 'Room 1', status } as Meeting);
const action = (id: string, due: string | null): MyAction =>
  ({ id, kind: 'proposal', due, label: `action ${id}`, detail: '', link: `/a/${id}` });

describe('myDay', () => {
  const rows = myDay({
    now: NOW,
    holidays: [{ id: 'h1', holiday_date: '2026-11-14', name: 'Diwali' } as Holiday],
    meetings: [meeting('m1', '2026-11-13'), meeting('m2', '2026-11-13', 'Cancelled'), meeting('m3', '2026-11-20')],
    events: [event('e1', '2026-11-13'), event('e2', '2026-11-13', 'Announcement')],
    actions: [action('a1', '2026-11-14'), action('a2', null), action('a3', '2026-11-01')],
  });
  it('covers today and tomorrow only, in date order', () => {
    expect(rows.map(r => r.key)).toEqual(['meeting:m1', 'event:e1', 'holiday:h1', 'action:a1']);
  });
  it('leaves out cancelled meetings and announcements', () => {
    expect(rows.some(r => r.key === 'meeting:m2' || r.key === 'event:e2')).toBe(false);
  });
});

describe('withoutClaimed', () => {
  it('drops rows the role half shows and counts them', () => {
    const rows = [{ key: deskKey.action('a1') }, { key: deskKey.meeting('m1') }];
    expect(withoutClaimed(rows, new Set(['action:a1']))).toEqual({ rows: [{ key: 'meeting:m1' }], hidden: 1 });
  });
});

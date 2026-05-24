import { describe, it, expect } from 'vitest';
import {
  deriveOwnMeetings,
  deriveUpcomingWeekEvents,
  deriveOwnActionItems,
} from './scientistData';
import type { Meeting, CommitteeMember, CalendarEvent, Holiday, ActionItem } from '../../types';

const NOW = new Date('2026-05-21T00:00:00Z');

function meeting(o: Partial<Meeting> = {}): Meeting {
  return {
    id: 'M1', committee_id: 'C1', meeting_date: '2026-05-25', venue: 'Room 3',
    title: 'Finance Committee', summary: '', status: 'Scheduled',
    created_at: '', teams_url: null, pamphlet_url: null, ...o,
  };
}
function member(o: Partial<CommitteeMember> = {}): CommitteeMember {
  return { id: 'CM1', committee_id: 'C1', staff_id: 'S001', role: 'Member', ...o };
}
function calEvent(o: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'E1', title: 'Audit', event_date: '2026-05-23', event_kind: 'Custom',
    location: '', teams_url: null, pamphlet_url: null, description: '',
    visibility: 'OrgWide', division_code: null, created_by: '', created_at: '', updated_at: '', ...o,
  };
}
function holiday(o: Partial<Holiday> = {}): Holiday {
  return { id: 'H1', holiday_date: '2026-05-23', name: 'Buddha Purnima', holiday_type: 'Gazetted', year: 2026, ...o };
}
function action(o: Partial<ActionItem> = {}): ActionItem {
  return {
    id: 'A1', meeting_id: 'M1', source: 'meeting', task: 'Submit report',
    assigned_to: 'Alice Researcher', deadline: '2026-05-25', status: 'Pending',
    completed_at: null, notes: '', ...o,
  };
}

describe('deriveOwnMeetings', () => {
  it('returns future meetings for committees the staff belongs to, sorted ascending', () => {
    const members = [member({ committee_id: 'C1', staff_id: 'S001' })];
    const meetings = [
      meeting({ id: 'M1', committee_id: 'C1', meeting_date: '2026-05-25' }),
      meeting({ id: 'M2', committee_id: 'C1', meeting_date: '2026-05-22' }),
      meeting({ id: 'M3', committee_id: 'C9', meeting_date: '2026-05-30' }),
      meeting({ id: 'M0', committee_id: 'C1', meeting_date: '2026-05-10' }),
    ];
    const result = deriveOwnMeetings(meetings, members, 'S001', NOW);
    expect(result.map(m => m.id)).toEqual(['M2', 'M1']);
  });

  it('returns empty when staff is in no committee', () => {
    expect(deriveOwnMeetings([meeting()], [], 'S999', NOW)).toEqual([]);
  });
});

describe('deriveUpcomingWeekEvents', () => {
  it('merges calendar events and holidays within next 7 days, sorted by date', () => {
    const events = [calEvent({ event_date: '2026-05-23', title: 'Audit' })];
    const holidays = [holiday({ holiday_date: '2026-05-22', name: 'Holiday X' })];
    const result = deriveUpcomingWeekEvents(events, holidays, NOW);
    expect(result.map(r => r.label)).toEqual(['Holiday X', 'Audit']);
    expect(result[0].kind).toBe('HOL');
    expect(result[1].kind).toBe('EVT');
  });

  it('excludes items more than 7 days out or in the past', () => {
    const events = [
      calEvent({ event_date: '2026-05-10' }),
      calEvent({ event_date: '2026-06-30' }),
    ];
    expect(deriveUpcomingWeekEvents(events, [], NOW)).toEqual([]);
  });
});

describe('deriveOwnActionItems', () => {
  it('returns non-completed items assigned to the staff name, sorted by deadline', () => {
    const items = [
      action({ id: 'A1', assigned_to: 'Alice Researcher', deadline: '2026-05-25', status: 'Pending' }),
      action({ id: 'A2', assigned_to: 'Alice Researcher', deadline: '2026-05-22', status: 'InProgress' }),
      action({ id: 'A3', assigned_to: 'Alice Researcher', status: 'Completed' }),
      action({ id: 'A4', assigned_to: 'Bob Other' }),
    ];
    const result = deriveOwnActionItems(items, 'Alice Researcher');
    expect(result.map(i => i.id)).toEqual(['A2', 'A1']);
  });
});

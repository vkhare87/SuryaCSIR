import { describe, expect, it } from 'vitest';
import type { ProjectReport } from '../../types/projectReport';
import type { MyAction } from '../dashboard/myActions';
import { canSnooze, consequenceLine, nextWorkingDay, onTimeRecord, snoozedIds } from './nudges';

const act = (id: string, due: string | null, link = '/x'): MyAction => ({ id, kind: 'project-review', due, label: id, detail: '', link });

describe('Tomorrow', () => {
  it('skips the weekend and holidays', () => {
    expect(nextWorkingDay('2026-11-13', [])).toBe('2026-11-16');            // Friday → Monday
    expect(nextWorkingDay('2026-11-13', ['2026-11-16'])).toBe('2026-11-17');
    expect(nextWorkingDay('2026-11-16', [])).toBe('2026-11-17');
  });
  it('is offered only before the due date', () => {
    expect(canSnooze(act('a', '2026-11-20'), '2026-11-14')).toBe(true);
    expect(canSnooze(act('a', '2026-11-14'), '2026-11-14')).toBe(false);
    expect(canSnooze(act('a', null), '2026-11-14')).toBe(true);
  });
  it('hides an item until its snooze ends', () => {
    expect([...snoozedIds({ a: '2026-11-16', b: '2026-11-14' }, '2026-11-14')]).toEqual(['a']);
  });
});

describe('consequenceLine', () => {
  const slot = act('slot-1', '2026-11-10', '/reports/new');
  it('names the day the head is told, then that the head was told', () => {
    expect(consequenceLine(slot, -4)).toBe('On 2026-11-17 your head of division is told.');
    expect(consequenceLine(slot, -7)).toBe('Your head of division has been told.');
  });
  it('says nothing for a report the sweep does not act on', () => {
    expect(consequenceLine(act('pms-1', '2026-11-10'), -4)).toBeNull();
  });
});

describe('onTimeRecord', () => {
  const r = (submittedAt: string | null, dueDate: string | null, by = 'me') => ({ submittedBy: by, submittedAt, dueDate } as ProjectReport);
  it('counts my reports sent this year and those sent by the due date', () => {
    expect(onTimeRecord([
      r('2026-06-10T10:00:00Z', '2026-06-15'), r('2026-09-20T10:00:00Z', '2026-09-15'),
      r('2026-02-01T10:00:00Z', '2026-02-05'), r(null, '2026-10-01'), r('2026-07-01T00:00:00Z', '2026-07-02', 'other'),
    ], 'me', '2026-11-14')).toEqual({ sent: 2, onTime: 1 });
  });
});

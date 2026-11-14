import { describe, expect, it } from 'vitest';
import type { MyAction } from '../dashboard/myActions';
import { classify, countByGroup } from './classify';
import { doNext, quickWins, rankActions } from './doNext';
import { daysUntil, doneToday, localIso, mergeSeen, weekStrip } from './today';
import { countWord, greeting } from './greeting';

const NOW = new Date(2026, 10, 13, 9, 0); // Fri 13 Nov 2026, local
const act = (id: string, kind: MyAction['kind'], due: string | null): MyAction =>
  ({ id, kind, due, label: id, detail: '', link: '/' });

describe('classify', () => {
  it('puts each kind in a group with an estimate', () => {
    expect(classify(act('a', 'progress-report', null))).toEqual({ group: 'research', minutes: 30 });
    expect(classify(act('a', 'action-item', null)).group).toBe('committee');
  });
  it('counts by group', () => {
    expect(countByGroup([act('a', 'proposal', null), act('b', 'ticket', null), act('c', 'pms-draft', null)]))
      .toEqual({ research: 1, admin: 2, committee: 0 });
  });
});

describe('rankActions', () => {
  const ranked = rankActions([
    act('undated', 'proposal', null),
    act('later', 'pms-draft', '2026-11-30'),
    act('overdue', 'progress-report', '2026-11-09'),
    act('sameDayLong', 'pms-draft', '2026-11-20'),
    act('sameDayShort', 'ticket', '2026-11-20'),
  ], NOW);
  it('orders overdue, then by due date, then undated; ties to the shorter job', () => {
    expect(ranked.map(a => a.id)).toEqual(['overdue', 'sameDayShort', 'sameDayLong', 'later', 'undated']);
  });
  it('does not change the input', () => {
    const input = [act('b', 'proposal', null), act('a', 'ticket', '2026-11-01')];
    rankActions(input, NOW);
    expect(input[0].id).toBe('b');
  });
});

describe('doNext and quickWins', () => {
  const ranked = rankActions([act('quick', 'contract-end', '2026-11-10'), act('work', 'proposal', '2026-11-20')], NOW);
  it('keeps two-minute items as quick wins', () => {
    expect(quickWins(ranked).map(a => a.id)).toEqual(['quick']);
  });
  it('picks the first item that is not a quick win', () => {
    expect(doNext(ranked)?.id).toBe('work');
  });
  it('falls back to a quick win, then to nothing', () => {
    expect(doNext([act('quick', 'contract-end', null)])?.id).toBe('quick');
    expect(doNext([])).toBeNull();
  });
});

describe('today', () => {
  it('formats a local date', () => {
    expect(localIso(NOW)).toBe('2026-11-13');
  });
  it('counts days, negative when past', () => {
    expect(daysUntil('2026-11-19', NOW)).toBe(6);
    expect(daysUntil('2026-11-09', NOW)).toBe(-4);
  });
  it('counts items seen today that are closed now', () => {
    expect(doneToday(['a', 'b', 'c'], ['b'])).toBe(2);
    expect(doneToday([], ['b'])).toBe(0);
  });
  it('merges seen ids without repeats', () => {
    expect(mergeSeen(['a'], ['a', 'b'])).toEqual(['a', 'b']);
  });
  it('builds seven days from today and places marks', () => {
    const cells = weekStrip([
      { date: '2026-11-13', mark: 'deadline' },
      { date: '2026-11-13', mark: 'deadline' },
      { date: '2026-11-19', mark: 'meeting' },
      { date: '2026-11-20', mark: 'holiday' }, // outside the strip
    ], NOW);
    expect(cells).toHaveLength(7);
    expect(cells[0]).toMatchObject({ iso: '2026-11-13', letter: 'F', isToday: true });
    expect(cells[0].marks.deadline).toBe(2);
    expect(cells[6].marks.meeting).toBe(1);
    expect(cells.reduce((n, c) => n + c.marks.holiday, 0)).toBe(0);
  });
});

describe('greeting', () => {
  it('uses words for small counts', () => {
    expect(countWord(7)).toBe('Seven');
    expect(countWord(40)).toBe('40');
  });
  it('says what is left and what is overdue', () => {
    expect(greeting({ name: 'Dr. Rao', hour: 9, left: 7, overdue: 2 }))
      .toBe('Good morning, Dr. Rao. Seven things are left. Two are overdue.');
    expect(greeting({ name: 'Dr. Rao', hour: 14, left: 1, overdue: 1 }))
      .toBe('Good afternoon, Dr. Rao. One thing is left. One is overdue.');
  });
  it('has a plain sentence for an empty day and for no linked staff row', () => {
    expect(greeting({ name: '', hour: 19, left: 0, overdue: 0 })).toBe('Good evening. Nothing is waiting on you.');
  });
});

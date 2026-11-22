import { describe, it, expect } from 'vitest';
import type { MyAction } from '../dashboard/myActions';
import { classifyAction, summarizeByGroup } from './classify';
import { canSnoozeForTomorrow, pickDoNext, rankHomeActions } from './doNext';
import { computeTodayProgress } from './today';
import { buildGreetingSentence } from './greeting';
import { filterUnclaimed } from './claimedKeys';

const base = (over: Partial<MyAction>): MyAction => ({
  id: 'a1',
  kind: 'ticket',
  label: 'Test',
  detail: 'Detail',
  due: null,
  link: '/work',
  ...over,
});

describe('home/classify', () => {
  it('groups action kinds and marks <= 2 minute confirmations as quick wins', () => {
    const cls = classifyAction(base({ kind: 'action-item' }));
    expect(cls.group).toBe('committee');
    expect(cls.minutes).toBe(2);
    expect(cls.quickWin).toBe(true);

    const prog = classifyAction(base({ kind: 'progress-report' }));
    expect(prog.group).toBe('research');
    expect(prog.quickWin).toBe(false);

    expect(summarizeByGroup([cls, prog])).toEqual({ research: 1, admin: 0, committee: 1 });
  });
});

describe('home/doNext', () => {
  it('ranks priorities first, then overdue, then soonest due, then shorter estimate', () => {
    const today = '2026-11-22';
    const items = [
      classifyAction(base({ id: 'later-long', kind: 'progress-report', due: '2026-11-25' })), // 15m
      classifyAction(base({ id: 'later-short', kind: 'action-item', due: '2026-11-25' })),    // 2m
      classifyAction(base({ id: 'overdue', kind: 'ticket', due: '2026-11-20' })),
      { ...classifyAction(base({ id: 'pri', kind: 'ticket', due: '2026-11-28' })), priority: true },
    ];
    const ranked = rankHomeActions(items, new Set(), today);
    expect(ranked.map((r) => r.id)).toEqual(['pri', 'overdue', 'later-short', 'later-long']);
    expect(pickDoNext(items, new Set(), today)?.id).toBe('pri');
  });

  it('allows snoozing future non-priority items but refuses overdue, due-today, and priority items', () => {
    const today = '2026-11-22';
    const future = classifyAction(base({ id: 'f', due: '2026-11-25' }));
    const dueToday = classifyAction(base({ id: 't', due: '2026-11-22' }));
    const pri = { ...future, id: 'p', priority: true };

    expect(canSnoozeForTomorrow(future, today)).toBe(true);
    expect(canSnoozeForTomorrow(dueToday, today)).toBe(false);
    expect(canSnoozeForTomorrow(pri, today)).toBe(false);

    const ranked = rankHomeActions([future, dueToday, pri], new Set(['f', 't', 'p']), today);
    expect(ranked.map((r) => r.id)).toEqual(['p', 't']);
  });
});

describe('home/today & greeting', () => {
  it('computes done today ring totals cleanly', () => {
    expect(computeTodayProgress(5, ['a', 'b', 'a'])).toEqual({ done: 2, total: 7, pending: 5, pct: 29 });
    expect(computeTodayProgress(0, [])).toEqual({ done: 0, total: 0, pending: 0, pct: 100 });
  });

  it('builds natural sentence with unlinked staff fallback', () => {
    const morning = new Date(2026, 10, 22, 9, 0, 0);
    expect(buildGreetingSentence(null, 0, 0, morning)).toMatch(/not linked to a staff record/);
    expect(buildGreetingSentence('Dr. Rao', 3, 1, morning)).toBe('Good morning, Dr. Rao. 3 things are left today.');
    expect(buildGreetingSentence('Dr. Rao', 0, 2, morning)).toBe('Good morning, Dr. Rao. All 2 items cleared today.');
  });
});

describe('home/claimedKeys', () => {
  it('omits items already shown in the role half and reports hiddenCount', () => {
    const res = filterUnclaimed(
      [{ id: '1' }, { id: '2' }, { id: '3' }],
      (x) => x.id,
      new Set(['1', '3']),
    );
    expect(res.visible).toEqual([{ id: '2' }]);
    expect(res.hiddenCount).toBe(2);
  });
});

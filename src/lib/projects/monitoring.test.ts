import { describe, it, expect } from 'vitest';
import { decisionsFor, portfolioHealth, slotState } from './monitoring';

describe('slotState', () => {
  const today = '2027-10-20';
  it('reads overdue, due soon, upcoming and done', () => {
    expect(slotState({ status: 'PENDING', dueDate: '2027-10-15', minutesDue: null }, today)).toBe('overdue');
    expect(slotState({ status: 'PENDING', dueDate: '2027-11-15', minutesDue: null }, today)).toBe('due-soon');
    expect(slotState({ status: 'PENDING', dueDate: '2028-03-31', minutesDue: null }, today)).toBe('upcoming');
    expect(slotState({ status: 'DONE', dueDate: '2027-09-30', minutesDue: null }, today)).toBe('done');
  });
  it('a held review still owes its minutes past their deadline', () => {
    expect(slotState({ status: 'DONE', dueDate: '2027-09-30', minutesDue: '2027-10-07' }, today)).toBe('minutes-overdue');
  });
});

describe('decisionsFor', () => {
  it('stage-gates take go / kill decisions; other reviews take continue / hold', () => {
    expect(decisionsFor('STAGE_GATE')).toContain('KILL');
    expect(decisionsFor('TASK_FORCE')).not.toContain('KILL');
    expect(decisionsFor('TASK_FORCE')).toContain('HOLD');
  });
});

describe('portfolioHealth', () => {
  const base = { overdue: 0, minutesOverdue: 0, elapsedPct: 50, sanctionedCost: 1000, spent: 500, milestonesTotal: 4, milestonesAchieved: 2 };
  it('is on track when money and milestones keep pace with time', () => {
    expect(portfolioHealth(base)).toBe('on-track');
  });
  it('watches a gap over 10 points and calls more than 25 behind', () => {
    expect(portfolioHealth({ ...base, spent: 350 })).toBe('watch');
    expect(portfolioHealth({ ...base, milestonesAchieved: 0 })).toBe('behind');
  });
  it('anything overdue is behind', () => {
    expect(portfolioHealth({ ...base, overdue: 1 })).toBe('behind');
    expect(portfolioHealth({ ...base, minutesOverdue: 1 })).toBe('behind');
  });
});

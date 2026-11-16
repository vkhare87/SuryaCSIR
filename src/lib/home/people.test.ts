import { describe, expect, it } from 'vitest';
import type { PhDMilestone } from '../../types';
import { PHD_GATES, contractClock, currentEngagement, leaveYear, paidLeaveUsed, phdRoad, yearsMonths } from './people';

const ms = (milestone: PhDMilestone['milestone'], completedDate?: string, dueDate?: string) =>
  ({ id: milestone, enrollmentNo: 'E1', milestone, completedDate, dueDate } as PhDMilestone);
const eng = (id: string, fromOn: string, toOn: string) => ({ id, projectId: 'P', positionCode: 'JRF', fromOn, toOn });

describe('phdRoad', () => {
  it('lists all eight gates in order and finds the first one not passed', () => {
    const r = phdRoad([ms('Coursework', '2024-01-01'), ms('Joining', '2023-08-01'), ms('Comprehensive Exam', undefined, '2026-12-01')]);
    expect(r.gates).toHaveLength(8);
    expect(r.gates.slice(0, 3).map(g => g.done)).toEqual([true, true, false]);
    expect(r.next).toMatchObject({ name: 'Comprehensive Exam', dueDate: '2026-12-01' });
  });
  it('has no next gate when every gate is passed', () => {
    expect(phdRoad(PHD_GATES.map(n => ms(n, '2020-01-01'))).next).toBeNull();
  });
});

describe('leave', () => {
  it('uses 1 April to 31 March', () => {
    expect(leaveYear('2026-11-14')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(leaveYear('2026-02-10')).toEqual({ from: '2025-04-01', to: '2026-03-31' });
  });
  it('counts paid days in this leave year only, both ends included', () => {
    expect(paidLeaveUsed([
      { kind: 'PAID', fromOn: '2026-06-01', toOn: '2026-06-03' },
      { kind: 'PAID', fromOn: '2026-03-30', toOn: '2026-04-02' }, // 2 days inside
      { kind: 'MATERNITY', fromOn: '2026-07-01', toOn: '2026-07-30' },
      { kind: 'PAID', fromOn: '2025-06-01', toOn: '2025-06-05' },
    ], '2026-11-14')).toBe(5);
  });
});

describe('engagement clocks', () => {
  const list = [eng('a', '2023-04-01', '2025-03-31'), eng('b', '2025-04-01', '2027-03-31'), eng('c', '2027-04-01', '2028-03-31')];
  it('picks the running engagement, else the next, else the last', () => {
    expect(currentEngagement(list, '2026-11-14')?.id).toBe('b');
    expect(currentEngagement([list[2]], '2026-11-14')?.id).toBe('c');
    expect(currentEngagement([list[0]], '2026-11-14')?.id).toBe('a');
    expect(currentEngagement([], '2026-11-14')).toBeNull();
  });
  it('gives days left and the share used', () => {
    const c = contractClock(eng('x', '2026-01-01', '2026-12-31'), new Date(2026, 6, 2));
    expect(c.daysLeft).toBe(182);
    expect(Math.round(c.share * 100)).toBe(50);
  });
  it('writes days as years and months', () => {
    expect(yearsMonths(365 * 2 + 300)).toBe('2 y 9 m');
    expect(yearsMonths(40)).toBe('1 m');
  });
});

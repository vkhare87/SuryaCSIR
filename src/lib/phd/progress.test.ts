import { describe, it, expect } from 'vitest';
import { scholarProgress, PHD_MILESTONE_ORDER } from './progress';
import type { PhDMilestone } from '../../types';

function ms(milestone: PhDMilestone['milestone'], over: Partial<PhDMilestone> = {}): PhDMilestone {
  return { id: milestone, enrollmentNo: 'E1', milestone, ...over };
}

describe('scholarProgress', () => {
  const today = new Date('2026-07-07');

  it('orders 8 canonical milestones', () => {
    expect(PHD_MILESTONE_ORDER).toHaveLength(8);
    expect(PHD_MILESTONE_ORDER[0]).toBe('Joining');
    expect(PHD_MILESTONE_ORDER[7]).toBe('Degree Awarded');
  });

  it('computes percent from completed milestones', () => {
    const p = scholarProgress([
      ms('Joining', { completedDate: '2023-08-01' }),
      ms('Coursework', { completedDate: '2024-06-01' }),
      ms('Comprehensive Exam'),
    ], today);
    expect(p.completed).toBe(2);
    expect(p.percent).toBe(25); // 2 of 8
    expect(p.next).toBe('Comprehensive Exam');
  });

  it('flags overdue milestones (due passed, not completed)', () => {
    const p = scholarProgress([ms('Registration', { dueDate: '2026-01-01' })], today);
    expect(p.overdue).toEqual(['Registration']);
  });

  it('empty input → 0%, next = Joining', () => {
    const p = scholarProgress([], today);
    expect(p.percent).toBe(0);
    expect(p.next).toBe('Joining');
    expect(p.overdue).toEqual([]);
  });
});

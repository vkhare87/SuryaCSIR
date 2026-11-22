import { describe, it, expect } from 'vitest';
import { runDecisionPrecheck } from './prechecks';

describe('HoD decision pre-checks (HH3)', () => {
  it.each([
    ['HIRING_EXTENSION', { tenureYearsUsed: 2.5 }, 'PASS'],
    ['HIRING_EXTENSION', { tenureYearsUsed: 6.2 }, 'FINDING'],
    ['HIRING_EXTENSION', {}, 'NOT_CONNECTED'],
    ['PURCHASE_INDENT', { amountInr: 250000 }, 'PASS'],
    ['PURCHASE_INDENT', { amountInr: 650000 }, 'FINDING'],
    ['PURCHASE_INDENT', {}, 'NOT_CONNECTED'],
    ['PROGRESS_REPORT', { lateMilestonesCount: 0, reasonGiven: false }, 'PASS'],
    ['PROGRESS_REPORT', { lateMilestonesCount: 2, reasonGiven: false }, 'FINDING'],
    ['PROGRESS_REPORT', {}, 'NOT_CONNECTED'],
    ['PROPOSAL', { readinessScore: 85, coiComplete: true }, 'PASS'],
    ['PROPOSAL', { readinessScore: 45, coiComplete: false }, 'FINDING'],
    ['PROPOSAL', {}, 'NOT_CONNECTED'],
    ['LEAVE_TOUR', { hasScheduleClash: false }, 'PASS'],
    ['LEAVE_TOUR', { hasScheduleClash: true }, 'FINDING'],
    ['LEAVE_TOUR', {}, 'NOT_CONNECTED'],
  ] as const)('%s returns %s', (kind, input, expected) => {
    const res = runDecisionPrecheck(kind, input);
    expect(res.status).toBe(expected);
  });
});

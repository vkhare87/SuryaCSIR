import { describe, it, expect } from 'vitest';
import { needsLegacyCompletion, yearsBetween } from './legacy';

describe('yearsBetween', () => {
  it('lists the Indian financial years a period spans', () => {
    expect(yearsBetween('2024-04-01', '2026-03-31')).toEqual(['2024-25', '2025-26']);
    expect(yearsBetween('2024-03-15', '2024-04-02')).toEqual(['2023-24', '2024-25']);
    expect(yearsBetween('2025-01-01', '2024-01-01')).toEqual([]);
    expect(yearsBetween('31/03/2024', '2025-01-01')).toEqual([]);
  });
});

describe('needsLegacyCompletion', () => {
  const base = { proposalId: null, legacyCompletedAt: null, stage: 'ACTIVE' as const, ProjectStatus: 'Active' };
  it('is a running project with no proposal, not yet brought in', () => {
    expect(needsLegacyCompletion(base)).toBe(true);
    expect(needsLegacyCompletion({ ...base, proposalId: 'p1' })).toBe(false);
    expect(needsLegacyCompletion({ ...base, legacyCompletedAt: '2026-11-12' })).toBe(false);
    expect(needsLegacyCompletion({ ...base, stage: 'CLOSED', ProjectStatus: 'Completed' })).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { coAuthorPairs } from './collaboration';
import type { ScientificOutput, StaffMember } from '../../types';

function out(authors: string[]): ScientificOutput {
  return { id: Math.random().toString(), title: 't', authors, journal: 'j', year: 2025, divisionCode: 'CMD' };
}

const staff = [
  { Name: 'A Kumar', Division: 'CMD' },
  { Name: 'B Singh', Division: 'LWMD' },
  { Name: 'C Verma', Division: 'CMD' },
] as StaffMember[];

describe('coAuthorPairs', () => {
  it('counts repeated pairs and flags cross-division', () => {
    const pairs = coAuthorPairs([out(['A Kumar', 'B Singh']), out(['A Kumar', 'B Singh'])], staff);
    expect(pairs).toEqual([{ a: 'A Kumar', b: 'B Singh', count: 2, crossDivision: true }]);
  });

  it('same-division pair is not cross-division', () => {
    const pairs = coAuthorPairs([out(['A Kumar', 'C Verma'])], staff);
    expect(pairs[0].crossDivision).toBe(false);
  });

  it('emits every pair from a 3-author paper', () => {
    const pairs = coAuthorPairs([out(['A Kumar', 'B Singh', 'C Verma'])], staff);
    expect(pairs).toHaveLength(3);
  });
});

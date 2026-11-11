import { describe, it, expect } from 'vitest';
import { subStage } from './milestones';

describe('subStage', () => {
  it('numbers six-month blocks from the project start', () => {
    expect(subStage('2027-04-01', '2027-04-01')).toBe(1);
    expect(subStage('2027-04-01', '2027-09-30')).toBe(1);
    expect(subStage('2027-04-01', '2027-10-01')).toBe(2);
    expect(subStage('2027-04-01', '2029-03-31')).toBe(4);
  });
  it('has no block before the start, or without a usable start date', () => {
    expect(subStage('2027-04-01', '2027-03-31')).toBeNull();
    expect(subStage(null, '2027-04-01')).toBeNull();
    expect(subStage('01.04.2027', '2027-04-01')).toBeNull();
  });
});

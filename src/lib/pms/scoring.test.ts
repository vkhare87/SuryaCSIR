import { describe, it, expect } from 'vitest';
import {
  averageScores,
  clampScore,
  getGrade,
  isValidScore,
  requiresBelowThresholdReasons,
  requiresOutstandingReasons,
} from './scoring';

describe('isValidScore', () => {
  it('accepts integers 0–100', () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(75)).toBe(true);
    expect(isValidScore(100)).toBe(true);
  });

  it('rejects non-integers and out-of-range values', () => {
    expect(isValidScore(75.5)).toBe(false);
    expect(isValidScore(0.9)).toBe(false); // legacy 2012 scale value
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(101)).toBe(false);
    expect(isValidScore(NaN)).toBe(false);
  });
});

describe('getGrade — 2026 grading scale', () => {
  it.each([
    [100, 'Outstanding'],
    [90, 'Outstanding'],
    [89, 'Excellent'],
    [85, 'Excellent'],
    [84, 'Very Good'],
    [75, 'Very Good'],
    [74, 'Good'],
    [60, 'Good'],
    [59, 'Satisfactory'],
    [50, 'Satisfactory'],
    [49, 'Need Improvement'],
    [0, 'Need Improvement'],
  ])('score %i → %s', (score, grade) => {
    expect(getGrade(score)).toBe(grade);
  });
});

describe('mandatory-reason thresholds', () => {
  it('requires outstanding reasons at 90 and above only', () => {
    expect(requiresOutstandingReasons(90)).toBe(true);
    expect(requiresOutstandingReasons(100)).toBe(true);
    expect(requiresOutstandingReasons(89)).toBe(false);
  });

  it('requires below-threshold reasons at 75 and below (inclusive)', () => {
    expect(requiresBelowThresholdReasons(75)).toBe(true);
    expect(requiresBelowThresholdReasons(0)).toBe(true);
    expect(requiresBelowThresholdReasons(76)).toBe(false);
  });
});

describe('clampScore / averageScores', () => {
  it('clamps to integers within 0–100', () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(87.6)).toBe(88);
  });

  it('averages valid integer scores, rounding to an integer', () => {
    expect(averageScores([80, 85])).toBe(83);
    expect(averageScores([80, 85.5])).toBe(80); // non-integer ignored
    expect(averageScores([])).toBeNull();
    expect(averageScores([0.9, 1.1])).toBeNull(); // legacy values ignored
  });
});

import { describe, it, expect } from 'vitest';
import { parseCost } from './parseCost';

describe('parseCost', () => {
  it('parses plain numbers', () => expect(parseCost('1500')).toBe(1500));
  it('strips currency and separators', () => expect(parseCost('₹ 1,250.50 L')).toBeCloseTo(1250.5));
  it('returns 0 for empty/undefined', () => {
    expect(parseCost('')).toBe(0);
    expect(parseCost(undefined)).toBe(0);
  });
  it('returns 0 for non-numeric', () => expect(parseCost('N/A')).toBe(0));
});

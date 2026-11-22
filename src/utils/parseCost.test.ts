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
  it('keeps a plain numeric string whole, scientific notation included', () => {
    expect(parseCost('1e6')).toBe(1000000);
    expect(parseCost(' 2500.5 ')).toBe(2500.5);
  });
  it('accepts a number, as Excel imports deliver', () => {
    expect(parseCost(120000)).toBe(120000);
    expect(parseCost(Number.NaN)).toBe(0);
    expect(parseCost(null)).toBe(0);
  });
});

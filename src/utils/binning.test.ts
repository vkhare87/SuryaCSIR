import { describe, it, expect } from 'vitest';
import { bin, sturgesBinCount, freedmanDiaconisBinCount } from './binning';

describe('sturgesBinCount', () => {
  it('returns 1 for n < 2', () => {
    expect(sturgesBinCount(0)).toBe(1);
    expect(sturgesBinCount(1)).toBe(1);
  });

  it('follows ceil(log2(n) + 1)', () => {
    expect(sturgesBinCount(8)).toBe(4);
    expect(sturgesBinCount(100)).toBe(8);
  });
});

describe('freedmanDiaconisBinCount', () => {
  it('returns 1 for tiny samples', () => {
    expect(freedmanDiaconisBinCount([5])).toBe(1);
  });

  it('falls back to Sturges when IQR is zero', () => {
    expect(freedmanDiaconisBinCount([5, 5, 5, 5, 5])).toBe(freedmanDiaconisBinCount([5, 5, 5, 5, 5]));
  });
});

describe('bin', () => {
  it('returns empty array for empty input', () => {
    expect(bin([])).toEqual([]);
  });

  it('strips non-finite values', () => {
    const out = bin([1, 2, 3, NaN, Infinity, -Infinity]);
    const total = out.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(3);
  });

  it('produces a single bin when all values are identical', () => {
    const out = bin([7, 7, 7]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
    expect(out[0].start).toBe(7);
    expect(out[0].end).toBe(7);
  });

  it('respects an explicit bin count', () => {
    const out = bin([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5);
    expect(out).toHaveLength(5);
    const total = out.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(10);
  });

  it('every value lands in exactly one bin', () => {
    const values = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100];
    const out = bin(values, 'sturges');
    const total = out.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(values.length);
  });

  it('labels integer bins without decimals', () => {
    const out = bin([0, 10, 20, 30, 40, 50], 5);
    out.forEach((b) => expect(b.label).toMatch(/^\d+–\d+$/));
  });

  it('handles Freedman-Diaconis strategy', () => {
    const out = bin([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'freedman-diaconis');
    expect(out.length).toBeGreaterThanOrEqual(1);
    const total = out.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(10);
  });
});

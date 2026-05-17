import { describe, it, expect } from 'vitest';
import { __test__ } from './useChartFilter';

const { parse, serialize } = __test__;

describe('useChartFilter parse/serialize', () => {
  it('round-trips a simple filter', () => {
    const f = { dim: 'fundType', value: 'External' };
    expect(parse(serialize(f))).toEqual(f);
  });

  it('handles colon inside value via encoding', () => {
    const f = { dim: 'status', value: 'state:active' };
    expect(parse(serialize(f))).toEqual(f);
  });

  it('handles spaces and punctuation', () => {
    const f = { dim: 'sponsorer', value: 'Dept. of Science & Tech' };
    expect(parse(serialize(f))).toEqual(f);
  });

  it('returns null for empty/invalid strings', () => {
    expect(parse(null)).toBeNull();
    expect(parse('')).toBeNull();
    expect(parse('nocolon')).toBeNull();
    expect(parse(':leadingcolon')).toBeNull();
    expect(parse('trailingcolon:')).toBeNull();
  });
});

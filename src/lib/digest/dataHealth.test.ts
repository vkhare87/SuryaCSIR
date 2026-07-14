import { describe, it, expect } from 'vitest';
import { buildDataHealthDigest, sortAndCap, type DigestItem, type DigestSeverity } from './dataHealth';
import type { DivisionFreshness } from '../divisions/freshness';

function fresh(over: Partial<DivisionFreshness>): DivisionFreshness {
  return {
    divCode: 'CMD', divName: 'Advanced Materials', completeness: 100,
    latestRecordYear: 2026, staleness: 'fresh', gaps: [], ...over,
  };
}

describe('buildDataHealthDigest — institute stewards', () => {
  const rows = [
    fresh({ divCode: 'A', staleness: 'empty', completeness: 0, latestRecordYear: null }),
    fresh({ divCode: 'B', staleness: 'stale', latestRecordYear: 2021 }),
    fresh({ divCode: 'C', staleness: 'aging', latestRecordYear: 2024 }),
    fresh({ divCode: 'D' }), // healthy, no gaps
  ];

  it('rolls up by severity for Director', () => {
    const items = buildDataHealthDigest('Director', null, rows);
    expect(items.map(i => i.id)).toEqual(['inst-empty', 'inst-stale', 'inst-soft']);
    expect(items[0].severity).toBe('urgent');
    expect(items[0].detail).toBe('A');
    expect(items[1].detail).toBe('B (2021)');
    expect(items[2].detail).toBe('C');
  });

  it('returns nothing when every division is healthy', () => {
    expect(buildDataHealthDigest('Director', null, [fresh({ divCode: 'D' })])).toEqual([]);
  });

  it('counts a fresh-but-gappy division as soft', () => {
    const items = buildDataHealthDigest('HRAdmin', null, [
      fresh({ divCode: 'E', gaps: ['1/3 projects missing PI'] }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('inst-soft');
  });

  it('ignores non-steward roles', () => {
    expect(buildDataHealthDigest('Scientist', null, rows)).toEqual([]);
    expect(buildDataHealthDigest('Technician', null, rows)).toEqual([]);
  });
});

describe('buildDataHealthDigest — division stewards', () => {
  const rows = [
    fresh({ divCode: 'CMD', staleness: 'stale', latestRecordYear: 2021 }),
    fresh({ divCode: 'OTHER', staleness: 'empty' }),
  ];

  it('shows only the head\'s own division', () => {
    const items = buildDataHealthDigest('DivisionHead', 'CMD', rows);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('dh-CMD');
    expect(items[0].severity).toBe('warning');
  });

  it('is silent when the head\'s division is healthy', () => {
    expect(buildDataHealthDigest('HOD', 'CMD', [fresh({ divCode: 'CMD' })])).toEqual([]);
  });

  it('flags gaps even on a fresh division', () => {
    const items = buildDataHealthDigest('DivisionHead', 'CMD', [
      fresh({ divCode: 'CMD', gaps: ['2/5 staff missing email'] }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('info');
    expect(items[0].detail).toBe('2/5 staff missing email');
  });

  it('returns nothing without a division code', () => {
    expect(buildDataHealthDigest('DivisionHead', null, rows)).toEqual([]);
  });
});

describe('sortAndCap', () => {
  const item = (id: string, severity: DigestSeverity): DigestItem =>
    ({ id, severity, title: id, detail: '', href: '/x' });

  it('orders urgent > warning > info and caps at 7 by default', () => {
    const items = [
      item('i1', 'info'), item('w1', 'warning'), item('u1', 'urgent'),
      item('i2', 'info'), item('u2', 'urgent'), item('w2', 'warning'),
      item('i3', 'info'), item('i4', 'info'),
    ];
    const out = sortAndCap(items);
    expect(out).toHaveLength(7);
    expect(out.map(i => i.severity)).toEqual(
      ['urgent', 'urgent', 'warning', 'warning', 'info', 'info', 'info']);
  });
});

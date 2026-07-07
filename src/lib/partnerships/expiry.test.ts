import { describe, it, expect } from 'vitest';
import { expiringWithin } from './expiry';
import type { MoU } from '../../types';

function mou(over: Partial<MoU>): MoU {
  return { id: 'm', partnerName: 'X', partnerType: 'Other', purpose: '',
           signedDate: '2024-01-01', validUntil: '2030-01-01', status: 'Active',
           divisionCode: '', ...over };
}

describe('expiringWithin', () => {
  const today = new Date('2026-07-07');
  it('returns active MOUs expiring inside the window, soonest first', () => {
    const out = expiringWithin([
      mou({ id: 'a', validUntil: '2026-08-01' }),
      mou({ id: 'b', validUntil: '2026-07-20' }),
      mou({ id: 'c', validUntil: '2027-01-01' }),
      mou({ id: 'd', validUntil: '2026-08-01', status: 'Terminated' }),
    ], 90, today);
    expect(out.map(m => m.id)).toEqual(['b', 'a']);
  });
  it('includes already-expired Active MOUs (they need action most)', () => {
    const out = expiringWithin([mou({ id: 'e', validUntil: '2026-06-01' })], 90, today);
    expect(out.map(m => m.id)).toEqual(['e']);
  });
  it('skips MOUs with no validUntil', () => {
    expect(expiringWithin([mou({ validUntil: '' })], 90, today)).toEqual([]);
  });
});

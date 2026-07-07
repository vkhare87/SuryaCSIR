import type { MoU } from '../../types';

/** Active MOUs whose validity ends within `days` (or already lapsed), soonest first. */
export function expiringWithin(mous: MoU[], days: number, today: Date = new Date()): MoU[] {
  const cutoff = today.getTime() + days * 86400000;
  return mous
    .filter(m => m.status === 'Active' && m.validUntil)
    .filter(m => new Date(m.validUntil).getTime() <= cutoff)
    .sort((a, b) => a.validUntil.localeCompare(b.validUntil));
}

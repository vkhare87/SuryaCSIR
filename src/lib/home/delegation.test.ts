import { describe, expect, it } from 'vitest';
import type { CsirRule } from '../../types';
import { PRESETS, floorKinds, headPowers, presetOf } from './delegation';
import type { DelegationOrder } from './delegation';

const rule = (ruleKey: string, value: unknown, effectiveFrom = '2025-04-25'): CsirRule =>
  ({ id: ruleKey + effectiveFrom, ruleKey, value, unit: null, effectiveFrom, effectiveTo: null, sourceRef: 'x', verified: false, note: ruleKey.split('.').pop() ?? null });

describe('presets', () => {
  it('recognise a preset and a custom set', () => {
    expect(presetOf(PRESETS.BALANCED)).toBe('BALANCED');
    expect(presetOf(PRESETS.HANDS_ON)).toBe('HANDS_ON');
    const custom = PRESETS.BALANCED.map(l => (l.kind === 'PROPOSAL' ? { ...l, mode: 'HEAD_TELL' as const } : l));
    expect(presetOf(custom)).toBeNull();
  });
  it('hands-on keeps everything with the Director', () => {
    expect(PRESETS.HANDS_ON.every(l => l.mode === 'SELF')).toBe(true);
  });
});

describe('floorKinds', () => {
  it('reads the floor from the rules; a newer row can lift it', () => {
    const rules = [rule('delegation.floor.MOU_SIGNING', true), rule('delegation.floor.WRITE_OFF', true), rule('delegation.floor.WRITE_OFF', false, '2026-01-01')];
    expect(floorKinds(rules, '2026-11-14').map(f => f.kind)).toEqual(['MOU_SIGNING']);
  });
});

describe('headPowers', () => {
  const order: DelegationOrder = {
    id: 'o', orderNo: 'DO/2026/01', preset: null, effectiveFrom: '2026-11-14',
    lines: [
      { kind: 'INDENT', mode: 'HEAD_TELL', limit: 500000, division: '*' },
      { kind: 'PROPOSAL', mode: 'SELF', limit: null, division: '*' },
      { kind: 'PS_HIRE_EXTEND', mode: 'HEAD_TELL', limit: null, division: 'D2' },
    ],
  };
  it('lists what the head of this division decides', () => {
    expect(headPowers(order, 'D1').map(l => l.kind)).toEqual(['INDENT']);
    expect(headPowers(order, 'D2').map(l => l.kind)).toEqual(['INDENT', 'PS_HIRE_EXTEND']);
    expect(headPowers(null, 'D1')).toEqual([]);
  });
});

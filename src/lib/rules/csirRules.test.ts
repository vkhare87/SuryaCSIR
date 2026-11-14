import { describe, it, expect } from 'vitest';
import { ruleNumber, ruleOn } from './csirRules';
import type { CsirRule } from '../../types';

const row = (value: unknown, from: string, to: string | null): CsirRule => ({
  id: from, ruleKey: 'k', value, unit: null, effectiveFrom: from, effectiveTo: to, sourceRef: '§1', verified: false, note: null,
});
const rules = [row(500000, '2025-04-25', '2027-03-31'), row(600000, '2027-04-01', null)];

describe('csir rules', () => {
  it('answers the value in force on a date', () => {
    expect(ruleNumber(rules, 'k', '2027-03-31')).toBe(500000);
    expect(ruleNumber(rules, 'k', '2027-04-01')).toBe(600000);
  });

  it('has no value before the first row, and no default', () => {
    expect(ruleOn(rules, 'k', '2020-01-01')).toBeUndefined();
    expect(ruleNumber(rules, 'other', '2026-01-01')).toBeNull();
  });
});

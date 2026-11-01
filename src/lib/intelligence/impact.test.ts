import { describe, it, expect } from 'vitest';
import { averageImpactFactor } from './impact';
import type { ScientificOutput } from '../../types';

const out = (impactFactor?: number) =>
  ({ id: 'x', title: 't', authors: [], journal: 'j', year: 2025, divisionCode: 'D', impactFactor }) as ScientificOutput;

describe('averageImpactFactor', () => {
  it('averages only outputs that carry an impact factor', () => {
    expect(averageImpactFactor([out(2), out(4), out(undefined)])).toBe(3);
  });
  it('is 0 with nothing to average', () => {
    expect(averageImpactFactor([out(undefined)])).toBe(0);
  });
});

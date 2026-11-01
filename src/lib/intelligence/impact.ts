import type { ScientificOutput } from '../../types';

/** Mean impact factor over outputs that have one (0 when none do). */
export function averageImpactFactor(outputs: ScientificOutput[]): number {
  const ifs = outputs.map(p => p.impactFactor ?? 0).filter(Boolean);
  return ifs.length === 0 ? 0 : ifs.reduce((a, b) => a + b, 0) / ifs.length;
}

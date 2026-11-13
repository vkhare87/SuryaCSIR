import { describe, it, expect } from 'vitest';
import { P2026_SPECS, wizardSteps2026 } from './proforma2026';

describe('PMS 2026 proforma (Annexure-A)', () => {
  it('Questionnaire B is a step only for Pay Level 13 and above', () => {
    const keys = (b: boolean) => wizardSteps2026(b).flatMap(s => s.keys);
    expect(keys(true)).toContain('p26_qb');
    expect(keys(false)).not.toContain('p26_qb');
  });

  it('every section a step names has a spec, and every spec is on a step', () => {
    const onSteps = new Set(wizardSteps2026(true).flatMap(s => s.keys));
    expect([...onSteps].every(k => k in P2026_SPECS)).toBe(true);
    expect(Object.keys(P2026_SPECS).every(k => onSteps.has(k as never))).toBe(true);
  });

  it('carries the printed word limits: I.4 150, I.5 100, sections III and IV 300 in all', () => {
    expect(P2026_SPECS.p26_i4).toMatchObject({ kind: 'text', maxWords: 150 });
    expect(P2026_SPECS.p26_i5).toMatchObject({ kind: 'text', maxWords: 100 });
    expect(P2026_SPECS.p26_iii).toMatchObject({ kind: 'prompts', totalMaxWords: 300 });
    expect(P2026_SPECS.p26_iv).toMatchObject({ kind: 'prompts', totalMaxWords: 300 });
  });

  it('has the guideline\'s two Questionnaire A and three Questionnaire B questions, and III.1–III.11, IV.1–IV.10', () => {
    const count = (k: keyof typeof P2026_SPECS) => { const s = P2026_SPECS[k]; return s.kind === 'prompts' ? s.prompts.length : 0; };
    expect([count('p26_qa'), count('p26_qb'), count('p26_iii'), count('p26_iv')]).toEqual([2, 3, 11, 10]);
  });

  it('Part I carries the assessment period, which submission needs', () => {
    const s = P2026_SPECS.p26_part1;
    expect(s.kind === 'fields' && s.fields.map(f => f.key)).toEqual(expect.arrayContaining(['periodFrom', 'periodTo']));
  });
});

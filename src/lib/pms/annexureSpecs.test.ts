import { describe, it, expect } from 'vitest';
import { ANNEXURE_SPECS, PEN_PICTURE_SPECS } from './annexureSpecs';
import { SECTION_KEYS, wizardStepsFor } from './constants';
import type { PmsTrack, SectionKey, SeniorSectionKey } from '../../types/pms';

const SENIOR_TRACKS: PmsTrack[] = ['ANNEXURE_I', 'ANNEXURE_II'];

describe('ANNEXURE_SPECS', () => {
  it('resolves every senior wizard-step key to a spec', () => {
    for (const track of SENIOR_TRACKS) {
      for (const step of wizardStepsFor(track)) {
        for (const key of step.keys) {
          expect(ANNEXURE_SPECS[key as SeniorSectionKey], `${track}/${key}`).toBeDefined();
        }
      }
    }
  });

  it('resolves every standard wizard-step key to a standard section key, not a spec', () => {
    const standard = new Set<SectionKey>(SECTION_KEYS);
    for (const step of wizardStepsFor('STANDARD')) {
      for (const key of step.keys) {
        expect(standard.has(key), `STANDARD/${key}`).toBe(true);
        expect(ANNEXURE_SPECS[key as SeniorSectionKey]).toBeUndefined();
      }
    }
  });

  it('uses every declared spec in exactly one wizard step', () => {
    const used = SENIOR_TRACKS.flatMap(t => wizardStepsFor(t).flatMap(s => s.keys));
    expect(new Set(used).size).toBe(used.length);          // no key reused
    expect(new Set(used)).toEqual(new Set(Object.keys(ANNEXURE_SPECS)));
  });

  it('gives every spec a title and every field a unique key within its section', () => {
    for (const [key, spec] of Object.entries(ANNEXURE_SPECS)) {
      expect(spec.title, key).toBeTruthy();
      const keys =
        spec.kind === 'fields'  ? spec.fields.map(f => f.key)
        : spec.kind === 'prompts' ? spec.prompts.map(p => p.key)
        : spec.kind === 'table'   ? spec.columns.map(c => c.key)
        : [];
      expect(new Set(keys).size, key).toBe(keys.length);
    }
  });

  it('carries the word caps the proformas state', () => {
    const i4 = ANNEXURE_SPECS.sr_b_i4;
    expect(i4.kind === 'text' && i4.maxWords).toBe(150);
    const roadmap = ANNEXURE_SPECS.dir_qa;
    expect(roadmap.kind === 'prompts'
      && roadmap.prompts.find(p => p.key === 'roadmap')?.maxWords).toBe(200);
    const iii = ANNEXURE_SPECS.sr_b_iii;
    expect(iii.kind === 'prompts' && iii.prompts.every(p => p.maxWords === 300)).toBe(true);
  });

  it('carries both Appendix-C rating scales', () => {
    for (const track of SENIOR_TRACKS) {
      const groups = PEN_PICTURE_SPECS[track as 'ANNEXURE_I' | 'ANNEXURE_II'];
      expect(groups.length).toBe(5);
      expect(groups[0].scale).toEqual(['Excellent', 'Very Good', 'Good', 'Needs to be Improved']);
      expect(groups[3].scale).toEqual(['Impeccable', 'Beyond Doubt', 'To be Monitored']);
      expect(groups[4].scale).toEqual(['Yes', 'No']);
      expect(groups.flatMap(g => g.rows).length).toBeGreaterThan(5);
    }
  });
});

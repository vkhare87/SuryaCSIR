import { describe, it, expect } from 'vitest';
import { factYears, groupFacts, isExternalLink, mapFactRow } from './profile';

const fact = (section: string, from: string | null, to: string | null = null) =>
  mapFactRow({ section, record_type: 'x', record_id: '1', title: 't', role: null, date_from: from, date_to: to, amount: null, link: '/x' });

describe('profile facts', () => {
  it('groups in display order and leaves out empty sections', () => {
    const g = groupFacts([fact('SERVICE', null), fact('PROJECT', null), fact('OUTPUT', null)]);
    expect(g.map(s => s.key)).toEqual(['PROJECT', 'OUTPUT', 'SERVICE']);
  });

  it('shows a year span, one year, or nothing', () => {
    expect(factYears(fact('PROJECT', '2023-04-01', '2026-03-31'))).toBe('2023–2026');
    expect(factYears(fact('OUTPUT', '2025-01-01', '2025-12-31'))).toBe('2025');
    expect(factYears(fact('STUDENT', null))).toBe('');
  });

  it('a DOI opens outside SURYA; an app path does not', () => {
    expect(isExternalLink('https://doi.org/10.1/x')).toBe(true);
    expect(isExternalLink('/projects/P1')).toBe(false);
  });
});

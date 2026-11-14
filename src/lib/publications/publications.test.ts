import { describe, it, expect } from 'vitest';
import { submitBlockers } from './api';

describe('publication file', () => {
  it('names what stops a submission', () => {
    const authors = [
      { pos: 1, name: 'Asha', staff_id: 'S1', contribution: 'x', consented_at: '2026-11-13' },
      { pos: 2, name: 'J. Smith', staff_id: null, contribution: null, consented_at: null },
      { pos: 3, name: 'Meena', staff_id: 'S2', contribution: null, consented_at: null },
    ];
    expect(submitBlockers({ communication_no: null, publication_author_consents: authors }))
      .toEqual(['no communication number', 'consent missing from Meena']);
    expect(submitBlockers({ communication_no: 'AMPRI/2026/0001', publication_author_consents: authors.slice(0, 2) })).toEqual([]);
  });
});

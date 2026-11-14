import { describe, it, expect } from 'vitest';
import { changeProblems, changeRoute, headCells, rceIncreasePct } from './changes';

const cells = headCells(
  [
    { fiscalYear: '2027-28', head: 'EQUIPMENT', amount: 600000 },
    { fiscalYear: '2027-28', head: 'CONSUMABLES', amount: 100000 },
    { fiscalYear: '2027-28', head: 'TA_INDIA', amount: 50000 },
  ],
  [{ fiscalYear: '2027-28', head: 'EQUIPMENT', amount: 500000 }],
);
const ctx = { track: 'ULIP', endDate: '2029-03-31', cells };

describe('changeProblems mirrors the database rules', () => {
  it('unspent per cell', () => {
    expect(cells.find(c => c.head === 'EQUIPMENT')).toMatchObject({ sanctioned: 600000, spent: 500000, unspent: 100000 });
  });

  it('refuses rephasing travel, backwards moves, and more than is unspent', () => {
    expect(changeProblems('REPHASING', { moves: [{ head: 'TA_INDIA', from_year: '2027-28', to_year: '2028-29', amount: 1 }] }, ctx))
      .toContain('Travel (India) cannot be rephased.');
    expect(changeProblems('REPHASING', { moves: [{ head: 'CONSUMABLES', from_year: '2028-29', to_year: '2027-28', amount: 1 }] }, ctx))
      .toContain('Money can only be carried forward to a later year.');
    expect(changeProblems('REPHASING', { moves: [{ head: 'EQUIPMENT', from_year: '2027-28', to_year: '2028-29', amount: 200000 }] }, ctx).join())
      .toMatch(/Equipment 2027-28 has ₹1,00,000 unspent/);
    expect(changeProblems('REPHASING', { moves: [{ head: 'EQUIPMENT', from_year: '2027-28', to_year: '2028-29', amount: 100000 }] }, ctx)).toEqual([]);
  });

  it('refuses Capital ↔ Revenue and augmenting travel', () => {
    expect(changeProblems('REAPPROPRIATION', { moves: [{ fiscal_year: '2027-28', from_head: 'EQUIPMENT', to_head: 'CONSUMABLES', amount: 1 }] }, ctx))
      .toContain('Capital and Revenue cannot be moved into each other.');
    expect(changeProblems('REAPPROPRIATION', { moves: [{ fiscal_year: '2027-28', from_head: 'CONSUMABLES', to_head: 'TA_ABROAD', amount: 1 }] }, ctx))
      .toContain('Travel cannot be increased.');
  });

  it('reallocation only on HQ, and only into approved heads', () => {
    const p = { lab: 'CSIR-NML', direction: 'IN' as const, lines: [{ fiscal_year: '2027-28', head: 'WORKS', amount: 1 }] };
    expect(changeProblems('REALLOCATION', p, ctx)).toContain('Only HQ projects with participating laboratories can reallocate.');
    expect(changeProblems('REALLOCATION', p, { ...ctx, track: 'HQ' })).toContain('Works & Services is not approved under this project.');
  });

  it('an RCE must raise the total and not cut below spending', () => {
    const lines = [{ fiscal_year: '2027-28', head: 'EQUIPMENT', amount: 400000 }, { fiscal_year: '2027-28', head: 'CONSUMABLES', amount: 500000 }];
    expect(changeProblems('RCE', { lines }, ctx).join()).toMatch(/cannot go below what is already spent/);
    expect(rceIncreasePct([{ fiscal_year: '2027-28', head: 'EQUIPMENT', amount: 900000 }], cells)).toBe(20);
  });

  it('time overrun and foreclosure need their dates and reasons', () => {
    expect(changeProblems('TIME_OVERRUN', { new_end_date: '2029-01-01' }, ctx)).toEqual(['The new end date must be after 2029-03-31.']);
    expect(changeProblems('FORECLOSURE', { effective_date: '2028-06-30' }, ctx))
      .toEqual(['Add the cost-benefit analysis of continuing against stopping.']);
  });
});

describe('changeRoute mirrors project_change_step_kinds()', () => {
  it('ULIP is decided in the institute', () => {
    expect(changeRoute('ULIP', 'RCE', 50, 20)).toEqual(['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']);
  });
  it('an HQ RCE above 20% adds two committees', () => {
    expect(changeRoute('HQ', 'RCE', 20, 20)).toHaveLength(4);
    expect(changeRoute('HQ', 'RCE', 20, 15)).toContain('REVISED_COST_COMMITTEE');
    expect(changeRoute('HQ', 'RCE', 5, null)).toContain('REVISED_COST_COMMITTEE');
    expect(changeRoute('HQ', 'RCE', 20.01, 20)).toContain('REVISED_COST_COMMITTEE');
  });
});

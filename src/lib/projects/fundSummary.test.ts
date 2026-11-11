import { describe, it, expect } from 'vitest';
import { fundSummary } from './fundSummary';

// The same worked example as scripts/db/projectExecution.db.test.ts.
const lines = [
  { fiscalYear: '2027-28', head: 'EQUIPMENT', amount: 600000 },
  { fiscalYear: '2027-28', head: 'CONSUMABLES', amount: 100000 },
  { fiscalYear: '2028-29', head: 'CONSUMABLES', amount: 300000 },
];
const receipts = [{ fiscalYear: '2027-28', amount: 700000 }, { fiscalYear: '2028-29', amount: 300000 }];
const spend = [
  { fiscalYear: '2027-28', head: 'EQUIPMENT', amount: 650000 },
  { fiscalYear: '2027-28', head: 'CONSUMABLES', amount: 40000 },
  { fiscalYear: '2027-28', head: 'CONSUMABLES', amount: 5000 },   // entered twice…
  { fiscalYear: '2027-28', head: 'CONSUMABLES', amount: -5000 },  // …and reversed
];

describe('fundSummary', () => {
  const s = fundSummary(lines, receipts, spend);

  it('gives sanctioned · received · spent · balance per year, reversals netted out', () => {
    expect(s.years).toEqual([
      { fiscalYear: '2027-28', sanctioned: 700000, received: 700000, spent: 690000, balance: 10000 },
      { fiscalYear: '2028-29', sanctioned: 300000, received: 300000, spent: 0, balance: 300000 },
    ]);
    expect(s.total).toEqual({ fiscalYear: 'Total', sanctioned: 1000000, received: 1000000, spent: 690000, balance: 310000 });
  });

  it('flags a head spent beyond its sanction for the year', () => {
    expect(s.heads.filter(h => h.over).map(h => `${h.fiscalYear} ${h.head}`)).toEqual(['2027-28 EQUIPMENT']);
    expect(s.heads.find(h => h.fiscalYear === '2027-28' && h.head === 'CONSUMABLES')).toMatchObject({ spent: 40000, over: false });
  });

  it('counts spend on a head with no sanction as over', () => {
    const t = fundSummary(lines, receipts, [{ fiscalYear: '2028-29', head: 'TA_ABROAD', amount: 1 }]);
    expect(t.heads.find(h => h.head === 'TA_ABROAD')).toMatchObject({ sanctioned: 0, over: true });
  });

  it('is empty for a project with nothing recorded', () => {
    expect(fundSummary([], [], [])).toEqual({
      years: [], heads: [], total: { fiscalYear: 'Total', sanctioned: 0, received: 0, spent: 0, balance: 0 },
    });
  });
});

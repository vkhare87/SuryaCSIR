import { describe, it, expect } from 'vitest';
import { draftSchema, submitSchema } from './validation';

const validBase = {
  title: 'Novel battery cathode',
  acronym: 'NBC',
  domainTheme: 'Energy Materials',
  fundType: 'External',
  sponsorType: 'Government',
  sponsorName: 'DST',
  projectCategory: 'Applied Research',
  proposedStartDate: '2026-08-01',
  proposedDurationMonths: 24,
  requestedBudget: 5000000,
  divisionCode: 'AMD',
  abstract: 'abc',
  problemStatement: 'p',
  objectives: 'o',
  expectedOutcomes: 'e',
  currentTrl: 3,
  targetTrl: 6,
  coPIs: [{ staffId: 'S1', staffName: 'Co-PI' }],
};

describe('draftSchema', () => {
  it('accepts a row with only title', () => {
    expect(draftSchema.safeParse({ title: 'wip' }).success).toBe(true);
  });
  it('rejects missing title', () => {
    expect(draftSchema.safeParse({}).success).toBe(false);
  });
});

describe('submitSchema', () => {
  it('accepts full valid object', () => {
    expect(submitSchema.safeParse(validBase).success).toBe(true);
  });
  it('rejects missing required text', () => {
    const bad = { ...validBase, abstract: '' };
    expect(submitSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects duration <= 0', () => {
    const bad = { ...validBase, proposedDurationMonths: 0 };
    expect(submitSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects budget < 0', () => {
    const bad = { ...validBase, requestedBudget: -1 };
    expect(submitSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects TRL out of range', () => {
    const bad = { ...validBase, currentTrl: 12 };
    expect(submitSchema.safeParse(bad).success).toBe(false);
  });
  it('accepts null TRL fields', () => {
    const ok = { ...validBase, currentTrl: null, targetTrl: null };
    expect(submitSchema.safeParse(ok).success).toBe(true);
  });
  it('rejects unknown fund type', () => {
    const bad = { ...validBase, fundType: 'Bitcoin' };
    expect(submitSchema.safeParse(bad).success).toBe(false);
  });
});

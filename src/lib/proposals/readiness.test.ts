import { describe, it, expect } from 'vitest';
import { REQUIRED_COLUMNS, missingItems, nextStep, sectionState } from './readiness';
import type { Proposal } from '../../types/proposal';

const ctx = (hasSignedScan: boolean) => ({ hasSignedScan, hasQuotation: false, lines: [] });

const blank = {
  title: 'Aluminium foam', track: null, categoryCode: null, abstract: '', problemStatement: '', domainTheme: '', objectives: '',
  expectedOutcomes: '', projectCategory: '', proposedStartDate: '', proposedDurationMonths: 0,
  piName: 'Dr PI', divisionCode: '', requestedBudget: 0, fundType: '', sponsorType: '', sponsorName: '',
  status: 'DRAFT',
} as Proposal;

const complete = {
  ...blank, track: 'ULIP', abstract: 'a', problemStatement: 'p', domainTheme: 'Nano Materials', objectives: 'o',
  expectedOutcomes: 'e', projectCategory: 'Basic Research', proposedStartDate: '2027-04-01',
  proposedDurationMonths: 24, divisionCode: 'D1', requestedBudget: 50, fundType: 'Internal',
  sponsorType: 'CSIR-Internal', sponsorName: 'CSIR-AMPRI',
} as Proposal;

describe('missingItems', () => {
  it('a title-only draft is missing everything else, in section order, and the signed scan last', () => {
    const cols = missingItems(blank, ctx(false)).map(i => i.column);
    expect(cols).toEqual([
      ...REQUIRED_COLUMNS.filter(c => !['title', 'pi_name', 'category_code', 'equipment_quotation', 'works_not_allowed'].includes(c)),
      'signed_scan',
    ]);
  });

  it('an HQ proposal asks for its HQ category instead of the general one', () => {
    const cols = missingItems({ ...complete, track: 'HQ', projectCategory: '' }, ctx(true)).map(i => i.column);
    expect(cols).toEqual(['category_code']);
  });

  it('equipment of ₹5 lakh or more needs a quotation; Works & Services only in MMP or FCP', () => {
    const lines = [{ head: 'EQUIPMENT', amount: 500000 }, { head: 'WORKS', amount: 1 }];
    expect(missingItems(complete, { hasSignedScan: true, hasQuotation: false, lines }).map(i => i.column))
      .toEqual(['equipment_quotation']);
    const hq = { ...complete, track: 'HQ', categoryCode: 'FTT' } as Proposal;
    expect(missingItems(hq, { hasSignedScan: true, hasQuotation: true, lines }).map(i => i.column))
      .toEqual(['works_not_allowed']);
    expect(missingItems({ ...hq, categoryCode: 'MMP' }, { hasSignedScan: true, hasQuotation: true, lines })).toEqual([]);
  });

  it('whitespace does not count as content, and a zero budget is not a budget', () => {
    const cols = missingItems({ ...complete, abstract: '   ', requestedBudget: 0 }, ctx(true)).map(i => i.column);
    expect(cols).toEqual(['abstract', 'requested_budget']);
  });

  it('is empty when the proposal can be submitted', () => {
    expect(missingItems(complete, ctx(true))).toEqual([]);
    expect(missingItems(complete, ctx(false)).map(i => i.column)).toEqual(['signed_scan']);
  });
});

describe('sectionState', () => {
  it('shows nothing, a dot or a tick', () => {
    expect(sectionState(blank, ctx(false), 'plan')).toBe('empty');
    expect(sectionState({ ...blank, objectives: 'o' }, ctx(false), 'plan')).toBe('started');
    expect(sectionState(complete, ctx(false), 'plan')).toBe('done');
    expect(sectionState(complete, ctx(false), 'documents')).toBe('empty');
    expect(sectionState(complete, ctx(true), 'documents')).toBe('done');
  });
});

describe('nextStep', () => {
  it('names the first thing a draft still needs', () => {
    expect(nextStep(blank)).toBe('Choose in-house or HQ scheme');
    expect(nextStep({ ...complete, objectives: '' })).toBe('Add objectives');
    expect(nextStep(complete)).toBe('Print it, get it signed, upload the scan and submit');
  });

  it('says where a submitted proposal stands in plain words', () => {
    expect(nextStep({ ...complete, status: 'SUBMITTED' })).toBe('Waiting for PME');
    expect(nextStep({ ...complete, status: 'REVISION_REQUESTED' })).toMatch(/Revision asked/);
  });
});

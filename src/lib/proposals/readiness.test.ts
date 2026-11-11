import { describe, it, expect } from 'vitest';
import { REQUIRED_COLUMNS, missingItems, nextStep, sectionState } from './readiness';
import type { Proposal } from '../../types/proposal';

const blank = {
  title: 'Aluminium foam', track: null, abstract: '', problemStatement: '', domainTheme: '', objectives: '',
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
    const cols = missingItems(blank, false).map(i => i.column);
    expect(cols).toEqual([...REQUIRED_COLUMNS.filter(c => c !== 'title' && c !== 'pi_name'), 'signed_scan']);
  });

  it('whitespace does not count as content, and a zero budget is not a budget', () => {
    const cols = missingItems({ ...complete, abstract: '   ', requestedBudget: 0 }, true).map(i => i.column);
    expect(cols).toEqual(['abstract', 'requested_budget']);
  });

  it('is empty when the proposal can be submitted', () => {
    expect(missingItems(complete, true)).toEqual([]);
    expect(missingItems(complete, false).map(i => i.column)).toEqual(['signed_scan']);
  });
});

describe('sectionState', () => {
  it('shows nothing, a dot or a tick', () => {
    expect(sectionState(blank, false, 'plan')).toBe('empty');
    expect(sectionState({ ...blank, objectives: 'o' }, false, 'plan')).toBe('started');
    expect(sectionState(complete, false, 'plan')).toBe('done');
    expect(sectionState(complete, false, 'documents')).toBe('empty');
    expect(sectionState(complete, true, 'documents')).toBe('done');
  });
});

describe('nextStep', () => {
  it('names the first thing a draft still needs', () => {
    expect(nextStep(blank)).toBe('Choose in-house or HQ scheme');
    expect(nextStep({ ...complete, objectives: '' })).toBe('Add objectives');
    expect(nextStep(complete)).toBe('Upload the signed proposal and submit');
  });

  it('says where a submitted proposal stands in plain words', () => {
    expect(nextStep({ ...complete, status: 'SUBMITTED' })).toBe('Waiting for PME');
    expect(nextStep({ ...complete, status: 'REVISION_REQUESTED' })).toMatch(/Revision asked/);
  });
});

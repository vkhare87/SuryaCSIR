import { describe, it, expect } from 'vitest';
import {
  AWP_ACTIVITY_LABELS,
  activityTotal,
  awpActionFor,
  awpYearOptions,
  emptyAWPContent,
  nextReportingYear,
  reportingYearFor,
  revisionWindowOpen,
} from './awp';
import type { AWPStatus, PMSAWP } from '../../types/pms';

const awp = (status: AWPStatus, over: Partial<PMSAWP> = {}): PMSAWP => ({
  ...emptyAWPContent(),
  id: 'a', staffId: 'S1', scientistUserId: 'u1', reportingYear: '2026-27', status,
  reportingOfficerId: 'RO', reviewingOfficerId: 'RVO',
  roVerdict: null, roReasons: null, roAt: null, rvoRemarks: null, rvoAt: null,
  directorDecision: null, directorRemarks: null, approvedAt: null, communicatedAt: null,
  returnReasons: null, source: 'ONLINE', sourcePdfPath: null, submittedAt: null,
  createdAt: '', updatedAt: '',
  ...over,
});

const none = { isDirector: false };

describe('activityTotal', () => {
  it('sums the sample AWP split to 100', () => {
    const rows = [25, 50, 5, 2, 5, 2, 1, 5, 5].map(timePct => ({ label: 'x', role: '', timePct }));
    expect(activityTotal(rows)).toBe(100);
  });
});

describe('reportingYearFor', () => {
  it('runs April to March', () => {
    expect(reportingYearFor(new Date(2026, 9, 21))).toBe('2026-27');
    expect(reportingYearFor(new Date(2027, 1, 1))).toBe('2026-27');
    expect(reportingYearFor(new Date(2027, 3, 1))).toBe('2027-28');
  });
});

describe('awpYearOptions', () => {
  it('offers this year and next year in the April–December part of the year', () => {
    expect(awpYearOptions(new Date(2026, 9, 22), [])).toEqual(['2026-27', '2027-28']);
  });
  it('still offers the following year in January–March (reviewer finding)', () => {
    expect(awpYearOptions(new Date(2027, 1, 10), [])).toEqual(['2026-27', '2027-28']);
  });
  it('keeps older years the scientist already has, sorted, without duplicates', () => {
    expect(awpYearOptions(new Date(2026, 9, 22), ['2025-26', '2026-27'])).toEqual(['2025-26', '2026-27', '2027-28']);
  });
});

describe('nextReportingYear', () => {
  it('steps to the following April–March year', () => {
    expect(nextReportingYear('2026-27')).toBe('2027-28');
    expect(nextReportingYear('2099-00')).toBe('2100-01');
  });
});

describe('revisionWindowOpen', () => {
  it('stays open through 30 September of the first year', () => {
    expect(revisionWindowOpen('2026-27', new Date(2026, 8, 30, 12))).toBe(true);
    expect(revisionWindowOpen('2026-27', new Date(2026, 9, 1))).toBe(false);
  });
});

describe('awpActionFor', () => {
  it('lets the owner edit a draft', () => {
    expect(awpActionFor(awp('DRAFT'), { staffId: 'S1', ...none })).toBe('EDIT');
  });
  it('gives the RO the review on WITH_RO', () => {
    expect(awpActionFor(awp('WITH_RO'), { staffId: 'RO', ...none })).toBe('RO_REVIEW');
  });
  it('gives the Director the decision on WITH_DIRECTOR', () => {
    expect(awpActionFor(awp('WITH_DIRECTOR'), { staffId: 'D', isDirector: true })).toBe('DIRECTOR_DECIDE');
  });
  it('does not give a non-Director (e.g. an admin) the Director decision (§5.E.a.iv)', () => {
    expect(awpActionFor(awp('WITH_DIRECTOR'), { staffId: 'H', isDirector: false })).toBeNull();
  });
  it('gives the RO the review of a blank-forwarded AWP', () => {
    expect(awpActionFor(awp('WITH_RO', { source: 'BLANK_FORWARDED' }), { staffId: 'RO', ...none })).toBe('RO_REVIEW');
  });
  it('gives a stranger nothing', () => {
    expect(awpActionFor(awp('WITH_RO'), { staffId: 'X', ...none })).toBeNull();
  });
});

describe('emptyAWPContent', () => {
  it('starts with the seven fixed activity rows', () => {
    expect(emptyAWPContent().activitySplit.map(r => r.label)).toEqual([...AWP_ACTIVITY_LABELS]);
  });
});

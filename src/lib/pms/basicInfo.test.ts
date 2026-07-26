import { describe, it, expect } from 'vitest';
import { basicInfoFromSection } from './basicInfo';

const NO_PREVIOUS = { previousPmsSubmittedOnTime: null, previousPmsSubmissionDate: null };

describe('basicInfoFromSection', () => {
  it('lifts the standard summary section onto the report columns', () => {
    expect(basicInfoFromSection(
      { title: 'APR 2025-26', periodFrom: '2025-04-01', periodTo: '2026-03-31', selfScore: 82 },
      { previousPmsSubmittedOnTime: true, previousPmsSubmissionDate: '2025-05-10' },
    )).toEqual({
      previousPmsSubmittedOnTime: true,
      previousPmsSubmissionDate: '2025-05-10',
      periodFrom: '2025-04-01',
      periodTo: '2026-03-31',
      selfScore: 82,
    });
  });

  it('lifts the senior identification section, which has no self score', () => {
    expect(basicInfoFromSection(
      { name: 'A. Scientist', periodFrom: '2025-04-01', periodTo: '2026-03-31' },
      NO_PREVIOUS,
    )).toEqual({
      previousPmsSubmittedOnTime: null,
      previousPmsSubmissionDate: null,
      periodFrom: '2025-04-01',
      periodTo: '2026-03-31',
      selfScore: null,
    });
  });

  it('normalises blank and non-numeric values to null rather than writing them', () => {
    expect(basicInfoFromSection(
      { periodFrom: '', periodTo: '   ', selfScore: 'not a number' },
      NO_PREVIOUS,
    )).toEqual({
      previousPmsSubmittedOnTime: null,
      previousPmsSubmissionDate: null,
      periodFrom: null,
      periodTo: null,
      selfScore: null,
    });
  });

  it('accepts a self score that arrived as a numeric string from the input', () => {
    expect(basicInfoFromSection({ selfScore: '73' }, NO_PREVIOUS).selfScore).toBe(73);
  });
});

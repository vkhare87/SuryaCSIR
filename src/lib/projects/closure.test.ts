import { describe, it, expect } from 'vitest';
import { EMPTY_COMPLETION, completionMissing, followOnIdeas } from './closure';

describe('completionMissing mirrors project_completion_missing()', () => {
  it('lists the required lessons in the database order', () => {
    expect(completionMissing(EMPTY_COMPLETION)).toEqual(['summary', 'objectives_status', 'what_worked', 'what_did_not', 'recommendations']);
  });

  it('asks why only when the objectives fell short', () => {
    const f = { ...EMPTY_COMPLETION, summary: 's', what_worked: 'w', what_did_not: 'd', recommendations: 'r' };
    expect(completionMissing({ ...f, objectives_status: 'MET' })).toEqual([]);
    expect(completionMissing({ ...f, objectives_status: 'NOT_MET' })).toEqual(['objectives_reason']);
  });
});

describe('followOnIdeas', () => {
  it('splits one idea per line and drops bullets and numbering', () => {
    expect(followOnIdeas('- Crash boxes\n2. Acoustic panels\n\n• ')).toEqual(['Crash boxes', 'Acoustic panels']);
  });
});

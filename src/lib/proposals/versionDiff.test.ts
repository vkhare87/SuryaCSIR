import { describe, it, expect } from 'vitest';
import { diffProposals } from './versionDiff';
import { mapVersionRow, toProposalRowPatch } from '../../utils/proposalMappers';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p', title: 'Foam', abstract: 'a', objectives: null, requested_budget: null,
  proposed_duration_months: null, status: 'DRAFT', ...over,
});
const version = (proposal: Record<string, unknown>, copis: { staff_id: string; staff_name: string }[] = []) =>
  mapVersionRow({ id: 'v', proposal_id: 'p', version_no: 1, label: 'l', kind: 'manual', created_at: '', snapshot: { proposal, copis } }).proposal;

describe('diffProposals', () => {
  it('reports nothing when nothing changed, treating NULL and empty alike', () => {
    expect(diffProposals(version(row()), version(row({ objectives: '' })))).toEqual([]);
  });

  it('lists each changed field with both values, co-PIs included', () => {
    const before = version(row(), [{ staff_id: 'S1', staff_name: 'Dr A' }]);
    const after = version(row({ title: 'Metal foam', objectives: 'o', requested_budget: 50 }));
    expect(diffProposals(before, after)).toEqual([
      { label: 'Title', before: 'Foam', after: 'Metal foam' },
      { label: 'Objectives', before: '', after: 'o' },
      { label: 'Co-PIs', before: 'Dr A', after: '' },
      { label: 'Requested budget', before: '', after: '50' },
    ]);
  });
});

describe('toProposalRowPatch', () => {
  it('sends only draft fields, under their column names', () => {
    expect(toProposalRowPatch({ problemStatement: 'p', status: 'APPROVED', sanctionedAmount: 9 }))
      .toEqual({ problem_statement: 'p' });
  });

  it('clears a date or duration to NULL, not to an empty string the column would reject', () => {
    expect(toProposalRowPatch({ proposedStartDate: '', proposedDurationMonths: 0, abstract: '' }))
      .toEqual({ proposed_start_date: null, proposed_duration_months: null, abstract: '' });
  });
});

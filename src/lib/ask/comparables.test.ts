import { describe, it, expect, vi } from 'vitest';

const tables: Record<string, unknown[]> = {
  documents: [
    { id: 'doc-r', entity_type: 'project_report', entity_id: 'rep-1' },
    { id: 'doc-p', entity_type: 'proposal', entity_id: 'prop-1' },
    { id: 'doc-x', entity_type: 'meeting', entity_id: 'm-1' },
  ],
  project_reports: [{ id: 'rep-1', project_no: 'GAP-101' }],
  proposals: [
    {
      id: 'prop-1',
      requested_budget: '120.5',
      proposed_start_date: '2026-01-01',
      proposed_duration_months: 24,
      status: 'APPROVED',
    },
  ],
};

vi.mock('../../utils/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: async () => ({ data: tables[table] ?? [], error: null }),
      }),
    }),
  },
}));

import { resolveComparables } from './comparables';

describe('resolveComparables', () => {
  it('maps project_report docs to project_no and proposal docs to budget facts', async () => {
    const out = await resolveComparables(['doc-r', 'doc-p', 'doc-x']);
    expect(out['doc-r']).toEqual({ kind: 'project_report', projectNo: 'GAP-101' });
    expect(out['doc-p']).toEqual({
      kind: 'proposal',
      proposal: {
        requestedBudget: 120.5,
        proposedStartDate: '2026-01-01',
        proposedDurationMonths: 24,
        status: 'APPROVED',
      },
    });
    expect(out['doc-x']).toBeUndefined();
  });

  it('returns empty for no ids', async () => {
    expect(await resolveComparables([])).toEqual({});
  });
});

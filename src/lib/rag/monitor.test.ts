import { describe, it, expect, vi } from 'vitest';

const rows = [
  {
    id: 'd1', title: 'Doc A', entity_type: 'proposal', ingest_status: 'indexed',
    ingest_error: null, ingest_attempts: 0, doc_indexes: [{ page_count: 4, built_at: '2026-07-01' }],
  },
  {
    id: 'd2', title: 'Doc B', entity_type: 'meeting', ingest_status: 'failed',
    ingest_error: 'boom', ingest_attempts: 2, doc_indexes: null,
  },
  {
    id: 'd3', title: 'Doc C', entity_type: 'pms_report', ingest_status: 'indexed',
    ingest_error: null, doc_indexes: { page_count: 2, built_at: '2026-07-02' },
  },
];

vi.mock('../../utils/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  },
}));

import { countByStatus, fetchMonitorRows } from './monitor';

describe('countByStatus', () => {
  it('tallies every status and zero-fills the rest', () => {
    const counts = countByStatus([
      { ingest_status: 'pending' },
      { ingest_status: 'pending' },
      { ingest_status: 'indexed' },
      { ingest_status: 'failed' },
    ]);
    expect(counts.pending).toBe(2);
    expect(counts.indexed).toBe(1);
    expect(counts.failed).toBe(1);
    expect(counts.processing).toBe(0);
    expect(counts.skipped).toBe(0);
  });
});

describe('fetchMonitorRows', () => {
  it('shapes array, null, and object doc_indexes joins', async () => {
    const out = await fetchMonitorRows();
    expect(out[0]).toEqual({
      id: 'd1', title: 'Doc A', entityType: 'proposal', status: 'indexed',
      attempts: 0, error: null, pageCount: 4, builtAt: '2026-07-01',
    });
    expect(out[1].pageCount).toBeNull();
    expect(out[1].error).toBe('boom');
    expect(out[1].attempts).toBe(2);
    expect(out[2].pageCount).toBe(2);
  });
});

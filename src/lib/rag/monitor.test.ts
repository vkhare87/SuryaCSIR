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
    rpc: async () => ({
      data: [{
        status_counts: { pending: 2, processing: 1, indexed: 5, failed: 0, skipped: 1 },
        traceability_cited: 4,
        traceability_total: 5,
      }],
      error: null,
    }),
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  },
}));

import { countByStatus, fetchMonitorRows, fetchMonitorSummary } from './monitor';

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

import { computeTraceability, toCsv } from './monitor';

describe('computeTraceability', () => {
  const row = (mode: string, answer: string, citations: unknown[] | null) =>
    ({ mode, answer, citations }) as Parameters<typeof computeTraceability>[0][number];

  it('counts only non-refusal document/hybrid answers', () => {
    const testRows = [
      row('document', 'Grounded answer', [{ title: 'x' }]),   // counts, cited
      row('hybrid', 'Grounded answer', [{ title: 'x' }]),     // counts, cited
      row('document', 'Not found in institute documents.', []), // refusal — excluded
      row('structured', '42', []),                             // structured — excluded
      row('document', 'Uncited answer', []),                   // counts, uncited
    ];
    expect(computeTraceability(testRows)).toEqual({ share: 2 / 3, cited: 2, total: 3 });
  });

  it('treats null citations as uncited', () => {
    expect(computeTraceability([row('document', 'a', null)]))
      .toEqual({ share: 0, cited: 0, total: 1 });
  });

  it('returns null when no qualifying rows', () => {
    expect(computeTraceability([row('structured', '42', [])])).toBeNull();
    expect(computeTraceability([])).toBeNull();
  });
});

describe('toCsv', () => {
  it('escapes quotes, commas and newlines; prefixes BOM for Excel', () => {
    const csv = toCsv(
      ['q', 'a'],
      [['he said "hi"', 'line1\nline2'], ['plain, comma', 'ok']],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"he said ""hi""","line1\nline2"');
    expect(csv).toContain('"plain, comma",ok');
  });
});

describe('fetchMonitorSummary', () => {
  it('maps RPC counts and traceability share', async () => {
    const summary = await fetchMonitorSummary();
    expect(summary).toEqual({
      counts: { pending: 2, processing: 1, indexed: 5, failed: 0, skipped: 1 },
      traceability: { share: 0.8, cited: 4, total: 5 },
    });
  });
});

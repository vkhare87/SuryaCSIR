import { describe, it, expect } from 'vitest';
import { countByStatus } from './monitor';

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

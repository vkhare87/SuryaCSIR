import { describe, it, expect, vi } from 'vitest';

const ranges: [number, number][] = [];
vi.mock('../../utils/supabaseClient', () => {
  const chain = {
    select: () => chain, in: () => chain, order: () => chain,
    range: async (from: number, to: number) => {
      ranges.push([from, to]);
      const n = from === 0 ? 1000 : 1;
      return {
        data: Array.from({ length: n }, (_, i) => ({
          id: `m${from + i}`, project_id: 'P1', title: 't', target_date: '2026-01-01', status: 'PLANNED',
        })),
        error: null,
      };
    },
  };
  return { supabase: { from: () => chain } };
});

import { milestonesFor } from './api';

describe('milestonesFor', () => {
  it('reads past the 1000-row cap instead of stopping at it', async () => {
    const out = await milestonesFor(['P1']);
    expect(out).toHaveLength(1001);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });
});

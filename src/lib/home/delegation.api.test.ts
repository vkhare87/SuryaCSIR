import { describe, it, expect, vi } from 'vitest';

const { rpcSpy } = vi.hoisted(() => ({ rpcSpy: vi.fn(async () => ({ error: null })) }));
vi.mock('../../utils/supabaseClient', () => {
  const orders = { data: { id: 'o1', order_no: 'DO/2026/01', preset: null, effective_from: '2026-11-14' }, error: null };
  const lines = {
    data: [{ kind: 'LEAVE_TOUR', mode: 'HEAD_FLAGS', amount_limit: null, division_code: 'D1', sample_rate: 25 }],
    error: null,
  };
  return {
    supabase: {
      from: (t: string) => ({
        select: () => ({
          is: () => ({ maybeSingle: async () => orders }),
          eq: async () => (t === 'delegation_lines' ? lines : { data: [], error: null }),
        }),
      }),
      rpc: rpcSpy,
    },
  };
});

import { issueOrder, loadOrderInForce } from './delegation';

describe('delegation order round trip', () => {
  it('keeps a non-default sample rate from load to reissue', async () => {
    const order = await loadOrderInForce();
    expect(order?.lines[0]).toMatchObject({ division: 'D1', sample: 25 });
    await issueOrder(null, [], order?.lines ?? []);
    expect(rpcSpy).toHaveBeenCalledWith('delegation_issue', {
      p_preset: null,
      p_lines: [{ kind: 'LEAVE_TOUR', mode: 'HEAD_FLAGS', limit: null, division: 'D1', sample: 25 }],
    });
  });
});

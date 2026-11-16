import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, state } = vi.hoisted(() => {
  const state = {
    fromCalls: {} as Record<string, number>,
    orders: [] as { col: string; opts?: { ascending?: boolean } }[],
    noticeRows: [
      {
        id: 'n1',
        notice_no: 'OO/2026/001',
        kind: 'OFFICE_ORDER',
        title: 'Must ack order',
        body: 'Body 1',
        issued_by: 'dir1',
        issued_on: '2026-11-01',
        audience_divisions: null,
        must_ack: true,
        ack_by: '2026-11-20',
      },
    ] as Record<string, unknown>[],
    readRows: [
      { notice_id: 'n1', read_at: '2026-11-02T10:00:00Z', acked_at: null },
    ] as Record<string, unknown>[],
  };

  const mockSupabase = {
    from: vi.fn((table: string) => {
      state.fromCalls[table] = (state.fromCalls[table] ?? 0) + 1;
      const response = table === 'notices'
        ? { data: state.noticeRows, error: null }
        : { data: state.readRows, error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        is: () => builder,
        or: () => builder,
        eq: () => builder,
        order: (col: string, opts?: { ascending?: boolean }) => {
          if (table === 'notices') state.orders.push({ col, opts });
          return builder;
        },
        limit: () => builder,
        then: (onFulfilled: (val: typeof response) => unknown) => Promise.resolve(response).then(onFulfilled),
      };
      return builder;
    }),
  };

  return { mockSupabase, state };
});

vi.mock('../../utils/supabaseClient', () => ({ supabase: mockSupabase }));

import { loadNotices } from './notices';

describe('loadNotices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.fromCalls = {};
    state.orders = [];
  });

  it('issues a single notices query prioritizing must_ack before recent limit', async () => {
    const out = await loadNotices('2026-11-16');

    expect(state.fromCalls.notices).toBe(1);
    expect(state.fromCalls.notice_reads).toBe(1);
    expect(state.orders[0]).toEqual({ col: 'must_ack', opts: { ascending: false } });
    expect(state.orders.map(o => o.col)).toEqual(['must_ack', 'issued_on', 'created_at']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'n1',
      readAt: '2026-11-02T10:00:00Z',
      ackedAt: null,
    });
  });
});

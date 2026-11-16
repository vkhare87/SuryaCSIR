import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase, state } = vi.hoisted(() => {
  const state = {
    fromCalls: {} as Record<string, number>,
    orders: [] as { col: string; opts?: { ascending?: boolean } }[],
    noticeRows: [] as Record<string, unknown>[],
    mustAckRows: [] as Record<string, unknown>[],
    readRows: [] as Record<string, unknown>[],
  };

  const mockSupabase = {
    from: vi.fn((table: string) => {
      state.fromCalls[table] = (state.fromCalls[table] ?? 0) + 1;
      let isMustAckQuery = false;
      let limitCount: number | null = null;

      const getData = () => {
        if (table === 'notice_reads') return { data: state.readRows, error: null };
        const rows = isMustAckQuery ? state.mustAckRows : state.noticeRows;
        return { data: limitCount !== null ? rows.slice(0, limitCount) : rows, error: null };
      };

      const builder: Record<string, unknown> = {
        select: () => builder,
        is: () => builder,
        or: () => builder,
        eq: (col: string, val: unknown) => {
          if (col === 'must_ack' && val === true) isMustAckQuery = true;
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          if (table === 'notices' && !isMustAckQuery) state.orders.push({ col, opts });
          return builder;
        },
        limit: (n: number) => {
          limitCount = n;
          return builder;
        },
        range: async (from: number, to: number) => {
          const rows = table === 'notice_reads'
            ? state.readRows
            : (isMustAckQuery ? state.mustAckRows : state.noticeRows);
          return { data: rows.slice(from, to + 1), error: null };
        },
        then: (onFulfilled: (val: ReturnType<typeof getData>) => unknown) => Promise.resolve(getData()).then(onFulfilled),
      };
      return builder;
    }),
  };

  return { mockSupabase, state };
});

vi.mock('../../utils/supabaseClient', () => ({ supabase: mockSupabase }));

import { loadNotices } from './notices';

const makeRow = (id: string, issuedOn: string, mustAck = false) => ({
  id,
  notice_no: `OO/2026/${id}`,
  kind: 'OFFICE_ORDER',
  title: `Notice ${id}`,
  body: `Body ${id}`,
  issued_by: 'dir1',
  issued_on: issuedOn,
  audience_divisions: null,
  must_ack: mustAck,
  ack_by: mustAck ? '2026-12-01' : null,
});

describe('loadNotices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.fromCalls = {};
    state.orders = [];
    state.noticeRows = [makeRow('n1', '2026-11-01', true)];
    state.mustAckRows = [];
    state.readRows = [{ notice_id: 'n1', read_at: '2026-11-02T10:00:00Z', acked_at: null }];
  });

  it('issues a single notices query when fewer than RECENT_NOTICES exist', async () => {
    const out = await loadNotices('2026-11-16');

    expect(state.fromCalls.notices).toBe(1);
    expect(state.fromCalls.notice_reads).toBe(1);
    expect(state.orders).toEqual([
      { col: 'must_ack', opts: { ascending: false } },
      { col: 'issued_on', opts: { ascending: false } },
      { col: 'created_at', opts: { ascending: false } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'n1',
      readAt: '2026-11-02T10:00:00Z',
      ackedAt: null,
    });
  });

  it('still returns an older unacknowledged must_ack notice behind 30 acknowledged ones', async () => {
    const acked30 = Array.from({ length: 30 }, (_, i) => makeRow(`ack-${i}`, `2026-11-${String(30 - i).padStart(2, '0')}`, true));
    const olderUnacked = makeRow('unacked-31', '2026-10-01', true);
    state.noticeRows = [...acked30, olderUnacked];
    state.mustAckRows = [...acked30, olderUnacked];
    state.readRows = acked30.map(r => ({
      notice_id: r.id,
      read_at: '2026-11-15T10:00:00Z',
      acked_at: '2026-11-15T10:00:00Z',
    }));

    const out = await loadNotices('2026-11-16');

    expect(state.fromCalls.notices).toBe(2);
    expect(out).toHaveLength(31);
    expect(out.find(x => x.id === 'unacked-31')).toMatchObject({
      mustAck: true,
      ackedAt: null,
    });
  });
});

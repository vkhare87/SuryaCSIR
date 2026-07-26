import { describe, it, expect, vi } from 'vitest';
import { fetchAll, PAGE_SIZE } from './fetchAll';

/** Stands in for a PostgREST query builder, capped like `db-max-rows`. */
function fakeTable(rowCount: number, cap = PAGE_SIZE) {
  const rows = Array.from({ length: rowCount }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];

  return {
    calls,
    query: {
      range(from: number, to: number) {
        calls.push([from, to]);
        const window = Math.min(to - from + 1, cap);
        return Promise.resolve({ data: rows.slice(from, from + window), error: null });
      },
    },
  };
}

describe('fetchAll', () => {
  it('returns every row of a table larger than one page', async () => {
    const { query } = fakeTable(PAGE_SIZE * 2 + 137);
    const { data, error } = await fetchAll(query);

    expect(error).toBeNull();
    expect(data).toHaveLength(PAGE_SIZE * 2 + 137);
    // No duplicates, nothing dropped.
    expect(new Set(data.map((r) => r.id)).size).toBe(data.length);
  });

  it('is the regression guard for silent truncation', async () => {
    // The old code did one unbounded select and kept whatever came back.
    const { query } = fakeTable(PAGE_SIZE + 1);
    const single = await query.range(0, PAGE_SIZE - 1);
    expect(single.data).toHaveLength(PAGE_SIZE); // what the app used to see

    const { data } = await fetchAll(query);
    expect(data).toHaveLength(PAGE_SIZE + 1); // what is actually there
  });

  it('stops after one request when the table fits in a page', async () => {
    const { query, calls } = fakeTable(10);
    const { data } = await fetchAll(query);

    expect(data).toHaveLength(10);
    expect(calls).toHaveLength(1);
  });

  it('handles an exactly-one-page table without dropping or looping', async () => {
    const { query, calls } = fakeTable(PAGE_SIZE);
    const { data } = await fetchAll(query);

    expect(data).toHaveLength(PAGE_SIZE);
    // Full window, so it must ask once more to learn there is nothing left.
    expect(calls).toHaveLength(2);
  });

  it('returns an empty result for an empty table', async () => {
    const { query } = fakeTable(0);
    const { data, error } = await fetchAll(query);

    expect(data).toEqual([]);
    expect(error).toBeNull();
  });

  it('surfaces an error instead of returning a partial set as success', async () => {
    const query = {
      range: vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } }),
    };
    const { data, error } = await fetchAll(query);

    expect(error?.message).toBe('permission denied');
    expect(data).toEqual([]);
  });

  it('keeps rows already read when a later page fails', async () => {
    let call = 0;
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i }));
    const query = {
      range: () => {
        call += 1;
        return Promise.resolve(
          call === 1
            ? { data: rows, error: null }
            : { data: null, error: { message: 'connection lost' } },
        );
      },
    };

    const { data, error } = await fetchAll(query);
    expect(error?.message).toBe('connection lost');
    expect(data).toHaveLength(PAGE_SIZE);
  });
});

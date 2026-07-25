/**
 * Paged table reads.
 *
 * `DataContext` issued 28 unbounded `select('*')` calls. PostgREST caps every
 * response at `db-max-rows` (1000 — Supabase's default, stated explicitly in
 * supabase/config.toml) and reports a cap by returning fewer rows — no error,
 * no flag. Every downstream
 * `useMemo` then aggregated a silently truncated set, so the institute's
 * analytics would start quietly under-reporting the moment any table crossed
 * the cap. Nothing in the app would have noticed.
 *
 * This pages until the server stops returning a full window, so a caller
 * gets the whole table or an explicit error.
 *
 * It does not make loading 28 tables into the browser a good idea — see
 * docs/ARCHITECTURE-REMEDIATION.md (A2) for pushing aggregation into
 * Postgres. It removes the silent-wrong-answer failure mode in the meantime.
 */

/** Rows per request. Must not exceed the server's `db-max-rows`, or a full
 *  window would be indistinguishable from a capped one and paging would stop
 *  early — the exact bug this exists to prevent. */
export const PAGE_SIZE = 1000;

/** Refuse to spin forever if the server keeps returning full windows. */
const MAX_PAGES = 100;

export interface PagedQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

export interface FetchAllResult<T> {
  data: T[];
  error: { message: string } | null;
}

/**
 * Read every row of `query`, one page at a time.
 *
 * Pass a query *builder* (`supabase.from('staff').select('*').order('ID')`);
 * this applies `.range()` per page. An ordered query is strongly preferred —
 * without a stable sort, Postgres may return rows in a different order per
 * page and paging can both duplicate and drop rows.
 */
export async function fetchAll<T>(query: PagedQuery<T>): Promise<FetchAllResult<T>> {
  const all: T[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);

    if (error) return { data: all, error };
    if (!data || data.length === 0) break;

    all.push(...data);

    // A short window means the server had nothing more to give.
    if (data.length < PAGE_SIZE) return { data: all, error: null };
  }

  if (all.length >= MAX_PAGES * PAGE_SIZE) {
    return {
      data: all,
      error: {
        message:
          `Stopped after ${MAX_PAGES * PAGE_SIZE} rows. A table this large must be ` +
          `queried per page or aggregated in Postgres, not loaded into the browser.`,
      },
    };
  }

  return { data: all, error: null };
}

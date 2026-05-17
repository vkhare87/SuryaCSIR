import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL-backed chart filter. Encodes a single (dimension, value) pair
 * as `?filter=<dim>:<value>` so clicks on charts are shareable and
 * the table on the same page can read the same params.
 *
 * Values are URI-encoded so `:` inside a value is safe.
 */

export interface ChartFilter {
  dim: string;
  value: string;
}

const PARAM = 'filter';

function parse(raw: string | null): ChartFilter | null {
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx <= 0 || idx === raw.length - 1) return null;
  const dim = decodeURIComponent(raw.slice(0, idx));
  const value = decodeURIComponent(raw.slice(idx + 1));
  if (!dim || !value) return null;
  return { dim, value };
}

function serialize(f: ChartFilter): string {
  return `${encodeURIComponent(f.dim)}:${encodeURIComponent(f.value)}`;
}

export function useChartFilter() {
  const [params, setParams] = useSearchParams();

  const filter = useMemo(() => parse(params.get(PARAM)), [params]);

  const setFilter = useCallback(
    (f: ChartFilter | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (f === null) next.delete(PARAM);
          else next.set(PARAM, serialize(f));
          return next;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const clearFilter = useCallback(() => setFilter(null), [setFilter]);

  const toggleFilter = useCallback(
    (f: ChartFilter) => {
      if (filter && filter.dim === f.dim && filter.value === f.value) {
        setFilter(null);
      } else {
        setFilter(f);
      }
    },
    [filter, setFilter],
  );

  return { filter, setFilter, clearFilter, toggleFilter };
}

export const __test__ = { parse, serialize };

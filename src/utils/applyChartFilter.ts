import type { ChartFilter } from './useChartFilter';

/**
 * Apply a URL-backed chart filter to a list. `accessors` maps dimension
 * keys (the `dim` value pushed by a chart) to a function that returns the
 * value to compare against. If the filter dimension is not in the map,
 * the list is returned unchanged so unknown filters are no-ops, not bugs.
 */
export function applyChartFilter<T>(
  rows: T[],
  filter: ChartFilter | null,
  accessors: Record<string, (row: T) => string | number | null | undefined>,
): T[] {
  if (!filter) return rows;
  const accessor = accessors[filter.dim];
  if (!accessor) return rows;
  return rows.filter((row) => {
    const v = accessor(row);
    return v != null && String(v) === filter.value;
  });
}

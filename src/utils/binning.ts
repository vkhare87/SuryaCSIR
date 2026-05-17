/**
 * Histogram binning utilities for numeric distributions.
 *
 * Sturges rule: k = ceil(log2(n) + 1)        — fast, good for normal-ish data.
 * Freedman–Diaconis: bw = 2 * IQR / cbrt(n)  — robust to outliers.
 */

export interface Bin {
  start: number;
  end: number;
  count: number;
  label: string;
}

export type BinStrategy = 'sturges' | 'freedman-diaconis' | number;

export function sturgesBinCount(n: number): number {
  if (n < 2) return 1;
  return Math.max(1, Math.ceil(Math.log2(n) + 1));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function freedmanDiaconisBinCount(values: number[]): number {
  if (values.length < 2) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const range = sorted[sorted.length - 1] - sorted[0];
  if (iqr === 0 || range === 0) return sturgesBinCount(values.length);
  const bw = (2 * iqr) / Math.cbrt(values.length);
  return Math.max(1, Math.ceil(range / bw));
}

export function bin(values: number[], strategy: BinStrategy = 'sturges'): Bin[] {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return [];

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  if (min === max) {
    return [{ start: min, end: max, count: clean.length, label: formatBinLabel(min, max) }];
  }

  const k =
    typeof strategy === 'number'
      ? Math.max(1, strategy)
      : strategy === 'freedman-diaconis'
        ? freedmanDiaconisBinCount(clean)
        : sturgesBinCount(clean.length);

  const width = (max - min) / k;
  const bins: Bin[] = Array.from({ length: k }, (_, i) => {
    const start = min + i * width;
    const end = i === k - 1 ? max : min + (i + 1) * width;
    return { start, end, count: 0, label: formatBinLabel(start, end) };
  });

  for (const v of clean) {
    let idx = Math.floor((v - min) / width);
    if (idx >= k) idx = k - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  }

  return bins;
}

function formatBinLabel(start: number, end: number): string {
  const isInt = Number.isInteger(start) && Number.isInteger(end);
  if (isInt) return `${start}–${end}`;
  return `${start.toFixed(1)}–${end.toFixed(1)}`;
}

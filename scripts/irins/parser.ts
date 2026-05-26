import type { IrinsCitations } from './types';

const toInt = (v: unknown): number | undefined => {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
};

export function parseCitations(json: string): IrinsCitations {
  try {
    const g = JSON.parse(json)?.google_data;
    if (!g) return {};
    return {
      total: toInt(g.all),
      total_2013: toInt(g.all_2013),
      h_index: toInt(g.h_all),
      h_index_2013: toInt(g.h_2013),
      i10: toInt(g.hi10_all),
      i10_2013: toInt(g.hi10_2013),
    };
  } catch {
    return {};
  }
}

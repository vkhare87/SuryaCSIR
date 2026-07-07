import type { IPIntelligence } from '../../types';

export interface PatentPipeline {
  filed: number;
  published: number;
  granted: number;
  medianMonthsToGrant: number | null;
  byDivision: { divisionCode: string; filed: number; granted: number }[];
}

const RANK: Record<string, number> = { Filed: 1, Published: 2, Granted: 3 };

export function patentPipeline(ip: IPIntelligence[]): PatentPipeline {
  const patents = ip.filter(p => p.type === 'Patent');
  const filed = patents.length;
  const published = patents.filter(p => (RANK[p.status] ?? 0) >= 2).length;
  const grantedList = patents.filter(p => p.status === 'Granted');

  const months = grantedList
    .filter(p => p.filingDate && p.grantDate)
    .map(p => (new Date(p.grantDate!).getTime() - new Date(p.filingDate).getTime()) / (30.44 * 86400000))
    .sort((a, b) => a - b);
  const medianMonthsToGrant = months.length
    ? Math.round(months.length % 2 ? months[(months.length - 1) / 2]
                                   : (months[months.length / 2 - 1] + months[months.length / 2]) / 2)
    : null;

  const div = new Map<string, { filed: number; granted: number }>();
  for (const p of patents) {
    const d = div.get(p.divisionCode) ?? { filed: 0, granted: 0 };
    d.filed += 1;
    if (p.status === 'Granted') d.granted += 1;
    div.set(p.divisionCode, d);
  }
  return {
    filed, published, granted: grantedList.length, medianMonthsToGrant,
    byDivision: [...div.entries()]
      .map(([divisionCode, v]) => ({ divisionCode, ...v }))
      .sort((a, b) => a.divisionCode.localeCompare(b.divisionCode)),
  };
}

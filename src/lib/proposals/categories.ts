// HQ-scheme project categories, CSIR guidelines April 2025 §2.1.
export interface HqCategory {
  code: string;
  name: string;
  trl: string;
  /** Normal duration in months; null where the guidelines fix none. */
  months: [number, number] | null;
}

export const HQ_CATEGORIES: HqCategory[] = [
  { code: 'FIR', name: 'CSIR-FIRST (fundamental & innovative)', trl: 'Basic / futuristic', months: [24, 24] },
  { code: 'FBR', name: 'Focused Basic Research',                trl: 'TRL 2–3',            months: [12, 24] },
  { code: 'NCP', name: 'Niche-Creating High Science / Technology', trl: 'TRL 2–3',         months: [12, 24] },
  { code: 'FTT', name: 'Fast Track Translational',               trl: 'TRL 3–6',            months: [18, 24] },
  { code: 'FTC', name: 'Fast Track Commercialization',           trl: 'TRL 4 and above',    months: [6, 24] },
  { code: 'MMP', name: 'Mission Mode',                           trl: 'High impact',        months: [36, 36] },
  { code: 'FCP', name: 'Facility Creation',                      trl: 'Near-ready tech',    months: null },
  { code: 'HCP', name: 'HQ Coordinated',                         trl: 'R&D / non-R&D',      months: null },
  { code: 'IST', name: 'International S&T',                      trl: 'Collaborative',      months: null },
];

/**
 * A note when a duration is outside the category's normal range. Advisory only:
 * the guidelines give normal durations, and PME may accept a reasoned exception.
 */
export function durationNote(code: string | null, months: number): string | null {
  const cat = HQ_CATEGORIES.find(c => c.code === code);
  if (!cat?.months || !(months > 0)) return null;
  const [lo, hi] = cat.months;
  if (months >= lo && months <= hi) return null;
  const range = lo === hi ? `${lo} months` : `${lo}–${hi} months`;
  return `${cat.code} projects normally run ${range}; this one is ${months}. Say why in the plan.`;
}

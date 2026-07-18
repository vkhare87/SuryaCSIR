// Superannuation math, shared by StaffAnalytics (retirement runway chart) and
// the My Actions inbox (retiring-soon alerts). CSIR scientists superannuate at 60.
export const RETIREMENT_AGE = 60;

const MS_PER_YEAR = 365.25 * 86400000;

/** Date of superannuation (DOB + 60y), or null when DOB is missing/unparseable. */
export function retirementDate(dob: string | undefined | null): Date | null {
  if (!dob) return null;
  const t = Date.parse(dob);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  d.setFullYear(d.getFullYear() + RETIREMENT_AGE);
  return d;
}

/** Fractional years from `from` until superannuation. Negative = already past. */
export function yearsUntilRetirement(dob: string | undefined | null, from: Date = new Date()): number | null {
  const r = retirementDate(dob);
  if (r === null) return null;
  return (r.getTime() - from.getTime()) / MS_PER_YEAR;
}

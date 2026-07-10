import { getRetirementDate } from '../../utils/dateUtils';
import type { StaffMember } from '../../types';

// SPA twin of rag/analytics.py _expertise_succession_risk — same semantics so
// Ask SURYA and this panel agree. Cover = exact CoreArea match (case-insensitive);
// semantic similarity ("corrosion coatings" vs "surface protection") is a
// deliberate non-goal here — that tier needs LLM matching server-side.
export interface SuccessionRiskRow {
  staff: StaffMember;
  retiresOn: Date;
}

/** Staff retiring within `years` whose CoreArea is held by no colleague who stays. */
export function successionRisk(
  staff: StaffMember[], years = 3, today: Date = new Date(),
): SuccessionRiskRow[] {
  const horizon = new Date(today.getFullYear() + years, today.getMonth(), today.getDate());
  const retiring: SuccessionRiskRow[] = [];
  const stayingAreas = new Set<string>();

  for (const s of staff) {
    const retiresOn = getRetirementDate(s.DOB);
    const area = s.CoreArea.trim().toLowerCase();
    if (!area) continue;
    if (!retiresOn) {
      stayingAreas.add(area); // unparseable DOB: assume they stay (fewer false alarms)
    } else if (retiresOn >= today && retiresOn <= horizon) {
      retiring.push({ staff: s, retiresOn });
    } else if (retiresOn > horizon) {
      stayingAreas.add(area);
    }
    // already past retirement date: neither retiring nor cover — they've left
  }
  return retiring
    .filter(r => !stayingAreas.has(r.staff.CoreArea.trim().toLowerCase()))
    .sort((a, b) => a.retiresOn.getTime() - b.retiresOn.getTime());
}

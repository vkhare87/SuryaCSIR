import type { ScientificOutput, StaffMember } from '../../types';

export interface CoAuthorPair {
  a: string;
  b: string;
  count: number;
  crossDivision: boolean;
}

/**
 * Collaboration map from co-authorship: every author pair per publication,
 * aggregated. crossDivision when both authors resolve to staff in different
 * divisions (unresolvable names count as same-division = false).
 */
export function coAuthorPairs(outputs: ScientificOutput[], staff: StaffMember[]): CoAuthorPair[] {
  const divisionOf = new Map(staff.map(s => [s.Name.toLowerCase(), s.Division]));
  const pairs = new Map<string, CoAuthorPair>();

  for (const o of outputs) {
    const authors = [...new Set(o.authors.map(a => a.trim()).filter(Boolean))].sort();
    for (let i = 0; i < authors.length; i++) {
      for (let j = i + 1; j < authors.length; j++) {
        const key = `${authors[i]}|${authors[j]}`;
        const existing = pairs.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          const divA = divisionOf.get(authors[i].toLowerCase());
          const divB = divisionOf.get(authors[j].toLowerCase());
          pairs.set(key, {
            a: authors[i], b: authors[j], count: 1,
            crossDivision: Boolean(divA && divB && divA !== divB),
          });
        }
      }
    }
  }
  return [...pairs.values()].sort((x, y) => y.count - x.count);
}

// Budget heads. Mirrored in the CHECK on proposal_budget_lines.head
// (20261111000001_proposal_review_chain.sql) — change both together.
export type BudgetHead =
  | 'EQUIPMENT' | 'WORKS' | 'MANPOWER' | 'CONSUMABLES' | 'TA_INDIA' | 'TA_ABROAD'
  | 'CONTINGENCY' | 'OUTSOURCING' | 'OTHER';

export const BUDGET_HEADS: { head: BudgetHead; label: string; capital: boolean }[] = [
  { head: 'EQUIPMENT',   label: 'Equipment',         capital: true },
  { head: 'WORKS',       label: 'Works & Services',  capital: true },
  { head: 'MANPOWER',    label: 'Manpower',          capital: false },
  { head: 'CONSUMABLES', label: 'Consumables',       capital: false },
  { head: 'TA_INDIA',    label: 'Travel (India)',    capital: false },
  { head: 'TA_ABROAD',   label: 'Travel (abroad)',   capital: false },
  { head: 'CONTINGENCY', label: 'Contingency',       capital: false },
  { head: 'OUTSOURCING', label: 'Outsourcing',       capital: false },
  { head: 'OTHER',       label: 'Other',             capital: false },
];

export const headLabel = (head: string) => BUDGET_HEADS.find(h => h.head === head)?.label ?? head;

/** Indian financial year containing a date: 2027-04-01 → "2027-28". */
export function fiscalYearOf(date: Date): string {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Financial years a project spans, from its start date and duration. */
export function fiscalYearsFor(startIso: string, months: number): string[] {
  if (!startIso || !(months > 0)) return [];
  const start = new Date(`${startIso}T00:00:00`);
  if (Number.isNaN(start.getTime())) return [];
  const end = new Date(start);
  end.setMonth(end.getMonth() + months - 1);
  const years: string[] = [];
  for (let d = new Date(start); d <= end; d.setFullYear(d.getFullYear() + 1)) {
    const fy = fiscalYearOf(d);
    if (!years.includes(fy)) years.push(fy);
  }
  const last = fiscalYearOf(end);
  if (!years.includes(last)) years.push(last);
  return years;
}

/** ₹ in the Indian grouping, no paise: 1250000 → "₹12,50,000". */
export const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

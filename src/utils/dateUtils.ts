/**
 * Parse a date string in DD/MM/YYYY, YYYY-MM-DD, or similar formats.
 * Returns null if unparseable.
 */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;

  // A bare number is an Excel date serial that escaped conversion, never a date a
  // person wrote. new Date('44265') silently returns the YEAR 44265, so timelines
  // and overdue checks quietly stop firing instead of failing loudly.
  if (/^\d{1,6}$/.test(s)) return null;

  // DD/MM/YYYY, and the dotted DD.MM.YYYY the HR sheets actually use ('22.12.1997').
  // Without the dot form these fell through to new Date(), which rejects them.
  const dmyMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmyMatch) {
    const d = new Date(
      parseInt(dmyMatch[3]),
      parseInt(dmyMatch[2]) - 1,
      parseInt(dmyMatch[1])
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM-DD or ISO
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Difference in whole days between two dates. Positive = a is after b.
 */
export function diffInDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Returns true if the date is within `months` months from now.
 */
export function isWithinMonths(date: Date, months: number): boolean {
  const now = new Date();
  const future = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
  return date >= now && date <= future;
}

/**
 * Format a Date to DD/MM/YYYY.
 */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return '--';
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Compute retirement date from date of birth (assumes age 60).
 */
export function getRetirementDate(dob: string | null | undefined): Date | null {
  const birth = parseDate(dob);
  if (!birth) return null;
  return new Date(birth.getFullYear() + 60, birth.getMonth(), birth.getDate());
}

/**
 * Get age in years from date of birth string.
 */
export function getAgeFromDOB(dob: string | null | undefined): number | null {
  const birth = parseDate(dob);
  if (!birth) return null;
  return Math.floor(diffInDays(new Date(), birth) / 365.25);
}

/**
 * Get years of service from date of joining string.
 */
export function getServiceYears(doj: string | null | undefined): number | null {
  const joined = parseDate(doj);
  if (!joined) return null;
  return Math.floor(diffInDays(new Date(), joined) / 365.25);
}

/**
 * Get years in current grade from date of appointment string.
 */
export function getYearsInGrade(doapp: string | null | undefined): number | null {
  const appointed = parseDate(doapp);
  if (!appointed) return null;
  return Math.floor(diffInDays(new Date(), appointed) / 365.25);
}

/**
 * Returns true if the staff member's name matches an author string.
 */
export function staffNameMatchesAuthor(staffName: string, author: string): boolean {
  const n = staffName.toLowerCase().trim();
  const a = author.toLowerCase().trim();
  return a.includes(n) || n.includes(a);
}

/**
 * Returns true if the staff member's name matches a supervisor string.
 */
export function staffNameMatchesSupervisor(staffName: string, supervisor: string): boolean {
  return staffNameMatchesAuthor(staffName, supervisor);
}

/** --- Instrument / AMC utilities --- */

export type AmcStatus = 'expired' | 'expiring' | 'ok' | 'none';

/**
 * Classify AMC status from an end-date string.
 * - expired:   date is in the past
 * - expiring:  within 90 days from today
 * - ok:        more than 90 days from today
 * - none:      no date provided
 */
export function amcStatus(dateStr?: string): AmcStatus {
  if (!dateStr) return 'none';
  const amc = new Date(dateStr);
  const today = new Date();
  const diffDays = Math.ceil((amc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 90) return 'expiring';
  return 'ok';
}

/** AMC badge color maps — shared across all AMC badge renderers */
export const AMC_COLORS: Record<AmcStatus, string> = {
  expired:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  expiring: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  ok:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  none:     '',
};

export const AMC_CARD_COLORS: Record<AmcStatus, string> = {
  expired:  'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
  expiring: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
  ok:       'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800',
  none:     'bg-surface border-border',
};

export const AMC_TEXT_COLORS: Record<AmcStatus, string> = {
  expired:  'text-red-700 dark:text-red-400',
  expiring: 'text-amber-700 dark:text-amber-400',
  ok:       'text-emerald-700 dark:text-emerald-400',
  none:     'text-text-muted',
};

/** --- Staff name matching --- */

interface StaffLike {
  ID: string;
  Name: string;
}

/**
 * Find a staff member by fuzzy-matching against their name.
 * Strips common titles (Dr., Sh., Shri, Smt.) and does case-insensitive
 * bidirectional substring matching.
 */
export function findStaffByName<T extends StaffLike>(staffList: T[], rawName?: string): T | null {
  if (!rawName) return null;
  const clean = (n: string) => n.toLowerCase().replace(/^(dr\.|sh\.|shri|smt\.)\s+/i, '').trim();
  const cleaned = clean(rawName);
  return staffList.find(s => {
    const sc = clean(s.Name);
    return sc === cleaned || sc.includes(cleaned) || cleaned.includes(sc);
  }) ?? null;
}

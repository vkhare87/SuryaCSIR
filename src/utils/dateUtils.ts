/**
 * Parse a date string in DD/MM/YYYY, YYYY-MM-DD, or similar formats.
 * Returns null if unparseable.
 */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;

  // DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
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

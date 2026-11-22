import { describe, it, expect } from 'vitest';
import {
  parseDate,
  diffInDays,
  isWithinMonths,
  formatDate,
  getRetirementDate,
  getAgeFromDOB,
  getServiceYears,
  getYearsInGrade,
  staffNameMatchesAuthor,
  staffNameMatchesSupervisor,
} from './dateUtils';

describe('parseDate', () => {
  it('parses DD/MM/YYYY', () => {
    const d = parseDate('15/03/2024')!;
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });

  it('parses YYYY-MM-DD', () => {
    const d = parseDate('2024-03-15')!;
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });

  it('parses the dotted DD.MM.YYYY the HR sheets use', () => {
    const d = parseDate('22.12.1997')!;
    expect(d.getFullYear()).toBe(1997);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(22);
  });

  it('does not read an Excel serial as a year', () => {
    // '44265' is 10-03-2021 as a serial; new Date('44265') yields the year 44265.
    const d = parseDate('44265');
    expect(d === null || d.getFullYear() < 3000).toBe(true);
  });

  it('returns null for empty/null/undefined', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('  ')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate('abc/def/ghij')).toBeNull();
  });

  it('handles single-digit day/month', () => {
    const d = parseDate('1/3/2024')!;
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(1);
  });
});

describe('diffInDays', () => {
  it('returns positive when a is after b', () => {
    const a = new Date(2024, 0, 10);
    const b = new Date(2024, 0, 1);
    expect(diffInDays(a, b)).toBe(9);
  });

  it('returns negative when a is before b', () => {
    const a = new Date(2024, 0, 1);
    const b = new Date(2024, 0, 10);
    expect(diffInDays(a, b)).toBe(-9);
  });

  it('returns 0 for same date', () => {
    const d = new Date(2024, 5, 15);
    expect(diffInDays(d, d)).toBe(0);
  });
});

describe('formatDate', () => {
  it('formats date as DD/MM/YYYY', () => {
    expect(formatDate(new Date(2024, 2, 5))).toBe('05/03/2024');
  });

  it('returns -- for null/undefined', () => {
    expect(formatDate(null)).toBe('--');
    expect(formatDate(undefined)).toBe('--');
  });
});

describe('isWithinMonths', () => {
  it('returns true for date within range', () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 2);
    expect(isWithinMonths(future, 3)).toBe(true);
  });

  it('returns false for past date', () => {
    const past = new Date(2020, 0, 1);
    expect(isWithinMonths(past, 6)).toBe(false);
  });
});

describe('getRetirementDate', () => {
  it('returns DOB + 60 years', () => {
    const ret = getRetirementDate('1968-03-20')!;
    expect(ret.getFullYear()).toBe(2028);
    expect(ret.getMonth()).toBe(2);
    expect(ret.getDate()).toBe(20);
  });

  it('returns null for bad input', () => {
    expect(getRetirementDate(null)).toBeNull();
    expect(getRetirementDate('')).toBeNull();
  });
});

describe('getAgeFromDOB', () => {
  it('returns approximate age in years', () => {
    const age = getAgeFromDOB('2000-01-01');
    expect(age).toBeGreaterThanOrEqual(25);
    expect(age).toBeLessThanOrEqual(27);
  });

  it('returns null for bad input', () => {
    expect(getAgeFromDOB(null)).toBeNull();
  });
});

describe('getServiceYears', () => {
  it('returns years since joining', () => {
    const years = getServiceYears('2020-01-01');
    expect(years).toBeGreaterThanOrEqual(5);
    expect(years).toBeLessThanOrEqual(7);
  });

  it('returns null for bad input', () => {
    expect(getServiceYears(undefined)).toBeNull();
  });
});

describe('getYearsInGrade', () => {
  it('returns years since appointment', () => {
    const years = getYearsInGrade('2020-06-01');
    expect(years).toBeGreaterThanOrEqual(5);
    expect(years).toBeLessThanOrEqual(7);
  });
});

describe('staffNameMatchesAuthor', () => {
  it('matches exact name', () => {
    expect(staffNameMatchesAuthor('Dr. A. K. Sharma', 'Dr. A. K. Sharma')).toBe(true);
  });

  it('matches partial name (case insensitive)', () => {
    expect(staffNameMatchesAuthor('Sharma', 'Dr. A. K. Sharma')).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(staffNameMatchesAuthor('Patel', 'Dr. A. K. Sharma')).toBe(false);
  });
});

describe('staffNameMatchesSupervisor', () => {
  it('delegates to staffNameMatchesAuthor', () => {
    expect(staffNameMatchesSupervisor('Dr. P. Singh', 'Dr. P. Singh')).toBe(true);
    expect(staffNameMatchesSupervisor('Singh', 'Dr. P. Singh')).toBe(true);
  });
});

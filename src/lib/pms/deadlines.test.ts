import { describe, it, expect } from 'vitest';
import {
  cycleDeadlines,
  isPastECDeadline,
  isPastEmpoweredDeadline,
  isPastSelfAppraisalDeadline,
  isSystemLocked,
  representationWindowOpen,
} from './deadlines';

// Financial-year cycle ending Mar 31 2026 → milestones in 2026
const cycle = { endDate: '2026-03-31' };

// Deadlines are the institute's day (IST), whatever zone the browser is in.
const ist = (s: string) => new Date(`${s}+05:30`);

describe('cycleDeadlines', () => {
  it('derives all milestones from the cycle end year, ending 23:59:59.999 IST', () => {
    const d = cycleDeadlines(cycle);
    expect(d.selfAppraisal.toISOString()).toBe('2026-05-15T18:29:59.999Z');
    expect(d.ecCompletion.toISOString()).toBe('2026-06-30T18:29:59.999Z');
    expect(d.empoweredCompletion.toISOString()).toBe('2026-07-31T18:29:59.999Z');
    expect(d.systemLock.toISOString()).toBe('2026-11-30T18:29:59.999Z');
  });

  it('takes the year from the date string, not a zone-shifted Date', () => {
    expect(cycleDeadlines({ endDate: '2027-03-31' }).systemLock.toISOString()).toBe('2027-11-30T18:29:59.999Z');
  });
});

describe('deadline checks', () => {
  it('self-appraisal: open through May 15, closed after', () => {
    expect(isPastSelfAppraisalDeadline(cycle, ist('2026-05-15T23:59:00'))).toBe(false);
    expect(isPastSelfAppraisalDeadline(cycle, ist('2026-05-16T00:00:00'))).toBe(true);
  });

  it('EC completion flagged after Jun 30', () => {
    expect(isPastECDeadline(cycle, ist('2026-06-30T12:00:00'))).toBe(false);
    expect(isPastECDeadline(cycle, ist('2026-07-01T00:00:00'))).toBe(true);
  });

  it('Empowered completion flagged after Jul 31', () => {
    expect(isPastEmpoweredDeadline(cycle, ist('2026-07-31T12:00:00'))).toBe(false);
    expect(isPastEmpoweredDeadline(cycle, ist('2026-08-01T00:00:00'))).toBe(true);
  });

  it('system lock engages at 1 Dec 00:00 IST, the same instant as the server', () => {
    expect(isSystemLocked(cycle, ist('2026-11-30T23:59:00'))).toBe(false);
    expect(isSystemLocked(cycle, ist('2026-12-01T00:00:00'))).toBe(true);
    // 1 Dec 00:01 IST is still 30 Nov in UTC: locked all the same.
    expect(isSystemLocked(cycle, new Date('2026-11-30T18:31:00Z'))).toBe(true);
  });
});

describe('representationWindowOpen', () => {
  const communicated = new Date(2026, 7, 1).toISOString();

  it('open within 15 days of score communication on a FINALIZED report', () => {
    const report = { status: 'FINALIZED' as const, scoreCommunicatedAt: communicated };
    expect(representationWindowOpen(report, new Date(2026, 7, 10))).toBe(true);
    expect(representationWindowOpen(report, new Date(2026, 7, 16))).toBe(true); // day 15
    expect(representationWindowOpen(report, new Date(2026, 7, 17))).toBe(false); // day 16
  });

  it('closed when not FINALIZED or score never communicated', () => {
    expect(representationWindowOpen({ status: 'DRAFT', scoreCommunicatedAt: communicated }, new Date(2026, 7, 2))).toBe(false);
    expect(representationWindowOpen({ status: 'FINALIZED', scoreCommunicatedAt: null }, new Date(2026, 7, 2))).toBe(false);
  });
});

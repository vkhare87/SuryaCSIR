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

describe('cycleDeadlines', () => {
  it('derives all milestones from the cycle end year', () => {
    const d = cycleDeadlines(cycle);
    expect(d.selfAppraisal.getFullYear()).toBe(2026);
    expect(d.selfAppraisal.getMonth()).toBe(4); // May
    expect(d.selfAppraisal.getDate()).toBe(15);
    expect(d.ecCompletion.getMonth()).toBe(5); // June
    expect(d.ecCompletion.getDate()).toBe(30);
    expect(d.empoweredCompletion.getMonth()).toBe(6); // July
    expect(d.empoweredCompletion.getDate()).toBe(31);
    expect(d.systemLock.getMonth()).toBe(10); // November
    expect(d.systemLock.getDate()).toBe(30);
  });
});

describe('deadline checks', () => {
  it('self-appraisal: open through May 15, closed after', () => {
    expect(isPastSelfAppraisalDeadline(cycle, new Date(2026, 4, 15, 12))).toBe(false);
    expect(isPastSelfAppraisalDeadline(cycle, new Date(2026, 4, 16))).toBe(true);
  });

  it('EC completion flagged after Jun 30', () => {
    expect(isPastECDeadline(cycle, new Date(2026, 5, 30))).toBe(false);
    expect(isPastECDeadline(cycle, new Date(2026, 6, 1))).toBe(true);
  });

  it('Empowered completion flagged after Jul 31', () => {
    expect(isPastEmpoweredDeadline(cycle, new Date(2026, 6, 31))).toBe(false);
    expect(isPastEmpoweredDeadline(cycle, new Date(2026, 7, 1))).toBe(true);
  });

  it('system lock engages after Nov 30', () => {
    expect(isSystemLocked(cycle, new Date(2026, 10, 30, 23))).toBe(false);
    expect(isSystemLocked(cycle, new Date(2026, 11, 1))).toBe(true);
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

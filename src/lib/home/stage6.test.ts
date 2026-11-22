import { describe, it, expect } from 'vitest';
import {
  divisionExpertiseMatrix,
  fellowshipMonthsRemaining,
  isThreadIdle,
  portfolioHealthScore,
  rowsToCsv,
} from './stage6';
import type { Project, StaffMember } from '../../types';

describe('Stage 6 helpers (HH6, ST2, C1, B1, F5)', () => {
  it('flags outside threads idle at 21+ days', () => {
    expect(isThreadIdle('2026-10-01', '2026-10-25')).toBe(true);
    expect(isThreadIdle('2026-10-20', '2026-10-25')).toBe(false);
  });

  it('computes fellowship months remaining from 60-month cap', () => {
    expect(fellowshipMonthsRemaining('2024-11-01', '2026-11-22')).toBe(36);
  });

  it('scores active portfolio health and builds division expertise counts', () => {
    const projects = [
      { ProjectStatus: 'Active', CompletioDate: '2026-12-31', SanctionedCost: '100', UtilizedAmount: '50' },
      { ProjectStatus: 'Active', CompletioDate: '2026-01-01', SanctionedCost: '100', UtilizedAmount: '150' },
    ] as Project[];
    expect(portfolioHealthScore(projects, '2026-11-22')).toBe(63);

    const staff = [{ Division: 'D1' }, { Division: 'D1' }, { Division: 'D2' }] as StaffMember[];
    expect(divisionExpertiseMatrix(staff)[0]).toEqual({ division: 'D1', count: 2 });
  });

  it('escapes CSV fields cleanly', () => {
    expect(rowsToCsv(['Name', 'Note'], [['A, B', 'Say "hi"']])).toBe('Name,Note\n"A, B","Say ""hi"""');
  });
});

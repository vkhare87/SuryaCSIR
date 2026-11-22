import { describe, it, expect } from 'vitest';
import type { Project } from '../../types';
import {
  directorGreeting,
  divisionGreeting,
  needsAttention,
  timerRingRatio,
} from './division';

const proj = (over: Partial<Project>): Project => ({
  ProjectID: 'P1',
  ProjectNo: 'OLP-01',
  ProjectName: 'Test Project',
  FundType: 'Grant',
  SponsorerType: 'CSIR',
  SponsorerName: 'CSIR',
  ProjectCategory: 'R&D',
  ProjectStatus: 'Active',
  StartDate: '2024-01-01',
  CompletioDate: '2027-03-31',
  SanctionedCost: 100000,
  UtilizedAmount: 50000,
  PrincipalInvestigator: 'Dr. A',
  DivisionCode: 'MSE',
  Extension: '',
  ApprovalAuthority: 'Director',
  ...over,
});

describe('home/division (HH1 / DH1 / SH2)', () => {
  it('flags behind-schedule, ending-soon, and over-sanction active projects only', () => {
    expect(needsAttention(proj({}), '2026-11-22')).toEqual({ attention: false, reasons: [] });
    expect(needsAttention(proj({ ProjectStatus: 'Completed', CompletioDate: '2025-01-01' }), '2026-11-22'))
      .toEqual({ attention: false, reasons: [] });
    expect(needsAttention(proj({ CompletioDate: '2026-11-01', UtilizedAmount: 120000 }), '2026-11-22'))
      .toEqual({ attention: true, reasons: ['Behind schedule', 'Over sanctioned cost'] });
    expect(needsAttention(proj({ CompletioDate: '2026-12-15' }), '2026-11-22'))
      .toEqual({ attention: true, reasons: ['Ending within 60d'] });
  });

  it('builds HoD and Director Fraunces greeting sentences', () => {
    const morning = new Date(2026, 10, 22, 9, 0, 0);
    expect(divisionGreeting('Dr. Mehta', 'MSE', 2, 3, morning))
      .toBe('Good morning, Dr. Mehta. 3 items waiting and 2 division exceptions in MSE.');
    expect(directorGreeting('Dr. Srivastava', 0, 0, morning))
      .toBe('Good morning, Dr. Srivastava. No pending approvals or division exceptions today.');
  });

  it('computes SH2 report timer ring shares including negative overdue days', () => {
    expect(timerRingRatio('2026-11-28', '2026-11-22')).toEqual({
      daysLeft: 6,
      overdue: false,
      shareUsed: 0.8,
      label: '6d',
    });
    expect(timerRingRatio('2026-11-18', '2026-11-22')).toEqual({
      daysLeft: -4,
      overdue: true,
      shareUsed: 1,
      label: '-4d',
    });
  });
});

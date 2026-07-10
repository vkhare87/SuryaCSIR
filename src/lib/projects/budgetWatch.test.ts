import { describe, it, expect } from 'vitest';
import { budgetWatch } from './budgetWatch';
import type { ProjectInfo } from '../../types';

function proj(over: Partial<ProjectInfo>): ProjectInfo {
  return {
    ProjectID: 'p', ProjectNo: 'p', ProjectName: 'P', FundType: '', SponsorerType: '',
    SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Ongoing', StartDate: '',
    CompletioDate: '', SanctionedCost: '', UtilizedAmount: '', PrincipalInvestigator: '',
    DivisionCode: 'CMD', Extension: '', ApprovalAuthority: '', ...over,
  };
}

const today = new Date('2026-07-10');

describe('budgetWatch', () => {
  it('flags overrun when utilized exceeds sanctioned', () => {
    const [f] = budgetWatch([proj({ SanctionedCost: '100', UtilizedAmount: '120' })], today);
    expect(f.flag).toBe('overrun');
    expect(f.utilizationPct).toBe(120);
  });

  it('flags ahead-of-burn when spend outruns elapsed time by >= 25pp', () => {
    // 50% elapsed (2yr project, 1yr in), 90% spent -> +40pp
    const [f] = budgetWatch([proj({
      StartDate: '2025-07-10', CompletioDate: '2027-07-10',
      SanctionedCost: '100', UtilizedAmount: '90',
    })], today);
    expect(f.flag).toBe('ahead');
    expect(f.variancePp).toBeCloseTo(40, 0);
  });

  it('flags behind-burn when spend lags elapsed time by >= 25pp', () => {
    const [f] = budgetWatch([proj({
      StartDate: '2025-07-10', CompletioDate: '2027-07-10',
      SanctionedCost: '100', UtilizedAmount: '10',
    })], today);
    expect(f.flag).toBe('behind');
  });

  it('flags near-exhaustion when >=90% spent and no parseable timeline', () => {
    const [f] = budgetWatch([proj({ SanctionedCost: '100', UtilizedAmount: '95' })], today);
    expect(f.flag).toBe('exhaustion');
  });

  it('skips completed/closed projects, zero-sanctioned, and within-threshold burn', () => {
    const out = budgetWatch([
      proj({ ProjectStatus: 'Completed', SanctionedCost: '100', UtilizedAmount: '120' }),
      proj({ SanctionedCost: '0', UtilizedAmount: '50' }),
      proj({ SanctionedCost: 'N/A', UtilizedAmount: '50' }),
      proj({ // 50% elapsed, 55% spent -> +5pp, under threshold
        StartDate: '2025-07-10', CompletioDate: '2027-07-10',
        SanctionedCost: '100', UtilizedAmount: '55',
      }),
    ], today);
    expect(out).toEqual([]);
  });

  it('parses lakh-formatted amounts with commas', () => {
    const [f] = budgetWatch([proj({ SanctionedCost: '1,00,000', UtilizedAmount: '1,20,000' })], today);
    expect(f.flag).toBe('overrun');
  });

  it('clamps elapsed to 100% for projects past CompletioDate but not closed', () => {
    // Past end date, 40% spent -> behind by 60pp
    const [f] = budgetWatch([proj({
      StartDate: '2023-01-01', CompletioDate: '2024-01-01',
      SanctionedCost: '100', UtilizedAmount: '40',
    })], today);
    expect(f.elapsedPct).toBe(100);
    expect(f.flag).toBe('behind');
  });

  it('sorts most severe first: overrun, then largest |variance|', () => {
    const out = budgetWatch([
      proj({ ProjectNo: 'B', StartDate: '2025-07-10', CompletioDate: '2027-07-10', SanctionedCost: '100', UtilizedAmount: '80' }),
      proj({ ProjectNo: 'O', SanctionedCost: '100', UtilizedAmount: '110' }),
      proj({ ProjectNo: 'S', StartDate: '2025-07-10', CompletioDate: '2027-07-10', SanctionedCost: '100', UtilizedAmount: '95' }),
    ], today);
    expect(out.map(f => f.project.ProjectNo)).toEqual(['O', 'S', 'B']);
  });
});

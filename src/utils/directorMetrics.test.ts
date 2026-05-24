import { describe, it, expect } from 'vitest';
import type {
  ProjectInfo,
  ScientificOutput,
  IPIntelligence,
  Equipment,
  Ticket,
  ActionItem,
} from '../types';
import type { DivisionMetric } from './analytics';
import {
  DEFAULT_THRESHOLDS,
  getProjectFlags,
  getInstituteUtilization,
  getUtilizationByDivision,
  getActiveProjectGantt,
  getGanttWindow,
  getPublicationTrend,
  getIpPipeline,
  getAvgImpactByDivision,
  getOutputPerScientist,
  getEquipmentUptime,
  getEquipmentFlags,
  getTicketUrgencyMix,
  getOpsFlags,
} from './directorMetrics';

const NOW = new Date('2026-05-24');

const proj = (o: Partial<ProjectInfo>): ProjectInfo => ({
  ProjectID: '', ProjectNo: '', ProjectName: '', FundType: '', SponsorerType: '',
  SponsorerName: '', ProjectCategory: '', ProjectStatus: 'Active', StartDate: '',
  CompletioDate: '', SanctionedCost: '', UtilizedAmount: '', PrincipalInvestigator: '',
  DivisionCode: '', Extension: '', ApprovalAuthority: '', ...o,
});
const out = (o: Partial<ScientificOutput>): ScientificOutput => ({
  id: '', title: '', authors: [], journal: '', year: 2025, divisionCode: '', ...o,
});
const equip = (o: Partial<Equipment>): Equipment => ({
  UInsID: '', Name: '', EndUse: '', Division: '', IndenterName: '', OperatorName: '',
  Location: '', WorkingStatus: 'Working', Movable: '', RequirementInstallation: '',
  Justification: '', Remark: '', ...o,
});

describe('getProjectFlags', () => {
  it('flags overdue active projects', () => {
    const r = getProjectFlags([proj({ CompletioDate: '2026-01-01' })], DEFAULT_THRESHOLDS, NOW);
    expect(r.overdue).toHaveLength(1);
  });
  it('flags ending-soon within window, not beyond', () => {
    const within = getProjectFlags([proj({ CompletioDate: '2026-06-10' })], DEFAULT_THRESHOLDS, NOW);
    const beyond = getProjectFlags([proj({ CompletioDate: '2027-01-01' })], DEFAULT_THRESHOLDS, NOW);
    expect(within.endingSoon).toHaveLength(1);
    expect(beyond.endingSoon).toHaveLength(0);
  });
  it('flags low burn below threshold, skips zero-sanctioned', () => {
    const low = getProjectFlags([proj({ SanctionedCost: '100', UtilizedAmount: '10' })], DEFAULT_THRESHOLDS, NOW);
    const zero = getProjectFlags([proj({ SanctionedCost: '0', UtilizedAmount: '0' })], DEFAULT_THRESHOLDS, NOW);
    expect(low.lowBurn).toHaveLength(1);
    expect(zero.lowBurn).toHaveLength(0);
  });
  it('ignores non-active projects for date flags', () => {
    const r = getProjectFlags([proj({ ProjectStatus: 'Completed', CompletioDate: '2026-01-01' })], DEFAULT_THRESHOLDS, NOW);
    expect(r.overdue).toHaveLength(0);
  });
});

describe('getInstituteUtilization', () => {
  it('sums and computes pct', () => {
    const r = getInstituteUtilization([
      proj({ SanctionedCost: '100', UtilizedAmount: '40' }),
      proj({ SanctionedCost: '100', UtilizedAmount: '60' }),
    ]);
    expect(r.pct).toBe(50);
  });
  it('guards divide-by-zero', () => {
    expect(getInstituteUtilization([proj({ SanctionedCost: '0' })]).pct).toBe(0);
  });
});

describe('getUtilizationByDivision', () => {
  it('groups pct per division sorted desc', () => {
    const r = getUtilizationByDivision([
      proj({ DivisionCode: 'A', SanctionedCost: '100', UtilizedAmount: '90' }),
      proj({ DivisionCode: 'B', SanctionedCost: '100', UtilizedAmount: '10' }),
    ]);
    expect(r[0]).toEqual({ label: 'A', value: 90 });
    expect(r[1]).toEqual({ label: 'B', value: 10 });
  });
});

describe('getGanttWindow', () => {
  it('spans full calendar years from start of current year', () => {
    const w = getGanttWindow(3, NOW);
    expect(w.start.getFullYear()).toBe(2026);
    expect(w.start.getMonth()).toBe(0);
    expect(w.end.getFullYear()).toBe(2028);
    expect(w.end.getMonth()).toBe(11);
  });
});

describe('getActiveProjectGantt', () => {
  it('clamps overlapping projects to the window (no epoch dates)', () => {
    const w = getGanttWindow(1, NOW);
    const r = getActiveProjectGantt([proj({ StartDate: '2020-01-01', CompletioDate: '2030-01-01' })], w);
    expect(r).toHaveLength(1);
    expect((r[0].start as Date).getFullYear()).toBe(2026);
    expect((r[0].end as Date).getFullYear()).toBe(2026);
  });
  it('excludes projects ending before the window', () => {
    const w = getGanttWindow(1, NOW);
    expect(getActiveProjectGantt([proj({ StartDate: '2019-01-01', CompletioDate: '2020-01-01' })], w)).toHaveLength(0);
  });
  it('excludes projects starting after the window', () => {
    const w = getGanttWindow(1, NOW);
    expect(getActiveProjectGantt([proj({ StartDate: '2030-01-01', CompletioDate: '2031-01-01' })], w)).toHaveLength(0);
  });
  it('drops unparseable or inverted dates', () => {
    const w = getGanttWindow(5, NOW);
    expect(getActiveProjectGantt([proj({ StartDate: '', CompletioDate: '' })], w)).toHaveLength(0);
    expect(getActiveProjectGantt([proj({ StartDate: '2027-01-01', CompletioDate: '2026-01-01' })], w)).toHaveLength(0);
  });
});

describe('getPublicationTrend', () => {
  it('counts by year ascending', () => {
    const r = getPublicationTrend([out({ year: 2024 }), out({ year: 2025 }), out({ year: 2025 })]);
    expect(r).toEqual([{ label: '2024', value: 1 }, { label: '2025', value: 2 }]);
  });
});

describe('getIpPipeline', () => {
  it('returns Filed/Published/Granted counts', () => {
    const ip = (s: IPIntelligence['status']): IPIntelligence => ({
      id: '', title: '', type: 'Patent', status: s, filingDate: '', inventors: [], divisionCode: '',
    });
    const r = getIpPipeline([ip('Filed'), ip('Filed'), ip('Granted')]);
    expect(r).toEqual([{ name: 'Filed', value: 2 }, { name: 'Published', value: 0 }, { name: 'Granted', value: 1 }]);
  });
});

describe('getAvgImpactByDivision', () => {
  it('averages impact factor, ignores null', () => {
    const r = getAvgImpactByDivision([
      out({ divisionCode: 'A', impactFactor: 2 }),
      out({ divisionCode: 'A', impactFactor: 4 }),
      out({ divisionCode: 'A' }),
    ]);
    expect(r[0]).toEqual({ label: 'A', value: 3 });
  });
});

describe('getOutputPerScientist', () => {
  it('divides outputs by staff', () => {
    const metrics = [{ divCode: 'A', divName: '', staffCount: 2, activeProjectCount: 0, projectCount: 0, scientificOutputCount: 6, phdStudentCount: 0, equipmentCount: 0 }] as DivisionMetric[];
    expect(getOutputPerScientist(metrics)[0]).toEqual({ label: 'A', value: 3 });
  });
});

describe('getEquipmentUptime', () => {
  it('counts working vs total', () => {
    const r = getEquipmentUptime([equip({}), equip({ WorkingStatus: 'Under Maintenance' })]);
    expect(r).toEqual({ working: 1, total: 2 });
  });
});

describe('getEquipmentFlags', () => {
  it('flags non-working (not blank) and amc within window', () => {
    const r = getEquipmentFlags(
      [equip({ WorkingStatus: 'Under Maintenance' }), equip({ WorkingStatus: '' }), equip({ amc_end_date: '2026-06-10' })],
      DEFAULT_THRESHOLDS, NOW,
    );
    expect(r.down).toHaveLength(1);
    expect(r.amcExpiring).toHaveLength(1);
  });
});

describe('getTicketUrgencyMix', () => {
  it('counts open tickets by urgency, drops zeros', () => {
    const tk = (o: Partial<Ticket>): Ticket => ({
      id: '', token: '', subject: '', category: 'Infrastructure', urgency: 'High',
      description: '', submitted_by: '', assigned_to: null, status: 'Open',
      created_at: '', updated_at: '', resolved_at: null, ...o,
    });
    const r = getTicketUrgencyMix([tk({ urgency: 'High' }), tk({ urgency: 'Critical', status: 'Closed' })]);
    expect(r).toEqual([{ label: 'High', value: 1 }]);
  });
});

describe('getOpsFlags', () => {
  it('flags overdue incomplete actions', () => {
    const a = (o: Partial<ActionItem>): ActionItem => ({
      id: '', meeting_id: null, source: 'manual', task: '', assigned_to: '',
      deadline: '2026-01-01', status: 'Pending', completed_at: null, notes: '', ...o,
    });
    const r = getOpsFlags([], [a({}), a({ status: 'Completed' })], NOW);
    expect(r.overdueActions).toHaveLength(1);
  });
});

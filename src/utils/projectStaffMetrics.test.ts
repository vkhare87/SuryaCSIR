import { describe, it, expect } from 'vitest';
import type { ProjectStaff } from '../types';
import {
  parseDurationEnd,
  getTenureYears,
  getAvgTenure,
  getContractRunway,
  getHeadcountByProject,
  getHeadcountByPI,
  getDesignationMix,
  getHiresByCycle,
  getJoiningByYear,
  getDivisionMix,
} from './projectStaffMetrics';

const ps = (o: Partial<ProjectStaff>): ProjectStaff => ({
  id: '', ProjectNo: '', StaffName: '', Designation: '', RecruitmentCycle: '',
  DateOfJoining: '', DateOfProjectDuration: '', PIName: '', DivisionCode: '', ...o,
});
const NOW = new Date('2026-05-25');

describe('parseDurationEnd', () => {
  it('parses the end of a "START to END" range', () => {
    expect(parseDurationEnd('2023-08-15 to 2025-08-14')?.getFullYear()).toBe(2025);
  });
  it('returns null when no " to " present', () => {
    expect(parseDurationEnd('2 years')).toBeNull();
  });
  it('returns null for empty', () => expect(parseDurationEnd('')).toBeNull());
});

describe('getTenureYears', () => {
  it('computes years since joining, drops bad/negative', () => {
    const r = getTenureYears([ps({ DateOfJoining: '2024-05-25' }), ps({ DateOfJoining: '' }), ps({ DateOfJoining: '2030-01-01' })], NOW);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo(2, 1);
  });
});

describe('getAvgTenure', () => {
  it('averages to 1 dp, 0 when none', () => {
    expect(getAvgTenure([ps({ DateOfJoining: '2024-05-25' }), ps({ DateOfJoining: '2022-05-25' })], NOW)).toBeCloseTo(3, 1);
    expect(getAvgTenure([], NOW)).toBe(0);
  });
});

describe('getContractRunway', () => {
  it('buckets by months to contract end', () => {
    const r = getContractRunway([
      ps({ DateOfProjectDuration: '2024-01-01 to 2026-06-30' }),
      ps({ DateOfProjectDuration: '2024-01-01 to 2027-06-30' }),
      ps({ DateOfProjectDuration: '2020-01-01 to 2021-01-01' }),
    ], NOW);
    const map = Object.fromEntries(r.map((d) => [d.label, d.value]));
    expect(map['<3mo']).toBe(1);
    expect(map['>12mo']).toBe(1);
  });
});

describe('grouping selectors', () => {
  const sample = [
    ps({ ProjectNo: 'A', PIName: 'Dr X', Designation: 'JRF', RecruitmentCycle: '2024-I', DivisionCode: 'ARC', DateOfJoining: '2024-03-01' }),
    ps({ ProjectNo: 'A', PIName: 'Dr X', Designation: 'SRF', RecruitmentCycle: '2023-II', DivisionCode: 'ARC', DateOfJoining: '2023-03-01' }),
    ps({ ProjectNo: 'B', PIName: 'Dr Y', Designation: 'JRF', RecruitmentCycle: '2024-I', DivisionCode: 'NST', DateOfJoining: '2024-06-01' }),
  ];
  it('headcount by project desc', () => {
    expect(getHeadcountByProject(sample)[0]).toEqual({ label: 'A', value: 2 });
  });
  it('headcount by PI desc', () => {
    expect(getHeadcountByPI(sample)[0]).toEqual({ label: 'Dr X', value: 2 });
  });
  it('designation mix', () => {
    expect(getDesignationMix(sample).find((d) => d.label === 'JRF')!.value).toBe(2);
  });
  it('hires by cycle sorted asc', () => {
    expect(getHiresByCycle(sample).map((d) => d.label)).toEqual(['2023-II', '2024-I']);
  });
  it('joining by year asc', () => {
    expect(getJoiningByYear(sample)).toEqual([{ label: '2023', value: 1 }, { label: '2024', value: 2 }]);
  });
  it('division mix', () => {
    expect(getDivisionMix(sample).find((d) => d.label === 'ARC')!.value).toBe(2);
  });
});

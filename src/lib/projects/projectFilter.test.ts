import { describe, it, expect } from 'vitest';
import { matchesProjectFilter } from './projectFilter';
import { matchesStaffFilter } from '../staff/staffFilter';
import type { ProjectInfo, StaffMember } from '../../types';

const project = { FundType: '', ProjectStatus: 'Active', PrincipalInvestigator: '', DivisionCode: 'CMD', SponsorerName: 'DST' } as ProjectInfo;

describe('matchesProjectFilter', () => {
  it('matches blank values under the chart label, so clicking "Unspecified" finds rows', () => {
    expect(matchesProjectFilter(project, { dim: 'fundType', value: 'Unspecified' })).toBe(true);
    expect(matchesProjectFilter(project, { dim: 'pi', value: 'Unassigned' })).toBe(true);
  });
  it('filters by exact value and ignores unknown dims', () => {
    expect(matchesProjectFilter(project, { dim: 'sponsorer', value: 'CSIR' })).toBe(false);
    expect(matchesProjectFilter(project, { dim: 'nope', value: 'x' })).toBe(true);
    expect(matchesProjectFilter(project, null)).toBe(true);
  });
});

describe('matchesStaffFilter', () => {
  it('matches blank designation as "Unspecified"', () => {
    expect(matchesStaffFilter({ Designation: '' } as StaffMember, { dim: 'designation', value: 'Unspecified' })).toBe(true);
  });
});

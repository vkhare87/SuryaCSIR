import { describe, it, expect } from 'vitest';
import { resolveRoutingPreview } from './routing';
import type { HelpdeskRouting, DivisionInfo, StaffMember } from '../../types';

// --- Test Fixtures ---

function makeRoutingEntry(
  overrides: Partial<HelpdeskRouting> = {},
): HelpdeskRouting {
  return {
    id: 'r-001',
    category: 'Infrastructure',
    target_type: 'division',
    target_id: 'ARC',
    ...overrides,
  };
}

function makeDivision(overrides: Partial<DivisionInfo> = {}): DivisionInfo {
  return {
    divCode: 'ARC',
    divName: 'Advanced Research Centre',
    divDescription: 'Research division',
    divResearchAreas: 'Materials',
    divHoD: 'Dr. Ramesh Kumar',
    divHoDID: 'STF-001',
    divSanctionedstrength: 10,
    divCurrentStrength: 8,
    divStatus: 'Active',
    ...overrides,
  };
}

function makeStaffMember(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    ID: 'STF-001',
    LabCode: 'LAB01',
    EmployeeType: 'Permanent',
    Name: 'Dr. Ramesh Kumar',
    Designation: 'Senior Scientist',
    Group: 'A',
    Division: 'ARC',
    DoAPP: 'Y',
    DOJ: '2010-01-01',
    DOB: '1975-06-15',
    Cat: 'General',
    AppointmentType: 'Regular',
    Level: '12',
    CoreArea: 'Materials Science',
    Expertise: 'Nanomaterials',
    Email: 'ramesh@ampri.res.in',
    Ext: '1234',
    VidwanID: 'V001',
    ReportingID: 'STF-000',
    HighestQualification: 'PhD',
    Gender: 'Male',
    ...overrides,
  };
}

// --- resolveRoutingPreview Tests ---

describe('resolveRoutingPreview', () => {
  const defaultStaff = [makeStaffMember()];
  const defaultDivisions = [makeDivision()];

  it('returns HoD for division-targeted category', () => {
    const routingEntries = [makeRoutingEntry({ category: 'Infrastructure', target_type: 'division', target_id: 'ARC' })];

    const result = resolveRoutingPreview({
      category: 'Infrastructure',
      routingEntries,
      divisions: defaultDivisions,
      staff: defaultStaff,
    });

    expect(result).not.toBeNull();
    expect(result!.handlerName).toBe('Dr. Ramesh Kumar');
    expect(result!.handlerRole).toBe('DivisionHead');
    expect(result!.category).toBe('Infrastructure');
    expect(result!.targetType).toBe('division');
  });

  it('returns role name for role-targeted category', () => {
    const routingEntries = [makeRoutingEntry({ category: 'Administrative', target_type: 'role', target_id: 'HRAdmin' })];

    const result = resolveRoutingPreview({
      category: 'Administrative',
      routingEntries,
      divisions: defaultDivisions,
      staff: defaultStaff,
    });

    expect(result).not.toBeNull();
    expect(result!.handlerName).toBe('HRAdmin');
    expect(result!.handlerRole).toBe('HRAdmin');
    expect(result!.targetType).toBe('role');
  });

  it('returns null when no routing entry matches category', () => {
    const routingEntries = [makeRoutingEntry({ category: 'Infrastructure' })];

    const result = resolveRoutingPreview({
      category: 'HRGrievance',
      routingEntries,
      divisions: defaultDivisions,
      staff: defaultStaff,
    });

    expect(result).toBeNull();
  });

  it('returns null when division target is not found in divisions array', () => {
    const routingEntries = [makeRoutingEntry({ category: 'Infrastructure', target_type: 'division', target_id: 'NONEXISTENT' })];

    const result = resolveRoutingPreview({
      category: 'Infrastructure',
      routingEntries,
      divisions: defaultDivisions,
      staff: defaultStaff,
    });

    expect(result).toBeNull();
  });

  it('returns null when HoD staff member is not found', () => {
    const division = makeDivision({ divCode: 'ARC', divHoDID: 'STF-999' });
    const routingEntries = [makeRoutingEntry({ category: 'Infrastructure', target_type: 'division', target_id: 'ARC' })];

    const result = resolveRoutingPreview({
      category: 'Infrastructure',
      routingEntries,
      divisions: [division],
      staff: defaultStaff, // STF-001 exists but not STF-999
    });

    expect(result).toBeNull();
  });
});

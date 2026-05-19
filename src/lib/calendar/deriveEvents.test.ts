import { describe, it, expect } from 'vitest';
import { deriveBirthdayEvents } from './deriveEvents';
import type { StaffMember } from '../../types';

function makeStaff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    ID: 'S001',
    LabCode: 'L1',
    EmployeeType: 'Permanent',
    Name: 'Alice Researcher',
    Designation: 'Scientist',
    Group: 'A',
    Division: 'D01',
    DoAPP: '',
    DOJ: '',
    DOB: '15/06/1985',
    Cat: '',
    AppointmentType: '',
    Level: '',
    CoreArea: '',
    Expertise: '',
    Email: '',
    Ext: '',
    VidwanID: '',
    ReportingID: '',
    HighestQualification: '',
    Gender: 'Female',
    ...overrides,
  };
}

describe('deriveBirthdayEvents', () => {
  it('emits a birthday event in the matching month', () => {
    const staff = [makeStaff({ ID: 'S001', Name: 'Alice', DOB: '15/06/1985' })];
    const events = deriveBirthdayEvents(staff, 2026, 5);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('birthday');
    expect(events[0].title).toContain('Alice');
    expect(events[0].date.getMonth()).toBe(5);
    expect(events[0].date.getDate()).toBe(15);
    expect(events[0].date.getFullYear()).toBe(2026);
  });

  it('does not emit for staff born in a different month', () => {
    const staff = [makeStaff({ DOB: '10/01/1985' })];
    const events = deriveBirthdayEvents(staff, 2026, 5);
    expect(events).toHaveLength(0);
  });

  it('collapses Feb 29 birthdays to Feb 28 in non-leap years', () => {
    const staff = [makeStaff({ ID: 'S002', Name: 'Leap Person', DOB: '29/02/1988' })];
    const events = deriveBirthdayEvents(staff, 2026, 1);
    expect(events).toHaveLength(1);
    expect(events[0].date.getMonth()).toBe(1);
    expect(events[0].date.getDate()).toBe(28);
  });

  it('keeps Feb 29 birthdays on Feb 29 in leap years', () => {
    const staff = [makeStaff({ DOB: '29/02/1988' })];
    const events = deriveBirthdayEvents(staff, 2028, 1);
    expect(events).toHaveLength(1);
    expect(events[0].date.getMonth()).toBe(1);
    expect(events[0].date.getDate()).toBe(29);
  });

  it('skips staff with missing or unparseable DOB', () => {
    const staff = [
      makeStaff({ DOB: '' }),
      makeStaff({ DOB: 'not a date' }),
    ];
    expect(deriveBirthdayEvents(staff, 2026, 5)).toHaveLength(0);
  });
});

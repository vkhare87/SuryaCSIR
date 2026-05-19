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

import { deriveRetirementEvents } from './deriveEvents';

describe('deriveRetirementEvents', () => {
  function makeStaff(dob: string, id = 'S001', name = 'Alice'): StaffMember {
    return {
      ID: id, LabCode: '', EmployeeType: '', Name: name, Designation: '',
      Group: '', Division: '', DoAPP: '', DOJ: '', DOB: dob, Cat: '',
      AppointmentType: '', Level: '', CoreArea: '', Expertise: '',
      Email: '', Ext: '', VidwanID: '', ReportingID: '',
      HighestQualification: '', Gender: '',
    };
  }

  it('emits a retirement event when DOB + 60yrs lands in the given month', () => {
    const staff = [makeStaff('15/06/1966')];
    const events = deriveRetirementEvents(staff, 2026, 5);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('retirement');
    if (events[0].kind === 'retirement') {
      expect(events[0].retirementDate.getFullYear()).toBe(2026);
      expect(events[0].retirementDate.getMonth()).toBe(5);
      expect(events[0].retirementDate.getDate()).toBe(15);
    }
  });

  it('does not emit when the retirement month/year does not match', () => {
    const staff = [makeStaff('15/06/1966')];
    expect(deriveRetirementEvents(staff, 2026, 4)).toHaveLength(0);
    expect(deriveRetirementEvents(staff, 2027, 5)).toHaveLength(0);
  });

  it('skips staff with missing or unparseable DOB', () => {
    const staff = [makeStaff(''), makeStaff('garbage')];
    expect(deriveRetirementEvents(staff, 2026, 5)).toHaveLength(0);
  });
});

import { deriveProjectClosingEvents } from './deriveEvents';
import type { ProjectInfo } from '../../types';

describe('deriveProjectClosingEvents', () => {
  function makeProject(
    overrides: Partial<ProjectInfo> = {}
  ): ProjectInfo {
    return {
      ProjectID: 'P1', ProjectNo: 'P-1', ProjectName: 'Solar Cell',
      FundType: '', SponsorerType: '', SponsorerName: '',
      ProjectCategory: '', ProjectStatus: 'Ongoing',
      StartDate: '01/01/2024', CompletioDate: '15/06/2026',
      SanctionedCost: '', UtilizedAmount: '',
      PrincipalInvestigator: 'PI1', DivisionCode: 'D01',
      Extension: '', ApprovalAuthority: '',
      ...overrides,
    };
  }

  it('emits a project closing event when CompletioDate falls inside the window', () => {
    const projects = [makeProject({ CompletioDate: '15/06/2026' })];
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    const events = deriveProjectClosingEvents(projects, from, to);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('project_closing');
    expect(events[0].date.getMonth()).toBe(5);
    expect(events[0].date.getDate()).toBe(15);
  });

  it('excludes projects with CompletioDate outside the window', () => {
    const projects = [
      makeProject({ ProjectNo: 'A', CompletioDate: '15/05/2026' }),
      makeProject({ ProjectNo: 'B', CompletioDate: '15/07/2026' }),
    ];
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    expect(deriveProjectClosingEvents(projects, from, to)).toHaveLength(0);
  });

  it('excludes Completed projects', () => {
    const projects = [
      makeProject({ ProjectStatus: 'Completed', CompletioDate: '15/06/2026' }),
    ];
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    expect(deriveProjectClosingEvents(projects, from, to)).toHaveLength(0);
  });

  it('skips projects with missing or unparseable CompletioDate', () => {
    const projects = [
      makeProject({ CompletioDate: '' }),
      makeProject({ CompletioDate: 'garbage' }),
    ];
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 11, 31);
    expect(deriveProjectClosingEvents(projects, from, to)).toHaveLength(0);
  });

  it('treats window as inclusive on both ends', () => {
    const projects = [
      makeProject({ ProjectNo: 'A', CompletioDate: '01/06/2026' }),
      makeProject({ ProjectNo: 'B', CompletioDate: '30/06/2026' }),
    ];
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    expect(deriveProjectClosingEvents(projects, from, to)).toHaveLength(2);
  });
});

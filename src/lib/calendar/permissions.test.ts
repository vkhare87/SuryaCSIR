import { describe, it, expect } from 'vitest';
import { canCreateEvent, canEditEvent, canManageHolidays } from './permissions';
import type { CalendarEvent, Role } from '../../types';

const baseEvent: CalendarEvent = {
  id: 'E1',
  title: 'Lab Meet',
  event_date: '2026-06-01',
  event_kind: 'Custom',
  location: 'Room 12',
  teams_url: null,
  pamphlet_url: null,
  description: '',
  visibility: 'OrgWide',
  division_code: null,
  created_by: 'user-creator',
  created_at: '',
  updated_at: '',
};

describe('canCreateEvent', () => {
  const allowed: Role[] = ['HRAdmin', 'SystemAdmin', 'MasterAdmin', 'Director', 'HOD', 'DivisionHead'];
  const denied: Role[] = ['Scientist', 'Technician', 'Student', 'ProjectStaff', 'Guest', 'DefaultUser', 'FinanceAdmin', 'EmpoweredCommittee'];

  it.each(allowed)('allows %s', (role) => {
    expect(canCreateEvent(role)).toBe(true);
  });
  it.each(denied)('denies %s', (role) => {
    expect(canCreateEvent(role)).toBe(false);
  });
});

describe('canEditEvent', () => {
  it('allows creator', () => {
    expect(canEditEvent(baseEvent, 'user-creator', 'Scientist')).toBe(true);
  });
  it('allows SystemAdmin even when not creator', () => {
    expect(canEditEvent(baseEvent, 'someone-else', 'SystemAdmin')).toBe(true);
  });
  it('allows MasterAdmin even when not creator', () => {
    expect(canEditEvent(baseEvent, 'someone-else', 'MasterAdmin')).toBe(true);
  });
  it('denies non-creator non-admin', () => {
    expect(canEditEvent(baseEvent, 'someone-else', 'Scientist')).toBe(false);
  });
});

describe('canManageHolidays', () => {
  it('allows SystemAdmin', () => {
    expect(canManageHolidays('SystemAdmin')).toBe(true);
  });
  it('allows MasterAdmin', () => {
    expect(canManageHolidays('MasterAdmin')).toBe(true);
  });
  it('denies HRAdmin', () => {
    expect(canManageHolidays('HRAdmin')).toBe(false);
  });
  it('denies Director', () => {
    expect(canManageHolidays('Director')).toBe(false);
  });
  it('denies Scientist', () => {
    expect(canManageHolidays('Scientist')).toBe(false);
  });
});

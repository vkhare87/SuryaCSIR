import type { CalendarEvent, Role } from '../../types';

const CREATE_ROLES: readonly Role[] = [
  'HRAdmin',
  'SystemAdmin',
  'MasterAdmin',
  'Director',
  'HOD',
  'DivisionHead',
];

const HOLIDAYS_ADMIN_ROLES: readonly Role[] = ['SystemAdmin', 'MasterAdmin'];
const EVENT_ADMIN_ROLES: readonly Role[] = ['SystemAdmin', 'MasterAdmin'];

export function canCreateEvent(activeRole: Role): boolean {
  return CREATE_ROLES.includes(activeRole);
}

export function canEditEvent(
  event: CalendarEvent,
  userId: string,
  activeRole: Role
): boolean {
  if (event.created_by === userId) return true;
  return EVENT_ADMIN_ROLES.includes(activeRole);
}

export function canManageHolidays(activeRole: Role): boolean {
  return HOLIDAYS_ADMIN_ROLES.includes(activeRole);
}

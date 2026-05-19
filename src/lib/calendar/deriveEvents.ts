import type { ProjectInfo, StaffMember } from '../../types';
import { parseDate, getRetirementDate } from '../../utils/dateUtils';
import type { CalEvent } from './types';

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function deriveBirthdayEvents(
  staff: StaffMember[],
  year: number,
  month: number
): CalEvent[] {
  const events: CalEvent[] = [];
  for (const s of staff) {
    const dob = parseDate(s.DOB);
    if (!dob) continue;
    if (dob.getMonth() !== month) continue;

    let day = dob.getDate();
    if (dob.getMonth() === 1 && day === 29 && !isLeapYear(year)) {
      day = 28;
    }
    const date = new Date(year, month, day);
    events.push({
      kind: 'birthday',
      id: `birthday-${s.ID}-${year}`,
      title: `${s.Name} — Birthday`,
      location: s.Division || '',
      date,
      meta: `Turns ${year - dob.getFullYear()}`,
      source: s,
    });
  }
  return events;
}

export function deriveRetirementEvents(
  staff: StaffMember[],
  year: number,
  month: number
): CalEvent[] {
  const events: CalEvent[] = [];
  for (const s of staff) {
    const retirementDate = getRetirementDate(s.DOB);
    if (!retirementDate) continue;
    if (retirementDate.getFullYear() !== year) continue;
    if (retirementDate.getMonth() !== month) continue;
    events.push({
      kind: 'retirement',
      id: `retirement-${s.ID}-${year}`,
      title: `${s.Name} — Retirement`,
      location: s.Division || '',
      date: retirementDate,
      retirementDate,
      meta: `Age 60 · ${s.Designation || ''}`,
      source: s,
    });
  }
  return events;
}

export function deriveProjectClosingEvents(
  _projects: ProjectInfo[],
  _from: Date,
  _to: Date
): CalEvent[] {
  return [];
}

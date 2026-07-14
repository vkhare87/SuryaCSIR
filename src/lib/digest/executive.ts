import { parseDate } from '../../utils/dateUtils';
import type { Role, ProjectInfo, PhDMilestone, VacancyAdvertisement } from '../../types';
import type { DigestItem } from './dataHealth';

const STEWARD_ROLES: Role[] = ['Director', 'HRAdmin', 'SystemAdmin', 'MasterAdmin'];
const DAY_MS = 86_400_000;
const plural = (n: number) => (n === 1 ? '' : 's');

function daysUntil(raw: string | undefined, today: Date): number | null {
  const d = raw ? parseDate(raw) : null;
  return d ? Math.floor((d.getTime() - today.getTime()) / DAY_MS) : null;
}

const isClosed = (status: string) =>
  ['completed', 'closed'].includes(status.trim().toLowerCase());

export interface ExecutiveDigestData {
  projects: ProjectInfo[];
  phdMilestones: PhDMilestone[];
  vacancyAdvertisements: VacancyAdvertisement[];
}

/**
 * Proactive executive alerts derived from loaded records: projects at/near end
 * date, overdue PhD milestones, vacancies about to close. Pure derivation like
 * buildDataHealthDigest — items vanish when the underlying record is resolved.
 */
export function buildExecutiveDigest(
  role: Role,
  divisionCode: string | null,
  data: ExecutiveDigestData,
  today: Date = new Date(),
): DigestItem[] {
  const divScoped = (role === 'DivisionHead' || role === 'HOD') && !!divisionCode;
  if (!divScoped && !STEWARD_ROLES.includes(role)) return [];

  const projects = divScoped
    ? data.projects.filter(p => p.DivisionCode === divisionCode)
    : data.projects;

  const items: DigestItem[] = [];

  const overdue: ProjectInfo[] = [];
  const ending: ProjectInfo[] = [];
  for (const p of projects) {
    if (isClosed(p.ProjectStatus)) continue;
    const days = daysUntil(p.CompletioDate, today);
    if (days === null) continue;
    if (days < 0) overdue.push(p);
    else if (days <= 60) ending.push(p);
  }
  if (overdue.length > 0) items.push({
    id: 'exec-projects-overdue',
    severity: 'urgent',
    title: `${overdue.length} active project${plural(overdue.length)} past end date`,
    detail: overdue.slice(0, 3).map(p => p.ProjectNo).join(', '),
    href: '/projects',
  });
  if (ending.length > 0) items.push({
    id: 'exec-projects-ending',
    severity: 'warning',
    title: `${ending.length} project${plural(ending.length)} ending within 60 days`,
    detail: ending.slice(0, 3).map(p => p.ProjectNo).join(', '),
    href: '/projects',
  });

  // ponytail: milestone/vacancy rules are steward-only — scoping them to a
  // division needs joins these records don't carry; add if HoDs ask.
  if (!divScoped) {
    const lateMilestones = data.phdMilestones.filter(m => {
      if (m.completedDate) return false;
      const days = daysUntil(m.dueDate, today);
      return days !== null && days < 0;
    });
    if (lateMilestones.length > 0) items.push({
      id: 'exec-phd-overdue',
      severity: 'warning',
      title: `${lateMilestones.length} PhD milestone${plural(lateMilestones.length)} overdue`,
      detail: [...new Set(lateMilestones.map(m => m.milestone))].slice(0, 3).join(', '),
      href: '/phd',
    });

    const closing = data.vacancyAdvertisements.filter(v => {
      if (v.status !== 'Open') return false;
      const days = daysUntil(v.applicationDeadline, today);
      return days !== null && days >= 0 && days <= 14;
    });
    if (closing.length > 0) items.push({
      id: 'exec-vacancy-closing',
      severity: 'info',
      title: `${closing.length} vacanc${closing.length === 1 ? 'y closes' : 'ies close'} within 14 days`,
      detail: closing.slice(0, 3).map(v => v.title).join(', '),
      href: '/recruitment',
    });
  }

  return items;
}

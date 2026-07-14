import type { Role } from '../../types';
import type { DivisionFreshness } from '../divisions/freshness';

export type DigestSeverity = 'urgent' | 'warning' | 'info';

export interface DigestItem {
  id: string;
  severity: DigestSeverity;
  title: string;
  detail: string;
  href: string;
}

// Roles that steward institute-wide data quality.
const STEWARD_ROLES: Role[] = ['Director', 'HRAdmin', 'SystemAdmin', 'MasterAdmin'];

const HREF = '/divisions-analytics';
const plural = (n: number) => (n === 1 ? '' : 's');

function gapSummary(f: DivisionFreshness): string {
  if (f.gaps.length > 0) return f.gaps.slice(0, 2).join('; ');
  return f.latestRecordYear ? `latest record ${f.latestRecordYear}` : 'no records';
}

/**
 * Role-scoped data-health alerts derived from division freshness — the
 * "3 divisions stale" half of the digest. Pure derivation: items appear when
 * records lapse and vanish when they're filled, so nothing goes stale in a
 * stored notification. Task-based pings live in MyActions / PMS notifications.
 */
export function buildDataHealthDigest(
  role: Role,
  divisionCode: string | null,
  freshness: DivisionFreshness[],
): DigestItem[] {
  // Division stewards see only their own division.
  if ((role === 'DivisionHead' || role === 'HOD') && divisionCode) {
    const f = freshness.find(x => x.divCode === divisionCode);
    if (!f || (f.staleness === 'fresh' && f.gaps.length === 0)) return [];
    return [{
      id: `dh-${f.divCode}`,
      severity: f.staleness === 'empty' ? 'urgent' : f.staleness === 'stale' ? 'warning' : 'info',
      title: `${f.divName} data needs attention`,
      detail: gapSummary(f),
      href: HREF,
    }];
  }

  if (!STEWARD_ROLES.includes(role)) return [];

  // Institute stewards: rolled up by severity, worst offenders named.
  const empties = freshness.filter(f => f.staleness === 'empty');
  const stales = freshness.filter(f => f.staleness === 'stale');
  const soft = freshness.filter(f => f.staleness === 'aging' || (f.staleness === 'fresh' && f.gaps.length > 0));

  const items: DigestItem[] = [];
  if (empties.length > 0) items.push({
    id: 'inst-empty',
    severity: 'urgent',
    title: `${empties.length} division${plural(empties.length)} with no records`,
    detail: empties.map(f => f.divCode).join(', '),
    href: HREF,
  });
  if (stales.length > 0) items.push({
    id: 'inst-stale',
    severity: 'warning',
    title: `${stales.length} division${plural(stales.length)} with stale data`,
    detail: stales.map(f => `${f.divCode} (${f.latestRecordYear})`).join(', '),
    href: HREF,
  });
  if (soft.length > 0) items.push({
    id: 'inst-soft',
    severity: 'info',
    title: `${soft.length} division${plural(soft.length)} with incomplete records`,
    detail: soft.map(f => f.divCode).join(', '),
    href: HREF,
  });
  return items;
}

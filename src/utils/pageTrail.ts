import { FEATURE_LABELS } from '../constants/access';
import { ROLE_ROUTES } from '../constants/roleRoutes';

export interface Crumb {
  label: string;
  to?: string;
}

// Routes that exist but are not access-controlled paths of their own.
const EXTRA_LABELS: Record<string, string> = {
  '/pms/reports': 'PMS Reports',
  '/pms/evaluate': 'Evaluations',
  '/pms/grievance': 'Grievance',
  '/helpdesk/new': 'New Ticket',
  '/proposals/new': 'New Proposal',
};

const LEAF_LABELS: Record<string, string> = {
  new: 'New', edit: 'Edit', meetings: 'Meetings', actions: 'Actions',
};

const DASHBOARDS = new Set(['/', ...Object.values(ROLE_ROUTES)]);

/**
 * Header trail for a pathname: known section prefixes become links, the last
 * crumb is the current page (no link). Record IDs collapse into "Details".
 * "/projects/AMPRI%2F…" → Projects › Details.
 */
export function pageTrail(pathname: string): Crumb[] {
  if (DASHBOARDS.has(pathname) && pathname !== '/pms') return [{ label: 'Dashboard' }];
  const labels: Record<string, string> = { ...FEATURE_LABELS, ...EXTRA_LABELS };
  const segs = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [];
  let prefix = '';
  segs.forEach((seg, i) => {
    prefix += `/${seg}`;
    const last = i === segs.length - 1;
    const label = labels[prefix] ?? (last ? LEAF_LABELS[seg] ?? 'Details' : null);
    if (label) crumbs.push({ label, to: last ? undefined : prefix });
  });
  return crumbs.length > 0 ? crumbs : [{ label: 'SURYA' }];
}

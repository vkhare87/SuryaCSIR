import type { Role, FeatureControl } from '../../types';
import { ACCESS_MAP, type AccessPath } from '../../constants/access';

// Runtime feature-control layer on top of the compile-time ACCESS_MAP.
// MasterAdmin can switch a feature off globally (enabled=false) or for
// specific roles (disabled_roles). Default-open: no row ⇒ feature on.
// This layer governs UI availability only — RLS remains the data gate.

// Paths MasterAdmin cannot switch off: the dashboard and the admin surface
// itself (self-lockout guard; MasterAdmin is also exempt from every control).
export const UNCONTROLLABLE_PATHS: AccessPath[] = (
  Object.keys(ACCESS_MAP) as AccessPath[]
).filter((p) => p === '/' || p.startsWith('/admin/'));

export function isControllable(path: string): path is AccessPath {
  return path in ACCESS_MAP && !UNCONTROLLABLE_PATHS.includes(path as AccessPath);
}

/**
 * Does the runtime control layer allow `role` to use the feature at `path`?
 * Pure control-layer check — ACCESS_MAP role membership is enforced separately
 * (Sidebar filter / ProtectedRoute allowedRoles).
 */
export function featureEnabled(
  path: string,
  role: Role,
  controls: FeatureControl[],
): boolean {
  if (role === 'MasterAdmin') return true;
  if (!isControllable(path)) return true;
  const c = controls.find((x) => x.feature_key === path);
  if (!c) return true;
  return c.enabled && !c.disabled_roles.includes(role);
}

// Grouping used by the Feature Controls admin panels — mirrors the sidebar
// sections, with workflow sub-paths listed under their parent area.
export const FEATURE_GROUPS: { label: string; paths: AccessPath[] }[] = [
  { label: 'Overview', paths: ['/ask', '/intelligence', '/explore', '/calendar'] },
  { label: 'Unified Human Resource', paths: ['/staff', '/staff/analytics', '/staff/project', '/phd', '/divisions', '/recruitment'] },
  { label: 'Research Ops', paths: ['/projects', '/proposals', '/reports', '/reports/new', '/facilities', '/partnerships', '/rnd-monitor'] },
  { label: 'Governance', paths: ['/committees', '/helpdesk', '/pms', '/pms/cycles', '/pms/evaluation-committees', '/pms/reports/new', '/pms/assign', '/pms/committee', '/pms/audit'] },
  { label: 'Data Ops', paths: ['/data', '/irins-sync'] },
];

export function blankControl(path: string): FeatureControl {
  return {
    feature_key: path,
    enabled: true,
    disabled_roles: [],
    note: null,
    updated_by: null,
    updated_at: '',
  };
}

/** Filters each group's paths to only those the role is eligible for
 * (present in ACCESS_MAP[path]); drops a group entirely if it ends up empty. */
export function featuresForRole(
  role: Role,
  groups: { label: string; paths: AccessPath[] }[],
): { label: string; paths: AccessPath[] }[] {
  return groups
    .map((g) => ({ label: g.label, paths: g.paths.filter((p) => (ACCESS_MAP[p] as Role[]).includes(role)) }))
    .filter((g) => g.paths.length > 0);
}

/** Pure state transform: returns the next FeatureControl after toggling
 * whether `role` is blocked. Does not mutate the input. */
export function toggleRoleBlock(control: FeatureControl, role: Role): FeatureControl {
  const disabled_roles = control.disabled_roles.includes(role)
    ? control.disabled_roles.filter((r) => r !== role)
    : [...control.disabled_roles, role];
  return { ...control, disabled_roles };
}

export interface FeatureRoleSummary {
  totalEligible: number;
  enabledCount: number;
  eligibleRoles: Role[];
  blockedRoles: Role[];
  globallyKilled: boolean;
}

/** Summarizes how exposed a feature currently is across its eligible roles
 * (ACCESS_MAP[path] minus MasterAdmin, which is always exempt). */
export function featureRoleSummary(
  path: AccessPath,
  control: FeatureControl | undefined,
): FeatureRoleSummary {
  const eligibleRoles = (ACCESS_MAP[path] as Role[]).filter((r) => r !== 'MasterAdmin');
  const c = control ?? blankControl(path);
  const blockedRoles = c.enabled ? eligibleRoles.filter((r) => c.disabled_roles.includes(r)) : eligibleRoles;
  return {
    totalEligible: eligibleRoles.length,
    enabledCount: eligibleRoles.length - blockedRoles.length,
    eligibleRoles,
    blockedRoles,
    globallyKilled: !c.enabled,
  };
}

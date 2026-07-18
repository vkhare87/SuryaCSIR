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

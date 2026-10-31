import { Users, Briefcase, Network, type LucideIcon } from 'lucide-react';

export type EntityKind = 'staff' | 'project' | 'division';

interface EntityMeta {
  icon: LucideIcon;
  color: string; // graph node fill / accent
  route: (id: string) => string;
}

/** One registry mapping entity kind → route, icon, accent. Used by EntityLink,
 *  the related-entity rails, and the graph explorer. IDs are URI-encoded:
 *  ProjectIDs look like "AMPRI/RD/2021-22/0002" and would not match a route raw. */
export const ENTITY_META: Record<EntityKind, EntityMeta> = {
  staff:    { icon: Users,     color: '#c96442', route: id => `/staff/${encodeURIComponent(id)}` },
  project:  { icon: Briefcase, color: '#d97757', route: id => `/projects/${encodeURIComponent(id)}` },
  division: { icon: Network,   color: '#7a4a1e', route: () => `/divisions` },
};

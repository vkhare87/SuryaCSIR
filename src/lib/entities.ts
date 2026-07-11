import { Users, Briefcase, Network, type LucideIcon } from 'lucide-react';

export type EntityKind = 'staff' | 'project' | 'division';

interface EntityMeta {
  icon: LucideIcon;
  color: string; // graph node fill / accent
  route: (id: string) => string;
}

/** One registry mapping entity kind → route, icon, accent. Used by EntityLink,
 *  the related-entity rails, and the graph explorer. */
export const ENTITY_META: Record<EntityKind, EntityMeta> = {
  staff:    { icon: Users,     color: '#c96442', route: id => `/staff/${id}` },
  project:  { icon: Briefcase, color: '#d97757', route: id => `/projects/${id}` },
  division: { icon: Network,   color: '#7a4a1e', route: () => `/divisions` },
};

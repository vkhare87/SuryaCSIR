import type { HelpdeskRouting, StaffMember, DivisionInfo } from '../../types';

interface RoutingPreview {
  handlerName: string;
  handlerRole: string;
  category: string;
  targetType: string;
}

/**
 * Resolve a routing preview for ticket creation UI.
 *
 * Client-side mirror of the route_ticket() DB function. Given a category
 * and lookup data from DataContext, returns the expected handler name and role
 * so the user sees where their ticket will go before submitting.
 *
 * Data comes from useData() — no Supabase calls here.
 */
export function resolveRoutingPreview(params: {
  category: string;
  routingEntries: HelpdeskRouting[];
  divisions: DivisionInfo[];
  staff: StaffMember[];
}): RoutingPreview | null {
  const entry = params.routingEntries.find((r) => r.category === params.category);
  if (!entry) return null;

  if (entry.target_type === 'role') {
    return {
      handlerName: entry.target_id,
      handlerRole: entry.target_id,
      category: params.category,
      targetType: 'role',
    };
  }

  // Division target: find the division, then find its HoD
  const division = params.divisions.find((d) => d.divCode === entry.target_id);
  if (!division) return null;

  const staffMember = params.staff.find((s) => s.ID === division.divHoDID);
  if (!staffMember) return null;

  return {
    handlerName: staffMember.Name,
    handlerRole: 'DivisionHead',
    category: params.category,
    targetType: 'division',
  };
}

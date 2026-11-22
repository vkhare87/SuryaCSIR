import { useMemo } from 'react';
import { useData } from '../contexts/DataContext';

function safeDecode(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/**
 * Resolves a human-readable record title for detail routes so header
 * breadcrumbs show "Projects › GAP-0421" instead of "Projects › Details".
 */
export function useEntityBreadcrumb(pathname: string): string | undefined {
  const { staff, projects, equipment, committees } = useData();

  return useMemo(() => {
    const segs = pathname.split('/').filter(Boolean);
    if (segs.length < 2) return undefined;

    if (segs[0] === 'staff' && segs.length === 2) {
      const id = safeDecode(segs[1]);
      const match = staff.find(s => s.ID === id);
      return match?.Name || undefined;
    }

    if (segs[0] === 'projects' && segs.length === 2) {
      const id = safeDecode(segs[1]);
      const match = projects.find(p => p.ProjectID === id);
      return match ? (match.ProjectNo || match.ProjectName || undefined) : undefined;
    }

    if (segs[0] === 'facilities' && segs.length === 2) {
      const id = safeDecode(segs[1]);
      const match = equipment.find(e => e.UInsID === id);
      return match?.Name || undefined;
    }

    if (segs[0] === 'committees' && segs.length === 2) {
      const id = safeDecode(segs[1]);
      const match = committees.find(c => c.id === id);
      return match?.name || undefined;
    }

    return undefined;
  }, [pathname, staff, projects, equipment, committees]);
}

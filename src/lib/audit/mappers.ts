// Normalizes the two audit tables (pms_audit_logs, audit_log) into one shape.
// Pure — unit-tested; AuditLog.tsx consumes.

export type AuditSource = 'pms' | 'modules';

export interface UnifiedLog {
  id: string;
  source: AuditSource;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export function mapPmsRow(r: Record<string, unknown>): UnifiedLog {
  return {
    id:         r.id as string,
    source:     'pms',
    actorId:    r.user_id as string,
    action:     r.action as string,
    entityType: r.entity_type as string,
    entityId:   r.entity_id as string,
    details:    (r.details as Record<string, unknown>) ?? {},
    createdAt:  r.created_at as string,
  };
}

export function mapModuleRow(r: Record<string, unknown>): UnifiedLog {
  return {
    id:         r.id as string,
    source:     'modules',
    actorId:    r.actor_id as string,
    action:     r.action as string,
    entityType: r.entity_type as string,
    entityId:   r.entity_id as string,
    details:    (r.changes as Record<string, unknown>) ?? {},
    createdAt:  r.created_at as string,
  };
}

export function summarizeDetails(log: UnifiedLog): string {
  const d = log.details;
  if (!d || Object.keys(d).length === 0) return '';
  if (log.source === 'pms') {
    return Object.entries(d).map(([k, v]) => `${k}: ${String(v)}`).join(' · ');
  }
  // module audit_log packs changes as { old, new } for updates
  if ('new' in d && 'old' in d) {
    const newObj = d.new as Record<string, unknown>;
    const oldObj = d.old as Record<string, unknown>;
    const changed: string[] = [];
    for (const key of Object.keys(newObj)) {
      if (newObj[key] !== oldObj?.[key]) {
        changed.push(`${key}: ${String(oldObj?.[key])} → ${String(newObj[key])}`);
      }
    }
    return changed.slice(0, 3).join(' · ');
  }
  // For inserts/deletes show a few useful keys if present
  const preferred = ['name', 'subject', 'token', 'status', 'urgency', 'category', 'title'];
  const lines = preferred
    .filter((k) => d[k] !== undefined)
    .map((k) => `${k}: ${String(d[k])}`);
  return lines.slice(0, 3).join(' · ');
}

import { supabase } from '../../utils/supabaseClient';
import type { AppNotification, NotificationStatus } from '../../types';
import type { PMSNotification } from '../../types/pms';

export function mapAppNotificationRow(row: Record<string, unknown>): AppNotification {
  return {
    id:             row.id as string,
    userId:         row.user_id as string,
    kind:           row.kind as string,
    severity:       row.severity as AppNotification['severity'],
    title:          row.title as string,
    body:           (row.body as string) ?? '',
    link:           (row.link as string) ?? null,
    source:         row.source as AppNotification['source'],
    status:         row.status as NotificationStatus,
    proposedAction: (row.proposed_action as Record<string, unknown>) ?? null,
    createdAt:      row.created_at as string,
  };
}

/** Only `status` is client-writable (column grant); RLS limits it to the caller's own rows. */
export async function updateNotificationStatus(id: string, status: NotificationStatus): Promise<void> {
  if (!supabase) throw new Error('Supabase not provisioned');
  const { error } = await supabase.from('notifications').update({ status }).eq('id', id);
  if (error) throw error;
}

export interface BellItem {
  id: string;
  source: 'pms' | 'app';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  link: string | null;
  /** A background-agent suggestion: the user accepts or dismisses it. */
  agent: boolean;
  /** Decided (accepted / dismissed) agent items leave the bell. */
  decided: boolean;
}

/** Both feeds as one list, newest first. */
export function mergeNotificationFeeds(pms: PMSNotification[], app: AppNotification[]): BellItem[] {
  return [
    ...pms.map(n => ({
      id: n.id, source: 'pms' as const, title: n.title, body: n.body, createdAt: n.createdAt,
      read: n.read, link: n.reportId ? `/pms/reports/${n.reportId}` : null,
      agent: false, decided: false,
    })),
    ...app.map(n => ({
      id: n.id, source: 'app' as const, title: n.title, body: n.body, createdAt: n.createdAt,
      read: n.status !== 'open', link: n.link,
      agent: n.source === 'agent', decided: n.status === 'accepted' || n.status === 'dismissed',
    })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

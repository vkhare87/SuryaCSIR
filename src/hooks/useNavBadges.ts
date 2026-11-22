import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { usePMS } from '../contexts/PMSContext';
import { inboxBucket, isReviewer } from '../lib/contributions/state';

/**
 * Computes lightweight urgency badge counts for sidebar navigation items
 * exclusively from already-loaded contexts (zero extra network requests).
 */
export function useNavBadges(): Record<string, number> {
  const { user } = useAuth();
  const { contributionRequests, dataStewards, tickets } = useData();
  const { notifications } = usePMS();

  return useMemo(() => {
    const counts: Record<string, number> = {};
    const userId = user?.id ?? '';
    const roles = user?.roles ?? [];

    if (userId && contributionRequests.length > 0) {
      let actionable = 0;
      for (const req of contributionRequests) {
        const reviewer = isReviewer(req, userId, roles, dataStewards);
        const bucket = inboxBucket(req, userId, reviewer);
        if (bucket === 'todo' || bucket === 'review') actionable += 1;
      }
      if (actionable > 0) counts['/work'] = actionable;
    }

    const unreadPms = notifications.filter(n => !n.read).length;
    if (unreadPms > 0) counts['/pms'] = unreadPms;

    if (userId && tickets.length > 0) {
      const openMine = tickets.filter(
        t => (t.assigned_to === userId || t.submitted_by === userId)
          && (t.status === 'Open' || t.status === 'InProgress'),
      ).length;
      if (openMine > 0) counts['/helpdesk'] = openMine;
    }

    return counts;
  }, [user, contributionRequests, dataStewards, notifications, tickets]);
}

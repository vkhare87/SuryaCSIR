import { useEffect, useState } from 'react';

export interface RecentRoute {
  path: string;
  label: string;
  visitedAt: number;
}

const STORAGE_KEY = 'surya_recent_routes';
const MAX_RECENT = 6;

const IGNORED_PREFIXES = ['/login', '/setup', '/change-password'];

function readStored(): RecentRoute[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is RecentRoute =>
        x && typeof x.path === 'string' && typeof x.label === 'string' && typeof x.visitedAt === 'number',
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/**
 * Tracks the user's most recently visited routes/records in localStorage so
 * the ⌘K Command Center offers instant 1-keystroke return to recent work.
 */
export function useRecentRoutes(pathname?: string, label?: string): RecentRoute[] {
  const [recent, setRecent] = useState<RecentRoute[]>(() => readStored());

  useEffect(() => {
    if (!pathname || !label) return;
    if (IGNORED_PREFIXES.some(p => pathname.startsWith(p))) return;
    if (label === 'Dashboard' || label === 'SURYA') return;

    setRecent(prev => {
      const next: RecentRoute[] = [
        { path: pathname, label, visitedAt: Date.now() },
        ...prev.filter(item => item.path !== pathname),
      ].slice(0, MAX_RECENT);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [pathname, label]);

  return recent;
}

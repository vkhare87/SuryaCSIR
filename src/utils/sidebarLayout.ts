export interface SidebarLayout {
  /** Ordered "For you" paths; null means the role's default list. */
  pins: string[] | null;
  /** Nav paths the user opened, newest first. */
  recent: string[];
  collapsed: boolean;
}

const DEFAULT_LAYOUT: SidebarLayout = { pins: null, recent: [], collapsed: false };

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

/**
 * How one user arranged the sidebar for one role, from this browser.
 * A view convenience only: what a user may open is decided by canAccess(),
 * never by what is stored here. Anything unreadable falls back to the default.
 */
export function readLayout(key: string): SidebarLayout {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<SidebarLayout> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_LAYOUT;
    return {
      pins: isStrings(raw.pins) ? raw.pins : null,
      recent: isStrings(raw.recent) ? raw.recent : [],
      collapsed: raw.collapsed === true,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function writeLayout(key: string, layout: SidebarLayout) {
  try { localStorage.setItem(key, JSON.stringify(layout)); } catch { /* storage blocked — state still works */ }
}

/** Adds `path` at the end, or removes it when it is already there. */
export function toggleIn(list: string[], path: string): string[] {
  return list.includes(path) ? list.filter(p => p !== path) : [...list, path];
}

/** Moves `path` one place up (-1) or down (+1); unchanged at either end. */
export function moveIn(list: string[], path: string, delta: -1 | 1): string[] {
  const from = list.indexOf(path);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

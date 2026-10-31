import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Tab state kept in `?tab=` so Back/forward and shared links reopen the same
 * tab. The first tab is the default and is left out of the URL. Other params
 * (e.g. `?filter=`) are preserved.
 */
export function useUrlTab<T extends string>(tabs: readonly T[]): [T, (t: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = (tabs as readonly string[]).includes(raw ?? '') ? (raw as T) : tabs[0];
  const setTab = useCallback((t: string) => setParams(prev => {
    const next = new URLSearchParams(prev);
    if (t === tabs[0]) next.delete('tab'); else next.set('tab', t);
    return next;
  }), [setParams, tabs]);
  return [tab, setTab];
}

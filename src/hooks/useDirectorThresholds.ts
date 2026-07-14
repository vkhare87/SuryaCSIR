import { useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_THRESHOLDS,
  THRESHOLD_KEYS,
  type DirectorThresholds,
} from '../utils/directorMetrics';

function loadLocal(): DirectorThresholds {
  const read = (key: string, fallback: number) => {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    lowBurnPct: read(THRESHOLD_KEYS.lowBurnPct, DEFAULT_THRESHOLDS.lowBurnPct),
    endingDays: read(THRESHOLD_KEYS.endingDays, DEFAULT_THRESHOLDS.endingDays),
    amcDays: read(THRESHOLD_KEYS.amcDays, DEFAULT_THRESHOLDS.amcDays),
  };
}

function saveLocal(t: DirectorThresholds) {
  localStorage.setItem(THRESHOLD_KEYS.lowBurnPct, String(t.lowBurnPct));
  localStorage.setItem(THRESHOLD_KEYS.endingDays, String(t.endingDays));
  localStorage.setItem(THRESHOLD_KEYS.amcDays, String(t.amcDays));
}

function sanitize(raw: unknown): DirectorThresholds | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
  return {
    lowBurnPct: num(r.lowBurnPct, DEFAULT_THRESHOLDS.lowBurnPct),
    endingDays: num(r.endingDays, DEFAULT_THRESHOLDS.endingDays),
    amcDays: num(r.amcDays, DEFAULT_THRESHOLDS.amcDays),
  };
}

/** Director dashboard thresholds backed by user_profiles.preferences (D5) —
 * organizational calibration survives browser changes. localStorage stays as
 * an instant-paint cache and offline fallback. */
export function useDirectorThresholds() {
  const { user } = useAuth();
  const [thresholds, setThresholds] = useState<DirectorThresholds>(loadLocal);
  const hydrated = useRef(false);

  // Hydrate once from the profile; profile wins over the local cache.
  useEffect(() => {
    if (hydrated.current || !supabase || !user?.id || user.id === 'dev-admin') return;
    hydrated.current = true;
    let cancelled = false;
    void supabase
      .from('user_profiles')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const remote = sanitize((data?.preferences as Record<string, unknown> | null)?.directorThresholds);
        if (remote) {
          setThresholds(remote);
          saveLocal(remote);
        }
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const update = (next: DirectorThresholds) => {
    setThresholds(next);
    saveLocal(next);
    if (supabase && user?.id && user.id !== 'dev-admin') {
      void supabase.rpc('merge_user_preferences', { p_patch: { directorThresholds: next } });
    }
  };

  return { thresholds, setThresholds: update };
}

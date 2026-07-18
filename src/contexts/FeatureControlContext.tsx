/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import { featureEnabled } from '../lib/access/featureControls';
import type { FeatureControl } from '../types';

interface FeatureControlContextType {
  controls: FeatureControl[];
  /** Runtime control check for the CURRENT user's active role. Default-open. */
  isEnabled: (path: string) => boolean;
  refresh: () => Promise<void>;
}

const FeatureControlContext = createContext<FeatureControlContextType | undefined>(undefined);

export function useFeatureControls() {
  const ctx = useContext(FeatureControlContext);
  if (ctx === undefined) throw new Error('useFeatureControls must be used within a FeatureControlProvider');
  return ctx;
}

export function FeatureControlProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [controls, setControls] = useState<FeatureControl[]>([]);

  const refresh = useCallback(async () => {
    // Any failure (table not yet migrated, network) falls back to default-open:
    // availability of the control plane must never brick the app.
    if (!supabase) { setControls([]); return; }
    try {
      const { data, error } = await supabase.from('feature_controls').select('*');
      if (error) {
        console.error('[feature-controls] load failed — defaulting open', error);
        setControls([]);
        return;
      }
      setControls((data as FeatureControl[]) ?? []);
    } catch (err) {
      console.error('[feature-controls] load failed — defaulting open', err);
      setControls([]);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void refresh();
    else setControls([]);
  }, [isAuthenticated, refresh]);

  const value = useMemo<FeatureControlContextType>(() => ({
    controls,
    isEnabled: (path: string) =>
      user ? featureEnabled(path, user.activeRole, controls) : true,
    refresh,
  }), [controls, user, refresh]);

  return (
    <FeatureControlContext.Provider value={value}>
      {children}
    </FeatureControlContext.Provider>
  );
}

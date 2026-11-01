/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import { featureAccessible, featureEnabled } from '../lib/access/featureControls';
import type { FeatureControl } from '../types';

interface FeatureControlContextType {
  controls: FeatureControl[];
  /** Feature paths MasterAdmin granted to the current user beyond their role. */
  grants: string[];
  /** Runtime control check for the CURRENT user's active role. Default-open. */
  isEnabled: (path: string) => boolean;
  /** Full access check: role (ACCESS_MAP) or personal grant, then controls. */
  canAccess: (path: string) => boolean;
  /** The controls read failed, so every kill switch is off (fail-open). Shown as a banner (SEC-13). */
  controlsDegraded: boolean;
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
  const [controlsDegraded, setControlsDegraded] = useState(false);
  const [grants, setGrants] = useState<string[]>([]);
  const userId = user?.id;

  const refresh = useCallback(async () => {
    // Any failure (table not yet migrated, network) falls back to default-open:
    // availability of the control plane must never brick the app.
    if (!supabase) { setControls([]); return; }
    try {
      const { data, error } = await supabase.from('feature_controls').select('*');
      if (error) {
        console.error('[feature-controls] load failed — defaulting open', error);
        setControls([]);
        setControlsDegraded(true);
        return;
      }
      setControls((data as FeatureControl[]) ?? []);
      setControlsDegraded(false);
    } catch (err) {
      console.error('[feature-controls] load failed — defaulting open', err);
      setControls([]);
      setControlsDegraded(true);
    }
  }, []);

  // Grants fail closed: no rows (or no table yet) means role access only.
  const refreshGrants = useCallback(async () => {
    if (!supabase || !userId) { setGrants([]); return; }
    const { data, error } = await supabase
      .from('feature_grants').select('feature_key').eq('user_id', userId);
    if (error) console.error('[feature-grants] load failed — role access only', error);
    setGrants(error ? [] : (data ?? []).map((g: { feature_key: string }) => g.feature_key));
  }, [userId]);

  useEffect(() => {
    if (isAuthenticated) void refresh();
    else setControls([]);
  }, [isAuthenticated, refresh]);

  useEffect(() => {
    if (isAuthenticated) void refreshGrants();
    else setGrants([]);
  }, [isAuthenticated, refreshGrants]);

  const value = useMemo<FeatureControlContextType>(() => {
    const grantSet = new Set(grants);
    return {
      controls,
      grants,
      isEnabled: (path: string) =>
        user ? featureEnabled(path, user.activeRole, controls) : true,
      canAccess: (path: string) =>
        user ? featureAccessible(path, user.activeRole, controls, grantSet) : false,
      refresh: async () => { await Promise.all([refresh(), refreshGrants()]); },
      controlsDegraded,
    };
  }, [controls, grants, user, refresh, refreshGrants, controlsDegraded]);

  return (
    <FeatureControlContext.Provider value={value}>
      {children}
    </FeatureControlContext.Provider>
  );
}

/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../utils/supabaseClient';
import { mapRuleRow } from '../lib/rules/csirRules';
import type { CsirRule } from '../types';

export interface NewRuleValue {
  key: string;
  value: unknown;
  unit: string;
  effectiveFrom: string;
  sourceRef: string;
  verified: boolean;
}

interface RulesContextType {
  /** Every dated CSIR rule row (empty for an unverified user, or before load). */
  rules: CsirRule[];
  refresh: () => Promise<void>;
  /** MasterAdmin: a new value from a date on (csir_rule_set). */
  setRule: (r: NewRuleValue) => Promise<void>;
}

const RulesContext = createContext<RulesContextType | undefined>(undefined);

export function useRules() {
  const ctx = useContext(RulesContext);
  if (ctx === undefined) throw new Error('useRules must be used within a RulesProvider');
  return ctx;
}

export function RulesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [rules, setRules] = useState<CsirRule[]>([]);

  const refresh = useCallback(async () => {
    if (!supabase || !isAuthenticated) { setRules([]); return; }
    try {
      const { data, error } = await supabase.from('csir_rules').select('*').order('rule_key').order('effective_from');
      if (error) throw error;
      setRules((data ?? []).map(mapRuleRow));
    } catch (err) {
      console.error('[csir-rules] load failed', err);
      setRules([]);
    }
  }, [isAuthenticated]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setRule = useCallback(async (r: NewRuleValue) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.rpc('csir_rule_set', {
      p_key: r.key, p_value: r.value, p_unit: r.unit, p_effective_from: r.effectiveFrom,
      p_source_ref: r.sourceRef, p_verified: r.verified,
    });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const value = useMemo(() => ({ rules, refresh, setRule }), [rules, refresh, setRule]);
  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>;
}

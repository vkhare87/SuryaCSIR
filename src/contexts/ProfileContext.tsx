/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { supabase } from '../utils/supabaseClient';
import { mapFactRow, mapIssueRow, mapTimelineRow, type OwnProfileField } from '../lib/staff/profile';
import type { ProfileFact, ProfileIssue, TimelineEntry } from '../types';

interface ProfileContextType {
  /** Everything SURYA holds on one person (staff_profile_facts). RLS-scoped: no rows if the caller may not see them. */
  loadFacts: (staffId: string, from?: string, to?: string) => Promise<ProfileFact[]>;
  /** Where the profile and the records disagree. */
  loadIssues: (staffId: string) => Promise<ProfileIssue[]>;
  /** entity_timeline for one entity, newest first. */
  loadTimeline: (entityType: string, entityId: string) => Promise<TimelineEntry[]>;
  /** The caller's own research fields (update_own_profile). */
  updateOwnProfile: (fields: Partial<Record<OwnProfileField, string>>) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (ctx === undefined) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}

// ponytail: no cache — each profile page loads its own person on demand.
export function ProfileProvider({ children }: { children: ReactNode }) {
  const loadFacts = useCallback(async (staffId: string, from?: string, to?: string) => {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('staff_profile_facts', { p_staff_id: staffId, p_from: from ?? null, p_to: to ?? null });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map(mapFactRow);
  }, []);

  const loadIssues = useCallback(async (staffId: string) => {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('profile_consistency_issues', { p_staff_id: staffId });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map(mapIssueRow);
  }, []);

  const loadTimeline = useCallback(async (entityType: string, entityId: string) => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('entity_timeline').select('at, kind, summary, source')
      .eq('entity_type', entityType).eq('entity_id', entityId).order('at', { ascending: false }).limit(200);
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map(mapTimelineRow);
  }, []);

  const updateOwnProfile = useCallback(async (fields: Partial<Record<OwnProfileField, string>>) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.rpc('update_own_profile', { p_fields: fields });
    if (error) throw error;
  }, []);

  const value = useMemo(() => ({ loadFacts, loadIssues, loadTimeline, updateOwnProfile }),
    [loadFacts, loadIssues, loadTimeline, updateOwnProfile]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

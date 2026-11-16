import { supabase } from '../../utils/supabaseClient';
import { fetchAll } from '../data/fetchAll';
import type { MilestoneStatus } from '../../types/projectFile';

export interface HomeMilestone {
  id: string;
  projectId: string;
  title: string;
  targetDate: string;
  status: MilestoneStatus;
}

/** The staff row linked to the signed-in account, or null. */
export async function callerStaffId(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('caller_staff_id');
  if (error) { console.error('[home] caller_staff_id failed', error); return null; }
  return (data as string | null) ?? null;
}

/** Milestones of the given projects, in target-date order. RLS decides what comes back. */
export async function milestonesFor(projectIds: string[]): Promise<HomeMilestone[]> {
  if (!supabase || projectIds.length === 0) return [];
  // Paged: the Director's institute-wide read can pass the 1000-row cap, and a
  // capped read would silently drop late milestones from the warnings.
  const { data, error } = await fetchAll<Record<string, unknown>>(supabase
    .from('project_milestones')
    .select('id, project_id, title, target_date, status')
    .in('project_id', projectIds)
    .order('target_date')
    .order('id'));
  if (error) { console.error('[home] milestones load failed', error); return []; }
  return data.map(r => ({
    id: r.id as string,
    projectId: r.project_id as string,
    title: r.title as string,
    targetDate: r.target_date as string,
    status: r.status as MilestoneStatus,
  }));
}

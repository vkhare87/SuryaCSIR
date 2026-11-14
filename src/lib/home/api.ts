import { supabase } from '../../utils/supabaseClient';
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
  const { data, error } = await supabase
    .from('project_milestones')
    .select('id, project_id, title, target_date, status')
    .in('project_id', projectIds)
    .order('target_date');
  if (error) { console.error('[home] milestones load failed', error); return []; }
  return (data ?? []).map(r => ({
    id: r.id as string,
    projectId: r.project_id as string,
    title: r.title as string,
    targetDate: r.target_date as string,
    status: r.status as MilestoneStatus,
  }));
}

import { supabase } from '../../utils/supabaseClient';
import type { PhDMilestoneName } from '../../types';

export interface MilestoneInput {
  enrollmentNo: string;
  milestone: PhDMilestoneName;
  dueDate?: string;
  completedDate?: string;
  remarks?: string;
}

/** Insert-or-update on (enrollment_no, milestone). */
export async function upsertMilestone(input: MilestoneInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.from('phd_milestones').upsert({
    enrollment_no: input.enrollmentNo, milestone: input.milestone,
    due_date: input.dueDate || null, completed_date: input.completedDate || null,
    remarks: input.remarks || null,
  }, { onConflict: 'enrollment_no,milestone' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

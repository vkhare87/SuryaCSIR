import { supabase } from '../../utils/supabaseClient';
import type { VacancyAdvertisement } from '../../types';

export type DriveStage = VacancyAdvertisement['driveStage'];

export const DRIVE_STAGES: DriveStage[] = [
  'Advertised', 'Applications Closed', 'Screening', 'Interviews',
  'Selection', 'Offers Issued', 'Joined', 'Closed',
];

export function drivesByStage(ads: VacancyAdvertisement[]) {
  return DRIVE_STAGES.map(stage => ({
    stage,
    permanent: ads.filter(a => a.driveStage === stage && a.staffCategory === 'Permanent').length,
    project: ads.filter(a => a.driveStage === stage && a.staffCategory === 'Project').length,
  }));
}

export async function setDriveStage(id: string, stage: DriveStage): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.from('vacancy_advertisements').update({ drive_stage: stage }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

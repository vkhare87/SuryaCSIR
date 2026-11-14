import { supabase } from '../../utils/supabaseClient';
import type { VacancyAdvertisement } from '../../types';
import { friendlyError } from '../errors';

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

/** Stages a drive may move to from `current`: itself, the next one, or Closed (recruitment_advance, 20261113000004). */
export function allowedStages(current: DriveStage): DriveStage[] {
  const i = DRIVE_STAGES.indexOf(current);
  return DRIVE_STAGES.filter((s, j) => j === i || j === i + 1 || (s === 'Closed' && current !== 'Closed'));
}

/** Moves a drive one stage on, or to Closed. The server refuses any other move and logs each one. */
export async function setDriveStage(id: string, stage: DriveStage): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.rpc('recruitment_advance', { p_advt_id: id, p_stage: stage });
  return error ? { ok: false, error: friendlyError(error) } : { ok: true };
}

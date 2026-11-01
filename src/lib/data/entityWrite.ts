import { supabase } from '../../utils/supabaseClient';
import { TABLE_NAMES } from '../../utils/dataMigration';
import type { FileType } from '../../utils/fileTypes';
import { friendlyError } from '../errors';

export type WriteResult = { ok: true } | { ok: false; error: string };

export const PK_FIELD: Record<FileType, string> = {
  divisions:    'divCode',
  staff:        'ID',
  projects:     'ProjectID',
  projectStaff: 'id',
  phd:          'EnrollmentNo',
  equipment:    'UInsID',
  contractStaff: 'id',
};

export async function updateEntityRecord(
  type: FileType, pkValue: unknown, patch: Record<string, unknown>,
): Promise<WriteResult> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const pk = PK_FIELD[type];
  // RLS drops a disallowed UPDATE to 0 rows with no error, so ask for the rows back.
  const { data, error } = await supabase.from(TABLE_NAMES[type]).update(patch).eq(pk, pkValue).select(pk);
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data || data.length === 0) {
    return { ok: false, error: 'No record was updated — you may not have edit rights on this record, or it no longer exists.' };
  }
  return { ok: true };
}

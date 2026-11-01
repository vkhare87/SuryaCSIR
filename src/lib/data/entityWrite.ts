import { supabase } from '../../utils/supabaseClient';
import { TABLE_NAMES } from '../../utils/dataMigration';
import type { FileType } from '../../utils/fileTypes';

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
  const { error } = await supabase.from(TABLE_NAMES[type]).update(patch).eq(PK_FIELD[type], pkValue);
  return error ? { ok: false, error: error.message } : { ok: true };
}

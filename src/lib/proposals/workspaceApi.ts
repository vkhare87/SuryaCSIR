import { supabase } from '../../utils/supabaseClient';
import { mapNoteRow, mapVersionRow, noteTargetColumn } from '../../utils/proposalMappers';
import type { NoteTarget, ProposalNote, ProposalVersion } from '../../types/proposal';

function client() {
  if (!supabase) throw new Error('Database not provisioned');
  return supabase;
}

// --- Notes: the PI's private scratch (RLS: author only) ---

export async function listNotes(proposalId: string): Promise<ProposalNote[]> {
  const { data, error } = await client()
    .from('proposal_notes').select('*').eq('proposal_id', proposalId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapNoteRow);
}

export async function addNote(proposalId: string, body: string): Promise<ProposalNote> {
  const { data, error } = await client()
    .from('proposal_notes').insert({ proposal_id: proposalId, body }).select().single();
  if (error) throw error;
  return mapNoteRow(data);
}

/** Record that a note's text now lives in a proposal field. The note is kept. */
export async function markNoteUsed(noteId: string, target: NoteTarget): Promise<ProposalNote> {
  const { data, error } = await client()
    .from('proposal_notes')
    .update({ used_in: noteTargetColumn(target), used_at: new Date().toISOString() })
    .eq('id', noteId).select().single();
  if (error) throw error;
  return mapNoteRow(data);
}

export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await client().from('proposal_notes').delete().eq('id', noteId);
  if (error) throw error;
}

// --- Versions: written only by the RPCs ---

export async function listVersions(proposalId: string): Promise<ProposalVersion[]> {
  const { data, error } = await client()
    .from('proposal_versions').select('*').eq('proposal_id', proposalId)
    .order('version_no', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapVersionRow);
}

export async function saveVersion(proposalId: string, label: string): Promise<void> {
  const { error } = await client().rpc('proposal_save_version', { p_id: proposalId, p_label: label });
  if (error) throw error;
}

export async function restoreVersion(versionId: string): Promise<void> {
  const { error } = await client().rpc('proposal_restore_version', { p_version_id: versionId });
  if (error) throw error;
}

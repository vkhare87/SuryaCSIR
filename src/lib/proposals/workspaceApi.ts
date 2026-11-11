import { supabase } from '../../utils/supabaseClient';
import {
  mapBudgetLineRow, mapNoteRow, mapReviewCommentRow, mapVersionRow, noteTargetColumn,
} from '../../utils/proposalMappers';
import type {
  NoteTarget, ProposalBudgetLine, ProposalNote, ProposalSection, ProposalVersion, ReviewComment,
} from '../../types/proposal';

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

// --- Budget lines: written directly by the author while drafting (RLS) ---

export async function addBudgetLine(proposalId: string, line: Omit<ProposalBudgetLine, 'id'>): Promise<ProposalBudgetLine> {
  const { data, error } = await client()
    .from('proposal_budget_lines')
    .insert({ proposal_id: proposalId, fiscal_year: line.fiscalYear, head: line.head, item: line.item, amount: line.amount })
    .select().single();
  if (error) throw error;
  return mapBudgetLineRow(data);
}

export async function updateBudgetLine(id: string, line: Partial<Omit<ProposalBudgetLine, 'id'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (line.fiscalYear !== undefined) row.fiscal_year = line.fiscalYear;
  if (line.head !== undefined) row.head = line.head;
  if (line.item !== undefined) row.item = line.item;
  if (line.amount !== undefined) row.amount = line.amount;
  const { error } = await client().from('proposal_budget_lines').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteBudgetLine(id: string): Promise<void> {
  const { error } = await client().from('proposal_budget_lines').delete().eq('id', id);
  if (error) throw error;
}

// --- Review comments ---

export async function addComment(proposalId: string, section: ProposalSection, body: string): Promise<ReviewComment> {
  const { data, error } = await client()
    .from('proposal_review_comments').insert({ proposal_id: proposalId, section, body }).select().single();
  if (error) throw error;
  return mapReviewCommentRow(data);
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await client().from('proposal_review_comments').delete().eq('id', id);
  if (error) throw error;
}

/** The PI ticks a comment done, or un-ticks it. */
export async function setCommentResolved(id: string, resolved: boolean): Promise<void> {
  const { error } = await client()
    .from('proposal_review_comments')
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

/** The scheme leader of a track (ULIP: Head RPBD), or null when none is set. */
export async function getSchemeLeader(track: string): Promise<string | null> {
  const { data, error } = await client().from('project_schemes').select('leader_user_id').eq('code', track).maybeSingle();
  if (error) throw error;
  return data?.leader_user_id ?? null;
}

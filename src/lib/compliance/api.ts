import { supabase } from '../../utils/supabaseClient';
import type { CoiDeclaration, EquipmentUsage } from '../../types';

// Committee declarations (20261112000013) and the instrument logbook
// (20261112000017). Writes go through RPCs; reads are RLS-scoped.

function client() {
  if (!supabase) throw new Error('Database not provisioned');
  return supabase;
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as T;
}

/** Declarations the caller may read for a meeting: their own, or all if chair / convener. */
export async function loadDeclarations(meetingId: string): Promise<CoiDeclaration[]> {
  const { data, error } = await client().from('coi_declarations')
    .select('id, meeting_id, member_user_id, format, conflict_note, chair_decision, declared_at')
    .eq('meeting_id', meetingId).order('declared_at');
  if (error) throw error;
  return (data ?? []).map((x: any) => ({
    id: x.id, meetingId: x.meeting_id, memberUserId: x.member_user_id, format: x.format,
    conflictNote: x.conflict_note, chairDecision: x.chair_decision, declaredAt: x.declared_at,
  }));
}

export function declare(meetingId: string, format: 'F1' | 'F2', note: string | null) {
  return rpc('coi_declare', { p_meeting_id: meetingId, p_format: format, p_note: note });
}

export function chairDecide(declarationId: string, decision: 'CONTINUE' | 'RECUSE') {
  return rpc('coi_chair_decide', { p_id: declarationId, p_decision: decision });
}

export async function loadUsage(equipmentId: string): Promise<EquipmentUsage[]> {
  const { data, error } = await client().from('equipment_usage_log')
    .select('id, used_on, hours, user_staff_id, purpose, logged_at')
    .eq('equipment_id', equipmentId).order('used_on', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map((x: any) => ({
    id: x.id, usedOn: x.used_on, hours: Number(x.hours), userStaffId: x.user_staff_id, purpose: x.purpose, loggedAt: x.logged_at,
  }));
}

export function logbookRequired(equipmentId: string) {
  return rpc<boolean>('equipment_logbook_required', { p_equipment_id: equipmentId });
}

export function logUsage(equipmentId: string, usedOn: string, hours: number, userStaffId: string | null, purpose: string) {
  return rpc('equipment_log_usage', {
    p_equipment_id: equipmentId, p_used_on: usedOn, p_hours: hours, p_user_staff_id: userStaffId, p_purpose: purpose,
  });
}

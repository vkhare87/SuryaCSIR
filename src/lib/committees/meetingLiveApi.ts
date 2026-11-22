import { supabase } from '../../utils/supabaseClient';

export interface AgendaCirculationRow {
  id: string;
  meeting_id: string;
  version: number;
  circulated_at: string;
  notes: string;
}

export interface AgendaReceiptRow {
  circulation_id: string;
  member_user_id: string;
  opened_at: string | null;
  replied_at: string | null;
  reply_note: string | null;
}

export interface AttendanceRow {
  meeting_id: string;
  person_key: string;
  staff_id: string | null;
  external_member_id: string | null;
  seat: string;
  status: 'PRESENT' | 'ONLINE' | 'ABSENT' | 'LEAVE_GRANTED';
}

export interface QuorumStatus {
  present_count: number;
  required_min: number;
  chair_present: boolean;
  chair_required: boolean;
  quorum_met: boolean;
}

function requireSb() {
  if (!supabase) throw new Error('Supabase client is not configured');
  return supabase;
}

export async function fetchMeetingLiveState(meetingId: string): Promise<{
  circulations: AgendaCirculationRow[];
  receipts: AgendaReceiptRow[];
  attendance: AttendanceRow[];
  quorum: QuorumStatus | null;
}> {
  const sb = requireSb();
  const [circRes, attRes, qRes] = await Promise.all([
    sb.from('agenda_circulations').select('*').eq('meeting_id', meetingId).order('version', { ascending: false }),
    sb.from('meeting_attendance').select('*').eq('meeting_id', meetingId),
    sb.rpc('meeting_quorum_status', { p_meeting_id: meetingId }),
  ]);
  const circulations = (circRes.data ?? []) as AgendaCirculationRow[];
  let receipts: AgendaReceiptRow[] = [];
  if (circulations.length > 0) {
    const { data: recData } = await sb
      .from('agenda_receipts')
      .select('*')
      .eq('circulation_id', circulations[0].id);
    receipts = (recData ?? []) as AgendaReceiptRow[];
  }
  const qRow = Array.isArray(qRes.data) ? qRes.data[0] : qRes.data;
  return {
    circulations,
    receipts,
    attendance: (attRes.data ?? []) as AttendanceRow[],
    quorum: (qRow as QuorumStatus) ?? null,
  };
}

export async function circulateAgenda(meetingId: string, notes = ''): Promise<number> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('agenda_circulate', { p_meeting_id: meetingId, p_notes: notes });
  if (error) throw error;
  return Number(data ?? 1);
}

export async function ackAgendaReceipt(circulationId: string, replyNote?: string): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('agenda_receipt_ack', {
    p_circulation_id: circulationId,
    p_reply_note: replyNote ?? null,
  });
  if (error) throw error;
}

export async function setMeetingAttendance(params: {
  meetingId: string;
  personKey: string;
  status: AttendanceRow['status'];
  staffId?: string | null;
  seat?: string;
}): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('meeting_attendance_set', {
    p_meeting_id: params.meetingId,
    p_person_key: params.personKey,
    p_status: params.status,
    p_staff_id: params.staffId ?? null,
    p_external_member_id: null,
    p_seat: params.seat ?? 'MEMBER',
  });
  if (error) throw error;
}

export async function markMeetingHeld(meetingId: string): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('meeting_mark_held', { p_meeting_id: meetingId });
  if (error) throw error;
}

export async function adjournMeeting(meetingId: string, nextDate: string): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('meeting_adjourn', {
    p_meeting_id: meetingId,
    p_next_date: nextDate,
  });
  if (error) throw error;
  return String(data);
}

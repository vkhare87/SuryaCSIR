import { supabase } from '../../utils/supabaseClient';

export interface InstrumentBookingRow {
  id: string;
  equipment_id: string;
  project_id: string | null;
  starts_at: string;
  ends_at: string;
  purpose: string;
  status: string;
}

export interface ProjectLeaveRow {
  id: string;
  leave_type: string;
  from_on: string;
  to_on: string;
  days_count: number;
  reason: string;
  status: string;
}

export interface OfficialLetterRow {
  id: string;
  letter_no: string;
  template_kind: string;
  recipient_name: string;
  subject: string;
  status: string;
  verification_code: string | null;
}

export interface DakLetterRow {
  id: string;
  dak_no: string;
  direction: 'INWARD' | 'OUTWARD';
  from_or_to: string;
  subject: string;
  received_or_sent_on: string;
  is_hq: boolean;
  division_code: string | null;
  status: string;
}

export interface FormShelfItem {
  key: string;
  title: string;
  category: string;
  description: string;
  link: string;
}

export interface SafetyIncidentRow {
  id: string;
  division_code: string | null;
  location: string;
  severity: string;
  description: string;
  status: string;
  reported_at: string;
}

export interface DivisionReportRow {
  id: string;
  division_code: string;
  kind: string;
  period_from: string;
  period_to: string;
  body_markdown: string;
  status: 'DRAFT' | 'SENT';
}

export interface DirectorWatchRow {
  id: string;
  tag: 'PEOPLE' | 'PROJECT' | 'COMMITTEE' | 'UPWARD' | 'DECISION';
  subject_type: string;
  subject_id: string;
  title: string;
  note: string;
}

function requireSb() {
  if (!supabase) throw new Error('Supabase client is not configured');
  return supabase;
}

export async function fetchOperationsDeskData() {
  const sb = requireSb();
  const [bkRes, lvRes, ltRes, dkRes, fmRes, sfRes] = await Promise.all([
    sb.from('instrument_bookings').select('*').order('starts_at', { ascending: false }).limit(25),
    sb.from('project_leave_requests').select('*').order('created_at', { ascending: false }).limit(25),
    sb.from('official_letters').select('*').order('created_at', { ascending: false }).limit(25),
    sb.from('dak_letters').select('*').order('received_or_sent_on', { ascending: false }).limit(25),
    sb.from('forms_shelf').select('*').eq('active', true).order('category'),
    sb.from('safety_incidents').select('*').order('reported_at', { ascending: false }).limit(25),
  ]);
  return {
    bookings: (bkRes.data ?? []) as InstrumentBookingRow[],
    leaves: (lvRes.data ?? []) as ProjectLeaveRow[],
    letters: (ltRes.data ?? []) as OfficialLetterRow[],
    dak: (dkRes.data ?? []) as DakLetterRow[],
    forms: (fmRes.data ?? []) as FormShelfItem[],
    safety: (sfRes.data ?? []) as SafetyIncidentRow[],
  };
}

export async function bookInstrument(params: {
  equipmentId: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
  projectId?: string | null;
}): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('instrument_book', {
    p_equipment_id: params.equipmentId,
    p_starts_at: params.startsAt,
    p_ends_at: params.endsAt,
    p_purpose: params.purpose,
    p_project_id: params.projectId ?? null,
  });
  if (error) throw error;
  return String(data);
}

export async function decideInstrumentBooking(bookingId: string, status: 'APPROVED' | 'REJECTED', notes = ''): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('instrument_booking_decide', {
    p_booking_id: bookingId,
    p_status: status,
    p_notes: notes,
  });
  if (error) throw error;
}

export async function applyProjectLeave(leaveType: string, fromOn: string, toOn: string, reason: string): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('project_leave_apply', {
    p_leave_type: leaveType,
    p_from_on: fromOn,
    p_to_on: toOn,
    p_reason: reason,
  });
  if (error) throw error;
  return String(data);
}

export async function decideProjectLeave(leaveId: string, status: 'APPROVED' | 'REJECTED'): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('project_leave_decide', { p_leave_id: leaveId, p_status: status });
  if (error) throw error;
}

export async function requestOfficialLetter(templateKind: string, subject: string, bodyMarkdown = ''): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('letter_request', {
    p_template_kind: templateKind,
    p_subject: subject,
    p_body_markdown: bodyMarkdown,
  });
  if (error) throw error;
  return String(data);
}

export async function issueOfficialLetter(letterId: string): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('letter_issue', { p_letter_id: letterId, p_body_markdown: null });
  if (error) throw error;
  return String(data);
}

export async function logDakLetter(params: {
  dakNo: string;
  direction: 'INWARD' | 'OUTWARD';
  fromOrTo: string;
  subject: string;
  isHq?: boolean;
  divisionCode?: string | null;
}): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('dak_letter_log', {
    p_dak_no: params.dakNo,
    p_direction: params.direction,
    p_from_or_to: params.fromOrTo,
    p_subject: params.subject,
    p_is_hq: params.isHq ?? false,
    p_division_code: params.divisionCode ?? null,
    p_assigned_to: null,
  });
  if (error) throw error;
  return String(data);
}

export async function reportSafetyIncident(
  location: string,
  severity: 'NEAR_MISS' | 'MINOR' | 'MAJOR',
  description: string,
  divisionCode?: string | null,
): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('safety_incident_report', {
    p_location: location,
    p_severity: severity,
    p_description: description,
    p_division_code: divisionCode ?? null,
  });
  if (error) throw error;
  return String(data);
}

export async function fetchDivisionReports(divisionCode: string): Promise<DivisionReportRow[]> {
  const sb = requireSb();
  const { data } = await sb
    .from('division_reports')
    .select('*')
    .eq('division_code', divisionCode)
    .order('created_at', { ascending: false })
    .limit(5);
  return (data ?? []) as DivisionReportRow[];
}

export async function assembleDivisionReport(divisionCode: string, kind: 'MONTHLY' | 'QUARTERLY' | 'RC_DECK', fromOn: string, toOn: string): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('division_report_assemble', {
    p_division_code: divisionCode,
    p_kind: kind,
    p_period_from: fromOn,
    p_period_to: toOn,
    p_due_on: null,
  });
  if (error) throw error;
  return String(data);
}

export async function sendDivisionReport(reportId: string): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('division_report_send', { p_report_id: reportId });
  if (error) throw error;
}

export async function fetchDirectorWatch(): Promise<DirectorWatchRow[]> {
  const sb = requireSb();
  const { data } = await sb
    .from('director_watch_items')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(10);
  return (data ?? []) as DirectorWatchRow[];
}

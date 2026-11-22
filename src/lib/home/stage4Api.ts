import { supabase } from '../../utils/supabaseClient';

export interface DelegationRuleRow {
  decision_kind: string;
  label: string;
  mode: 'SELF' | 'HEAD_TELL' | 'HEAD_FLAGS';
  max_amount_inr: number | null;
  non_delegable_floor: boolean;
  order_no: string | null;
  effective_from: string;
}

export interface DirectorFlagRow {
  id: string;
  subject_type: string;
  subject_id: string;
  flag_kind: 'HOLD' | 'AUDIT_SAMPLE' | 'CALLBACK';
  note: string;
  resolved_at: string | null;
  created_at: string;
}

export interface SignatureVerification {
  verification_code: string;
  subject_type: string;
  subject_id: string;
  signer_name: string;
  level: string;
  payload_hash: string;
  chain_hash: string;
  signed_at: string;
  valid: boolean;
}

export interface MinutesVersionRow {
  id: string;
  meeting_id: string;
  version_no: number;
  body_markdown: string;
  status: 'DRAFT' | 'CIRCULATED' | 'APPROVED' | 'SIGNED' | 'ISSUED' | 'CONFIRMED';
  pdf_hash: string | null;
  verification_code: string | null;
  signed_at: string | null;
  created_at: string;
}

function requireSb() {
  if (!supabase) throw new Error('Supabase client is not configured');
  return supabase;
}

export async function fetchDelegationState(): Promise<{
  rules: DelegationRuleRow[];
  flags: DirectorFlagRow[];
}> {
  const sb = requireSb();
  const [rRes, fRes] = await Promise.all([
    sb.from('delegation_rules').select('*').order('non_delegable_floor', { ascending: false }).order('decision_kind'),
    sb.from('director_flags').select('*').is('resolved_at', null).order('created_at', { ascending: false }).limit(20),
  ]);
  return {
    rules: (rRes.data ?? []) as DelegationRuleRow[],
    flags: (fRes.data ?? []) as DirectorFlagRow[],
  };
}

export async function setDelegationRule(
  kind: string,
  mode: DelegationRuleRow['mode'],
  maxAmountInr: number | null,
  orderNo: string,
): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('delegation_rule_set', {
    p_kind: kind,
    p_mode: mode,
    p_max_amount_inr: maxAmountInr,
    p_order_no: orderNo,
  });
  if (error) throw error;
}

export async function resolveDirectorFlag(flagId: string): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('director_flag_resolve', { p_flag_id: flagId });
  if (error) throw error;
}

export async function verifySignatureCode(code: string): Promise<SignatureVerification | null> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('signature_verify', { p_code: code });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as SignatureVerification) ?? null;
}

export async function attestSignature(
  subjectType: string,
  subjectId: string,
  payloadHash: string,
  level: 'ATTEST' | 'SCAN' | 'DSC' | 'ESIGN' = 'ATTEST',
): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('signature_attest', {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_payload_hash: payloadHash,
    p_level: level,
  });
  if (error) throw error;
  return String(data);
}

export async function fetchMinutesVersions(meetingId: string): Promise<MinutesVersionRow[]> {
  const sb = requireSb();
  const { data } = await sb
    .from('minutes_versions')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('version_no', { ascending: false });
  return (data ?? []) as MinutesVersionRow[];
}

export async function createMinutesDraft(meetingId: string, bodyMarkdown?: string): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('minutes_draft_create', {
    p_meeting_id: meetingId,
    p_body_markdown: bodyMarkdown ?? null,
  });
  if (error) throw error;
  return String(data);
}

export async function approveMinutesVersion(versionId: string): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('minutes_approve', { p_version_id: versionId });
  if (error) throw error;
}

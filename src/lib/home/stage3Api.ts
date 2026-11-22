import { supabase } from '../../utils/supabaseClient';

export interface WorkPriority {
  id: string;
  assignee_user_id: string;
  asked_by: string;
  title: string;
  reason: string;
  wanted_by: string;
  link: string;
  subject_type: string | null;
  subject_id: string | null;
  status: 'OPEN' | 'DONE' | 'WITHDRAWN';
  seen_at: string | null;
  pushback_reason: string | null;
  pushback_date: string | null;
  pushback_at: string | null;
  pushback_answer: 'ACCEPTED' | 'KEPT' | null;
  done_at: string | null;
  created_at: string;
}

export interface DecisionRow {
  kind: string;
  subject_type: string;
  subject_id: string;
  title: string;
  requester_user_id: string | null;
  waiting_since: string;
  quick: boolean;
  link: string;
  days_waiting: number;
  open_question: boolean;
}

export interface NoticeItem {
  id: string;
  notice_no: string;
  kind: 'OFFICE_ORDER' | 'CIRCULAR' | 'NOTICE' | 'EVENT';
  title: string;
  body: string;
  issued_by: string;
  issued_on: string;
  audience: Record<string, unknown>;
  must_ack: boolean;
  ack_by: string | null;
  valid_to: string | null;
  supersedes: string | null;
  superseded_by: string | null;
  read_at: string | null;
  acked_at: string | null;
}

export interface AnswerTimeStat {
  median_days: number;
  decision_count: number;
}

export interface OnTimeRecord {
  on_time_count: number;
  total_count: number;
}

function requireSb() {
  if (!supabase) throw new Error('Supabase client is not configured');
  return supabase;
}

export async function priorityPin(params: {
  assigneeUserId: string;
  title: string;
  reason: string;
  wantedBy: string;
  link?: string;
  subjectType?: string | null;
  subjectId?: string | null;
}): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('priority_pin', {
    p_assignee: params.assigneeUserId,
    p_title: params.title,
    p_reason: params.reason,
    p_wanted_by: params.wantedBy,
    p_link: params.link ?? '/',
    p_subject_type: params.subjectType ?? null,
    p_subject_id: params.subjectId ?? null,
  });
  if (error) throw error;
  return String(data);
}

export async function prioritySeen(id: string): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('priority_seen', { p_id: id });
  if (error) throw error;
}

export async function priorityPushBack(id: string, reason: string, newDate: string): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('priority_push_back', {
    p_id: id,
    p_reason: reason,
    p_new_date: newDate,
  });
  if (error) throw error;
}

export async function priorityAnswer(id: string, accept: boolean, shownDate: string | null): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('priority_answer', { p_id: id, p_accept: accept, p_expected_date: shownDate });
  if (error) throw error;
}

export async function priorityDone(id: string): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('priority_done', { p_id: id });
  if (error) throw error;
}

export async function priorityWithdraw(id: string): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('priority_withdraw', { p_id: id });
  if (error) throw error;
}

export async function decisionAsk(
  subjectType: string,
  subjectId: string,
  askedTo: string,
  question: string,
): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('decision_ask', {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_asked_to: askedTo,
    p_question: question,
  });
  if (error) throw error;
  return String(data);
}

export async function homeSnoozeTomorrow(itemKey: string, dueDate?: string | null): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('home_snooze_tomorrow', {
    p_item_key: itemKey,
    p_due_date: dueDate ?? null,
  });
  if (error) throw error;
  return String(data);
}

export async function noticeIssue(params: {
  noticeNo: string;
  kind: 'OFFICE_ORDER' | 'CIRCULAR' | 'NOTICE' | 'EVENT';
  title: string;
  body: string;
  audience?: Record<string, unknown>;
  mustAck?: boolean;
  ackBy?: string | null;
}): Promise<string> {
  const sb = requireSb();
  const { data, error } = await sb.rpc('notice_issue', {
    p_notice_no: params.noticeNo,
    p_kind: params.kind,
    p_title: params.title,
    p_body: params.body,
    p_audience: params.audience ?? { scope: 'ALL' },
    p_must_ack: params.mustAck ?? false,
    p_ack_by: params.ackBy ?? null,
  });
  if (error) throw error;
  return String(data);
}

export async function noticeMarkRead(noticeId: string, ack = false): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.rpc('notice_mark_read', {
    p_notice_id: noticeId,
    p_ack: ack,
  });
  if (error) throw error;
}

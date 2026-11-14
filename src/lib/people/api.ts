import { supabase } from '../../utils/supabaseClient';

// Enterprise P5 (20261113000001–04): post register, workload, outlook,
// career events, project staff engagement, acting charge. Writes are RPCs;
// reads are RLS-scoped.

function client() {
  if (!supabase) throw new Error('Database not provisioned');
  return supabase;
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as T;
}

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

// --- Post register ---
export type PostState = 'FILLED' | 'VACANT' | 'ADVERTISED' | 'ABEYANCE' | 'ABOLISHED';
export interface SanctionedPost {
  id: string; post_code: string; staff_group: string; level: string | null; designation: string;
  discipline: string | null; division_code: string | null; category: string | null; state: PostState;
  holder_staff_id: string | null; vacant_since: string | null; sanction_ref: string | null;
}
export interface DivisionStrength { division_code: string; sanctioned: number; filled: number; vacant: number; advertised: number; oldest_vacancy: string | null }

export const loadPosts = () => rows<SanctionedPost>(client().from('sanctioned_posts').select('*').order('division_code').order('post_code'));
export const loadDivisionStrength = () => rows<DivisionStrength>(client().from('division_strength').select('*').order('division_code'));
export const createPost = (p: { code: string; group: string; level: string; designation: string; discipline: string; division: string; category: string; sanctionRef: string }) =>
  rpc<string>('post_create', {
    p_post_code: p.code, p_group: p.group, p_level: p.level, p_designation: p.designation, p_discipline: p.discipline,
    p_division: p.division, p_category: p.category, p_sanction_ref: p.sanctionRef,
  });
export const fillPost = (id: string, staffId: string, on: string, orderRef: string) =>
  rpc('post_fill', { p_post_id: id, p_staff_id: staffId, p_on: on, p_order_ref: orderRef });
export const vacatePost = (id: string, on: string, reason: string, orderRef: string) =>
  rpc('post_vacate', { p_post_id: id, p_on: on, p_reason: reason, p_order_ref: orderRef });
export const setPostState = (id: string, state: Exclude<PostState, 'FILLED'>, orderRef: string) =>
  rpc('post_set_state', { p_post_id: id, p_state: state, p_order_ref: orderRef });

// --- Workload, outlook, careers ---
export interface WorkloadRow {
  staff_id: string; name: string; division: string | null; active_projects: number; as_pi: number;
  sanctioned_value: number; awp_year: string | null; awp_time_pct: { label: string; role: string; timePct: number }[]; overload: boolean;
}
export interface OutlookRow { kind: 'RETIREMENT' | 'VACANCY'; year: number; discipline: string | null; division: string | null; ref: string; label: string; single_holder: boolean }
export const loadWorkload = () => rpc<WorkloadRow[]>('staff_workload', { p_staff_id: null });
export const loadOutlook = (years = 5) => rpc<OutlookRow[]>('workforce_outlook', { p_years: years });
export interface CareerEventInput { staff_id: string; kind: string; effective_on: string; order_ref?: string; detail?: { summary?: string } }
export const importCareerEvents = (events: CareerEventInput[]) => rpc<number>('career_events_import', { p_rows: events });

// --- Acting charge ---
export interface ActingAssignment {
  id: string; role: 'HOD' | 'DivisionHead' | 'Director'; division_code: string | null; principal_user_id: string | null;
  acting_user_id: string; from_on: string; to_on: string; order_ref: string;
}
export const loadActing = () => rows<ActingAssignment>(client().from('acting_assignments').select('*').order('from_on', { ascending: false }));
export const assignActing = (a: { role: string; division: string | null; principal: string | null; acting: string; from: string; to: string; orderRef: string }) =>
  rpc<string>('acting_assign', {
    p_role: a.role, p_division: a.division, p_principal: a.principal, p_acting: a.acting, p_from: a.from, p_to: a.to, p_order_ref: a.orderRef,
  });
export const endActing = (id: string, lastDay: string) => rpc('acting_end', { p_id: id, p_last_day: lastDay });

// --- Project staff engagement ---
export interface PsPerson {
  id: string; name: string; born_on: string | null; category: string | null; gender: string | null;
  phd_registered_on: string | null; thesis_submitted_on: string | null; abroad_last_5y: boolean; antecedents_verified_on: string | null;
}
export interface PsSelection { id: string; project_id: string; position_code: string; mode: 'SELECTION' | 'WAITLIST' | 'DIRECT'; advert_ncs_ref: string | null; advert_on: string | null; created_at: string }
export interface PsEngagement { id: string; person_id: string; project_id: string; position_code: string; from_on: string; to_on: string; selection_id: string | null }
export interface RuleCheck { rule: string; ok: boolean | null; detail: string }
export interface LegacyPending { name_key: string; legacy_ids: string[]; names: string[]; projects: string[] }

export const loadPersons = () => rows<PsPerson>(client().from('project_staff_persons').select('*').order('name'));
export const loadSelections = () => rows<PsSelection>(client().from('project_selections').select('id, project_id, position_code, mode, advert_ncs_ref, advert_on, created_at').order('created_at', { ascending: false }));
export const loadEngagements = () => rows<PsEngagement>(client().from('project_engagements').select('id, person_id, project_id, position_code, from_on, to_on, selection_id').order('from_on', { ascending: false }));
export const savePerson = (id: string | null, p: Partial<PsPerson>) => rpc<string>('project_staff_person_save', { p_id: id, p });
export const createSelection = (s: { projectId: string; position: string; mode: string; ncsRef: string; advertOn: string | null; committee: { name: string; role: 'CHAIR' | 'MEMBER' }[]; exigencyNote: string; waitlistUntil: string | null }) =>
  rpc<string>('project_selection_create', {
    p_project_id: s.projectId, p_position_code: s.position, p_mode: s.mode, p_advert_ncs_ref: s.ncsRef, p_advert_on: s.advertOn,
    p_committee: s.committee, p_exigency_note: s.exigencyNote, p_waitlist_valid_until: s.waitlistUntil, p_minutes_document_id: null,
  });
export const checkEngagement = (personId: string, projectId: string, position: string, from: string, to: string, selectionId: string | null) =>
  rpc<RuleCheck[]>('project_engagement_check', {
    p_person_id: personId, p_project_id: projectId, p_position_code: position, p_from: from, p_to: to, p_selection_id: selectionId,
  });
export const engage = (selectionId: string, personId: string, from: string, to: string) =>
  rpc<string>('project_engage', { p_selection_id: selectionId, p_person_id: personId, p_from: from, p_to: to, p_emoluments: null });
export const loadLegacyPending = () => rpc<LegacyPending[]>('project_staff_legacy_pending');
export const linkLegacy = (legacyIds: string[], personId: string | null = null) =>
  rpc<string>('project_staff_link_legacy', { p_legacy_ids: legacyIds, p_person_id: personId });
export const backfillLegacy = () => rpc<number>('project_staff_backfill');

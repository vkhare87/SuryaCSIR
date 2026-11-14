import type { PhDMilestone, PhDMilestoneName } from '../../types';
import { supabase } from '../../utils/supabaseClient';
import { daysUntil } from './today';

const MS_PER_DAY = 86400000;

// --- 1. PhD road ---

// Canonical PhD order (matches the phd_milestones CHECK constraint).
export const PHD_GATES: PhDMilestoneName[] = [
  'Joining', 'Coursework', 'Comprehensive Exam', 'Registration',
  'Synopsis Submission', 'Thesis Submission', 'Viva Voce', 'Degree Awarded',
];

export interface Gate { name: PhDMilestoneName; done: boolean; dueDate: string | null }

/** Every gate in order, with whether it is passed and its due date if one is set. */
export function phdRoad(milestones: PhDMilestone[]): { gates: Gate[]; next: Gate | null } {
  const byName = new Map(milestones.map(m => [m.milestone, m]));
  const gates = PHD_GATES.map(name => ({
    name, done: Boolean(byName.get(name)?.completedDate), dueDate: byName.get(name)?.dueDate || null,
  }));
  return { gates, next: gates.find(g => !g.done) ?? null };
}

// --- 2. Project staff record ---

export interface MyEngagement { id: string; projectId: string; positionCode: string; fromOn: string; toOn: string }
export interface MyLeave { kind: string; fromOn: string; toOn: string }
export interface MyProjectStaffRecord {
  personId: string;
  engagements: MyEngagement[];
  leave: MyLeave[];
  /** Days counted under the cap up to today (time as a registered PhD left out); null when it could not be read. */
  tenureDays: number | null;
}

/** The caller's own project staff record, or null when the login is not linked to one. */
export async function myProjectStaffRecord(today: string): Promise<MyProjectStaffRecord | null> {
  if (!supabase) return null;
  const me = await supabase.rpc('project_staff_caller_person');
  if (me.error) { console.error('[home] project_staff_caller_person failed', me.error); return null; }
  const personId = me.data as string | null;
  if (!personId) return null;
  const [eng, tenure] = await Promise.all([
    supabase.from('project_engagements').select('id, project_id, position_code, from_on, to_on').eq('person_id', personId).order('from_on'),
    supabase.rpc('project_staff_tenure_days', { p_person_id: personId, p_on: today }),
  ]);
  if (eng.error) console.error('[home] engagements load failed', eng.error);
  const engagements: MyEngagement[] = (eng.data ?? []).map(r => ({
    id: r.id as string, projectId: r.project_id as string, positionCode: r.position_code as string,
    fromOn: r.from_on as string, toOn: r.to_on as string,
  }));
  let leave: MyLeave[] = [];
  if (engagements.length > 0) {
    const l = await supabase.from('project_staff_leave').select('kind, from_on, to_on').in('engagement_id', engagements.map(e => e.id));
    if (l.error) console.error('[home] leave load failed', l.error);
    leave = (l.data ?? []).map(r => ({ kind: r.kind as string, fromOn: r.from_on as string, toOn: r.to_on as string }));
  }
  return { personId, engagements, leave, tenureDays: tenure.error ? null : (tenure.data as number) };
}

/** Whole days in a range, both ends included, clipped to [from, to]. */
function overlapDays(aFrom: string, aTo: string, from: string, to: string): number {
  const s = aFrom > from ? aFrom : from;
  const e = aTo < to ? aTo : to;
  if (s > e) return 0;
  return Math.round((Date.parse(e) - Date.parse(s)) / MS_PER_DAY) + 1;
}

/** 1 April to 31 March around a date. ponytail: the leave year until a csir_rules key names one. */
export function leaveYear(today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4));
  const start = today.slice(5) >= '04-01' ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** Paid leave days taken in the leave year around today. */
export function paidLeaveUsed(leave: MyLeave[], today: string): number {
  const yr = leaveYear(today);
  return leave.filter(l => l.kind === 'PAID').reduce((n, l) => n + overlapDays(l.fromOn, l.toOn, yr.from, yr.to), 0);
}

/** The engagement running today; else the next one; else the last one. */
export function currentEngagement(engagements: MyEngagement[], today: string): MyEngagement | null {
  return engagements.find(e => e.fromOn <= today && e.toOn >= today)
    ?? engagements.find(e => e.fromOn > today)
    ?? engagements[engagements.length - 1]
    ?? null;
}

/** Days left on an engagement and the share of it already used (0–1). */
export function contractClock(e: MyEngagement, now: Date = new Date()): { daysLeft: number; share: number } {
  const total = Math.max(1, Math.round((Date.parse(e.toOn) - Date.parse(e.fromOn)) / MS_PER_DAY) + 1);
  const daysLeft = daysUntil(e.toOn, now);
  return { daysLeft, share: Math.min(1, Math.max(0, 1 - daysLeft / total)) };
}

/** Years and months, for a number of days. */
export function yearsMonths(days: number): string {
  const months = Math.floor(days / 30.4375);
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y > 0 ? `${y} y` : '', `${m} m`].filter(Boolean).join(' ');
}

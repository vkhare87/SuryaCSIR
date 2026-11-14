import { supabase } from '../../utils/supabaseClient';
import type { CsirRule } from '../../types';
import { ruleOn } from '../rules/csirRules';

export type DelegationMode = 'SELF' | 'HEAD_TELL' | 'HEAD_FLAGS';
export type Preset = 'HANDS_ON' | 'BALANCED' | 'HANDS_OFF';

export const MODE_LABEL: Record<DelegationMode, string> = {
  SELF: 'I decide',
  HEAD_TELL: 'Head decides, tell me',
  HEAD_FLAGS: 'Head decides, flags only',
};
export const PRESET_LABEL: Record<Preset, string> = { HANDS_ON: 'Hands-on', BALANCED: 'Balanced', HANDS_OFF: 'Hands-off' };

export interface DelegableKind { kind: string; label: string; hasLimit: boolean }

// The kinds a Director may pass down (DIRECTOR-HOME-PLAN §1.2). The floor comes from csir_rules, not from here.
export const DELEGABLE: DelegableKind[] = [
  { kind: 'LEAVE_TOUR', label: 'Leave and tour of scientists', hasLimit: false },
  { kind: 'PS_HIRE_EXTEND', label: 'Project staff: hire and extend', hasLimit: false },
  { kind: 'INDENT', label: 'Purchase indents', hasLimit: true },
  { kind: 'PROGRESS_REPORT', label: 'Progress reports to the funder or PME', hasLimit: false },
  { kind: 'PROPOSAL', label: 'New proposals', hasLimit: false },
  { kind: 'PROJECT_CHANGE', label: 'Project change: time, money, people', hasLimit: false },
  { kind: 'INSTRUMENT_HOURS', label: 'Instrument hours to other divisions', hasLimit: false },
];

export interface Line { kind: string; mode: DelegationMode; limit: number | null }

const DEFAULT_LIMIT = 500000;
const line = (kind: string, mode: DelegationMode): Line => ({ kind, mode, limit: kind === 'INDENT' ? DEFAULT_LIMIT : null });

export const PRESETS: Record<Preset, Line[]> = {
  HANDS_ON: DELEGABLE.map(k => line(k.kind, 'SELF')),
  BALANCED: DELEGABLE.map(k => line(k.kind, ({
    LEAVE_TOUR: 'HEAD_FLAGS', PS_HIRE_EXTEND: 'HEAD_TELL', INDENT: 'HEAD_TELL', PROGRESS_REPORT: 'HEAD_TELL', INSTRUMENT_HOURS: 'HEAD_FLAGS',
  } as Record<string, DelegationMode>)[k.kind] ?? 'SELF')),
  HANDS_OFF: DELEGABLE.map(k => line(k.kind, k.kind === 'PROPOSAL' || k.kind === 'PROJECT_CHANGE' ? 'HEAD_TELL' : 'HEAD_FLAGS')),
};

/** The preset these lines match, or null for a custom set. */
export function presetOf(lines: Line[]): Preset | null {
  const key = (ls: Line[]) => ls.map(l => `${l.kind}:${l.mode}:${l.limit ?? ''}`).sort().join('|');
  return (Object.keys(PRESETS) as Preset[]).find(p => key(PRESETS[p]) === key(lines)) ?? null;
}

/** Floor kinds in force, from csir_rules (delegation.floor.<kind> = true). */
export function floorKinds(rules: CsirRule[], on?: string): { kind: string; note: string; verified: boolean }[] {
  const keys = [...new Set(rules.filter(r => r.ruleKey.startsWith('delegation.floor.')).map(r => r.ruleKey))];
  return keys
    .map(k => ({ k, r: ruleOn(rules, k, on) }))
    .filter(({ r }) => r?.value === true)
    .map(({ k, r }) => ({ kind: k.slice('delegation.floor.'.length), note: r?.note ?? k, verified: Boolean(r?.verified) }));
}

export interface DelegationOrder { id: string; orderNo: string; preset: Preset | null; effectiveFrom: string; lines: (Line & { division: string })[] }

export async function loadOrderInForce(): Promise<DelegationOrder | null> {
  if (!supabase) return null;
  const o = await supabase.from('delegation_orders').select('*').is('ended_at', null).maybeSingle();
  if (o.error) { console.error('[home] delegation order load failed', o.error); return null; }
  if (!o.data) return null;
  const l = await supabase.from('delegation_lines').select('*').eq('order_id', o.data.id);
  return {
    id: o.data.id as string, orderNo: o.data.order_no as string, preset: (o.data.preset as Preset | null) ?? null,
    effectiveFrom: o.data.effective_from as string,
    lines: (l.data ?? []).map(x => ({
      kind: x.kind as string, mode: x.mode as DelegationMode, limit: x.amount_limit === null ? null : Number(x.amount_limit),
      division: x.division_code as string,
    })),
  };
}

export async function issueOrder(preset: Preset | null, lines: Line[]): Promise<void> {
  if (!supabase) throw new Error('Not connected');
  const { error } = await supabase.rpc('delegation_issue', {
    p_preset: preset, p_lines: lines.map(l => ({ kind: l.kind, mode: l.mode, limit: l.limit })),
  });
  if (error) throw new Error(error.message);
}

/** The lines a head of this division decides under the order. */
export function headPowers(order: DelegationOrder | null, division: string | null): (Line & { division: string })[] {
  if (!order) return [];
  return order.lines.filter(l => l.mode !== 'SELF' && (l.division === '*' || l.division === division));
}

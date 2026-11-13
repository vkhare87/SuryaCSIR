import { supabase } from '../../utils/supabaseClient';

// Enterprise P7 (20261113000007): every quoted number comes from the metric
// registry. Screens, the pack PDF and Ask SURYA all read metric_value /
// metric_table / metric_snapshots, so one number is the same everywhere.

export type MetricUnit = 'count' | 'inr' | 'pct';
export interface Metric { key: string; label: string; definition: string; unit: MetricUnit; owner_role: string; sort: number }
/** division null = the institute. */
export interface MetricCell { metric_key: string; division: string | null; value: number | null }
export interface MetricSnapshot { metric_key: string; division: string | null; as_on: string; value: number | null }

function client() {
  if (!supabase) throw new Error('Database not provisioned');
  return supabase;
}

async function run<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw error;
  return data as T;
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const loadMetrics = async () =>
  (await run<Metric[] | null>(client().from('metrics').select('key, label, definition, unit, owner_role, sort').order('sort'))) ?? [];

export const loadMetricTable = async (): Promise<MetricCell[]> =>
  ((await run<{ metric_key: string; division: string | null; value: unknown }[] | null>(client().rpc('metric_table'))) ?? [])
    .map(r => ({ metric_key: r.metric_key, division: r.division, value: n(r.value) }));

export const loadSnapshotDates = async (): Promise<string[]> => {
  const rows = (await run<{ as_on: string }[] | null>(client().from('metric_snapshots').select('as_on').eq('scope', '{}').order('as_on', { ascending: false }))) ?? [];
  return [...new Set(rows.map(r => r.as_on))];
};

/** Every snapshot on or before asOn (all when omitted), newest first. */
export const loadSnapshots = async (asOn?: string): Promise<MetricSnapshot[]> => {
  let q = client().from('metric_snapshots').select('metric_key, scope, as_on, value').order('as_on', { ascending: false });
  if (asOn) q = q.lte('as_on', asOn);
  const rows = (await run<{ metric_key: string; scope: { division?: string }; as_on: string; value: unknown }[] | null>(q)) ?? [];
  return rows.map(r => ({ metric_key: r.metric_key, division: r.scope?.division ?? null, as_on: r.as_on, value: n(r.value) }));
};

export const setProjectLens = (projectId: string, themeCode: string | null, trlTarget: number | null, trlReached: number | null) =>
  run(client().rpc('project_set_lens', { p_project_id: projectId, p_theme_code: themeCode, p_trl_target: trlTarget, p_trl_reached: trlReached }));

export function formatMetric(value: number | null, unit: MetricUnit): string {
  if (value === null) return '—';
  if (unit === 'pct') return `${value}%`;
  if (unit === 'inr') return value >= 1e7 ? `₹${(value / 1e7).toFixed(2)} Cr` : `₹${(value / 1e5).toFixed(2)} L`;
  return value.toLocaleString('en-IN');
}

/** The latest snapshot value before today's, per metric and division, for "change since". */
export function previousValues(snaps: MetricSnapshot[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const s of snaps) {
    const k = `${s.metric_key}|${s.division ?? ''}`;
    if (!out.has(k)) out.set(k, s.value);
  }
  return out;
}

/** Rows of the "as on" pack: exactly the snapshot taken for that day, nothing live. */
export function packRows(metrics: Metric[], snaps: MetricSnapshot[], asOn: string, divisions: string[]) {
  const at = new Map(snaps.filter(s => s.as_on === asOn).map(s => [`${s.metric_key}|${s.division ?? ''}`, s.value]));
  return metrics.map(m => ({
    metric: m,
    institute: at.get(`${m.key}|`) ?? null,
    byDivision: divisions.map(d => at.get(`${m.key}|${d}`) ?? null),
  }));
}

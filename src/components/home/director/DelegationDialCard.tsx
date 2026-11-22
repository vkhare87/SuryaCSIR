import { useCallback, useEffect, useState } from 'react';
import { Lock, Sliders } from 'lucide-react';
import { Card } from '../../ui/Cards';
import {
  fetchDelegationState,
  resolveDirectorFlag,
  setDelegationRule,
  type DelegationRuleRow,
  type DirectorFlagRow,
} from '../../../lib/home/stage4Api';

const MODES: DelegationRuleRow['mode'][] = ['SELF', 'HEAD_TELL', 'HEAD_FLAGS'];

export function DelegationDialCard() {
  const [rules, setRules] = useState<DelegationRuleRow[]>([]);
  const [flags, setFlags] = useState<DirectorFlagRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const state = await fetchDelegationState();
      setRules(state.rules);
      setFlags(state.flags);
    } catch {
      // Offline/non-Supabase fallback
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (rules.length === 0 && flags.length === 0) return null;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Sliders size={13} /> Delegation Dial &amp; Director Flags
        </h2>
        <span className="text-[11px] font-mono tabular-nums text-text-muted">
          {flags.length} active flag{flags.length === 1 ? '' : 's'}
        </span>
      </div>

      {err && <p className="text-xs text-error-crimson">{err}</p>}

      <div className="divide-y divide-border">
        {rules.map((r) => (
          <div key={r.decision_kind} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <p className="font-medium text-text flex items-center gap-1.5">
                {r.label}
                {r.non_delegable_floor && (
                  <span title="Non-delegable CSIR floor" className="text-text-muted inline-flex items-center gap-0.5 text-[11px]">
                    <Lock size={11} /> Floor
                  </span>
                )}
              </p>
              <p className="text-[11px] font-mono text-text-muted">
                {r.order_no ?? 'CSIR-DOP'}
                {r.max_amount_inr ? ` · Cap INR ${r.max_amount_inr.toLocaleString('en-IN')}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={busyKey === r.decision_kind || (r.non_delegable_floor && m !== 'SELF')}
                  onClick={async () => {
                    setBusyKey(r.decision_kind);
                    setErr(null);
                    try {
                      await setDelegationRule(
                        r.decision_kind,
                        m,
                        r.max_amount_inr,
                        r.order_no ?? 'DIR-DEL-2026',
                      );
                      await load();
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : 'Failed to update delegation dial');
                    } finally {
                      setBusyKey(null);
                    }
                  }}
                  className={`px-2 py-0.5 rounded border text-[11px] font-mono transition-colors ${
                    r.mode === m
                      ? 'border-terracotta bg-terracotta text-ivory font-semibold'
                      : 'border-border text-text-muted hover:text-text disabled:opacity-35'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {flags.length > 0 && (
        <div className="pt-2 border-t border-border space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Held / Audit Flags</p>
          {flags.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-text truncate">
                {f.flag_kind} · {f.subject_type}:{f.subject_id} {f.note ? `— ${f.note}` : ''}
              </span>
              <button
                type="button"
                disabled={busyKey === f.id}
                onClick={async () => {
                  setBusyKey(f.id);
                  try {
                    await resolveDirectorFlag(f.id);
                    await load();
                  } finally {
                    setBusyKey(null);
                  }
                }}
                className="px-2 py-0.5 rounded border border-border text-[11px] text-archive-green hover:bg-surface-hover shrink-0"
              >
                Release
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

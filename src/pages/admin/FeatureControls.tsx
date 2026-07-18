import { useMemo, useState } from 'react';
import { SlidersHorizontal, ShieldCheck, RotateCcw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../utils/supabaseClient';
import { Card } from '../../components/ui/Cards';
import { ACCESS_MAP, FEATURE_LABELS, type AccessPath } from '../../constants/access';
import { UNCONTROLLABLE_PATHS } from '../../lib/access/featureControls';
import type { FeatureControl, Role } from '../../types';

// Controllable features grouped for scanning; mirrors sidebar sections,
// with workflow sub-paths listed under their parent area.
const GROUPS: { label: string; paths: AccessPath[] }[] = [
  { label: 'Overview', paths: ['/ask', '/intelligence', '/explore', '/calendar'] },
  { label: 'Unified Human Resource', paths: ['/staff', '/staff/analytics', '/staff/project', '/phd', '/divisions', '/recruitment'] },
  { label: 'Research Ops', paths: ['/projects', '/proposals', '/reports', '/reports/new', '/facilities', '/partnerships', '/rnd-monitor'] },
  { label: 'Governance', paths: ['/committees', '/helpdesk', '/pms', '/pms/cycles', '/pms/evaluation-committees', '/pms/reports/new', '/pms/assign', '/pms/committee', '/pms/audit'] },
  { label: 'Data Ops', paths: ['/data', '/irins-sync'] },
];

const blankControl = (path: string): FeatureControl => ({
  feature_key: path,
  enabled: true,
  disabled_roles: [],
  note: null,
  updated_by: null,
  updated_at: '',
});

export default function FeatureControls() {
  const { user } = useAuth();
  const { controls, refresh } = useFeatureControls();
  const { push } = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const byKey = useMemo(
    () => new Map(controls.map((c) => [c.feature_key, c])),
    [controls],
  );

  const save = async (next: FeatureControl) => {
    if (!supabase || !user) return;
    setSaving(next.feature_key);
    const { error } = await supabase.from('feature_controls').upsert({
      feature_key: next.feature_key,
      enabled: next.enabled,
      disabled_roles: next.disabled_roles,
      note: next.note,
      updated_by: user.id,
    });
    setSaving(null);
    if (error) { push(error.message, 'error'); return; }
    await refresh();
  };

  const toggleEnabled = (path: string) => {
    const cur = byKey.get(path) ?? blankControl(path);
    void save({ ...cur, enabled: !cur.enabled });
  };

  const toggleRole = (path: string, role: Role) => {
    const cur = byKey.get(path) ?? blankControl(path);
    const disabled = cur.disabled_roles.includes(role)
      ? cur.disabled_roles.filter((r) => r !== role)
      : [...cur.disabled_roles, role];
    void save({ ...cur, disabled_roles: disabled });
  };

  const resetControl = (path: string) => {
    const cur = byKey.get(path);
    if (!cur) return;
    void save({ ...cur, enabled: true, disabled_roles: [], note: null });
    setNotes((n) => ({ ...n, [path]: '' }));
  };

  const saveNote = (path: string) => {
    const cur = byKey.get(path) ?? blankControl(path);
    const note = (notes[path] ?? cur.note ?? '').trim() || null;
    if (note === cur.note) return;
    void save({ ...cur, note });
  };

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif flex items-center gap-3">
          <SlidersHorizontal size={26} className="text-terracotta" /> Feature Controls
        </h1>
        <p className="text-text-muted mt-1 text-sm font-medium">
          Switch features off institute-wide or for specific roles. Absent entry = fully enabled.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface px-5 py-3 flex items-start gap-3 text-xs text-text-muted">
        <ShieldCheck size={15} className="text-terracotta shrink-0 mt-0.5" />
        <p>
          MasterAdmin is exempt from every control, and the dashboard + admin pages
          ({UNCONTROLLABLE_PATHS.join(', ')}) cannot be switched off — no self-lockout.
          These switches govern navigation and routes; row-level security on the data remains in force regardless.
        </p>
      </div>

      {GROUPS.map((group) => (
        <Card key={group.label} className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">{group.label}</h2>
          </div>
          <div className="divide-y divide-border">
            {group.paths.map((path) => {
              const control = byKey.get(path) ?? blankControl(path);
              const eligibleRoles = ACCESS_MAP[path].filter((r) => r !== 'MasterAdmin');
              const modified = !control.enabled || control.disabled_roles.length > 0 || Boolean(control.note);
              return (
                <div key={path} className="px-6 py-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Master switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={control.enabled}
                      aria-label={`${FEATURE_LABELS[path]} enabled`}
                      disabled={saving === path}
                      onClick={() => toggleEnabled(path)}
                      className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${
                        control.enabled ? 'bg-[#16a34a]' : 'bg-surface-hover border border-border'
                      } disabled:opacity-50`}
                    >
                      <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${
                        control.enabled ? 'left-[22px]' : 'left-[3px]'
                      }`} />
                    </button>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-text">{FEATURE_LABELS[path]}</span>
                      <span className="ml-2 text-[10px] font-mono text-text-muted">{path}</span>
                    </div>
                    {!control.enabled && (
                      <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#fde2e2] text-[#991b1b]">
                        Off for everyone
                      </span>
                    )}
                    {modified && (
                      <button
                        type="button"
                        onClick={() => resetControl(path)}
                        className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-terracotta transition-colors"
                      >
                        <RotateCcw size={12} /> Reset
                      </button>
                    )}
                  </div>

                  {/* Per-role disables */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Blocked roles:</span>
                    {eligibleRoles.map((r) => {
                      const blocked = control.disabled_roles.includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          disabled={saving === path || !control.enabled}
                          onClick={() => toggleRole(path, r)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors disabled:opacity-40 ${
                            blocked
                              ? 'bg-[#fde2e2] border-[#fca5a5] text-[#991b1b]'
                              : 'bg-surface border-border text-text-muted hover:border-terracotta'
                          }`}
                          title={blocked ? `Re-enable for ${r}` : `Switch off for ${r}`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>

                  {/* Note */}
                  <input
                    type="text"
                    value={notes[path] ?? control.note ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [path]: e.target.value }))}
                    onBlur={() => saveNote(path)}
                    placeholder="Reason / note (optional)"
                    className="w-full max-w-xl bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder:text-text-muted"
                  />
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

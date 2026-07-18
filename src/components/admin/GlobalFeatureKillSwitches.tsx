import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { useFeatureControlEditor } from '../../hooks/useFeatureControlEditor';
import { Card, Badge } from '../ui/Cards';
import { FEATURE_LABELS } from '../../constants/access';
import { FEATURE_GROUPS, blankControl } from '../../lib/access/featureControls';

export function GlobalFeatureKillSwitches() {
  const { controls } = useFeatureControls();
  const { saving, savedFlash, save } = useFeatureControlEditor();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const byKey = useMemo(() => new Map(controls.map((c) => [c.feature_key, c])), [controls]);

  const toggle = (path: string) => {
    const cur = byKey.get(path) ?? blankControl(path);
    void save({ ...cur, enabled: !cur.enabled });
  };

  const saveNote = (path: string) => {
    const cur = byKey.get(path) ?? blankControl(path);
    const note = (notes[path] ?? cur.note ?? '').trim() || null;
    if (note === cur.note) return;
    void save({ ...cur, note });
  };

  const reset = (path: string) => {
    const cur = byKey.get(path);
    if (!cur) return;
    void save({ ...cur, enabled: true, note: null });
    setNotes((n) => ({ ...n, [path]: '' }));
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">Global Kill Switches</h2>
        <p className="text-xs text-text-muted mt-0.5">Off here means off for everyone, every role, institute-wide.</p>
      </div>
      <div className="divide-y divide-border">
        {FEATURE_GROUPS.flatMap((g) => g.paths).map((path) => {
          const control = byKey.get(path) ?? blankControl(path);
          const modified = !control.enabled || Boolean(control.note);
          return (
            <div key={path} className="px-6 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  role="switch"
                  aria-checked={control.enabled}
                  aria-label={`${FEATURE_LABELS[path]} enabled institute-wide`}
                  disabled={saving === path}
                  onClick={() => toggle(path)}
                  className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                    control.enabled ? 'bg-[#16a34a]' : 'bg-surface-hover border border-border'
                  }`}
                >
                  <span
                    className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${
                      control.enabled ? 'left-[22px]' : 'left-[3px]'
                    }`}
                  />
                </button>
                <span className="text-sm font-semibold text-text">{FEATURE_LABELS[path]}</span>
                <Badge variant={control.enabled ? 'success' : 'danger'}>{control.enabled ? 'ON' : 'OFF'}</Badge>
                {savedFlash === path && (
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Saved</span>
                )}
                {modified && (
                  <button
                    type="button"
                    onClick={() => reset(path)}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-terracotta transition-colors"
                  >
                    <RotateCcw size={12} /> Reset
                  </button>
                )}
              </div>
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
  );
}

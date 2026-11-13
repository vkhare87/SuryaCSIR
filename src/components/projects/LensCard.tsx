import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Card } from '../ui/Cards';
import { Button } from '../ui/Button';
import { friendlyError } from '../../lib/errors';
import { THEME_OPTIONS, themeLabel } from '../../lib/expertise/api';
import { setProjectLens } from '../../lib/metrics/api';
import type { ProjectInfo } from '../../types';

const TRLS = Array.from({ length: 9 }, (_, i) => i + 1);
const select = 'rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text w-full';

// Theme and TRL of a project (EP9). PME or the PI edits; the database checks.
export function LensCard({ project, canEdit, onSaved }: { project: ProjectInfo; canEdit: boolean; onSaved: () => Promise<void> }) {
  const { push } = useToast();
  const [theme, setTheme] = useState(project.themeCode ?? '');
  const [target, setTarget] = useState(project.trlTarget ? String(project.trlTarget) : '');
  const [reached, setReached] = useState(project.trlReached ? String(project.trlReached) : '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await setProjectLens(project.ProjectID, theme || null, target ? Number(target) : null, reached ? Number(reached) : null);
      await onSaved();
      push('Theme and TRL saved', 'success');
    } catch (err) { push(friendlyError(err), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="space-y-3">
      <h3 className="text-lg font-[500] text-text font-serif">Theme and TRL</h3>
      {canEdit ? (
        <>
          <label className="block text-xs text-text-muted">Theme
            <select aria-label="Theme" value={theme} onChange={e => setTheme(e.target.value)} className={select}>
              <option value="">Not set</option>
              {THEME_OPTIONS.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-text-muted">TRL target
              <select aria-label="TRL target" value={target} onChange={e => setTarget(e.target.value)} className={select}>
                <option value="">—</option>{TRLS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="block text-xs text-text-muted">TRL reached
              <select aria-label="TRL reached" value={reached} onChange={e => setReached(e.target.value)} className={select}>
                <option value="">—</option>{TRLS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <Button variant="secondary" disabled={busy} onClick={() => void save()}>Save</Button>
        </>
      ) : (
        <p className="text-sm text-text">
          {project.themeCode ? themeLabel(project.themeCode) : 'No theme'} · TRL {project.trlReached ?? '—'} of {project.trlTarget ?? '—'}
        </p>
      )}
    </Card>
  );
}

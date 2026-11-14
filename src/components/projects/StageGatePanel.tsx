import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Layers } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { Card } from '../ui/Cards';
import { loadStageGate, projectCategory, recordStageDeliverable, uploadProjectDocument } from '../../lib/projects/projectFileApi';
import { STAGE_GATE_CATEGORIES } from '../../lib/projects/packs';
import { friendlyError } from '../../lib/errors';
import type { ProjectInfo } from '../../types';
import type { StageDeliverable, StageItem } from '../../types/projectFile';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

/** Stages I–VI of an FTT / FTC / MMP project and what each must leave on file (§4.2). */
export function StageGatePanel({ project, canRecord, onChanged }: { project: ProjectInfo; canRecord: boolean; onChanged: () => void }) {
  const { push } = useToast();
  const [category, setCategory] = useState<string | null>(null);
  const [items, setItems] = useState<StageItem[]>([]);
  const [done, setDone] = useState<StageDeliverable[]>([]);
  const [busy, setBusy] = useState('');

  const reload = useCallback(async () => {
    try {
      const cat = await projectCategory(project.ProjectID);
      setCategory(cat);
      if (!cat || !STAGE_GATE_CATEGORIES.includes(cat)) return;
      const g = await loadStageGate(project.ProjectID);
      setItems(g.items);
      setDone(g.done);
    } catch (e) { push(friendlyError(e), 'error'); }
  }, [project.ProjectID, push]);
  useEffect(() => { void reload(); }, [reload]);

  const byStage = useMemo(() => [1, 2, 3, 4, 5, 6].map(s => ({ stage: s, items: items.filter(i => i.stage === s) })), [items]);
  const doneKeys = useMemo(() => new Set(done.map(d => d.itemKey)), [done]);

  if (!category || !STAGE_GATE_CATEGORIES.includes(category)) return null;

  const attach = async (item: StageItem, file: File | undefined) => {
    if (!file) return;
    setBusy(item.itemKey);
    try {
      const doc = await uploadProjectDocument(project.ProjectID, 'stage_deliverable', file);
      await recordStageDeliverable(project.ProjectID, item.itemKey, doc.id);
      push(`${item.label} on file`, 'success');
      await reload();
      onChanged();
    } catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(''); }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Layers size={16} className="text-terracotta" />
        <h3 className="text-sm font-medium text-text">Stage gates · {category}</h3>
      </div>
      <p className="text-xs text-text-muted">Stage VI papers must be on file before the technology is transferred; a transfer without them shows on the PME desk.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {byStage.map(s => (
          <div key={s.stage} className="rounded-lg border border-border p-3">
            <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Stage {ROMAN[s.stage]}</p>
            <ul className="space-y-1.5">
              {s.items.map(i => (
                <li key={i.itemKey} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 text-text">
                    {doneKeys.has(i.itemKey) ? <CheckCircle2 size={14} className="text-archive-green" /> : <Circle size={14} className="text-text-muted" />}
                    {i.label}
                  </span>
                  {canRecord && (
                    <label className="text-xs text-terracotta cursor-pointer hover:underline shrink-0">
                      {busy === i.itemKey ? 'Uploading…' : doneKeys.has(i.itemKey) ? 'Replace' : 'Attach PDF'}
                      <input type="file" accept="application/pdf" className="hidden" disabled={!!busy}
                        onChange={e => void attach(i, e.target.files?.[0])} />
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

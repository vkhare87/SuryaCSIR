import { useMemo, useState } from 'react';
import { loadLabMoney } from '../../lib/projects/labs';
import { FileDown, Package } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { projectPack } from '../../lib/projects/projectFileApi';
import { PACK_LABELS } from '../../lib/projects/packs';
import { friendlyError } from '../../lib/errors';
import type { ProjectInfo } from '../../types';
import type { ChecklistItem, PackKind, ProjectFile } from '../../types/projectFile';

/** One click builds the HQ paper pack from the file (§4.1.5, §7.1, §7.2). Checklist B shows before a change pack prints. */
export function PacksPanel({ project, file, changesOnly = false }: { project: ProjectInfo; file: ProjectFile; changesOnly?: boolean }) {
  const { push } = useToast();
  const changes = useMemo(() => file.changes.filter(c => c.kind === 'REPHASING' || c.kind === 'REAPPROPRIATION'), [file.changes]);
  const [kind, setKind] = useState<PackKind>(changesOnly ? 'REPHASING' : 'NEXT_YEAR_RELEASE');
  const [changeId, setChangeId] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const isChange = kind === 'REPHASING' || kind === 'REAPPROPRIATION';
  const kinds: PackKind[] = changesOnly ? ['REPHASING', 'REAPPROPRIATION'] : ['FIRST_RELEASE', 'NEXT_YEAR_RELEASE', 'REPHASING', 'REAPPROPRIATION'];

  if (changesOnly && changes.length === 0) return null;

  const build = async () => {
    setBusy(true);
    try {
      const [pack, labs] = await Promise.all([projectPack(project.ProjectID, kind, isChange ? changeId : null), loadLabMoney(project.ProjectID)]);
      if (labs.length > 1) pack.labs = labs;
      setChecklist(pack.checklist_b ?? null);
      const [{ pdf }, { PackPdf }] = await Promise.all([import('@react-pdf/renderer'), import('../../lib/projects/packPdf')]);
      const url = URL.createObjectURL(await pdf(<PackPdf pack={pack} />).toBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kind.toLowerCase()}_${project.ProjectNo}_${pack.as_on}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2"><Package size={16} className="text-terracotta" /><h3 className="text-sm font-medium text-text">Paper pack for HQ</h3></div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-text-muted">Pack
          <select value={kind} onChange={e => { setKind(e.target.value as PackKind); setChecklist(null); }}
            className="block mt-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text">
            {kinds.map(k => <option key={k} value={k}>{PACK_LABELS[k]}</option>)}
          </select>
        </label>
        {isChange && (
          <label className="text-xs text-text-muted">Request
            <select value={changeId} onChange={e => { setChangeId(e.target.value); setChecklist(null); }}
              className="block mt-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text">
              <option value="">Choose…</option>
              {changes.filter(c => c.kind === kind).map(c => (
                <option key={c.id} value={c.id}>{c.createdAt.slice(0, 10)} · {c.status.toLowerCase()}</option>
              ))}
            </select>
          </label>
        )}
        <Button disabled={busy || (isChange && !changeId)} onClick={() => void build()}><FileDown size={14} className="mr-1.5 inline" />{busy ? 'Building…' : 'Build PDF'}</Button>
      </div>
      {checklist && (
        <ul className="text-sm space-y-1 border-t border-border pt-3">
          {checklist.map(c => (
            <li key={c.item} className="flex items-start gap-2">
              <Badge variant={c.ok ? 'success' : 'danger'}>{c.ok ? 'Yes' : 'No'}</Badge><span className="text-text">{c.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

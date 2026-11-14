import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Card } from '../ui/Cards';
import { Button } from '../ui/Button';
import { useData } from '../../contexts/DataContext';
import { linkOutput, type OutputKind } from '../../lib/projects/projectFileApi';
import { friendlyError } from '../../lib/errors';
import type { ProjectInfo } from '../../types';

interface OutputsPanelProps {
  project: ProjectInfo;
  /** PME, or the project's PI: may link and unlink. */
  canLink: boolean;
}

export function OutputsPanel({ project, canLink }: OutputsPanelProps) {
  const { scientificOutputs, ipIntelligence, equipment, mous, techTransfers, refreshSlice } = useData();
  const id = project.ProjectID;
  const linked = useMemo(() => ({
    publication: scientificOutputs.filter(o => o.projectId === id).map(o => ({ id: o.id, label: `${o.title} — ${o.journal}, ${o.year}` })),
    patent: ipIntelligence.filter(o => o.projectId === id).map(o => ({ id: o.id, label: `${o.title} (${o.type}, ${o.status})` })),
    equipment: equipment.filter(o => o.projectId === id).map(o => ({ id: o.UInsID, label: `${o.Name} (${o.UInsID})` })),
  }), [scientificOutputs, ipIntelligence, equipment, id]);
  const agreements = useMemo(() => [
    ...mous.filter(m => m.projectId === id).map(m => `MoU with ${m.partnerName}`),
    ...techTransfers.filter(t => t.projectId === id).map(t => `Technology transfer: ${t.technologyTitle} to ${t.licensee}`),
  ], [mous, techTransfers, id]);
  const candidates = useMemo(() => ({
    publication: scientificOutputs.filter(o => !o.projectId).map(o => ({ id: o.id, label: `${o.title} (${o.year})` })),
    patent: ipIntelligence.filter(o => !o.projectId).map(o => ({ id: o.id, label: o.title })),
    equipment: equipment.filter(o => !o.projectId).map(o => ({ id: o.UInsID, label: `${o.Name} (${o.UInsID})` })),
  }), [scientificOutputs, ipIntelligence, equipment]);

  const [kind, setKind] = useState<OutputKind>('publication');
  const [pick, setPick] = useState('');
  const [error, setError] = useState('');

  async function change(k: OutputKind, outputId: string, projectId: string | null) {
    setError('');
    try { await linkOutput(k, outputId, projectId); setPick(''); await refreshSlice(k === 'equipment' ? 'facilities' : 'outputs'); }
    catch (e) { setError(friendlyError(e)); }
  }

  const groups: { kind: OutputKind; title: string }[] = [
    { kind: 'publication', title: 'Publications' }, { kind: 'patent', title: 'Patents and IP' }, { kind: 'equipment', title: 'Equipment bought' },
  ];

  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-base font-[500] font-serif text-text">What this project produced</h2>
      {groups.map(g => (
        <div key={g.kind}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">{g.title}</h3>
          {linked[g.kind].length === 0 ? <p className="text-sm text-text-muted">None linked.</p> : (
            <ul className="space-y-1">
              {linked[g.kind].map(o => (
                <li key={o.id} className="flex items-center gap-2 text-sm text-text">
                  <span className="flex-1">{o.label}</span>
                  {canLink && (
                    <button type="button" aria-label={`Unlink ${o.label}`} className="p-1 text-text-muted hover:text-danger"
                      onClick={() => void change(g.kind, o.id, null)}><X size={14} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {agreements.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">Agreements</h3>
          <ul className="space-y-1 text-sm text-text">{agreements.map(a => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      {canLink && (
        <div className="border-t border-border pt-3 flex flex-wrap gap-2 items-end">
          <label className="block">
            <span className="block text-xs font-medium text-text-muted mb-1">Link a</span>
            <select className="px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text" value={kind}
              onChange={(e) => { setKind(e.target.value as OutputKind); setPick(''); }}>
              {groups.map(g => <option key={g.kind} value={g.kind}>{g.title.toLowerCase()}</option>)}
            </select>
          </label>
          <label className="block flex-1 min-w-[16rem]">
            <span className="block text-xs font-medium text-text-muted mb-1">Not yet linked to any project</span>
            <select className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Select…</option>
              {candidates[kind].map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <Button onClick={() => void change(kind, pick, id)} disabled={!pick}>Link</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </Card>
  );
}

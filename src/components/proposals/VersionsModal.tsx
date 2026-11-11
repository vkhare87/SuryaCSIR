import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Cards';
import { listVersions, restoreVersion, saveVersion } from '../../lib/proposals/workspaceApi';
import { diffProposals } from '../../lib/proposals/versionDiff';
import { friendlyError } from '../../lib/errors';
import type { Proposal, ProposalVersion } from '../../types/proposal';

interface VersionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The draft as it stands on screen. */
  current: Proposal;
  /** Send any unsaved typing before a version is marked or restored. */
  flush: () => Promise<void>;
  /** A version was restored — reload the draft. */
  onRestored: () => Promise<void>;
}

const CURRENT = 'current';

export function VersionsModal({ isOpen, onClose, current, flush, onRestored }: VersionsModalProps) {
  const [versions, setVersions] = useState<ProposalVersion[]>([]);
  const [label, setLabel] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<string>(CURRENT);
  const [busy, setBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setError('');
    setConfirmRestore(false);
    listVersions(current.id).then(
      (v) => { if (!cancelled) { setVersions(v); setSelectedId((s) => s ?? v[0]?.id ?? null); } },
      (e) => { if (!cancelled) setError(friendlyError(e)); },
    );
    return () => { cancelled = true; };
  }, [isOpen, current.id]);

  const selected = versions.find(v => v.id === selectedId) ?? null;
  const other = compareWith === CURRENT ? current : versions.find(v => v.id === compareWith)?.proposal ?? current;
  const otherName = compareWith === CURRENT
    ? 'Current draft'
    : `Version ${versions.find(v => v.id === compareWith)?.versionNo ?? ''}`;
  const changes = useMemo(() => (selected ? diffProposals(selected.proposal, other) : []), [selected, other]);

  async function mark() {
    setBusy(true); setError('');
    try {
      await flush();
      await saveVersion(current.id, label);
      setLabel('');
      const v = await listVersions(current.id);
      setVersions(v);
      setSelectedId(v[0]?.id ?? null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      await flush();
      await restoreVersion(selected.id);
      await onRestored();
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      setConfirmRestore(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Versions" className="sm:max-w-3xl">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[14rem]">
            <span className="block text-xs font-medium text-text-muted mb-1">Mark the draft as it is now</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. after discussion with HOD"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text"
            />
          </label>
          <Button onClick={() => void mark()} isLoading={busy}>Mark version</Button>
        </div>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        {versions.length === 0 ? (
          <p className="text-sm text-text-muted">
            No versions yet. Mark one before a big rewrite; one is also kept automatically each time you submit.
          </p>
        ) : (
          <div className="grid sm:grid-cols-[14rem_minmax(0,1fr)] gap-4">
            <ul className="space-y-1" aria-label="Saved versions">
              {versions.map(v => (
                <li key={v.id}>
                  <button
                    type="button"
                    aria-pressed={v.id === selectedId}
                    onClick={() => { setSelectedId(v.id); setConfirmRestore(false); if (compareWith === v.id) setCompareWith(CURRENT); }}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      v.id === selectedId ? 'border-terracotta/50 bg-surface-hover' : 'border-border hover:bg-surface-hover'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-text-muted">v{v.versionNo}</span>
                      {v.kind === 'submitted' && <Badge variant="info">Submitted</Badge>}
                    </span>
                    <span className="block text-sm text-text truncate">{v.label}</span>
                    <span className="block text-[11px] font-mono text-text-muted">
                      {new Date(v.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {selected && (
              <div className="space-y-3 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs text-text-muted flex items-center gap-2">
                    Compare version {selected.versionNo} with
                    <select
                      value={compareWith}
                      onChange={(e) => setCompareWith(e.target.value)}
                      className="bg-surface-hover border border-border rounded-md px-2 py-1 text-xs text-text"
                    >
                      <option value={CURRENT}>Current draft</option>
                      {versions.filter(v => v.id !== selected.id).map(v => (
                        <option key={v.id} value={v.id}>Version {v.versionNo} — {v.label}</option>
                      ))}
                    </select>
                  </label>
                  {confirmRestore ? (
                    <span className="flex items-center gap-2 text-xs text-text-muted">
                      The current draft is kept as a new version first.
                      <Button size="sm" variant="danger" onClick={() => void restore()} isLoading={busy}>Restore</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(false)}>Cancel</Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setConfirmRestore(true)}>
                      Restore version {selected.versionNo}
                    </Button>
                  )}
                </div>

                {changes.length === 0 ? (
                  <p className="text-sm text-text-muted">No differences.</p>
                ) : (
                  <table className="w-full text-sm border-t border-border">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
                        <th className="py-2 pr-3 font-semibold w-36">Field</th>
                        <th className="py-2 pr-3 font-semibold">Version {selected.versionNo}</th>
                        <th className="py-2 font-semibold">{otherName}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map(c => (
                        <tr key={c.label} className="border-t border-border align-top">
                          <td className="py-2 pr-3 text-text-muted">{c.label}</td>
                          <td className="py-2 pr-3 text-text whitespace-pre-wrap break-words">{c.before || <span className="text-text-muted italic">empty</span>}</td>
                          <td className="py-2 text-text whitespace-pre-wrap break-words">{c.after || <span className="text-text-muted italic">empty</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

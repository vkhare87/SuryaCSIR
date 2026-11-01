import { useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Download, UserPlus, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Badge } from './ui/Cards';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { UserPicker } from './ui/UserPicker';
import { generateTemplate, FILE_TYPE_LABELS, type FileType } from '../utils/dataMigration';
import { domainUploadLedger, type UploadStatus } from '../lib/divisions/uploadFreshness';
import { setDataSteward, removeDataSteward } from '../lib/contributions/api';
import { DATA_ADMINS } from '../constants/access';
import type { DirectoryUser } from '../hooks/useUserDirectory';
import type { DataSteward } from '../types';

const STATUS_LABEL: Record<UploadStatus, string> = {
  fresh: 'Fresh',
  stale: 'Stale',
  urgent: 'Urgent',
};

const STATUS_CLASS: Record<UploadStatus, string> = {
  fresh: 'text-archive-green',
  stale: 'text-turmeric',
  urgent: 'text-rose-600 dark:text-rose-400',
};

const inputCls = 'w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text focus:ring-2 focus:ring-brand-blue outline-none';

function downloadTemplate(type: FileType, format: 'xlsx' | 'csv') {
  const blob = generateTemplate(type, format);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${type}-template.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface AssignOwnerModalProps {
  domain: FileType | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function AssignOwnerModal({ domain, onClose, onSaved }: AssignOwnerModalProps) {
  const ids = useId();
  const [person, setPerson] = useState<DirectoryUser | null>(null);
  const [kind, setKind] = useState<DataSteward['kind']>('steward');
  const [cadence, setCadence] = useState('90');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPerson(null);
    setKind('steward');
    setCadence('90');
    setError('');
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!domain) return;
    if (!person) return setError('Pick a person');
    const days = Number(cadence);
    if (!Number.isInteger(days) || days <= 0) return setError('Cadence must be a whole number of days');
    setBusy(true);
    // ponytail: domain-wide owners only; division-scoped rows still display and can be removed.
    const res = await setDataSteward(domain, null, person.userId, kind, days);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? 'Could not assign owner');
    close();
    await onSaved();
  };

  return (
    <Modal isOpen={domain !== null} onClose={close} title={domain ? `Assign owner: ${FILE_TYPE_LABELS[domain]}` : 'Assign owner'}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <span className="block text-xs font-semibold text-text-muted mb-1">Person</span>
          {person ? (
            <div className="flex items-center justify-between px-3 py-2 border border-border rounded-lg text-sm text-text">
              <span className="truncate">{person.name ?? person.email ?? person.userId}</span>
              <button type="button" onClick={() => setPerson(null)} aria-label="Clear person"
                className="p-1 rounded hover:bg-surface-hover text-text-muted">
                <X size={14} />
              </button>
            </div>
          ) : (
            <UserPicker onSelect={setPerson} />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-kind`} className="block text-xs font-semibold text-text-muted mb-1">Role</label>
            <select id={`${ids}-kind`} value={kind} onChange={e => setKind(e.target.value as DataSteward['kind'])} className={inputCls}>
              <option value="steward">Steward (keeps it current)</option>
              <option value="accountable">Accountable (signs off)</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-cadence`} className="block text-xs font-semibold text-text-muted mb-1">Refresh every (days)</label>
            <input id={`${ids}-cadence`} type="number" min={1} step={1} value={cadence}
              onChange={e => setCadence(e.target.value)} className={inputCls} />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
          <Button type="submit" isLoading={busy}>Assign</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Always-visible per-domain upload ledger on Data Management. Upload-recency
 * signal — distinct from lib/divisions/freshness.ts's content-recency signal.
 * See design doc Phase A revision (2026-07-19 /plan-design-review, D2/D3). */
export function DataFreshnessLedger() {
  const { user } = useAuth();
  const { importEvents, dataStewards, staff, contributionRequests, refreshContributions } = useData();
  const { push } = useToast();
  const [assignFor, setAssignFor] = useState<FileType | null>(null);
  const ledger = useMemo(() => domainUploadLedger(importEvents, dataStewards), [importEvents, dataStewards]);
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    staff.forEach(s => { if (s.user_id) m.set(s.user_id, s.Name); });
    return (userId: string) => m.get(userId) ?? 'Unlinked login';
  }, [staff]);
  const unownedCount = useMemo(
    () => contributionRequests.filter(r => r.assigneeId === null && r.status === 'open').length,
    [contributionRequests],
  );
  // Hint only: data_steward_set / data_steward_remove are admin-gated on the server.
  const isAdmin = !!user && user.roles.some(r => DATA_ADMINS.includes(r));

  const remove = async (steward: DataSteward) => {
    if (!window.confirm(`Remove ${nameOf(steward.userId)} as ${steward.kind} for ${FILE_TYPE_LABELS[steward.domain]}?`)) return;
    const res = await removeDataSteward(steward.id);
    if (!res.ok) return push(res.error ?? 'Could not remove owner', 'error');
    await refreshContributions();
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Per-domain data upload freshness, owners and templates</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Domain</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Last Uploaded</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">By</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Status</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Owner</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-muted">Template</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row) => (
              <tr key={row.domain} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-text">{FILE_TYPE_LABELS[row.domain]}</td>
                <td className="px-4 py-3 font-mono [font-variant-numeric:tabular-nums] text-text-muted whitespace-nowrap">
                  {formatDate(row.lastUploadedAt)}
                </td>
                <td className="px-4 py-3 text-text-muted truncate max-w-[200px]">{row.uploadedByEmail ?? '—'}</td>
                <td className={clsx('px-4 py-3 font-semibold', STATUS_CLASS[row.status])}>
                  {STATUS_LABEL[row.status]}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    {row.ownerStatus === 'no-owner' && <Badge variant="neutral">No owner</Badge>}
                    {row.owners.map(o => (
                      <span key={o.id} className="flex items-center gap-1 text-text whitespace-nowrap">
                        {nameOf(o.userId)}
                        <span className="text-xs text-text-muted">
                          {o.kind}{o.divisionCode ? ` · ${o.divisionCode}` : ''} · {o.cadenceDays}d
                        </span>
                        {isAdmin && (
                          <button type="button" onClick={() => remove(o)} aria-label={`Remove ${nameOf(o.userId)} as owner`}
                            className="p-2 rounded hover:bg-surface-hover text-text-muted">
                            <X size={14} />
                          </button>
                        )}
                      </span>
                    ))}
                    {isAdmin && (
                      <Button variant="ghost" size="sm" className="gap-1.5 min-h-[44px] whitespace-nowrap" onClick={() => setAssignFor(row.domain)}>
                        <UserPlus size={14} /> Assign owner
                      </Button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-[44px]"
                    onClick={() => downloadTemplate(row.domain, 'xlsx')}
                  >
                    <span className="text-archive-green flex items-center gap-1.5">
                      <Download size={14} /> Template
                    </span>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-border text-sm">
        <Link to="/work?tab=unowned" className="text-brand-blue hover:underline">
          Unowned requests: <span className="font-mono [font-variant-numeric:tabular-nums]">{unownedCount}</span>
        </Link>
      </div>
      <AssignOwnerModal domain={assignFor} onClose={() => setAssignFor(null)} onSaved={refreshContributions} />
    </Card>
  );
}

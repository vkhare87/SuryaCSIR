import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Inbox, X } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Badge } from '../components/ui/Cards';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { UserPicker } from '../components/ui/UserPicker';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { availableActions, changedFields, inboxBucket, isReviewer } from '../lib/contributions/state';
import { actOnContributionRequest, listRequestEvents } from '../lib/contributions/api';
import { updateEntityRecord } from '../lib/data/entityWrite';
import type { WriteResult } from '../lib/data/entityWrite';
import { FIELD_META } from '../utils/dataMigration';
import { DATA_ADMINS } from '../constants/access';
import type { DirectoryUser } from '../hooks/useUserDirectory';
import type { ContributionAction, ContributionEvent, ContributionRequest, ContributionStatus } from '../types';

type Bucket = 'todo' | 'review' | 'unowned' | 'done';

// Same rule as the contribution_requests.link CHECK; kept here in case a row predates it.
const safeLink = (l: string | null) => (l && /^\/([^/\\]|$)/.test(l) ? l : null);

const ACTION_LABEL: Record<ContributionAction, string> = {
  delegate: 'Delegate',
  submit: 'Submit update',
  confirm: 'Confirm and send for review',
  confirm_unchanged: 'Still correct',
  clarify: 'Ask for clarification',
  answer: 'Answer',
  not_mine: 'Not mine',
  cannot_provide: 'Cannot provide',
  accept: 'Accept',
  return: 'Return',
  withdraw: 'Withdraw',
  claim: 'Claim',
};
const NOTE_ACTIONS: ContributionAction[] = ['clarify', 'answer', 'cannot_provide', 'return', 'withdraw'];
// submit and accept have their own forms below; the rest are plain buttons.
const BUTTON_ORDER: ContributionAction[] = [
  'confirm', 'confirm_unchanged', 'delegate', 'claim', 'clarify', 'answer', 'not_mine', 'cannot_provide', 'return', 'withdraw',
];

const STATUS_BADGE: Record<ContributionStatus, { label: string; variant: 'info' | 'warning' | 'success' | 'neutral' | 'danger' }> = {
  open:                { label: 'Open',          variant: 'warning' },
  prepared:            { label: 'Prepared',      variant: 'info' },
  submitted:           { label: 'Submitted',     variant: 'info' },
  needs_clarification: { label: 'Clarification', variant: 'warning' },
  blocked:             { label: 'Blocked',       variant: 'danger' },
  done:                { label: 'Done',          variant: 'success' },
  declined:            { label: 'Declined',      variant: 'neutral' },
};

const TABS: { value: Bucket; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'review', label: 'To review' },
  { value: 'unowned', label: 'Unowned' },
  { value: 'done', label: 'Done' },
];

const inputCls = 'w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text focus:ring-2 focus:ring-brand-blue outline-none';
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const day = (iso: string) => iso.slice(0, 10);

export default function MyWork() {
  const { user } = useAuth();
  const { contributionRequests, dataStewards, staff, refreshContributions } = useData();
  const [params] = useSearchParams();
  const selectedId = params.get('r');
  const [tab, setTab] = useState<Bucket | null>(null);

  const userId = user?.id ?? '';
  const roles = useMemo(() => user?.roles ?? [], [user?.roles]);
  const isAdmin = useMemo(() => roles.some(r => DATA_ADMINS.includes(r)), [roles]);
  const showUnowned = useMemo(
    () => isAdmin || dataStewards.some(s => s.userId === userId),
    [isAdmin, dataStewards, userId],
  );

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    staff.forEach(s => { if (s.user_id) m.set(s.user_id, s.Name); });
    return (id: string | null) => (id ? m.get(id) ?? 'Unknown user' : '—');
  }, [staff]);

  const buckets = useMemo(() => {
    const out: Record<Bucket, ContributionRequest[]> = { todo: [], review: [], unowned: [], done: [] };
    const byDue = (a: ContributionRequest, b: ContributionRequest) =>
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.createdAt.localeCompare(a.createdAt);
    for (const r of [...contributionRequests].sort(byDue)) {
      const reviewer = isReviewer(r, userId, roles, dataStewards);
      let b = inboxBucket(r, userId, reviewer);
      // Without the Unowned tab, a requester still tracks their orphaned request.
      if (b === 'unowned' && !showUnowned) b = reviewer ? 'review' : null;
      if (b) out[b].push(r);
    }
    return out;
  }, [contributionRequests, userId, roles, dataStewards, showUnowned]);

  const selected = useMemo(
    () => (selectedId ? contributionRequests.find(r => r.id === selectedId) ?? null : null),
    [contributionRequests, selectedId],
  );
  const selectedBucket = useMemo(
    () => (selected ? (Object.keys(buckets) as Bucket[]).find(b => buckets[b].includes(selected)) ?? null : null),
    [buckets, selected],
  );
  const tabs = TABS.filter(t => t.value !== 'unowned' || showUnowned);
  const paramTab = tabs.find(t => t.value === params.get('tab'))?.value ?? null;
  const activeTab = tab ?? selectedBucket ?? paramTab ?? 'todo';

  if (!user) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
      className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-[500] text-text font-serif">My Work</h1>
        <p className="text-sm text-text-muted mt-1">Data requests for you to complete, review or pick up.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Tabs value={activeTab} onValueChange={v => setTab(v as Bucket)} className="space-y-4 min-w-0">
          <TabsList className="flex flex-wrap">
            {tabs.map(t => (
              <TabsTrigger key={t.value} value={t.value} className="px-3">
                {t.label} <span className="font-mono text-text-muted">{buckets[t.value].length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map(t => (
            <TabsContent key={t.value} value={t.value}>
              {buckets[t.value].length === 0 ? (
                <EmptyState icon={Inbox} title="Nothing here" description="Requests will appear here when they need you." />
              ) : (
                <Card className="p-0 overflow-hidden">
                  <ul className="divide-y divide-border">
                    {buckets[t.value].map(r => (
                      <li key={r.id}>
                        <Link to={`/work?r=${r.id}`}
                          className={clsx('block px-4 py-3 hover:bg-surface-hover transition-colors',
                            r.id === selectedId && 'bg-surface-hover')}>
                          <div className="flex items-center gap-2">
                            <p className="flex-1 min-w-0 text-sm font-medium text-text truncate">{r.title}</p>
                            <Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge>
                          </div>
                          <p className="text-xs text-text-muted mt-0.5">
                            {r.domain}{r.recordRef ? ` · ${r.recordRef}` : ''}
                            {r.dueDate && <> · Due <span className="font-mono">{r.dueDate}</span></>}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <div className="min-w-0">
          {selectedId && !selected ? (
            <Card className="p-5 space-y-3">
              <p className="text-sm text-text">Request not found or not shared with you</p>
              <Link to="/work" className="inline-flex items-center gap-1 text-sm text-brand-blue hover:underline">
                <ArrowLeft size={14} /> Back to My Work
              </Link>
            </Card>
          ) : selected ? (
            <RequestPanel key={selected.id} r={selected} userId={userId} isAdmin={isAdmin}
              nameOf={nameOf} onDone={refreshContributions} />
          ) : (
            <EmptyState title="Select a request" description="Pick a request from the list to see its details." />
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface RequestPanelProps {
  r: ContributionRequest;
  userId: string;
  isAdmin: boolean;
  nameOf: (id: string | null) => string;
  onDone: () => Promise<void>;
}

function RequestPanel({ r, userId, isAdmin, nameOf, onDone }: RequestPanelProps) {
  const { user } = useAuth();
  const { dataStewards } = useData();
  const { push } = useToast();
  const [events, setEvents] = useState<ContributionEvent[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>(
    () => Object.fromEntries(Object.entries(r.prefill).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])),
  );
  const [note, setNote] = useState('');
  const [target, setTarget] = useState<DirectoryUser | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listRequestEvents(r.id).then(ev => { if (!cancelled) setEvents(ev); });
    return () => { cancelled = true; };
  }, [r.id, r.status]);

  const labels = useMemo(
    () => new Map(FIELD_META[r.domain].map(f => [f.column, f.label])),
    [r.domain],
  );
  const actions = useMemo(() => {
    const roles = user?.roles ?? [];
    const reviewer = isReviewer(r, userId, roles, dataStewards);
    const canClaim = isAdmin || dataStewards.some(s => s.userId === userId && s.domain === r.domain
      && (s.divisionCode === null || s.divisionCode === r.divisionCode));
    return availableActions(r, userId, reviewer, canClaim);
  }, [r, userId, user?.roles, isAdmin, dataStewards]);

  const drafted = useMemo(() => changedFields(r.prefill, draft), [r.prefill, draft]);
  // The response holds only changed fields, so compare it against those prefill keys alone.
  const submittedChanges = useMemo(() => {
    const resp = r.response ?? {};
    return changedFields(Object.fromEntries(Object.keys(resp).map(k => [k, r.prefill[k]])), resp);
  }, [r.prefill, r.response]);

  const run = async (action: ContributionAction) => {
    setError('');
    const needsNote = NOTE_ACTIONS.includes(action);
    if (needsNote && !note.trim()) return setError('A note is required');
    if (action === 'delegate' && !target) return setError('Choose a person to delegate to');
    setBusy(true);
    let res: WriteResult;
    if (action === 'submit') {
      if (drafted.length === 0) {
        setBusy(false);
        return setError('Nothing changed. Use "Still correct" if the record is right.');
      }
      res = await actOnContributionRequest(r.id, 'submit', {
        response: Object.fromEntries(drafted.map(c => [c.field, c.to])),
      });
    } else {
      if (action === 'accept' && submittedChanges.length > 0 && r.recordRef) {
        const patch = Object.fromEntries(submittedChanges.map(c => [c.field, c.to === '' ? null : c.to]));
        const write = await updateEntityRecord(r.domain, r.recordRef, patch);
        if (!write.ok) {
          setBusy(false);
          return setError(`Could not update the record: ${write.error}`);
        }
      }
      res = await actOnContributionRequest(r.id, action, {
        note: needsNote ? note.trim() : undefined,
        target: action === 'delegate' || action === 'claim' ? target?.userId : undefined,
      });
    }
    setBusy(false);
    if (!res.ok) return setError(res.error);
    push(`${ACTION_LABEL[action]}: done`, 'success');
    setNote('');
    setTarget(null);
    await onDone();
  };

  const buttons = BUTTON_ORDER.filter(a => actions.includes(a));
  const showNote = actions.some(a => NOTE_ACTIONS.includes(a));
  const showPicker = actions.includes('delegate') || actions.includes('claim');
  const link = safeLink(r.link);

  return (
    <Card className="p-5 space-y-5">
      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <h2 className="flex-1 min-w-0 text-lg font-semibold text-text break-words">{r.title}</h2>
          <Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge>
        </div>
        <p className="text-sm text-text">{r.reason}</p>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><dt className="text-xs text-text-muted">Asked by</dt>
          <dd className="text-text">{r.requestedBy ? nameOf(r.requestedBy) : 'SURYA data check'}</dd></div>
        <div><dt className="text-xs text-text-muted">Assigned to</dt>
          <dd className="text-text">{r.assigneeId ? nameOf(r.assigneeId) : 'Unowned'}
            {r.delegateId && <span className="text-text-muted"> (delegated to {nameOf(r.delegateId)})</span>}</dd></div>
        <div><dt className="text-xs text-text-muted">Due</dt>
          <dd className="text-text font-mono">{r.dueDate ?? '—'}</dd></div>
        <div><dt className="text-xs text-text-muted">Record</dt>
          <dd className="text-text">
            {link ? (
              <Link to={link} className="inline-flex items-center gap-1 text-brand-blue hover:underline">
                Open record <ExternalLink size={12} />
              </Link>
            ) : show(r.recordRef)}
          </dd></div>
      </dl>

      {actions.includes('submit') && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-text">Update the record</h3>
          {Object.keys(r.prefill).map(field => {
            const label = labels.get(field) ?? field;
            return (
              <div key={field} className="grid gap-2 sm:grid-cols-2 sm:items-center">
                <div className="text-sm">
                  <p className="text-xs font-semibold text-text-muted">{label}</p>
                  <p className="text-text break-words">{show(r.prefill[field])}
                    <span className="text-xs text-text-muted"> as of <span className="font-mono">{day(r.createdAt)}</span></span></p>
                </div>
                <input aria-label={`New ${label}`} value={draft[field] ?? ''} className={inputCls}
                  onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))} />
              </div>
            );
          })}
          {drafted.length > 0 && <ChangeTable changes={drafted} labels={labels} />}
          <div className="flex justify-end">
            <Button onClick={() => run('submit')} isLoading={busy}>{ACTION_LABEL.submit}</Button>
          </div>
        </section>
      )}

      {r.response && r.status !== 'open' && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-text">Submitted changes</h3>
          {submittedChanges.length > 0
            ? <ChangeTable changes={submittedChanges} labels={labels} />
            : <p className="text-sm text-text-muted">Confirmed with no changes.</p>}
          {actions.includes('accept') && (
            <div className="flex justify-end">
              <Button onClick={() => run('accept')} isLoading={busy}>{ACTION_LABEL.accept}</Button>
            </div>
          )}
        </section>
      )}

      {(showNote || showPicker || buttons.length > 0) && (
        <section className="space-y-3">
          {showPicker && (
            <div>
              <span className="block text-xs font-semibold text-text-muted mb-1">Person</span>
              {target ? (
                <div className="flex items-center justify-between px-3 py-2 border border-border rounded-lg text-sm text-text">
                  <span className="truncate">{target.name ?? target.email ?? target.userId}</span>
                  <button type="button" onClick={() => setTarget(null)} aria-label="Clear person"
                    className="p-1 rounded hover:bg-surface-hover text-text-muted"><X size={14} /></button>
                </div>
              ) : (
                <UserPicker onSelect={setTarget} excludeIds={[userId]}
                  placeholder={actions.includes('claim') ? 'Claim for someone, or leave empty for yourself' : 'Search a person'} />
              )}
            </div>
          )}
          {showNote && (
            <div>
              <label htmlFor={`note-${r.id}`} className="block text-xs font-semibold text-text-muted mb-1">Note</label>
              <textarea id={`note-${r.id}`} rows={3} value={note} onChange={e => setNote(e.target.value)}
                placeholder="Needed to clarify, answer, return, withdraw or decline" className={inputCls + ' resize-y'} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {buttons.map(a => (
              <Button key={a} variant={a === 'withdraw' || a === 'cannot_provide' ? 'ghost' : 'secondary'}
                size="sm" disabled={busy} onClick={() => run(a)}>
                {ACTION_LABEL[a]}
              </Button>
            ))}
          </div>
        </section>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text">History</h3>
        {events.length === 0 ? (
          <p className="text-sm text-text-muted">No events yet.</p>
        ) : (
          <ol className="space-y-2 border-l border-border pl-4">
            {events.map(ev => (
              <li key={ev.id} className="text-sm">
                <p className="text-text">
                  <span className="font-medium">{ev.action === 'created' ? 'Created' : ACTION_LABEL[ev.action]}</span>
                  <span className="text-text-muted"> by {ev.actorId ? nameOf(ev.actorId) : 'SURYA'} · </span>
                  <span className="font-mono text-xs text-text-muted">{day(ev.createdAt)}</span>
                </p>
                {ev.note && <p className="text-text-muted break-words">{ev.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </Card>
  );
}

function ChangeTable({ changes, labels }: {
  changes: { field: string; from: unknown; to: unknown }[];
  labels: Map<string, string>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-text-muted border-b border-border">
            <th className="py-1.5 pr-3 font-semibold">Field</th>
            <th className="py-1.5 pr-3 font-semibold">Before</th>
            <th className="py-1.5 font-semibold">After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {changes.map(c => (
            <tr key={c.field}>
              <td className="py-1.5 pr-3 text-text">{labels.get(c.field) ?? c.field}</td>
              <td className="py-1.5 pr-3 text-text-muted break-words">{show(c.from)}</td>
              <td className="py-1.5 text-text break-words">{show(c.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

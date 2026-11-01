import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { UserPicker } from './ui/UserPicker';
import { createContributionRequest } from '../lib/contributions/api';
import { FIELD_META } from '../utils/dataMigration';
import { PK_FIELD } from '../lib/data/entityWrite';
import { DATA_ADMINS } from '../constants/access';
import type { DirectoryUser } from '../hooks/useUserDirectory';
import type { FileType } from '../utils/fileTypes';
import type { Role } from '../types';

interface RequestUpdateButtonProps {
  domain: FileType;
  recordRef: string;
  divisionCode: string | null;
  record: object; // typed entity interfaces lack an index signature
  defaultTitle: string;
}

const REQUESTER_ROLES: Role[] = ['Director', 'DivisionHead', 'HOD', ...DATA_ADMINS];
const inputCls = 'w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text focus:ring-2 focus:ring-brand-blue outline-none';

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}

export function RequestUpdateButton({ domain, recordRef, divisionCode, record, defaultTitle }: RequestUpdateButtonProps) {
  const { user } = useAuth();
  const { dataStewards, refreshContributions } = useData();
  const { push } = useToast();
  const { pathname } = useLocation();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [reason, setReason] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState<DirectoryUser | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Hint only: contribution_request_create decides.
  const canRequest = !!user && (
    user.roles.some(r => REQUESTER_ROLES.includes(r))
    || dataStewards.some(s => s.userId === user.id && s.domain === domain
      && (s.divisionCode === null || s.divisionCode === divisionCode))
  );
  if (!canRequest) return null;

  const close = () => {
    setOpen(false);
    setTitle(defaultTitle);
    setReason('');
    setDueDate('');
    setAssignee(null);
    setError('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Title is required');
    if (!reason.trim()) return setError('Reason is required');
    setBusy(true);
    const res = await createContributionRequest({
      domain,
      recordRef,
      divisionCode,
      title: title.trim(),
      reason: reason.trim(),
      link: pathname.startsWith('/') && !pathname.startsWith('//') ? pathname : null,
      dueDate: dueDate || null,
      prefill: Object.fromEntries(FIELD_META[domain].filter(f => f.column !== PK_FIELD[domain])
        .map(f => [f.column, (record as Record<string, unknown>)[f.column] ?? null])),
      assigneeId: assignee?.userId ?? null,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? 'Could not send request');
    push('Request sent', 'success');
    close();
    await refreshContributions();
  };

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)} className="gap-1.5">
        <Send size={14} /> Request update
      </Button>
      <Modal isOpen={open} onClose={close} title="Request an update">
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field id={`${ids}-title`} label="Title">
            <input id={`${ids}-title`} value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
          </Field>
          <Field id={`${ids}-reason`} label="Reason">
            <textarea id={`${ids}-reason`} rows={3} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="What is missing or out of date?" className={inputCls + ' resize-y'} />
          </Field>
          <Field id={`${ids}-due`} label="Due date">
            <input id={`${ids}-due`} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
          </Field>
          <div>
            <span className="block text-xs font-semibold text-text-muted mb-1">Assign to</span>
            {assignee ? (
              <div className="flex items-center justify-between px-3 py-2 border border-border rounded-lg text-sm text-text">
                <span className="truncate">{assignee.name ?? assignee.email ?? assignee.userId}</span>
                <button type="button" onClick={() => setAssignee(null)} aria-label="Clear assignee"
                  className="p-1 rounded hover:bg-surface-hover text-text-muted">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <UserPicker onSelect={setAssignee} placeholder="Search a person, or leave empty" />
                <p className="text-xs text-text-muted mt-1">Empty = route to data steward</p>
              </>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" isLoading={busy}>Send request</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

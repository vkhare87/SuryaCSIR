import { useMemo, useState } from 'react';
import { Bell, CheckCircle2, Plus } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useHome } from '../../../contexts/HomeContext';
import { noticeIssue, noticeMarkRead, type NoticeItem } from '../../../lib/home/stage3Api';

const ISSUER_ROLES = new Set(['Director', 'MasterAdmin', 'SystemAdmin', 'HRAdmin', 'PME', 'HOD', 'DivisionHead']);

export function NoticesBlock() {
  const { user, activeRole } = useAuth();
  const { notices = [], refreshHome } = useHome();
  const [showForm, setShowForm] = useState(false);
  const [noticeNo, setNoticeNo] = useState('');
  const [kind, setKind] = useState<NoticeItem['kind']>('NOTICE');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mustAck, setMustAck] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canIssue = Boolean(activeRole && ISSUER_ROLES.has(activeRole));

  const ordered = useMemo(() => {
    return [...notices].sort((a, b) => {
      const aNeed = a.must_ack && !a.acked_at ? 0 : 1;
      const bNeed = b.must_ack && !b.acked_at ? 0 : 1;
      if (aNeed !== bNeed) return aNeed - bNeed;
      return b.issued_on.localeCompare(a.issued_on);
    });
  }, [notices]);

  const handleAck = async (n: NoticeItem) => {
    setBusyId(n.id);
    setErr(null);
    try {
      await noticeMarkRead(n.id, n.must_ack);
      await refreshHome();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to acknowledge notice');
    } finally {
      setBusyId(null);
    }
  };

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noticeNo.trim() || !title.trim()) return;
    setBusyId('__new__');
    setErr(null);
    try {
      const isHodOnly = activeRole === 'HOD' || activeRole === 'DivisionHead';
      const audience = isHodOnly && user?.divisionCode
        ? { scope: 'DIVISIONS', divisions: [user.divisionCode] }
        : { scope: 'ALL' };
      await noticeIssue({
        noticeNo: noticeNo.trim(),
        kind,
        title: title.trim(),
        body: body.trim(),
        audience,
        mustAck,
      });
      setNoticeNo('');
      setTitle('');
      setBody('');
      setMustAck(false);
      setShowForm(false);
      await refreshHome();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to issue notice');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="Notices" className="rounded-xl border border-border bg-surface p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Bell size={13} /> Notices
        </h2>
        {canIssue && (
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="text-xs text-terracotta hover:underline inline-flex items-center gap-0.5"
          >
            <Plus size={12} /> Issue
          </button>
        )}
      </div>

      {err && <p className="text-xs text-error-crimson">{err}</p>}

      {showForm && (
        <form onSubmit={handleIssue} className="space-y-2 border border-border rounded-lg p-2.5 bg-background">
          <div className="flex gap-2">
            <input
              type="text"
              value={noticeNo}
              onChange={(e) => setNoticeNo(e.target.value)}
              placeholder="Order no."
              className="w-28 px-2 py-1 rounded border border-border bg-surface text-xs font-mono text-text"
              required
            />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as NoticeItem['kind'])}
              className="flex-1 px-2 py-1 rounded border border-border bg-surface text-xs text-text"
            >
              <option value="NOTICE">Notice</option>
              <option value="OFFICE_ORDER">Office Order</option>
              <option value="CIRCULAR">Circular</option>
              <option value="EVENT">Event</option>
            </select>
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full px-2 py-1 rounded border border-border bg-surface text-xs text-text"
            required
          />
          <textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Summary..."
            className="w-full px-2 py-1 rounded border border-border bg-surface text-xs text-text"
          />
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-1.5 text-xs text-text-muted">
              <input type="checkbox" checked={mustAck} onChange={(e) => setMustAck(e.target.checked)} />
              Must acknowledge
            </label>
            <button
              type="submit"
              disabled={busyId === '__new__'}
              className="px-2.5 py-1 rounded bg-terracotta text-ivory text-xs font-semibold disabled:opacity-50"
            >
              Publish
            </button>
          </div>
        </form>
      )}

      {ordered.length === 0 ? (
        <p className="text-xs text-text-muted">No notices this week.</p>
      ) : (
        <ul className="space-y-2">
          {ordered.slice(0, 5).map((n) => {
            const done = n.must_ack ? Boolean(n.acked_at) : Boolean(n.read_at);
            return (
              <li key={n.id} className="text-xs border-b border-border pb-2 last:border-0 last:pb-0 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-text truncate">
                      {n.superseded_by && <span className="line-through text-text-muted mr-1">{n.title}</span>}
                      {!n.superseded_by && n.title}
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-text-muted">
                      {n.notice_no} · {n.issued_on}
                    </p>
                  </div>
                  {!done ? (
                    <button
                      type="button"
                      disabled={busyId === n.id}
                      onClick={() => handleAck(n)}
                      className="shrink-0 px-2 py-0.5 rounded border border-border text-[11px] text-terracotta hover:bg-surface-hover"
                    >
                      {n.must_ack ? 'Acknowledge' : 'I read it'}
                    </button>
                  ) : (
                    <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] text-archive-green">
                      <CheckCircle2 size={11} /> Read
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

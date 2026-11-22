import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, Check, Eye, Flag } from 'lucide-react';
import { useHome } from '../../../contexts/HomeContext';
import { Card } from '../../ui/Cards';
import { priorityDone, priorityPushBack, prioritySeen } from '../../../lib/home/stage3Api';

export function DoFirstStrip() {
  const { priorities = [], refreshHome } = useHome();
  const [pushId, setPushId] = useState<string | null>(null);
  const [pushReason, setPushReason] = useState('');
  const [pushDate, setPushDate] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Rule: with no open priority, block 3 is not rendered
  if (priorities.length === 0) return null;

  const shown = priorities.slice(0, 3);

  const handleSeen = async (id: string) => {
    setBusyId(id);
    setErr(null);
    try {
      await prioritySeen(id);
      await refreshHome();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to mark seen');
    } finally {
      setBusyId(null);
    }
  };

  const handleDone = async (id: string) => {
    setBusyId(id);
    setErr(null);
    try {
      await priorityDone(id);
      await refreshHome();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to mark done');
    } finally {
      setBusyId(null);
    }
  };

  const handlePushBack = async (id: string) => {
    if (!pushReason.trim() || !pushDate) return;
    setBusyId(id);
    setErr(null);
    try {
      await priorityPushBack(id, pushReason.trim(), pushDate);
      setPushId(null);
      setPushReason('');
      setPushDate('');
      await refreshHome();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to submit push-back');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-2 border-turmeric">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-turmeric flex items-center gap-1.5">
          <Flag size={13} /> Do first ({priorities.length})
        </h2>
        <span className="text-[11px] text-text-muted font-mono tabular-nums">Max 3 pinned</span>
      </div>

      {err && <p className="text-xs text-error-crimson">{err}</p>}

      <ul className="space-y-2.5">
        {shown.map((p, idx) => (
          <li key={p.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-text">{p.title}</p>
                <p className="text-xs text-text-muted">{p.reason}</p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <span className="block text-[11px] font-mono tabular-nums text-text-muted">
                  By {p.wanted_by}
                </span>
                {p.pushback_at && (
                  <span className="block text-[11px] font-mono text-turmeric">
                    {p.pushback_answer === 'ACCEPTED'
                      ? 'Date moved'
                      : p.pushback_answer === 'KEPT'
                        ? 'Original date kept'
                        : `Proposed ${p.pushback_date}`}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Link
                to={p.link}
                className={
                  idx === 0
                    ? 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold'
                    : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs text-text hover:bg-surface-hover'
                }
              >
                Open <ArrowRight size={12} />
              </Link>
              {!p.seen_at && (
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => handleSeen(p.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs text-text-muted hover:text-text hover:bg-surface-hover"
                >
                  <Eye size={12} /> Seen it
                </button>
              )}
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => {
                  setPushId(pushId === p.id ? null : p.id);
                  setPushDate(p.wanted_by);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs text-text-muted hover:text-text hover:bg-surface-hover"
              >
                <CalendarClock size={12} /> Cannot by then
              </button>
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => handleDone(p.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs text-archive-green hover:bg-surface-hover"
              >
                <Check size={12} /> Mark done
              </button>
            </div>

            {pushId === p.id && (
              <div className="pt-2 border-t border-border flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={pushReason}
                  onChange={(e) => setPushReason(e.target.value)}
                  placeholder="Reason for new date..."
                  className="flex-1 px-2.5 py-1.5 rounded-md border border-border bg-surface text-xs text-text"
                />
                <input
                  type="date"
                  value={pushDate}
                  onChange={(e) => setPushDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-md border border-border bg-surface text-xs text-text font-mono"
                />
                <button
                  type="button"
                  disabled={busyId === p.id || !pushReason.trim() || !pushDate}
                  onClick={() => handlePushBack(p.id)}
                  className="px-3 py-1.5 rounded-md bg-terracotta text-ivory text-xs font-semibold disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

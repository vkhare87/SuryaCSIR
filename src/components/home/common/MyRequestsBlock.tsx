import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useData } from '../../../contexts/DataContext';
import { useHome } from '../../../contexts/HomeContext';
import { filterUnclaimed } from '../../../lib/home/claimedKeys';

interface RequestRow {
  key: string;
  title: string;
  holder: string;
  link: string;
}

export function MyRequestsBlock() {
  const { user } = useAuth();
  const { tickets, contributionRequests } = useData();
  const { claimedKeys, myRequestsItems, todayIso } = useHome();

  const rows = useMemo<RequestRow[]>(() => {
    if (myRequestsItems && myRequestsItems.length > 0) {
      const todayMs = Date.parse(`${todayIso}T00:00:00Z`);
      return myRequestsItems.map((r, idx) => {
        const sinceMs = Date.parse(r.holderSince || r.askedAt);
        const daysAtHolder = Number.isNaN(sinceMs) || Number.isNaN(todayMs)
          ? 0
          : Math.max(0, Math.floor((todayMs - sinceMs) / 86400000));
        const late = daysAtHolder > r.normDays * 2;
        return {
          key: `${r.kind}-${idx}-${r.link}`,
          title: r.title,
          holder: `${r.holderLabel}${daysAtHolder > 0 ? ` · ${daysAtHolder}d` : ''}${late ? ' (late)' : ''}`,
          link: r.link,
        };
      });
    }
    if (!user) return [];
    const out: RequestRow[] = [];
    for (const t of tickets) {
      if (t.submitted_by === user.id && t.status !== 'Closed') {
        out.push({
          key: `ticket-${t.id}`,
          title: t.subject,
          holder: t.assigned_to ? 'Assigned' : 'Routing',
          link: `/helpdesk/${t.id}`,
        });
      }
    }
    for (const c of contributionRequests) {
      if (c.requestedBy === user.id && c.status !== 'done' && c.status !== 'declined') {
        out.push({
          key: `contribution-${c.id}`,
          title: c.title,
          holder: c.status,
          link: `/work?r=${c.id}`,
        });
      }
    }
    return out;
  }, [myRequestsItems, todayIso, user, tickets, contributionRequests]);

  const { visible, hiddenCount } = useMemo(
    () => filterUnclaimed(rows, (r) => r.key, claimedKeys),
    [rows, claimedKeys],
  );

  const shown = visible.slice(0, 5);

  return (
    <section aria-label="My requests" className="rounded-xl border border-border bg-surface p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Inbox size={13} /> My requests
        </h2>
        <div className="flex items-center gap-2">
          <Link to="/helpdesk/new" className="text-xs text-text-muted hover:text-text hover:underline">
            Raise
          </Link>
          <Link to="/helpdesk" className="text-xs text-text-muted hover:text-text hover:underline">
            See all
          </Link>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-xs text-text-muted">
          {hiddenCount > 0 ? `+${hiddenCount} on the left.` : 'No open requests.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-2 text-xs">
              <Link to={r.link} className="text-text hover:underline truncate">
                {r.title}
              </Link>
              <span className="font-mono text-[11px] text-text-muted shrink-0">{r.holder}</span>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 0 && hiddenCount > 0 && (
        <p className="text-[11px] text-text-muted font-mono tabular-nums">+{hiddenCount} on the left</p>
      )}
    </section>
  );
}

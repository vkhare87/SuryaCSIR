import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { useHome } from '../../../contexts/HomeContext';
import { filterUnclaimed } from '../../../lib/home/claimedKeys';

export function WaitingOnMeBlock() {
  const { decisions = [], rankedActions, claimedKeys } = useHome();

  const { visible } = useMemo(
    () => filterUnclaimed(rankedActions, (a) => a.id, claimedKeys),
    [rankedActions, claimedKeys],
  );

  // Prefer unified SQL my_decisions() queue when populated; otherwise show unclaimed local actions
  const hasDecisions = decisions.length > 0;
  const totalCount = hasDecisions ? decisions.length : visible.length;

  // Rule 3: conditional block is absent from DOM when empty
  if (totalCount === 0) return null;

  return (
    <section aria-label="Waiting on me" className="rounded-xl border border-border bg-surface p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Clock size={13} /> Waiting on me
          <span className="font-mono tabular-nums text-text">({totalCount})</span>
        </h2>
        <Link to="/work" className="text-xs text-text-muted hover:text-text hover:underline">
          See all
        </Link>
      </div>

      <ul className="space-y-1.5">
        {hasDecisions
          ? decisions.slice(0, 3).map((d) => (
              <li key={`${d.subject_type}:${d.subject_id}`} className="flex items-baseline justify-between gap-2 text-xs">
                <Link to={d.link} className="text-text hover:underline truncate">
                  {d.title}
                </Link>
                <span className="font-mono tabular-nums text-[11px] text-text-muted shrink-0">
                  {d.open_question ? 'With requester' : `${d.days_waiting}d`}
                </span>
              </li>
            ))
          : visible.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-2 text-xs">
                <Link to={a.link} className="text-text hover:underline truncate">
                  {a.label}
                </Link>
                {a.due && (
                  <span className="font-mono tabular-nums text-[11px] text-text-muted shrink-0">
                    {a.due}
                  </span>
                )}
              </li>
            ))}
      </ul>
    </section>
  );
}

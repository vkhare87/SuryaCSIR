import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useData } from '../../../contexts/DataContext';
import { useHome } from '../../../contexts/HomeContext';
import { deriveOwnMeetings } from '../../../lib/dashboard/scientistData';
import { filterUnclaimed } from '../../../lib/home/claimedKeys';

export function MyCommitteesBlock() {
  const { meetings, committeeMembers } = useData();
  const { ownStaffId, claimedKeys } = useHome();

  const ownMeetings = useMemo(() => {
    if (!ownStaffId) return [];
    return deriveOwnMeetings(meetings, committeeMembers, ownStaffId, new Date());
  }, [meetings, committeeMembers, ownStaffId]);

  const { visible } = useMemo(
    () => filterUnclaimed(ownMeetings, (m) => `meeting-${m.id}`, claimedKeys),
    [ownMeetings, claimedKeys],
  );

  // Rule 3: conditional block is absent from DOM when empty
  if (visible.length === 0) return null;

  return (
    <section aria-label="My committees" className="rounded-xl border border-border bg-surface p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Building2 size={13} /> My committees
        </h2>
        <Link to="/committees" className="text-xs text-text-muted hover:text-text hover:underline">
          See all
        </Link>
      </div>

      <ul className="space-y-1.5">
        {visible.slice(0, 5).map((m) => (
          <li key={m.id} className="flex items-baseline justify-between gap-2 text-xs">
            <Link to={`/committees/${m.committee_id}/meetings/${m.id}`} className="text-text hover:underline truncate">
              {m.title}
            </Link>
            <span className="font-mono tabular-nums text-[11px] text-text-muted shrink-0">
              {m.meeting_date}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

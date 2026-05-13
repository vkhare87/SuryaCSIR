import { CalendarClock } from 'lucide-react';
import { amcStatus, AMC_COLORS } from '../../utils/dateUtils';

export function AmcBadge({ dateStr }: { dateStr?: string }) {
  const status = amcStatus(dateStr);
  if (status === 'none') return <span className="text-xs text-text-muted">&mdash;</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${AMC_COLORS[status]}`}>
      <CalendarClock size={10} />
      {dateStr}
    </span>
  );
}

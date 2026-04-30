import type { ReportStatus } from '../../types/pms';
import { STATUS_COLORS } from '../../lib/pms/constants';

export function StatusBadge({ status }: { status: ReportStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

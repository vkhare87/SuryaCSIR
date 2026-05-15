import type { ReportStatus } from '../../types/pms';
import { STATUS_COLORS } from '../../lib/pms/constants';
import { StatusBadge as BaseStatusBadge } from '../ui/StatusBadge';

export function StatusBadge({ status }: { status: ReportStatus }) {
  const c = STATUS_COLORS[status];
  return <BaseStatusBadge label={c.label} bg={c.bg} text={c.text} />;
}

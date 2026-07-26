import type { ReportStatus } from '../../types/pms';
import { StatusSeal } from './StatusSeal';

/**
 * PMS report status. Kept as a named re-export so the six call sites
 * (Reports, ReportView, Index, EvaluatorQueue, CommitteeQueue,
 * AssignEvaluators) did not all need touching — the seal is DESIGN.md R3 and
 * replaces the filled pill wholesale, so there is no case left where the old
 * badge is the right answer.
 */
export function StatusBadge({ status }: { status: ReportStatus }) {
  return <StatusSeal status={status} />;
}

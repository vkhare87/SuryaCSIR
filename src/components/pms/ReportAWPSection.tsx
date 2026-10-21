import { useMemo } from 'react';
import { useAWP } from '../../contexts/AWPContext';
import { useData } from '../../contexts/DataContext';
import { AWPPanel } from './AWPPanel';
import { AWP_STATUS_LABEL, reportingYearFor } from '../../lib/pms/awp';
import type { PMSReport } from '../../types/pms';

interface Props {
  report: Pick<PMSReport, 'scientistId' | 'periodFrom' | 'periodTo'>;
}

/**
 * The approved Part V plan for the report's reporting year — what the
 * committees compare the year's work against (§5.E). Confidential projects
 * stay hidden.
 */
export function ReportAWPSection({ report }: Props) {
  const { awpFor } = useAWP();
  const { staff } = useData();

  const staffId = useMemo(() => staff.find(s => s.user_id === report.scientistId)?.ID ?? null, [staff, report.scientistId]);
  const year = report.periodFrom ? reportingYearFor(new Date(report.periodFrom)) : null;
  const awp = staffId && year ? awpFor(staffId, year) : undefined;

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium text-text">Approved Annual Work Plan</h2>
      {awp?.status === 'APPROVED' ? (
        <AWPPanel awp={awp} hideConfidential />
      ) : (
        <p className="text-sm text-text-muted">
          No approved Annual Work Plan on record{year ? ` for ${year}` : ''}
          {awp ? ` (status: ${AWP_STATUS_LABEL[awp.status]})` : ''}.
        </p>
      )}
    </section>
  );
}

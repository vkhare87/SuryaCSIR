import { useEffect, useState } from 'react';
import { useAWP } from '../../contexts/AWPContext';
import { AWPPanel } from './AWPPanel';
import { AWP_STATUS_LABEL, reportingYearFor } from '../../lib/pms/awp';
import type { PMSAWP, PMSReport } from '../../types/pms';

interface Props {
  report: Pick<PMSReport, 'id' | 'periodFrom'>;
}

/**
 * The approved Part V plan for the report's reporting year — what the
 * committees compare the year's work against (§5.E). Fetched through
 * pms_awp_for_report, which strips confidential projects server-side and
 * works for reviewers who cannot see the scientist's staff row.
 */
export function ReportAWPSection({ report }: Props) {
  const { awpForReport } = useAWP();
  const [awp, setAwp] = useState<PMSAWP | null>(null);
  const [loaded, setLoaded] = useState(false);
  const year = report.periodFrom ? reportingYearFor(new Date(report.periodFrom)) : null;

  useEffect(() => {
    let live = true;
    awpForReport(report.id)
      .then(a => { if (live) setAwp(a); })
      .catch(e => console.error('[awp] committee view failed', e))
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [report.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium text-text">Approved Annual Work Plan</h2>
      {!loaded ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : awp?.status === 'APPROVED' ? (
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

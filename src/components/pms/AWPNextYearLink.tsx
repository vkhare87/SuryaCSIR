import { Link } from 'react-router-dom';
import { useAWP } from '../../contexts/AWPContext';
import { AWP_STATUS_LABEL, nextReportingYear, reportingYearFor } from '../../lib/pms/awp';

/** Wizard step: the AWP for the year after this report, filed separately (§5.E.a.i). */
export function AWPNextYearLink({ periodFrom }: { periodFrom: string | null }) {
  const { myStaffId, awpFor } = useAWP();
  const year = nextReportingYear(reportingYearFor(periodFrom ? new Date(periodFrom) : new Date()));
  const awp = myStaffId ? awpFor(myStaffId, year) : undefined;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-text-muted">
        Submit your Annual Work Plan for {year} together with this self-appraisal (by 15 May). It goes to your
        Reporting Officer and the Director separately from this report.
      </p>
      <p className="text-text">Status: <strong>{awp ? AWP_STATUS_LABEL[awp.status] : 'Not started'}</strong></p>
      <Link to={`/pms/awp?year=${year}`} className="inline-block text-terracotta underline">
        Open my Annual Work Plan for {year}
      </Link>
    </div>
  );
}

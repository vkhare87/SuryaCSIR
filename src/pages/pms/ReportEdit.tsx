import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';
import { ReportWizard } from '../../components/pms/ReportWizard';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import type { PMSReport, PMSReportSection, PMSAnnexure } from '../../types/pms';

type FullReport = PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[] };

export default function ReportEdit() {
  const { id } = useParams<{ id: string }>();
  const { getReport, cycles } = usePMS();
  const navigate = useNavigate();

  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getReport(id)
      .then(r => {
        if (r.status !== 'DRAFT') {
          navigate(`/pms/reports/${id}`, { replace: true });
          return;
        }
        setReport(r);
      })
      .catch(() => navigate('/pms', { replace: true }))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!report) return null;

  const cycle = cycles.find(c => c.id === report.cycleId);
  const cycleOpen = !!(cycle && cycle.status === 'OPEN');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/pms')}>← Back</Button>
        <h1 className="text-2xl font-serif font-medium text-text flex-1">
          {cycle?.name ?? 'Appraisal Report'} — Edit
        </h1>
        {!cycleOpen && (
          <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
            Cycle closed — cannot submit
          </span>
        )}
      </div>
      <ReportWizard report={report} cycleOpen={cycleOpen} />
    </div>
  );
}

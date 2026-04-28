import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import type { PMSReport, PMSReportSection, PMSAnnexure } from '../../types/pms';

type FullReport = PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[] };

export default function ReportView() {
  const { id } = useParams<{ id: string }>();
  const { getReport } = usePMS();
  const navigate = useNavigate();

  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getReport(id)
      .then(r => {
        if (r.status === 'DRAFT') {
          navigate(`/pms/reports/${id}/edit`, { replace: true });
          return;
        }
        setReport(r);
      })
      .catch(() => navigate('/pms', { replace: true }))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/pms')}>← Back</Button>
        <h1 className="text-2xl font-serif font-medium text-text flex-1">
          {report.cycle?.name ?? 'Appraisal Report'}
        </h1>
        <StatusBadge status={report.status} />
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-text-muted">Period: </span>
            <span className="text-text">
              {report.periodFrom && report.periodTo
                ? `${report.periodFrom} – ${report.periodTo}`
                : '—'}
            </span>
          </div>
          <div>
            <span className="text-text-muted">Self Score: </span>
            <span className="text-text">{report.selfScore ?? '—'}</span>
          </div>
          {report.submittedAt && (
            <div>
              <span className="text-text-muted">Submitted: </span>
              <span className="text-text">{new Date(report.submittedAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>

      {report.sections.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-text">Sections</h2>
          {report.sections.map(s => (
            <div key={s.id} className="bg-surface border border-border rounded-xl p-4">
              <p className="text-xs font-mono font-medium text-text-muted mb-2 uppercase tracking-wider">
                {s.sectionKey}
              </p>
              <pre className="text-xs text-text overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(s.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}

      {report.annexures.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-text">Annexures</h2>
          {report.annexures.map(a => (
            <div
              key={a.id}
              className="flex items-center justify-between px-4 py-3 bg-surface border border-border rounded-xl text-sm"
            >
              <span className="text-text">{a.fileName}</span>
              <span className="text-xs text-text-muted">{(a.fileSize / 1024).toFixed(0)} KB</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

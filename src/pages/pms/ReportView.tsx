import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { pdf } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import { usePMS } from '../../contexts/PMSContext';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ReportPDF } from '../../components/pms/ReportPDF';
import type { PMSReport, PMSReportSection, PMSAnnexure, PMSChairmanReview, PMSCommitteeDecision } from '../../types/pms';

type FullReport = PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[] };

export default function ReportView() {
  const { id } = useParams<{ id: string }>();
  const { getReport, getChairmanReview, getCommitteeDecision } = usePMS();
  const navigate = useNavigate();

  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [chairmanReview, setChairmanReview] = useState<PMSChairmanReview | null>(null);
  const [committeeDecision, setCommitteeDecision] = useState<PMSCommitteeDecision | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    getReport(id)
      .then(r => {
        if (r.status === 'DRAFT') {
          navigate(`/pms/reports/${id}/edit`, { replace: true });
          return;
        }
        setReport(r);
        getChairmanReview(id).then(setChairmanReview).catch(() => {});
        getCommitteeDecision(id).then(setCommitteeDecision).catch(() => {});
      })
      .catch(() => navigate('/pms', { replace: true }))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportPDF = async () => {
    if (!report) return;
    setExportLoading(true);
    try {
      const blob = await pdf(
        <ReportPDF
          report={report}
          sections={report.sections}
          annexures={report.annexures}
          finalScore={committeeDecision?.finalScore}
          justification={committeeDecision?.justification}
          recommendedMin={chairmanReview?.recommendedMin}
          recommendedMax={chairmanReview?.recommendedMax}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PMS_Report_${report.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  };

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
        <Button variant="secondary" size="sm" onClick={handleExportPDF} isLoading={exportLoading}>
          <Download size={14} className="mr-1.5" /> Export PDF
        </Button>
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

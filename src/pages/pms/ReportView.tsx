import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { pdf } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import { usePMS } from '../../contexts/PMSContext';
import { useAuth } from '../../contexts/AuthContext';
import { getGrade } from '../../lib/pms/scoring';
import { representationWindowOpen } from '../../lib/pms/deadlines';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { ReportPDF } from '../../components/pms/ReportPDF';
import type { PMSReport, PMSReportSection, PMSAnnexure, PMSAWPActivity, PMSCommitteeDecision } from '../../types/pms';

type FullReport = PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[]; awpActivities: PMSAWPActivity[] };

export default function ReportView() {
  const { id } = useParams<{ id: string }>();
  const { getReport, getCommitteeDecision, submitRepresentation } = usePMS();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [committeeDecision, setCommitteeDecision] = useState<PMSCommitteeDecision | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [showRepresent, setShowRepresent] = useState(false);
  const [grounds, setGrounds] = useState('');
  const [representError, setRepresentError] = useState<string | null>(null);
  const [representing, setRepresenting] = useState(false);

  useEffect(() => {
    if (!id) return;
    getReport(id)
      .then(r => {
        if (r.status === 'DRAFT') {
          navigate(`/pms/reports/${id}/edit`, { replace: true });
          return;
        }
        setReport(r);
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

  const handleRepresent = async () => {
    if (!report) return;
    if (grounds.trim().length < 20) {
      setRepresentError('Please state your grounds in at least 20 characters.');
      return;
    }
    setRepresenting(true);
    setRepresentError(null);
    try {
      await submitRepresentation(report.id, grounds);
      setShowRepresent(false);
      setReport({ ...report, status: 'UNDER_GRIEVANCE_REVIEW' });
    } catch (e) {
      setRepresentError(e instanceof Error ? e.message : 'Failed to submit representation');
    } finally {
      setRepresenting(false);
    }
  };

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!report) return null;

  const canRepresent = user?.id === report.scientistId && representationWindowOpen(report);

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

      {report.systemRemark && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl">
          <span className="font-medium">System remark:</span> {report.systemRemark}
        </div>
      )}

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
            <span className="text-text">
              {report.selfScore != null ? `${report.selfScore} (${getGrade(report.selfScore)})` : '—'}
            </span>
          </div>
          {report.submittedAt && (
            <div>
              <span className="text-text-muted">Submitted: </span>
              <span className="text-text">{new Date(report.submittedAt).toLocaleDateString()}</span>
            </div>
          )}
          {report.dutyDays != null && (
            <div>
              <span className="text-text-muted">Duty Days: </span>
              <span className="text-text">{report.dutyDays}</span>
            </div>
          )}
        </div>
      </div>

      {/* Final decision */}
      {committeeDecision?.finalScore != null && (
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text">Final Decision</h2>
            {canRepresent && (
              <Button size="sm" variant="secondary" onClick={() => { setGrounds(''); setRepresentError(null); setShowRepresent(true); }}>
                Submit Representation
              </Button>
            )}
          </div>
          <p className="text-sm text-text">
            Final score: <strong>{committeeDecision.finalScore}</strong> — Grade:{' '}
            <strong>{getGrade(committeeDecision.finalScore)}</strong>
          </p>
          <p className="text-xs text-text-muted italic">"{committeeDecision.justification}"</p>
          {committeeDecision.reasonsForOutstanding && (
            <p className="text-xs text-text-muted"><span className="font-medium">Reasons for Outstanding:</span> {committeeDecision.reasonsForOutstanding}</p>
          )}
          {committeeDecision.reasonsBelowThreshold && (
            <p className="text-xs text-text-muted"><span className="font-medium">Reasons below threshold:</span> {committeeDecision.reasonsBelowThreshold}</p>
          )}
          {committeeDecision.suggestionsForImprovement && (
            <p className="text-xs text-text-muted"><span className="font-medium">Suggestions:</span> {committeeDecision.suggestionsForImprovement}</p>
          )}
          {canRepresent && (
            <p className="text-xs text-text-muted">
              You may submit a representation within 15 days of the score being communicated.
            </p>
          )}
        </div>
      )}

      {/* Part V: Annual Work Plan */}
      {report.awpActivities.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-text">Part V — Annual Work Plan</h2>
          <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
            {report.awpActivities.map(a => (
              <div key={a.id} className="px-4 py-3 bg-surface text-sm">
                <p className="text-text font-medium">{a.natureOfActivity}</p>
                <p className="text-xs text-text-muted">
                  Role: {a.role} · Time committed: {a.timeCommittedPercentage}%
                </p>
                {a.milestones.length > 0 && (
                  <p className="text-xs text-text-muted mt-0.5">Milestones: {a.milestones.join('; ')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

      <Modal isOpen={showRepresent} onClose={() => setShowRepresent(false)} title="Submit Representation">
        <div className="space-y-4 p-4">
          <p className="text-sm text-text-muted">
            Your representation will be routed to the independent 5-member Grievance Redressal Committee.
          </p>
          <textarea
            rows={5}
            value={grounds}
            onChange={e => setGrounds(e.target.value)}
            placeholder="State the grounds for your representation…"
            className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none"
          />
          {representError && <p className="text-sm text-rose-600">{representError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowRepresent(false)}>Cancel</Button>
            <Button onClick={handleRepresent} isLoading={representing}>Submit</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

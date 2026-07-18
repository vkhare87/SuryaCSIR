import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';
import { useAuth } from '../../contexts/AuthContext';
import { canCommitteeDecide } from '../../lib/pms/permissions';
import { SCORE_RANGE } from '../../lib/pms/constants';
import { getGrade, isValidScore, requiresBelowThresholdReasons, requiresOutstandingReasons } from '../../lib/pms/scoring';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { EvidencePanel } from '../../components/pms/EvidencePanel';
import type { PMSEvaluation, PMSReportSection, PMSAnnexure, PMSReport, ReportStatus } from '../../types/pms';

type ReportDetail = PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[] };

// Display order for the cycle-progress strip — earliest stage first.
const STATUS_ORDER: ReportStatus[] = [
  'DRAFT', 'SUBMITTED', 'UNDER_EVALUATION_COMMITTEE_REVIEW',
  'EMPOWERED_COMMITTEE_REVIEW', 'FINALIZED', 'UNDER_GRIEVANCE_REVIEW', 'NOT_ASSESSED',
];
const STATUS_LABEL: Record<ReportStatus, string> = {
  DRAFT: 'Draft', SUBMITTED: 'Submitted',
  UNDER_EVALUATION_COMMITTEE_REVIEW: 'With Evaluators',
  EMPOWERED_COMMITTEE_REVIEW: 'With Committee',
  FINALIZED: 'Finalized', NOT_ASSESSED: 'Not Assessed',
  UNDER_GRIEVANCE_REVIEW: 'Grievance',
};

export default function CommitteeQueue() {
  const { user } = useAuth();
  const { reports, isLoading, getReportEvaluations, getReport, finalizeReport } = usePMS();

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportEvaluations, setReportEvaluations] = useState<PMSEvaluation[]>([]);
  const [reportDetail, setReportDetail] = useState<ReportDetail | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [finalScore, setFinalScore] = useState('');
  const [justification, setJustification] = useState('');
  const [reasonsOutstanding, setReasonsOutstanding] = useState('');
  const [reasonsBelow, setReasonsBelow] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusCounts = useMemo(
    () => STATUS_ORDER
      .map(s => ({ status: s, count: reports.filter(r => r.status === s).length }))
      .filter(s => s.count > 0),
    [reports],
  );

  if (!user || !canCommitteeDecide(user)) return <Navigate to="/pms" replace />;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const committeeReports = reports.filter(r => r.status === 'EMPOWERED_COMMITTEE_REVIEW');

  const openModal = async (reportId: string) => {
    setSelectedReportId(reportId);
    setFinalScore('');
    setJustification('');
    setReasonsOutstanding('');
    setReasonsBelow('');
    setSuggestions('');
    setError(null);
    setReportDetail(null);
    setLoadingReview(true);
    try {
      const [evals, detail] = await Promise.all([
        getReportEvaluations(reportId),
        getReport(reportId).catch(() => null),
      ]);
      setReportEvaluations(evals.filter(e => e.status === 'COMPLETED'));
      setReportDetail(detail);
    } catch {
      setReportEvaluations([]);
    } finally {
      setLoadingReview(false);
    }
  };

  const parsedScore = finalScore === '' ? null : parseInt(finalScore, 10);
  const needsOutstanding = parsedScore != null && !isNaN(parsedScore) && requiresOutstandingReasons(parsedScore);
  const needsBelow = parsedScore != null && !isNaN(parsedScore) && requiresBelowThresholdReasons(parsedScore);
  const justLen = justification.trim().length;

  const handleFinalize = async () => {
    if (!selectedReportId) return;
    if (parsedScore == null || !isValidScore(parsedScore)) {
      setError(`Score must be a whole number between ${SCORE_RANGE.min} and ${SCORE_RANGE.max}.`);
      return;
    }
    if (justLen < 50) {
      setError('Justification must be at least 50 characters.');
      return;
    }
    if (needsOutstanding && !reasonsOutstanding.trim()) {
      setError('Scores of 90 or above require reasons for the Outstanding grade.');
      return;
    }
    if (needsBelow && (!reasonsBelow.trim() || !suggestions.trim())) {
      setError('Scores of 75 or below require reasons and suggestions for improvement.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await finalizeReport(selectedReportId, {
        finalScore: parsedScore,
        justification,
        reasonsForOutstanding: reasonsOutstanding || undefined,
        reasonsBelowThreshold: reasonsBelow || undefined,
        suggestionsForImprovement: suggestions || undefined,
      });
      setSelectedReportId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Finalization failed');
    } finally {
      setSaving(false);
    }
  };

  const selectedReport = reports.find(r => r.id === selectedReportId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-text">Empowered Committee Queue</h1>
      <p className="text-sm text-text-muted">
        {committeeReports.length} report{committeeReports.length !== 1 ? 's' : ''} awaiting final decision
      </p>

      {statusCounts.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {statusCounts.map(s => (
            <div key={s.status} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-surface text-xs">
              <span className="text-text-muted">{STATUS_LABEL[s.status]}</span>
              <span className="font-semibold text-text tabular-nums">{s.count}</span>
            </div>
          ))}
        </div>
      )}

      {committeeReports.length === 0 ? (
        <div className="py-16 text-center text-text-muted border border-border rounded-2xl">
          No reports awaiting committee decision.
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {committeeReports.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between px-5 py-4 bg-surface hover:bg-surface-hover transition-colors"
            >
              <div>
                <p className="font-medium text-text text-sm">{r.cycle?.name ?? r.cycleId}</p>
                <p className="text-xs text-text-muted mt-0.5 font-mono">
                  Scientist: {r.scientistId.slice(0, 8)}…
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={r.status} />
                <Button size="sm" onClick={() => openModal(r.id)}>Decide</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!selectedReportId}
        onClose={() => setSelectedReportId(null)}
        title="Empowered Committee Decision"
      >
        <div className="space-y-4 p-4">
          <p className="text-sm font-medium text-text-muted">{selectedReport?.cycle?.name}</p>

          {loadingReview ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {/* Evaluation Committee appraisals */}
              <div className="p-4 bg-surface border border-border rounded-xl">
                <h3 className="text-sm font-semibold text-text mb-2">Evaluation Committee Appraisal</h3>
                {reportEvaluations.length > 0 ? (
                  <div className="space-y-1.5">
                    {reportEvaluations.map(ev => (
                      <p key={ev.id} className="text-sm text-text">
                        <span className="font-mono text-xs text-text-muted">{ev.evaluatorId.slice(0, 8)}…</span>{' '}
                        {ev.totalScore != null
                          ? <>scored <strong>{ev.totalScore}</strong> ({getGrade(ev.totalScore)})</>
                          : 'no total score recorded'}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">No completed evaluations on record.</p>
                )}
              </div>

              {/* Institutional evidence — claim corroboration + trajectory */}
              {reportDetail && (
                <EvidencePanel report={reportDetail} sections={reportDetail.sections} />
              )}

              {/* Final score */}
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Final Score ({SCORE_RANGE.min} – {SCORE_RANGE.max}, whole numbers)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={SCORE_RANGE.min}
                    max={SCORE_RANGE.max}
                    step={1}
                    value={finalScore}
                    onChange={e => setFinalScore(e.target.value)}
                    placeholder="0 – 100"
                    className="w-32 px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442]"
                  />
                  {parsedScore != null && !isNaN(parsedScore) && (
                    <span className="text-sm text-text-muted">{getGrade(parsedScore)}</span>
                  )}
                </div>
              </div>

              {needsOutstanding && (
                <div>
                  <label className="block text-sm font-medium text-text mb-1">
                    Reasons for Outstanding grade <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={reasonsOutstanding}
                    onChange={e => setReasonsOutstanding(e.target.value)}
                    placeholder="Mandatory for scores of 90 or above…"
                    className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none"
                  />
                </div>
              )}
              {needsBelow && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text mb-1">
                      Reasons for score below threshold <span className="text-rose-600">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={reasonsBelow}
                      onChange={e => setReasonsBelow(e.target.value)}
                      placeholder="Mandatory for scores of 75 or below…"
                      className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text mb-1">
                      Suggestions for improvement <span className="text-rose-600">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={suggestions}
                      onChange={e => setSuggestions(e.target.value)}
                      placeholder="Mandatory for scores of 75 or below…"
                      className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none"
                    />
                  </div>
                </>
              )}

              {/* Justification */}
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Justification <span className="text-text-muted font-normal">(min 50 characters)</span>
                </label>
                <textarea
                  rows={4}
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                  placeholder="Explain the basis for the final score decision…"
                  className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none"
                />
                <p className={`text-xs mt-1 ${justLen < 50 ? 'text-rose-500' : 'text-green-600'}`}>
                  {justLen}/50 characters minimum
                </p>
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSelectedReportId(null)}>Cancel</Button>
                <Button
                  onClick={handleFinalize}
                  isLoading={saving}
                  disabled={justLen < 50}
                >
                  Finalize Report
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';
import { useAuth } from '../../contexts/AuthContext';
import { canCommitteeDecide } from '../../lib/pms/permissions';
import { SCORE_RANGE, SCORE_CATEGORIES } from '../../lib/pms/constants';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import type { PMSChairmanReview } from '../../types/pms';

function getCategory(score: number): string {
  return SCORE_CATEGORIES.find(c => score >= c.min && score <= c.max)?.label ?? '—';
}

export default function CommitteeQueue() {
  const { user } = useAuth();
  const { reports, isLoading, getChairmanReview, finalizeReport } = usePMS();

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [chairmanReview, setChairmanReview] = useState<PMSChairmanReview | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [finalScore, setFinalScore] = useState('');
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setLoadingReview(true);
    try {
      const review = await getChairmanReview(reportId);
      setChairmanReview(review);
    } catch {
      setChairmanReview(null);
    } finally {
      setLoadingReview(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedReportId) return;
    const score = parseFloat(finalScore);
    if (isNaN(score) || score < SCORE_RANGE.min || score > SCORE_RANGE.max) {
      setError(`Score must be between ${SCORE_RANGE.min} and ${SCORE_RANGE.max}.`);
      return;
    }
    if (justification.trim().length < 50) {
      setError('Justification must be at least 50 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await finalizeReport(selectedReportId, score, justification);
      setSelectedReportId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Finalization failed');
    } finally {
      setSaving(false);
    }
  };

  const selectedReport = reports.find(r => r.id === selectedReportId);
  const justLen = justification.trim().length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-text">Committee Decision Queue</h1>
      <p className="text-sm text-text-muted">
        {committeeReports.length} report{committeeReports.length !== 1 ? 's' : ''} awaiting final decision
      </p>

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
        title="Final Committee Decision"
      >
        <div className="space-y-4 p-4">
          <p className="text-sm font-medium text-text-muted">{selectedReport?.cycle?.name}</p>

          {loadingReview ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              {/* Chairman recommendation */}
              <div className="p-4 bg-surface border border-border rounded-xl">
                <h3 className="text-sm font-semibold text-text mb-2">Chairman's Recommendation</h3>
                {chairmanReview ? (
                  <>
                    <p className="text-sm text-text">
                      Recommended range:{' '}
                      <strong>{chairmanReview.recommendedMin}</strong> – <strong>{chairmanReview.recommendedMax}</strong>
                    </p>
                    {chairmanReview.comments && (
                      <p className="text-xs text-text-muted mt-1 italic">"{chairmanReview.comments}"</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-text-muted">No chairman review on record yet.</p>
                )}
              </div>

              {/* Final score */}
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Final Score ({SCORE_RANGE.min} – {SCORE_RANGE.max})
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={SCORE_RANGE.min}
                    max={SCORE_RANGE.max}
                    step={0.01}
                    value={finalScore}
                    onChange={e => setFinalScore(e.target.value)}
                    placeholder="0.50 – 1.10"
                    className="w-32 px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442]"
                  />
                  {finalScore && !isNaN(parseFloat(finalScore)) && (
                    <span className="text-sm text-text-muted">{getCategory(parseFloat(finalScore))}</span>
                  )}
                </div>
              </div>

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

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';
import { useAuth } from '../../contexts/AuthContext';
import { canChairmanReview } from '../../lib/pms/permissions';
import { EVALUATION_DIMENSIONS, SCORE_RANGE, SCORE_CATEGORIES } from '../../lib/pms/constants';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import type { PMSEvaluation } from '../../types/pms';

function computeAverage(evals: PMSEvaluation[]): number | null {
  const completed = evals.filter(e => e.status === 'COMPLETED');
  if (completed.length === 0) return null;
  const perEval = completed.map(e => {
    const vals = Object.values(e.scores);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }).filter((v): v is number => v !== null);
  return perEval.length > 0 ? perEval.reduce((a, b) => a + b, 0) / perEval.length : null;
}

function getCategory(score: number): string {
  return SCORE_CATEGORIES.find(c => score >= c.min && score <= c.max)?.label ?? '—';
}

export default function ChairmanQueue() {
  const { user } = useAuth();
  const { reports, collegiums, isLoading, getReportEvaluations, saveChairmanReview } = usePMS();

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportEvals, setReportEvals] = useState<PMSEvaluation[]>([]);
  const [loadingEvals, setLoadingEvals] = useState(false);
  const [recMin, setRecMin] = useState('');
  const [recMax, setRecMax] = useState('');
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const allMembers = collegiums.flatMap(c => c.members ?? []);
  if (!canChairmanReview(user, allMembers)) return <Navigate to="/pms" replace />;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const chairmanReports = reports.filter(r => r.status === 'CHAIRMAN_REVIEW');

  const openModal = async (reportId: string) => {
    setSelectedReportId(reportId);
    setRecMin('');
    setRecMax('');
    setComments('');
    setError(null);
    setLoadingEvals(true);
    try {
      const evals = await getReportEvaluations(reportId);
      setReportEvals(evals);
    } catch {
      setReportEvals([]);
    } finally {
      setLoadingEvals(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedReportId) return;
    const min = parseFloat(recMin);
    const max = parseFloat(recMax);
    if (isNaN(min) || isNaN(max)) {
      setError('Enter valid min and max scores.');
      return;
    }
    if (min < SCORE_RANGE.min || max > SCORE_RANGE.max) {
      setError(`Scores must be between ${SCORE_RANGE.min} and ${SCORE_RANGE.max}.`);
      return;
    }
    if (min > max) {
      setError('Minimum must be ≤ maximum.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveChairmanReview(selectedReportId, min, max, comments);
      setSelectedReportId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const avg = computeAverage(reportEvals);
  const selectedReport = reports.find(r => r.id === selectedReportId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-text">Chairman Review Queue</h1>
      <p className="text-sm text-text-muted">
        {chairmanReports.length} report{chairmanReports.length !== 1 ? 's' : ''} awaiting your score range recommendation
      </p>

      {chairmanReports.length === 0 ? (
        <div className="py-16 text-center text-text-muted border border-border rounded-2xl">
          No reports awaiting chairman review.
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {chairmanReports.map(r => (
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
                <Button size="sm" onClick={() => openModal(r.id)}>Review</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!selectedReportId}
        onClose={() => setSelectedReportId(null)}
        title="Recommend Score Range"
      >
        <div className="space-y-4 p-4">
          <p className="text-sm font-medium text-text-muted">{selectedReport?.cycle?.name}</p>

          {loadingEvals ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              {/* Evaluator score summary */}
              <div className="p-4 bg-surface border border-border rounded-xl space-y-2">
                <h3 className="text-sm font-semibold text-text">Evaluator Scores</h3>
                <p className="text-xs text-text-muted">
                  {reportEvals.length} evaluator(s) · {reportEvals.filter(e => e.status === 'COMPLETED').length} completed
                </p>
                {avg != null ? (
                  <p className="text-sm font-medium text-[#c96442]">
                    Average: {avg.toFixed(2)} — {getCategory(avg)}
                  </p>
                ) : (
                  <p className="text-xs text-text-muted">No completed evaluations yet.</p>
                )}
                {reportEvals.filter(e => e.status === 'COMPLETED').length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-border pt-3">
                    {EVALUATION_DIMENSIONS.map(dim => {
                      const dimScores = reportEvals
                        .filter(e => e.status === 'COMPLETED' && e.scores[dim.key] != null)
                        .map(e => e.scores[dim.key]);
                      const dimAvg = dimScores.length > 0
                        ? dimScores.reduce((a, b) => a + b, 0) / dimScores.length
                        : null;
                      return (
                        <div key={dim.key} className="flex justify-between text-xs">
                          <span className="text-text-muted">{dim.label}</span>
                          <span className="font-mono text-text">{dimAvg != null ? dimAvg.toFixed(2) : '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Score range inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Recommended Min</label>
                  <input
                    type="number"
                    min={SCORE_RANGE.min}
                    max={SCORE_RANGE.max}
                    step={0.01}
                    value={recMin}
                    onChange={e => setRecMin(e.target.value)}
                    placeholder="0.50"
                    className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Recommended Max</label>
                  <input
                    type="number"
                    min={SCORE_RANGE.min}
                    max={SCORE_RANGE.max}
                    step={0.01}
                    value={recMax}
                    onChange={e => setRecMax(e.target.value)}
                    placeholder="1.10"
                    className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1">Comments (optional)</label>
                <textarea
                  rows={3}
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  placeholder="Observations for the Empowered Committee…"
                  className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none"
                />
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSelectedReportId(null)}>Cancel</Button>
                <Button onClick={handleSubmit} isLoading={saving}>Submit Range</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';
import { useAuth } from '../../contexts/AuthContext';
import { EVALUATION_DIMENSIONS, SCORE_RANGE, SCORE_CATEGORIES } from '../../lib/pms/constants';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import type { PMSReportSection, PMSAnnexure, PMSReport } from '../../types/pms';

function getCategory(score: number): string {
  return SCORE_CATEGORIES.find(c => score >= c.min && score <= c.max)?.label ?? '—';
}

type ReportDetail = PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[] };

export default function EvaluateReport() {
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const { user } = useAuth();
  const { evaluations, reports, saveEvaluationScores, completeEvaluation, getReport } = usePMS();
  const navigate = useNavigate();

  const evaluation = evaluations.find(e => e.id === evaluationId);
  const report = evaluation ? reports.find(r => r.id === evaluation.reportId) : undefined;

  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<ReportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (evaluation) {
      setScores(evaluation.scores ?? {});
      setComments(evaluation.comments ?? '');
    }
  }, [evaluation]);

  const loadDetail = useCallback(async (reportId: string) => {
    setLoadingDetail(true);
    try {
      const detail = await getReport(reportId);
      setReportDetail(detail);
    } catch {
      // non-critical — summary still visible from report state
    } finally {
      setLoadingDetail(false);
    }
  }, [getReport]);

  useEffect(() => {
    if (evaluation?.reportId) void loadDetail(evaluation.reportId);
  }, [evaluation?.reportId, loadDetail]);

  if (!user) return null;
  if (!evaluation) return <Navigate to="/pms/evaluate" replace />;
  if (evaluation.evaluatorId !== user.id) return <Navigate to="/pms/evaluate" replace />;

  const setScore = (key: string, val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n)) {
      setScores(prev => ({
        ...prev,
        [key]: Math.min(SCORE_RANGE.max, Math.max(SCORE_RANGE.min, n)),
      }));
    } else if (val === '') {
      setScores(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const filledCount = EVALUATION_DIMENSIONS.filter(d => scores[d.key] != null).length;
  const avgScore = filledCount === EVALUATION_DIMENSIONS.length
    ? EVALUATION_DIMENSIONS.reduce((s, d) => s + (scores[d.key] ?? 0), 0) / EVALUATION_DIMENSIONS.length
    : null;

  const handleSave = async (complete: boolean) => {
    if (complete && filledCount < EVALUATION_DIMENSIONS.length) {
      setError('Score all 12 dimensions before submitting.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (complete) {
        await completeEvaluation(evaluation.id, scores, comments);
      } else {
        await saveEvaluationScores(evaluation.id, scores, comments);
      }
      navigate('/pms/evaluate');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const isCompleted = evaluation.status === 'COMPLETED';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-serif font-medium text-text">Evaluation Form</h1>
        <p className="text-sm text-text-muted mt-1">
          {report?.cycle?.name ?? 'Report'} · ID: {evaluation.reportId.slice(0, 8)}…
        </p>
        {isCompleted && (
          <p className="mt-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg inline-block">
            Evaluation submitted — read-only
          </p>
        )}
      </div>

      {/* Report summary */}
      {loadingDetail ? (
        <Skeleton className="h-20 w-full" />
      ) : (reportDetail ?? report) && (
        <div className="p-4 bg-surface border border-border rounded-2xl">
          <h2 className="font-semibold text-sm text-text mb-2">Report Summary</h2>
          <p className="text-xs text-text-muted">
            Period: {(reportDetail ?? report)?.periodFrom ?? '—'} – {(reportDetail ?? report)?.periodTo ?? '—'}
          </p>
          {(reportDetail ?? report)?.selfScore != null && (
            <p className="text-xs text-text-muted">
              Self-score: {(reportDetail ?? report)!.selfScore} ({getCategory((reportDetail ?? report)!.selfScore!)})
            </p>
          )}
        </div>
      )}

      {/* 12-dimension score grid */}
      <div className="space-y-3">
        <h2 className="font-semibold text-text">
          Dimension Scores{' '}
          <span className="text-text-muted font-normal text-sm">
            ({SCORE_RANGE.min} – {SCORE_RANGE.max}) · {filledCount}/{EVALUATION_DIMENSIONS.length} filled
          </span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EVALUATION_DIMENSIONS.map(dim => (
            <div key={dim.key} className="p-4 bg-surface border border-border rounded-xl">
              <label className="block text-sm font-medium text-text mb-0.5">{dim.label}</label>
              <p className="text-xs text-text-muted mb-2">{dim.description}</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={SCORE_RANGE.min}
                  max={SCORE_RANGE.max}
                  step={0.01}
                  value={scores[dim.key] ?? ''}
                  onChange={e => setScore(dim.key, e.target.value)}
                  disabled={isCompleted}
                  placeholder={`${SCORE_RANGE.min}–${SCORE_RANGE.max}`}
                  className="w-24 px-2 py-1.5 border border-border rounded-lg text-sm bg-background text-text focus:outline-none focus:border-[#c96442] disabled:opacity-50"
                />
                {scores[dim.key] != null && (
                  <span className="text-xs text-text-muted">{getCategory(scores[dim.key])}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Overall average */}
      {avgScore != null && (
        <div className="p-4 bg-[#fdf0e8] border border-[#c96442]/20 rounded-2xl">
          <p className="text-sm font-medium text-[#c96442]">
            Overall average: <strong>{avgScore.toFixed(2)}</strong> — {getCategory(avgScore)}
          </p>
        </div>
      )}

      {/* Comments */}
      <div>
        <label className="block text-sm font-medium text-text mb-1">Comments (optional)</label>
        <textarea
          rows={4}
          value={comments}
          onChange={e => setComments(e.target.value)}
          disabled={isCompleted}
          placeholder="Additional observations or remarks…"
          className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none disabled:opacity-50"
        />
      </div>

      {error && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">
          {error}
        </div>
      )}

      {isCompleted ? (
        <Button variant="ghost" onClick={() => navigate('/pms/evaluate')}>Back to Queue</Button>
      ) : (
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => navigate('/pms/evaluate')}>Back</Button>
          <Button variant="secondary" onClick={() => handleSave(false)} isLoading={saving}>
            Save Draft
          </Button>
          <Button
            onClick={() => handleSave(true)}
            isLoading={saving}
            disabled={filledCount < EVALUATION_DIMENSIONS.length}
          >
            Submit ({filledCount}/{EVALUATION_DIMENSIONS.length})
          </Button>
        </div>
      )}
    </div>
  );
}

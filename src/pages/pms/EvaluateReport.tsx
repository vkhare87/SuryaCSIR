import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';
import { useAuth } from '../../contexts/AuthContext';
import { EVALUATION_DIMENSIONS, SCORE_RANGE } from '../../lib/pms/constants';
import { getGrade, requiresBelowThresholdReasons, requiresOutstandingReasons } from '../../lib/pms/scoring';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EvidencePanel } from '../../components/pms/EvidencePanel';
import type { PMSReportSection, PMSAnnexure, PMSReport } from '../../types/pms';

type ReportDetail = PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[] };

export default function EvaluateReport() {
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const { user } = useAuth();
  const { evaluations, reports, saveEvaluationScores, completeEvaluation, getReport } = usePMS();
  const navigate = useNavigate();

  const evaluation = evaluations.find(e => e.id === evaluationId);
  const report = evaluation ? reports.find(r => r.id === evaluation.reportId) : undefined;

  const [scores, setScores] = useState<Record<string, number>>({});
  const [totalScore, setTotalScore] = useState<number | null>(null);
  const [comments, setComments] = useState('');
  const [reasonsOutstanding, setReasonsOutstanding] = useState('');
  const [reasonsBelow, setReasonsBelow] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<ReportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (evaluation) {
      setScores(evaluation.scores ?? {});
      setTotalScore(evaluation.totalScore);
      setComments(evaluation.comments ?? '');
      setReasonsOutstanding(evaluation.reasonsForOutstanding ?? '');
      setReasonsBelow(evaluation.reasonsBelowThreshold ?? '');
      setSuggestions(evaluation.suggestionsForImprovement ?? '');
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
    const n = parseInt(val, 10);
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
    ? Math.round(EVALUATION_DIMENSIONS.reduce((s, d) => s + (scores[d.key] ?? 0), 0) / EVALUATION_DIMENSIONS.length)
    : null;

  const effectiveTotal = totalScore ?? avgScore;
  const needsOutstanding = effectiveTotal != null && requiresOutstandingReasons(effectiveTotal);
  const needsBelow = effectiveTotal != null && requiresBelowThresholdReasons(effectiveTotal);

  const summaryReport = reportDetail ?? report;
  const nonSubmission = Boolean(summaryReport?.nonSubmissionCertificatePath);

  const handleSave = async (complete: boolean) => {
    if (complete && effectiveTotal == null) {
      setError(nonSubmission
        ? 'Enter a total score (a zero score is permitted for non-submission).'
        : 'Score all 12 dimensions or enter a total score before submitting.');
      return;
    }
    if (complete && needsOutstanding && !reasonsOutstanding.trim()) {
      setError('Scores of 90 or above require reasons for the Outstanding grade.');
      return;
    }
    if (complete && needsBelow && (!reasonsBelow.trim() || !suggestions.trim())) {
      setError('Scores of 75 or below require reasons and suggestions for improvement.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        scores,
        totalScore: effectiveTotal ?? 0,
        comments,
        reasonsForOutstanding: reasonsOutstanding || undefined,
        reasonsBelowThreshold: reasonsBelow || undefined,
        suggestionsForImprovement: suggestions || undefined,
      };
      if (complete) {
        await completeEvaluation(evaluation.id, payload);
      } else {
        await saveEvaluationScores(evaluation.id, payload);
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
        <h1 className="text-2xl font-serif font-medium text-text">Evaluation Committee Appraisal</h1>
        <p className="text-sm text-text-muted mt-1">
          {report?.cycle?.name ?? 'Report'} · ID: {evaluation.reportId.slice(0, 8)}…
        </p>
        {isCompleted && (
          <p className="mt-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg inline-block">
            Evaluation submitted — read-only
          </p>
        )}
      </div>

      {nonSubmission && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl">
          Self-appraisal was not submitted by the May 15 deadline (non-submission certificate on file).
          You may award a <strong>zero score</strong> or rate strictly on Reporting Officer inputs.
        </div>
      )}

      {/* Report summary */}
      {loadingDetail ? (
        <Skeleton className="h-20 w-full" />
      ) : summaryReport && (
        <div className="p-4 bg-surface border border-border rounded-2xl">
          <h2 className="font-semibold text-sm text-text mb-2">Report Summary</h2>
          <p className="text-xs text-text-muted">
            Period: {summaryReport.periodFrom ?? '—'} – {summaryReport.periodTo ?? '—'}
          </p>
          {summaryReport.selfScore != null && (
            <p className="text-xs text-text-muted">
              Self-score: {summaryReport.selfScore} ({getGrade(summaryReport.selfScore)})
            </p>
          )}
          {summaryReport.systemRemark && (
            <p className="text-xs text-amber-700 mt-1">{summaryReport.systemRemark}</p>
          )}
        </div>
      )}

      {/* Institutional evidence — claim corroboration + trajectory */}
      {reportDetail && (
        <EvidencePanel report={reportDetail} sections={reportDetail.sections} />
      )}

      {/* 12-dimension score grid (worksheet) */}
      <div className="space-y-3">
        <h2 className="font-semibold text-text">
          Dimension Scores{' '}
          <span className="text-text-muted font-normal text-sm">
            (whole numbers {SCORE_RANGE.min} – {SCORE_RANGE.max}) · {filledCount}/{EVALUATION_DIMENSIONS.length} filled
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
                  step={1}
                  value={scores[dim.key] ?? ''}
                  onChange={e => setScore(dim.key, e.target.value)}
                  disabled={isCompleted}
                  placeholder={`${SCORE_RANGE.min}–${SCORE_RANGE.max}`}
                  className="w-24 px-2 py-1.5 border border-border rounded-lg text-sm bg-background text-text focus:outline-none focus:border-[#c96442] disabled:opacity-50"
                />
                {scores[dim.key] != null && (
                  <span className="text-xs text-text-muted">{getGrade(scores[dim.key])}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Total score + grade */}
      <div className="p-4 bg-[#fdf0e8] border border-[#c96442]/20 rounded-2xl space-y-2">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-[#c96442]">Total score (0–100):</label>
          <input
            type="number"
            min={SCORE_RANGE.min}
            max={SCORE_RANGE.max}
            step={1}
            value={totalScore ?? ''}
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              setTotalScore(isNaN(n) ? null : Math.min(SCORE_RANGE.max, Math.max(SCORE_RANGE.min, n)));
            }}
            disabled={isCompleted}
            placeholder={avgScore != null ? String(avgScore) : '—'}
            className="w-24 px-2 py-1.5 border border-border rounded-lg text-sm bg-background text-text focus:outline-none focus:border-[#c96442] disabled:opacity-50"
          />
          {effectiveTotal != null && (
            <span className="text-sm font-medium text-[#c96442]">Grade: {getGrade(effectiveTotal)}</span>
          )}
        </div>
        {avgScore != null && totalScore == null && (
          <p className="text-xs text-text-muted">Defaults to dimension average ({avgScore}) unless overridden.</p>
        )}
      </div>

      {/* Conditional mandatory reasons */}
      {needsOutstanding && (
        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Reasons for Outstanding grade <span className="text-rose-600">*</span>
          </label>
          <textarea
            rows={3}
            value={reasonsOutstanding}
            onChange={e => setReasonsOutstanding(e.target.value)}
            disabled={isCompleted}
            placeholder="Mandatory for scores of 90 or above…"
            className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none disabled:opacity-50"
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
              disabled={isCompleted}
              placeholder="Mandatory for scores of 75 or below…"
              className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none disabled:opacity-50"
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
              disabled={isCompleted}
              placeholder="Mandatory for scores of 75 or below…"
              className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none disabled:opacity-50"
            />
          </div>
        </>
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
            disabled={effectiveTotal == null}
          >
            Submit Appraisal
          </Button>
        </div>
      )}
    </div>
  );
}

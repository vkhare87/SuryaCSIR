import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';
import { useAuth } from '../../contexts/AuthContext';
import { canAdmin } from '../../lib/pms/permissions';
import { SCORE_RANGE } from '../../lib/pms/constants';
import { getGrade, isValidScore, requiresBelowThresholdReasons, requiresOutstandingReasons } from '../../lib/pms/scoring';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';

export default function Grievance() {
  const { user } = useAuth();
  const { reports, representations, grievanceMembers, isLoading, resolveRepresentation } = usePMS();

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [revisedScore, setRevisedScore] = useState('');
  const [reasonsOutstanding, setReasonsOutstanding] = useState('');
  const [reasonsBelow, setReasonsBelow] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGrievanceMember = grievanceMembers.some(m => m.userId === user?.id);
  if (!user || (!isGrievanceMember && !canAdmin(user))) return <Navigate to="/pms" replace />;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const pending = representations.filter(r => r.status === 'PENDING');
  const selected = pending.find(r => r.reportId === selectedReportId);
  const selectedReport = reports.find(r => r.id === selectedReportId);

  const parsedScore = revisedScore === '' ? null : parseInt(revisedScore, 10);
  const needsOutstanding = parsedScore != null && !isNaN(parsedScore) && requiresOutstandingReasons(parsedScore);
  const needsBelow = parsedScore != null && !isNaN(parsedScore) && requiresBelowThresholdReasons(parsedScore);

  const openModal = (reportId: string) => {
    setSelectedReportId(reportId);
    setResolution('');
    setRevisedScore('');
    setReasonsOutstanding('');
    setReasonsBelow('');
    setSuggestions('');
    setError(null);
  };

  const handleResolve = async () => {
    if (!selectedReportId) return;
    if (resolution.trim().length < 20) {
      setError('Resolution must be at least 20 characters.');
      return;
    }
    if (parsedScore != null && !isValidScore(parsedScore)) {
      setError(`Revised score must be a whole number between ${SCORE_RANGE.min} and ${SCORE_RANGE.max}.`);
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
      await resolveRepresentation(
        selectedReportId,
        resolution,
        parsedScore != null
          ? {
              finalScore: parsedScore,
              justification: resolution,
              reasonsForOutstanding: reasonsOutstanding || undefined,
              reasonsBelowThreshold: reasonsBelow || undefined,
              suggestionsForImprovement: suggestions || undefined,
            }
          : undefined
      );
      setSelectedReportId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resolution failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-text">Grievance Redressal Committee</h1>
      <p className="text-sm text-text-muted">
        {pending.length} representation{pending.length !== 1 ? 's' : ''} pending review
      </p>

      {pending.length === 0 ? (
        <div className="py-16 text-center text-text-muted border border-border rounded-2xl">
          No pending representations.
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {pending.map(rep => {
            const report = reports.find(r => r.id === rep.reportId);
            return (
              <div
                key={rep.id}
                className="flex items-center justify-between px-5 py-4 bg-surface hover:bg-surface-hover transition-colors"
              >
                <div>
                  <p className="font-medium text-text text-sm">{report?.cycle?.name ?? rep.reportId}</p>
                  <p className="text-xs text-text-muted mt-0.5 font-mono">
                    Scientist: {rep.scientistId.slice(0, 8)}… · {new Date(rep.submittedAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-text-muted mt-1 line-clamp-2">{rep.grounds}</p>
                </div>
                <Button size="sm" onClick={() => openModal(rep.reportId)}>Review</Button>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!selectedReportId}
        onClose={() => setSelectedReportId(null)}
        title="Resolve Representation"
      >
        <div className="space-y-4 p-4">
          <p className="text-sm font-medium text-text-muted">{selectedReport?.cycle?.name}</p>
          {selected && (
            <div className="p-4 bg-surface border border-border rounded-xl">
              <h3 className="text-sm font-semibold text-text mb-1">Grounds</h3>
              <p className="text-sm text-text-muted">{selected.grounds}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Resolution <span className="text-text-muted font-normal">(min 20 characters)</span>
            </label>
            <textarea
              rows={4}
              value={resolution}
              onChange={e => setResolution(e.target.value)}
              placeholder="Committee's decision and reasoning…"
              className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Revised Score <span className="text-text-muted font-normal">(optional; leave blank to uphold)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={SCORE_RANGE.min}
                max={SCORE_RANGE.max}
                step={1}
                value={revisedScore}
                onChange={e => setRevisedScore(e.target.value)}
                placeholder="0 – 100"
                className="w-32 px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442]"
              />
              {parsedScore != null && !isNaN(parsedScore) && (
                <span className="text-sm text-text-muted">{getGrade(parsedScore)}</span>
              )}
            </div>
          </div>

          {needsOutstanding && (
            <textarea
              rows={2}
              value={reasonsOutstanding}
              onChange={e => setReasonsOutstanding(e.target.value)}
              placeholder="Reasons for Outstanding grade (mandatory for 90+)…"
              className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none"
            />
          )}
          {needsBelow && (
            <>
              <textarea
                rows={2}
                value={reasonsBelow}
                onChange={e => setReasonsBelow(e.target.value)}
                placeholder="Reasons for score below threshold (mandatory for ≤75)…"
                className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none"
              />
              <textarea
                rows={2}
                value={suggestions}
                onChange={e => setSuggestions(e.target.value)}
                placeholder="Suggestions for improvement (mandatory for ≤75)…"
                className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442] resize-none"
              />
            </>
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSelectedReportId(null)}>Cancel</Button>
            <Button onClick={handleResolve} isLoading={saving}>Resolve</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

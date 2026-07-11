import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';
import { useAuth } from '../../contexts/AuthContext';
import { canAdmin, isPanelValid } from '../../lib/pms/permissions';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';

export default function AssignEvaluators() {
  const { user } = useAuth();
  const { reports, committees, isLoading, assignEvaluators } = usePMS();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !canAdmin(user)) return <Navigate to="/pms" replace />;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const submittedReports = reports.filter(r => r.status === 'SUBMITTED');
  const selectedReport = reports.find(r => r.id === selectedReportId);
  const cycleCommittees = selectedReport
    ? committees.filter(c => c.cycleId === selectedReport.cycleId)
    : [];

  const openModal = (reportId: string) => {
    setSelectedReportId(reportId);
    setSelectedCommitteeId(null);
    setError(null);
  };

  const handleAssign = async () => {
    if (!selectedReportId || !selectedCommitteeId) return;
    setSaving(true);
    setError(null);
    try {
      await assignEvaluators(selectedReportId, selectedCommitteeId);
      setSelectedReportId(null);
      setSelectedCommitteeId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assignment failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-text">Assign Evaluation Committee</h1>
      <p className="text-sm text-text-muted">
        {submittedReports.length} report{submittedReports.length !== 1 ? 's' : ''} awaiting assignment
      </p>

      {submittedReports.length === 0 ? (
        <div className="py-16 text-center text-text-muted border border-border rounded-2xl">
          No submitted reports awaiting assignment.
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {submittedReports.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between px-5 py-4 bg-surface hover:bg-surface-hover transition-colors"
            >
              <div>
                <p className="font-medium text-text text-sm">{r.cycle?.name ?? r.cycleId}</p>
                <p className="text-xs text-text-muted font-mono mt-0.5">
                  Scientist: {r.scientistId.slice(0, 8)}…
                </p>
                {r.periodFrom && r.periodTo && (
                  <p className="text-xs text-text-muted mt-0.5">{r.periodFrom} – {r.periodTo}</p>
                )}
                {r.nonSubmissionCertificatePath && (
                  <p className="text-xs text-amber-600 mt-0.5">Non-submission — certificate on file</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={r.status} />
                <Button size="sm" onClick={() => openModal(r.id)}>
                  Assign
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!selectedReportId}
        onClose={() => { setSelectedReportId(null); setSelectedCommitteeId(null); }}
        title="Assign Evaluation Committee"
      >
        <div className="space-y-4 p-4">
          <p className="text-sm font-medium text-text-muted">{selectedReport?.cycle?.name}</p>

          {cycleCommittees.length === 0 ? (
            <p className="text-sm text-text-muted">
              No Evaluation Committee found for this cycle. Create one first in the Evaluation Committees section.
            </p>
          ) : (
            <>
              <p className="text-sm text-text-muted">
                Select the committee tier matching the appraisee's grade (I: Sci B/C/D, II: Sci E, III: Sci F).
                The full panel becomes the evaluators.
              </p>
              <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                {cycleCommittees.map(c => {
                  const panelOk = isPanelValid(c.members ?? []);
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-hover transition-colors"
                    >
                      <input
                        type="radio"
                        name="committee"
                        checked={selectedCommitteeId === c.id}
                        onChange={() => setSelectedCommitteeId(c.id)}
                        disabled={!panelOk}
                        className="accent-[#c96442]"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-text">{c.name}</p>
                        <p className="text-xs text-text-muted">
                          {c.members?.length ?? 0} member{(c.members?.length ?? 0) !== 1 ? 's' : ''}
                          {!panelOk && ' — panel invalid (odd count with Reporting Officer, Reviewing Officer, EC member required)'}
                        </p>
                      </div>
                      {c.tier && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          Tier {c.tier}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {error && (
                <p className="text-sm text-rose-600">{error}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setSelectedReportId(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAssign}
                  isLoading={saving}
                  disabled={!selectedCommitteeId}
                >
                  Assign Committee
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

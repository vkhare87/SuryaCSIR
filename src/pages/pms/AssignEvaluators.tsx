import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';
import { useAuth } from '../../contexts/AuthContext';
import { canAdmin } from '../../lib/pms/permissions';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';

export default function AssignEvaluators() {
  const { user } = useAuth();
  const { reports, collegiums, isLoading, assignEvaluators } = usePMS();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
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
  const collegiumForCycle = selectedReport
    ? collegiums.find(c => c.cycleId === selectedReport.cycleId)
    : null;
  const members = collegiumForCycle?.members ?? [];

  const toggleUser = (uid: string) => {
    setSelectedUserIds(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const openModal = (reportId: string) => {
    setSelectedReportId(reportId);
    setSelectedUserIds([]);
    setError(null);
  };

  const handleAssign = async () => {
    if (!selectedReportId || selectedUserIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await assignEvaluators(selectedReportId, selectedUserIds);
      setSelectedReportId(null);
      setSelectedUserIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assignment failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-text">Assign Evaluators</h1>
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
        onClose={() => { setSelectedReportId(null); setSelectedUserIds([]); }}
        title="Assign Evaluators"
      >
        <div className="space-y-4 p-4">
          <p className="text-sm font-medium text-text-muted">{selectedReport?.cycle?.name}</p>

          {members.length === 0 ? (
            <p className="text-sm text-text-muted">
              No collegium found for this cycle. Create a collegium first in the Collegiums section.
            </p>
          ) : (
            <>
              <p className="text-sm text-text-muted">Select evaluators from the collegium:</p>
              <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                {members.map(m => (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-hover transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(m.userId)}
                      onChange={() => toggleUser(m.userId)}
                      className="accent-[#c96442]"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text">
                        {m.userName ?? m.userId.slice(0, 8) + '…'}
                      </p>
                      {m.userEmail && (
                        <p className="text-xs text-text-muted">{m.userEmail}</p>
                      )}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      m.role === 'CHAIRMAN'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {m.role}
                    </span>
                  </label>
                ))}
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
                  disabled={selectedUserIds.length === 0}
                >
                  Assign {selectedUserIds.length > 0 ? `(${selectedUserIds.length})` : ''}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

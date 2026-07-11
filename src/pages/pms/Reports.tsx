import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePMS } from '../../contexts/PMSContext';
import { canAdmin } from '../../lib/pms/permissions';
import { isPastSelfAppraisalDeadline } from '../../lib/pms/deadlines';
import { MIN_DUTY_DAYS } from '../../lib/pms/constants';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';

export default function Reports() {
  const { user } = useAuth();
  const { cycles, reports, isLoading, setDutyDays, markNotAssessed, recordNonSubmission } = usePMS();
  const navigate = useNavigate();
  const isAdmin = user ? canAdmin(user) : false;

  const [manageReportId, setManageReportId] = useState<string | null>(null);
  const [dutyDaysInput, setDutyDaysInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const certInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const openCycle = cycles.find(c => c.status === 'OPEN');
  const displayReports = isAdmin ? reports : reports.filter(r => r.scientistId === user.id);
  const manageReport = reports.find(r => r.id === manageReportId);
  const manageCycle = manageReport ? cycles.find(c => c.id === manageReport.cycleId) : undefined;
  const pastDeadline = manageCycle ? isPastSelfAppraisalDeadline(manageCycle) : false;

  const openManage = (reportId: string) => {
    const r = reports.find(x => x.id === reportId);
    setManageReportId(reportId);
    setDutyDaysInput(r?.dutyDays != null ? String(r.dutyDays) : '');
    setError(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDutyDays = () => {
    if (!manageReportId) return;
    const n = parseInt(dutyDaysInput, 10);
    if (isNaN(n) || n < 0) {
      setError('Duty days must be zero or more.');
      return;
    }
    void run(() => setDutyDays(manageReportId, n));
  };

  const handleCertUpload = (file: File | undefined) => {
    if (!manageReportId || !file) return;
    void run(async () => {
      await recordNonSubmission(manageReportId, file);
      setManageReportId(null);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-medium text-text">
          {isAdmin ? 'All Reports' : 'My Reports'}
        </h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="secondary" size="sm" onClick={() => navigate('/pms/assign')}>
              Assign Committee
            </Button>
          )}
          {!isAdmin && openCycle && (
            <Button onClick={() => navigate('/pms/reports/new')}>New Report</Button>
          )}
        </div>
      </div>

      {displayReports.length === 0 ? (
        <div className="py-16 text-center text-text-muted">
          <p>
            {isAdmin
              ? 'No reports submitted yet.'
              : openCycle
              ? 'No reports yet. Click "New Report" to start.'
              : 'No open appraisal cycle currently.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {displayReports.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between px-5 py-4 bg-surface hover:bg-surface-hover transition-colors"
            >
              <div>
                <p className="font-medium text-text text-sm">{r.cycle?.name ?? r.cycleId}</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {r.periodFrom && r.periodTo
                    ? `${r.periodFrom} – ${r.periodTo}`
                    : 'Period not set'}
                </p>
                {isAdmin && (
                  <p className="text-xs text-text-muted/60 font-mono mt-0.5">
                    Scientist: {r.scientistId.slice(0, 8)}…
                    {r.dutyDays != null && (
                      <span className={r.dutyDays < MIN_DUTY_DAYS ? ' text-rose-500' : ''}>
                        {' '}· {r.dutyDays} duty days
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={r.status} />
                {isAdmin && r.status === 'SUBMITTED' && (
                  <Button size="sm" variant="secondary" onClick={() => navigate('/pms/assign')}>
                    Assign
                  </Button>
                )}
                {isAdmin && !['FINALIZED', 'NOT_ASSESSED'].includes(r.status) && (
                  <Button size="sm" variant="ghost" onClick={() => openManage(r.id)}>
                    Manage
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigate(
                      r.status === 'DRAFT'
                        ? `/pms/reports/${r.id}/edit`
                        : `/pms/reports/${r.id}`
                    )
                  }
                >
                  {r.status === 'DRAFT' ? 'Edit' : 'View'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Admin: duty days / not-assessed / non-submission */}
      <Modal
        isOpen={!!manageReport}
        onClose={() => setManageReportId(null)}
        title="Administer Report"
      >
        <div className="space-y-5 p-4">
          <p className="text-sm font-medium text-text-muted">{manageReport?.cycle?.name}</p>

          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Physical duty days (reporting year)
            </label>
            <p className="text-xs text-text-muted mb-2">
              Cross-reference attendance/leave records manually. Below {MIN_DUTY_DAYS} days the report
              cannot be submitted and can be marked Not Assessed.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={dutyDaysInput}
                onChange={e => setDutyDaysInput(e.target.value)}
                className="w-32 px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-[#c96442]"
              />
              <Button size="sm" isLoading={saving} onClick={handleSaveDutyDays}>Save</Button>
            </div>
          </div>

          {manageReport?.dutyDays != null && manageReport.dutyDays < MIN_DUTY_DAYS && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <p className="text-sm text-amber-800">
                Duty days below {MIN_DUTY_DAYS} — the appraisal can be bypassed with an automatic
                system remark.
              </p>
              <Button
                size="sm"
                variant="danger"
                isLoading={saving}
                onClick={() => void run(async () => {
                  await markNotAssessed(manageReport.id);
                  setManageReportId(null);
                })}
              >
                Mark Not Assessed
              </Button>
            </div>
          )}

          {manageReport?.status === 'DRAFT' && pastDeadline && (
            <div className="p-4 bg-surface border border-border rounded-xl space-y-2">
              <p className="text-sm text-text">
                Self-appraisal deadline (May 15) has passed. Upload a non-submission certificate to
                flag the report to the Evaluation Committee (zero score or Reporting Officer inputs).
              </p>
              <input
                ref={certInputRef}
                type="file"
                className="hidden"
                onChange={e => handleCertUpload(e.target.files?.[0])}
              />
              <Button size="sm" variant="secondary" isLoading={saving} onClick={() => certInputRef.current?.click()}>
                Upload Non-Submission Certificate
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}

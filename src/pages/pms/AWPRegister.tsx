import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAWP } from '../../contexts/AWPContext';
import { useData } from '../../contexts/DataContext';
import { AWPPanel } from '../../components/pms/AWPPanel';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { canAdmin, scientistGrade } from '../../lib/pms/permissions';
import { ELIGIBLE_SCIENTIST_GRADES, STANDARD_DESIGNATIONS } from '../../lib/pms/constants';
import { AWP_STATUS_LABEL, reportingYearFor } from '../../lib/pms/awp';
import { friendlyError } from '../../lib/errors';

// Standard track (Scientist B–F) — the scientists the 2026 AWP applies to.
function isStandardScientist(designation: string | null | undefined): boolean {
  const d = (designation ?? '').trim();
  const grade = scientistGrade(d);
  return STANDARD_DESIGNATIONS.some(s => s.toLowerCase() === d.toLowerCase())
    || (grade != null && ELIGIBLE_SCIENTIST_GRADES.includes(grade));
}

export default function AWPRegister() {
  const { user } = useAuth();
  const { awps, isLoading, forwardBlank, getSignedPdfUrl, setReviewingOfficer } = useAWP();
  const { staff } = useData();
  const isAdmin = user ? canAdmin(user) : false;

  const [year, setYear] = useState(reportingYearFor(new Date()));
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rvoPick, setRvoPick] = useState('');

  const nameOf = useMemo(() => new Map(staff.map(s => [s.ID, s.Name])), [staff]);
  const rows = useMemo(() => {
    const byStaff = new Map(awps.filter(a => a.reportingYear === year).map(a => [a.staffId, a]));
    return staff
      .filter(s => isStandardScientist(s.Designation))
      .map(s => ({ s, awp: byStaff.get(s.ID) }))
      .filter(r => !onlyMissing || !r.awp || r.awp.status === 'DRAFT' || r.awp.status === 'RETURNED')
      .sort((a, b) => (a.s.Name ?? '').localeCompare(b.s.Name ?? ''));
  }, [awps, staff, year, onlyMissing]);
  const counts = useMemo(() => {
    const c = { total: rows.length, approved: 0, pending: 0, missing: 0 };
    for (const r of rows) {
      if (!r.awp || r.awp.status === 'DRAFT' || r.awp.status === 'RETURNED') c.missing++;
      else if (r.awp.status === 'APPROVED') c.approved++;
      else c.pending++;
    }
    return c;
  }, [rows]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const startYear = Number(year.slice(0, 4));
  const pastDeadline = new Date() > new Date(startYear, 4, 15, 23, 59, 59);
  const viewing = awps.find(a => a.id === viewId);

  const forward = async (staffId: string) => {
    setBusyId(staffId); setError(null);
    try { await forwardBlank(staffId, year); }
    catch (e) { setError(friendlyError(e, 'Could not forward')); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-serif font-medium text-text">Annual Work Plan Register</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-text-muted">
            <input type="checkbox" className="accent-terracotta" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />
            Not submitted only
          </label>
          <input
            aria-label="Reporting year"
            value={year}
            onChange={e => setYear(e.target.value)}
            className="w-24 px-3 py-2 border border-border rounded-xl text-sm bg-background text-text"
          />
        </div>
      </div>

      <p className="text-sm text-text-muted">
        {counts.total} scientists · {counts.approved} approved · {counts.pending} under review · {counts.missing} not submitted
      </p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto border border-border rounded-2xl bg-surface">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-muted border-b border-border">
            <tr>
              <th className="px-4 py-2">Scientist</th>
              <th className="px-4 py-2">Division</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Reporting Officer</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ s, awp }) => (
              <tr key={s.ID}>
                <td className="px-4 py-2 text-text">{s.Name} <span className="text-text-muted">({s.ID})</span></td>
                <td className="px-4 py-2 text-text-muted">{s.Division}</td>
                <td className="px-4 py-2 text-text">{awp ? AWP_STATUS_LABEL[awp.status] : 'Not started'}</td>
                <td className="px-4 py-2 text-text-muted">{awp?.reportingOfficerId ? nameOf.get(awp.reportingOfficerId) ?? awp.reportingOfficerId : '—'}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap space-x-2">
                  {awp && <Button size="sm" variant="ghost" onClick={() => setViewId(awp.id)}>View</Button>}
                  {isAdmin && pastDeadline && (!awp || awp.status === 'DRAFT' || awp.status === 'RETURNED') && (
                    <Button size="sm" variant="secondary" isLoading={busyId === s.ID} onClick={() => void forward(s.ID)}>
                      Forward blank to RO
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!viewing} onClose={() => setViewId(null)} title="Annual Work Plan">
        {viewing && (
          <div className="p-4 space-y-3">
            {viewing.sourcePdfPath && (
              <Button size="sm" variant="secondary"
                onClick={() => void getSignedPdfUrl(viewing.sourcePdfPath!).then(u => window.open(u, '_blank', 'noopener')).catch(e => setError(String(e)))}>
                Open submitted PDF
              </Button>
            )}
            {isAdmin && ['DRAFT', 'RETURNED', 'WITH_RO'].includes(viewing.status) && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-text-muted">
                  Reviewing Officer: {viewing.reviewingOfficerId ? nameOf.get(viewing.reviewingOfficerId) ?? viewing.reviewingOfficerId : '—'}
                </span>
                <select
                  aria-label="New Reviewing Officer"
                  value={rvoPick}
                  onChange={e => setRvoPick(e.target.value)}
                  className="px-3 py-1.5 border border-border rounded-xl text-sm bg-background text-text"
                >
                  <option value="">— change to —</option>
                  {staff.map(s => <option key={s.ID} value={s.ID}>{s.Name} ({s.Designation})</option>)}
                </select>
                <Button size="sm" variant="secondary" disabled={!rvoPick} isLoading={busyId === viewing.id}
                  onClick={() => {
                    setBusyId(viewing.id); setError(null);
                    setReviewingOfficer(viewing.id, rvoPick)
                      .then(() => setRvoPick(''))
                      .catch(e => setError(friendlyError(e, 'Could not change')))
                      .finally(() => setBusyId(null));
                  }}>
                  Save
                </Button>
              </div>
            )}
            <AWPPanel awp={viewing} />
          </div>
        )}
      </Modal>
    </div>
  );
}

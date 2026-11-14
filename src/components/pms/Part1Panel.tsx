import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { canAdmin } from '../../lib/pms/permissions';
import { loadPart1, reportPart1Discrepancy, verifyPart1 } from '../../lib/pms/assessment2026Api';
import { friendlyError } from '../../lib/errors';
import type { PMSReport, PmsPart1 } from '../../types/pms';

const LABELS: Record<string, string> = {
  name: 'Name', employeeId: 'Employee ID', designation: 'Designation', group: 'Group', payLevel: 'Level',
  division: 'Division', category: 'Category', gender: 'Gender', dateOfBirth: 'Date of birth',
  dateOfJoining: 'Date of joining', inPresentGradeSince: 'In present grade since',
  appointmentType: 'Appointment', highestQualification: 'Highest qualification',
};

/** Part I as Establishment filled it; the scientist reports what is wrong, Establishment verifies (2026 Part I). */
export function Part1Panel({ report }: { report: PMSReport }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [part, setPart] = useState<PmsPart1 | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const isOwner = user?.id === report.scientistId;
  const isAdmin = !!user && canAdmin(user);

  const reload = useCallback(() => {
    loadPart1(report.id).then(setPart).catch(e => push(friendlyError(e), 'error'));
  }, [report.id, push]);
  useEffect(() => { reload(); }, [reload]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); push(done, 'success'); setNote(''); reload(); }
    catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-medium text-text">Part I — Basic information</h3>
        {part?.verifiedAt ? <Badge variant="success"><BadgeCheck size={12} className="inline mr-1" />Verified by Establishment</Badge>
          : part ? <Badge variant="warning">Not yet verified</Badge> : null}
      </div>
      {!part ? (
        <p className="text-sm text-text-muted">Establishment has not filled Part I yet.</p>
      ) : (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {Object.entries(part.data).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-border py-1">
                <dt className="text-text-muted">{LABELS[k] ?? k}</dt><dd className="text-text text-right">{String(v)}</dd>
              </div>
            ))}
          </dl>
          {part.discrepancy && (
            <p className="text-sm text-text flex items-start gap-2"><AlertTriangle size={14} className="text-turmeric mt-0.5 shrink-0" />
              Reported: {part.discrepancy}</p>
          )}
          {isOwner && report.status === 'DRAFT' && (
            <div className="flex gap-2 items-end flex-wrap">
              <input aria-label="What is wrong" value={note} onChange={e => setNote(e.target.value)} placeholder="Something wrong? Say what."
                className="flex-1 min-w-48 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text" />
              <Button variant="secondary" disabled={busy || !note.trim()} onClick={() => void run(() => reportPart1Discrepancy(report.id, note), 'Sent to Establishment')}>Report</Button>
            </div>
          )}
          {isAdmin && !part.verifiedAt && (
            <Button disabled={busy} onClick={() => void run(() => verifyPart1(report.id), 'Part I verified')}>Verify Part I</Button>
          )}
        </>
      )}
    </Card>
  );
}

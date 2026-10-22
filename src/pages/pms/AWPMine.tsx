import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pdf } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAWP } from '../../contexts/AWPContext';
import { useData } from '../../contexts/DataContext';
import { AWPPartVForm } from '../../components/pms/AWPPartVForm';
import { AWPPanel } from '../../components/pms/AWPPanel';
import { AWPPDF } from '../../components/pms/AWPPDF';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import {
  AWP_STATUS_LABEL, activityTotal, awpActionFor, awpYearOptions, emptyAWPContent, reportingYearFor, revisionWindowOpen,
} from '../../lib/pms/awp';
import type { AWPContent, PMSAWP } from '../../types/pms';

export default function AWPMine() {
  const { awps, revisions, myStaffId, isLoading, awpFor, saveDraft, submit, requestRevision } = useAWP();
  const { staff } = useData();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const years = useMemo(
    () => awpYearOptions(new Date(), awps.filter(a => a.staffId === myStaffId).map(a => a.reportingYear)),
    [awps, myStaffId],
  );
  const year = params.get('year') ?? reportingYearFor(new Date());

  const me = useMemo(() => staff.find(s => s.ID === myStaffId), [staff, myStaffId]);
  const awp = myStaffId ? awpFor(myStaffId, year) : undefined;
  const pendingRevision = useMemo(
    () => (awp ? revisions.find(r => r.awpId === awp.id && r.status === 'PENDING') : undefined),
    [awp, revisions],
  );

  const [content, setContent] = useState<AWPContent>(emptyAWPContent());
  const [revising, setRevising] = useState(false);
  const [reasons, setReasons] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the saved plan, or start a new one with Part A taken from the staff roster.
  useEffect(() => {
    if (awp) { setContent(awp); return; }
    const blank = emptyAWPContent();
    if (me) {
      blank.partA = {
        ...blank.partA,
        name: me.Name ?? '', employeeId: me.ID, designation: me.Designation ?? '', group: me.Group ?? '',
        division: me.Division ?? '', dojCsir: me.DOJ ?? '', dob: me.DOB ?? '', email: me.Email ?? '',
      };
    }
    setContent(blank);
    setRevising(false);
  }, [awp, me, year]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  // caller_staff_id() falls back to a matching e-mail, but saving needs a real
  // staff.user_id link — say so up front instead of failing on Save.
  if (!myStaffId || (me && me.user_id !== user?.id)) {
    return (
      <div className="p-6 bg-surface border border-border rounded-2xl text-sm text-text-muted">
        Your login is not linked to a staff record, so you cannot file an Annual Work Plan. Ask HR to link your account.
      </div>
    );
  }

  const editable = !awp || awpActionFor(awp, { staffId: myStaffId, isDirector: false }) === 'EDIT';
  const total = activityTotal(content.activitySplit);

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true); setError(null); setMessage(null);
    try { await fn(); setMessage(done); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  };

  const download = async (a: PMSAWP) => {
    const blob = await pdf(<AWPPDF awp={a} />).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AWP_${a.reportingYear}_${a.staffId}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-serif font-medium text-text">My Annual Work Plan</h1>
        <div className="flex items-center gap-2">
          <select
            aria-label="Reporting year"
            value={year}
            onChange={e => setParams({ year: e.target.value })}
            className="px-3 py-2 border border-border rounded-xl text-sm bg-background text-text"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {awp && (
            <Button variant="secondary" size="sm" onClick={() => void download(awp)}>
              <Download size={14} className="mr-1.5" /> PDF
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-text-muted">
        Reporting period 1 April {year.slice(0, 4)} – 31 March {Number(year.slice(0, 4)) + 1}. Submit by 15 May with
        your self-appraisal. Status: <strong className="text-text">{awp ? AWP_STATUS_LABEL[awp.status] : 'Not started'}</strong>
      </p>
      {awp?.status === 'RETURNED' && awp.returnReasons && (
        <p className="p-3 border border-turmeric rounded-xl text-sm text-text">Returned for revision: {awp.returnReasons}</p>
      )}

      {editable || revising ? (
        <>
          <AWPPartVForm value={content} onChange={setContent} disabled={busy} />
          {revising ? (
            <div className="space-y-2">
              <textarea
                rows={3}
                value={reasons}
                onChange={e => setReasons(e.target.value)}
                placeholder="Reasons for the revision (at least 20 characters)"
                className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-terracotta"
              />
              <div className="flex gap-2">
                <Button
                  isLoading={busy}
                  disabled={reasons.trim().length < 20 || total !== 100}
                  onClick={() => awp && void run(async () => {
                    await requestRevision(awp.id, reasons.trim(), content);
                    setRevising(false);
                  }, 'Revision sent to the Director.')}
                >
                  Send revision for approval
                </Button>
                <Button variant="ghost" onClick={() => { setRevising(false); if (awp) setContent(awp); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" isLoading={busy}
                onClick={() => void run(async () => { await saveDraft(myStaffId, year, content); }, 'Draft saved.')}>
                Save draft
              </Button>
              <Button isLoading={busy} disabled={total !== 100}
                onClick={() => void run(async () => {
                  const id = await saveDraft(myStaffId, year, content);
                  await submit(id);
                }, 'Submitted to your Reporting Officer.')}>
                Submit
              </Button>
            </div>
          )}
        </>
      ) : awp && (
        <>
          <AWPPanel awp={awp} />
          {awp.status === 'APPROVED' && (
            pendingRevision ? (
              <p className="text-sm text-text-muted">A revision is waiting for the Director's approval.</p>
            ) : revisionWindowOpen(awp.reportingYear) ? (
              <Button variant="secondary" onClick={() => setRevising(true)}>Request a revision</Button>
            ) : (
              <p className="text-sm text-text-muted">Revisions closed on 30 September {awp.reportingYear.slice(0, 4)}.</p>
            )
          )}
        </>
      )}

      {message && <p className="text-sm text-text-muted">{message}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

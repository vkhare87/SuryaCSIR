import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAWP } from '../../contexts/AWPContext';
import { useData } from '../../contexts/DataContext';
import { AWPPanel } from '../../components/pms/AWPPanel';
import { AWPPartVForm } from '../../components/pms/AWPPartVForm';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { AWP_STATUS_LABEL, activityTotal, awpActionFor, type AWPAction } from '../../lib/pms/awp';
import type { AWPContent, AWPVerdict, PMSAWP } from '../../types/pms';

const ACTION_LABEL: Record<Exclude<AWPAction, 'EDIT'>, string> = {
  RO_REVIEW: 'Review as Reporting Officer',
  RVO_REVIEW: 'Review as Reviewing Officer',
  DIRECTOR_DECIDE: 'Approve as Director',
};

const area = 'w-full px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-terracotta';

export default function AWPInbox() {
  const { user } = useAuth();
  const {
    awps, revisions, myStaffId, isLoading,
    roReview, rvoReview, directorDecide, returnAWP, decideRevision, getSignedPdfUrl,
  } = useAWP();
  const { staff } = useData();

  const isDirector = !!user?.roles.includes('Director');
  const nameOf = useMemo(() => new Map(staff.map(s => [s.ID, s.Name])), [staff]);

  const queue = useMemo(
    () => awps
      .map(a => ({ awp: a, action: awpActionFor(a, { staffId: myStaffId, isDirector }) }))
      .filter((x): x is { awp: PMSAWP; action: Exclude<AWPAction, 'EDIT'> } => x.action != null && x.action !== 'EDIT'),
    [awps, myStaffId, isDirector],
  );
  const pendingRevisions = useMemo(
    () => (isDirector ? revisions.filter(r => r.status === 'PENDING') : []),
    [revisions, isDirector],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<AWPVerdict>('REASONABLE');
  const [text, setText] = useState('');
  const [modifying, setModifying] = useState<AWPContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const selected = queue.find(q => q.awp.id === selectedId);
  const open = (id: string) => {
    const pick = queue.find(q => q.awp.id === id);
    setSelectedId(id); setText(''); setVerdict('REASONABLE'); setError(null);
    // A blank-forwarded AWP is filled in by the RO on the scientist's behalf (§5.E.a.iii).
    setModifying(pick?.action === 'RO_REVIEW' && pick.awp.source === 'BLANK_FORWARDED' ? pick.awp : null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); setSelectedId(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  };

  const openPdf = async (path: string) => {
    try { window.open(await getSignedPdfUrl(path), '_blank', 'noopener'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open PDF'); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-text">Annual Work Plan Inbox</h1>

      {queue.length === 0 && pendingRevisions.length === 0 && (
        <p className="text-sm text-text-muted">Nothing is waiting for you.</p>
      )}

      {queue.length > 0 && (
        <div className="divide-y divide-border border border-border rounded-2xl bg-surface">
          {queue.map(({ awp, action }) => (
            <button
              key={awp.id}
              onClick={() => open(awp.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-hover"
            >
              <span className="text-sm text-text">{nameOf.get(awp.staffId) ?? awp.staffId} · {awp.reportingYear}</span>
              <span className="text-xs text-text-muted">{ACTION_LABEL[action]}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-4">
          {selected.awp.sourcePdfPath && (
            <Button variant="secondary" size="sm" onClick={() => void openPdf(selected.awp.sourcePdfPath!)}>
              Open submitted PDF
            </Button>
          )}
          {modifying ? <AWPPartVForm value={modifying} onChange={setModifying} disabled={busy} /> : <AWPPanel awp={selected.awp} />}

          <div className="p-4 bg-surface border border-border rounded-2xl space-y-3">
            <h2 className="text-sm font-semibold text-text">{ACTION_LABEL[selected.action]}</h2>
            {selected.action === 'RO_REVIEW' && modifying && (
              <p className="text-xs text-text-muted">
                The scientist did not submit this plan. Fill it in above on their behalf (time must total 100%), then record your verdict.
              </p>
            )}

            {selected.action === 'RO_REVIEW' && (
              <div className="flex gap-4 text-sm text-text">
                {(['REASONABLE', 'NOT_REASONABLE'] as const).map(v => (
                  <label key={v} className="flex items-center gap-1.5">
                    <input type="radio" name="verdict" className="accent-terracotta" checked={verdict === v} onChange={() => setVerdict(v)} />
                    {v === 'REASONABLE' ? 'Appears reasonable' : 'Does not appear reasonable'}
                  </label>
                ))}
              </div>
            )}

            <textarea
              rows={3}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={
                selected.action === 'RO_REVIEW' ? 'Reasons (required if not reasonable, at least 20 characters)'
                  : selected.action === 'RVO_REVIEW' ? 'Remarks'
                    : 'Remarks (required to modify or return, at least 20 characters)'
              }
              className={area}
            />

            <div className="flex flex-wrap gap-2">
              {selected.action === 'RO_REVIEW' && (
                <Button
                  isLoading={busy}
                  disabled={!!modifying && activityTotal(modifying.activitySplit) !== 100}
                  onClick={() => void run(() => roReview(selected.awp.id, verdict, text.trim(), modifying ?? undefined))}
                >
                  {modifying ? 'Save the plan and forward' : 'Record verdict and forward'}
                </Button>
              )}
              {selected.action === 'RVO_REVIEW' && (
                <Button isLoading={busy} onClick={() => void run(() => rvoReview(selected.awp.id, text.trim()))}>
                  Forward to Director
                </Button>
              )}
              {selected.action === 'DIRECTOR_DECIDE' && !modifying && (
                <>
                  <Button isLoading={busy} onClick={() => void run(() => directorDecide(selected.awp.id, 'ACCEPTED', text.trim()))}>
                    Approve
                  </Button>
                  <Button variant="secondary" onClick={() => setModifying(selected.awp)}>Modify…</Button>
                </>
              )}
              {selected.action === 'DIRECTOR_DECIDE' && modifying && (
                <Button isLoading={busy} disabled={text.trim().length < 20}
                  onClick={() => void run(() => directorDecide(selected.awp.id, 'MODIFIED', text.trim(), modifying))}>
                  Approve with modifications
                </Button>
              )}
              <Button variant="danger" isLoading={busy} disabled={text.trim().length < 20}
                onClick={() => void run(() => returnAWP(selected.awp.id, text.trim()))}>
                Return to scientist
              </Button>
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          </div>
        </div>
      )}

      {pendingRevisions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-text">Revision requests</h2>
          {pendingRevisions.map(rev => {
            const awp = awps.find(a => a.id === rev.awpId);
            return (
              <div key={rev.id} className="p-4 bg-surface border border-border rounded-2xl space-y-2">
                <p className="text-sm text-text">
                  {awp ? `${nameOf.get(awp.staffId) ?? awp.staffId} · ${awp.reportingYear} · ${AWP_STATUS_LABEL[awp.status]}` : rev.awpId}
                </p>
                <p className="text-sm text-text-muted">Reasons: {rev.reasons}</p>
                {awp && <AWPPanel awp={{ ...awp, ...rev.after }} />}
                <div className="flex gap-2">
                  <Button size="sm" isLoading={busy} onClick={() => void run(() => decideRevision(rev.id, true, ''))}>Approve revision</Button>
                  <Button size="sm" variant="danger" isLoading={busy} onClick={() => void run(() => decideRevision(rev.id, false, ''))}>Reject</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, FileDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { chairDecide, declare, loadDeclarations } from '../../lib/compliance/api';
import { friendlyError } from '../../lib/errors';
import type { CoiDeclaration, Committee, CommitteeMember, Meeting, StaffMember } from '../../types';

interface Props {
  meeting: Meeting;
  committee: Committee;
  members: CommitteeMember[];
  staff: StaffMember[];
}

/** §6.3 declarations for one meeting: each member declares; the chair decides; Annexure 3 prints. */
export function DeclarationsPanel({ meeting, committee, members, staff }: Props) {
  const { user } = useAuth();
  const { push } = useToast();
  const [rows, setRows] = useState<CoiDeclaration[]>([]);
  const [format, setFormat] = useState<'F1' | 'F2'>('F1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const myStaffId = useMemo(() => staff.find(s => s.user_id && s.user_id === user?.id)?.ID ?? null, [staff, user]);
  const isChair = myStaffId !== null && myStaffId === committee.chairperson_id;
  const isConvener = myStaffId !== null && myStaffId === committee.secretary_id;
  const panel = useMemo(() => {
    const ids = [...new Set([committee.chairperson_id, committee.secretary_id, ...members.map(m => m.staff_id)])];
    return ids.map(id => staff.find(s => s.ID === id)).filter((s): s is StaffMember => !!s);
  }, [committee, members, staff]);
  const isMember = myStaffId !== null && panel.some(s => s.ID === myStaffId);
  const nameOf = useCallback((userId: string) => staff.find(s => s.user_id === userId)?.Name ?? 'A member', [staff]);
  const mine = rows.find(r => r.memberUserId === user?.id);

  const reload = useCallback(() => {
    loadDeclarations(meeting.id).then(setRows).catch(e => push(friendlyError(e), 'error'));
  }, [meeting.id, push]);
  useEffect(() => { reload(); }, [reload]);

  if (!isMember) return null;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); push(done, 'success'); reload(); }
    catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };

  const printAnnexure = async () => {
    try {
      const [{ pdf }, { Annexure3Pdf }] = await Promise.all([import('@react-pdf/renderer'), import('../../lib/committees/annexure3Pdf')]);
      const doc = <Annexure3Pdf committee={committee.name} meeting={meeting.title} date={meeting.meeting_date}
        rows={rows.map(r => ({ name: nameOf(r.memberUserId), format: r.format, note: r.conflictNote, decision: r.chairDecision }))} />;
      const url = URL.createObjectURL(await pdf(doc).toBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `annexure3_${meeting.meeting_date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { push(friendlyError(e), 'error'); }
  };

  const seesAll = isChair || isConvener;
  const declaredIds = new Set(rows.map(r => r.memberUserId));
  const pending = panel.filter(s => s.user_id && !declaredIds.has(s.user_id));

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-terracotta" />
          <h3 className="text-sm font-medium text-text">Conflict of interest</h3>
          {seesAll && <Badge variant={pending.length ? 'warning' : 'success'}>{rows.length} of {panel.length} declared</Badge>}
        </div>
        {seesAll && <Button variant="secondary" onClick={() => void printAnnexure()}><FileDown size={14} className="mr-1.5 inline" />Annexure 3</Button>}
      </div>

      {mine?.chairDecision ? (
        <p className="text-sm text-text">You declared {mine.format === 'F1' ? 'no conflict' : 'a conflict'}; the chair decided: {mine.chairDecision === 'RECUSE' ? 'recuse' : 'continue'}.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-text-muted">
            {mine ? `You declared ${mine.format === 'F1' ? 'Format 1 (no conflict)' : 'Format 2 (a conflict)'}. You may change it until the chair decides.`
              : 'Declare before the meeting. Only you, the chair and the convener see it.'}
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-text">
            <label className="flex items-center gap-2"><input type="radio" checked={format === 'F1'} onChange={() => setFormat('F1')} />Format 1 — no conflict</label>
            <label className="flex items-center gap-2"><input type="radio" checked={format === 'F2'} onChange={() => setFormat('F2')} />Format 2 — I have a conflict</label>
          </div>
          {format === 'F2' && (
            <textarea aria-label="Describe the conflict" rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="What is the interest, and in which item?"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-terracotta/40" />
          )}
          <Button disabled={busy} onClick={() => void run(() => declare(meeting.id, format, format === 'F2' ? note : null), 'Declaration recorded')}>
            {mine ? 'Update declaration' : 'Declare'}
          </Button>
        </div>
      )}

      {seesAll && (
        <div className="border-t border-border pt-3 space-y-2">
          {rows.filter(r => r.format === 'F2').map(r => (
            <div key={r.id} className="flex items-start justify-between gap-3 text-sm">
              <div><p className="text-text">{nameOf(r.memberUserId)}</p><p className="text-xs text-text-muted">{r.conflictNote}</p></div>
              {r.chairDecision ? <Badge variant={r.chairDecision === 'RECUSE' ? 'warning' : 'neutral'}>{r.chairDecision === 'RECUSE' ? 'Recused' : 'Continues'}</Badge>
                : isChair && r.memberUserId !== user?.id ? (
                  <div className="flex gap-2 shrink-0">
                    <Button variant="secondary" disabled={busy} onClick={() => void run(() => chairDecide(r.id, 'CONTINUE'), 'Member continues')}>Continue</Button>
                    <Button variant="danger" disabled={busy} onClick={() => void run(() => chairDecide(r.id, 'RECUSE'), 'Member recused')}>Recuse</Button>
                  </div>
                ) : <Badge variant="info">Awaiting chair</Badge>}
            </div>
          ))}
          {pending.length > 0 && <p className="text-xs text-text-muted">Not yet declared: {pending.map(s => s.Name).join(', ')}</p>}
        </div>
      )}
    </Card>
  );
}

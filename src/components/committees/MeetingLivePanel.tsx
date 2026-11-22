import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Send, Users } from 'lucide-react';
import { Card, Badge } from '../ui/Cards';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import type { Committee, CommitteeMember, Meeting, StaffMember } from '../../types';
import {
  ackAgendaReceipt,
  adjournMeeting,
  circulateAgenda,
  fetchMeetingLiveState,
  markMeetingHeld,
  setMeetingAttendance,
  type AgendaCirculationRow,
  type AgendaReceiptRow,
  type AttendanceRow,
  type QuorumStatus,
} from '../../lib/committees/meetingLiveApi';

interface MeetingLivePanelProps {
  meeting: Meeting;
  committee: Committee;
  members: CommitteeMember[];
  staff: StaffMember[];
  canRun: boolean;
}

const STATUS_OPTS: AttendanceRow['status'][] = ['PRESENT', 'ONLINE', 'ABSENT', 'LEAVE_GRANTED'];

export function MeetingLivePanel({ meeting, committee, members, staff, canRun }: MeetingLivePanelProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshSlice } = useData();
  const [circulations, setCirculations] = useState<AgendaCirculationRow[]>([]);
  const [receipts, setReceipts] = useState<AgendaReceiptRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [quorum, setQuorum] = useState<QuorumStatus | null>(null);
  const [circNote, setCircNote] = useState('');
  const [replyNote, setReplyNote] = useState('');
  const [nextDate, setNextDate] = useState(meeting.meeting_date);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const state = await fetchMeetingLiveState(meeting.id);
      setCirculations(state.circulations);
      setReceipts(state.receipts);
      setAttendance(state.attendance);
      setQuorum(state.quorum);
    } catch {
      // Offline/non-Supabase fallback
    }
  }, [meeting.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const roster = useMemo(() => {
    const ids = new Map<string, string>();
    ids.set(committee.chairperson_id, 'CHAIRPERSON');
    ids.set(committee.secretary_id, 'MEMBER_SECRETARY');
    for (const m of members) {
      if (!ids.has(m.staff_id)) ids.set(m.staff_id, 'MEMBER');
    }
    return Array.from(ids.entries()).map(([staffId, seat]) => ({
      staffId,
      seat,
      name: staff.find((s) => s.ID === staffId)?.Name ?? staffId,
    }));
  }, [committee, members, staff]);

  const attMap = useMemo(() => {
    const map = new Map<string, AttendanceRow['status']>();
    for (const a of attendance) map.set(a.person_key, a.status);
    return map;
  }, [attendance]);

  const latestCirc = circulations[0] ?? null;
  const myReceipt = latestCirc && user
    ? receipts.find((r) => r.member_user_id === user.id) ?? null
    : null;
  const openedCount = receipts.filter((r) => r.opened_at).length;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-terracotta" />
          <h3 className="text-sm font-medium text-text">Agenda Circulation &amp; Live Attendance</h3>
          {quorum && (
            <Badge variant={quorum.quorum_met ? 'success' : 'warning'}>
              Quorum {quorum.present_count}/{quorum.required_min}
              {quorum.chair_required ? (quorum.chair_present ? ' · Chair present' : ' · Chair needed') : ''}
            </Badge>
          )}
        </div>
        {latestCirc && (
          <span className="text-xs font-mono tabular-nums text-text-muted">
            Agenda v{latestCirc.version} · {openedCount}/{receipts.length} opened
          </span>
        )}
      </div>

      {err && <p className="text-xs text-error-crimson">{err}</p>}

      {/* CM2: Circulate / Acknowledge */}
      {canRun && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={circNote}
            onChange={(e) => setCircNote(e.target.value)}
            placeholder="Circulation note for members…"
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-text"
          />
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await circulateAgenda(meeting.id, circNote.trim());
                setCircNote('');
                await load();
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Failed to circulate agenda');
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface text-xs font-medium text-text hover:bg-surface-hover disabled:opacity-50"
          >
            <Send size={13} /> {latestCirc ? `Circulate v${latestCirc.version + 1}` : 'Circulate agenda'}
          </button>
        </div>
      )}

      {myReceipt && latestCirc && (
        <div className="rounded-lg border border-border bg-background p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="space-y-0.5">
            <p className="font-medium text-text">Agenda v{latestCirc.version} receipt</p>
            <p className="text-text-muted">
              {myReceipt.replied_at
                ? `Replied: ${myReceipt.reply_note ?? 'Acknowledged'}`
                : myReceipt.opened_at
                  ? 'Marked opened'
                  : 'Please confirm receipt of the circulated agenda.'}
            </p>
          </div>
          {!myReceipt.replied_at && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={replyNote}
                onChange={(e) => setReplyNote(e.target.value)}
                placeholder="Optional note…"
                className="px-2 py-1 rounded border border-border bg-surface text-xs text-text"
              />
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    await ackAgendaReceipt(latestCirc.id, replyNote.trim() || undefined);
                    setReplyNote('');
                    await load();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Failed to acknowledge');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-terracotta text-ivory font-semibold"
              >
                <CheckCircle2 size={12} /> Confirm receipt
              </button>
            </div>
          )}
        </div>
      )}

      {/* CM3: Attendance Sheet */}
      <div className="divide-y divide-border">
        {roster.map((m) => {
          const cur = attMap.get(m.staffId) ?? 'ABSENT';
          return (
            <div key={m.staffId} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-medium text-text">{m.name}</span>
                <span className="ml-2 font-mono text-[11px] text-text-muted">{m.seat}</span>
              </div>
              <div className="flex items-center gap-1">
                {STATUS_OPTS.map((st) => (
                  <button
                    key={st}
                    type="button"
                    disabled={!canRun || busy}
                    onClick={async () => {
                      setBusy(true);
                      setErr(null);
                      try {
                        await setMeetingAttendance({
                          meetingId: meeting.id,
                          personKey: m.staffId,
                          status: st,
                          staffId: m.staffId,
                          seat: m.seat,
                        });
                        await load();
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : 'Failed to update attendance');
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className={`px-2 py-0.5 rounded border text-[11px] font-mono transition-colors ${
                      cur === st
                        ? 'border-terracotta bg-terracotta text-ivory font-semibold'
                        : 'border-border text-text-muted hover:text-text'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* CM3: Quorum-gated Mark Held or Adjourn */}
      {canRun && meeting.status === 'Scheduled' && (
        <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={busy || !quorum?.quorum_met}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await markMeetingHeld(meeting.id);
                await Promise.all([load(), refreshSlice('committees')]);
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Cannot mark meeting held');
              } finally {
                setBusy(false);
              }
            }}
            className="px-3.5 py-1.5 rounded-lg bg-terracotta hover:bg-terracotta-hover text-ivory text-xs font-semibold disabled:opacity-40"
          >
            Mark held
          </button>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="px-2 py-1 rounded border border-border bg-background text-xs font-mono text-text"
            />
            <button
              type="button"
              disabled={busy || !nextDate}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  const newId = await adjournMeeting(meeting.id, nextDate);
                  await refreshSlice('committees');
                  navigate(`/committees/meetings/${newId}`);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : 'Failed to adjourn meeting');
                } finally {
                  setBusy(false);
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover disabled:opacity-50"
            >
              Adjourn &amp; carry agenda
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

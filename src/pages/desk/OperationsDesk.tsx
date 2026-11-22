import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Mail, Microscope, Printer, ShieldAlert } from 'lucide-react';
import { Card } from '../../components/ui/Cards';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import {
  applyProjectLeave,
  bookInstrument,
  decideInstrumentBooking,
  decideProjectLeave,
  fetchOperationsDeskData,
  issueOfficialLetter,
  logDakLetter,
  reportSafetyIncident,
  requestOfficialLetter,
  type DakLetterRow,
  type FormShelfItem,
  type InstrumentBookingRow,
  type OfficialLetterRow,
  type ProjectLeaveRow,
  type SafetyIncidentRow,
} from '../../lib/home/stage5Api';

type Tab = 'shelf' | 'instruments' | 'leave' | 'dak' | 'safety';

export default function OperationsDesk() {
  const { user, activeRole } = useAuth();
  const { equipment } = useData();
  const [tab, setTab] = useState<Tab>('shelf');
  const [bookings, setBookings] = useState<InstrumentBookingRow[]>([]);
  const [leaves, setLeaves] = useState<ProjectLeaveRow[]>([]);
  const [letters, setLetters] = useState<OfficialLetterRow[]>([]);
  const [dak, setDak] = useState<DakLetterRow[]>([]);
  const [forms, setForms] = useState<FormShelfItem[]>([]);
  const [safety, setSafety] = useState<SafetyIncidentRow[]>([]);
  const [hqOnly, setHqOnly] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Forms state
  const [equipId, setEquipId] = useState('');
  const [bkStart, setBkStart] = useState('');
  const [bkEnd, setBkEnd] = useState('');
  const [bkPurpose, setBkPurpose] = useState('');
  const [leaveType, setLeaveType] = useState('CL');
  const [lvFrom, setLvFrom] = useState('');
  const [lvTo, setLvTo] = useState('');
  const [lvReason, setLvReason] = useState('');
  const [ltrKind, setLtrKind] = useState('BONAFIDE');
  const [ltrSubject, setLtrSubject] = useState('');
  const [dakNo, setDakNo] = useState('');
  const [dakDir, setDakDir] = useState<'INWARD' | 'OUTWARD'>('INWARD');
  const [dakParty, setDakParty] = useState('');
  const [dakSubj, setDakSubj] = useState('');
  const [dakHq, setDakHq] = useState(false);
  const [safLoc, setSafLoc] = useState('');
  const [safSev, setSafSev] = useState<'NEAR_MISS' | 'MINOR' | 'MAJOR'>('NEAR_MISS');
  const [safDesc, setSafDesc] = useState('');

  const canDecide = Boolean(
    activeRole && ['Director', 'HOD', 'DivisionHead', 'MasterAdmin', 'SystemAdmin', 'HRAdmin', 'Technician', 'Scientist'].includes(activeRole),
  );

  const load = useCallback(async () => {
    try {
      const data = await fetchOperationsDeskData();
      setBookings(data.bookings);
      setLeaves(data.leaves);
      setLetters(data.letters);
      setDak(data.dak);
      setForms(data.forms);
      setSafety(data.safety);
    } catch {
      // Offline/non-Supabase fallback
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredDak = useMemo(() => (hqOnly ? dak.filter((d) => d.is_hq) : dak), [dak, hqOnly]);

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-[500] font-serif text-text">Operations Desk</h1>
          <p className="text-xs text-text-muted">
            Self-service instrument slots, leave &amp; certificates, Dak register, forms shelf, and safety log.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="print:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-text hover:bg-surface-hover"
        >
          <Printer size={13} /> Print view
        </button>
      </div>

      <nav className="print:hidden flex flex-wrap gap-1.5 border-b border-border pb-2">
        {([
          ['shelf', 'Forms Shelf', FileText],
          ['instruments', 'Instrument Slots', Microscope],
          ['leave', 'Leave & Letters', FileText],
          ['dak', 'Dak & HQ Desk', Mail],
          ['safety', 'Safety Log', ShieldAlert],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
              tab === key ? 'bg-terracotta text-ivory font-semibold' : 'bg-surface text-text-muted hover:text-text'
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </nav>

      {err && <p className="text-xs text-error-crimson">{err}</p>}

      {tab === 'shelf' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {forms.map((f) => (
            <Card key={f.key} className="p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono uppercase text-text-muted">{f.category}</p>
                <p className="text-sm font-medium text-text">{f.title}</p>
                <p className="text-xs text-text-muted">{f.description}</p>
              </div>
              {f.link !== '/desk' ? (
                <Link to={f.link} className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover shrink-0">
                  Open
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (f.key === 'LEAVE_APP' || f.key === 'LETTER_REQ') setTab('leave');
                    else if (f.key === 'EQUIP_BOOK') setTab('instruments');
                    else if (f.key === 'SAFETY_INC') setTab('safety');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text hover:bg-surface-hover shrink-0"
                >
                  Open
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === 'instruments' && (
        <div className="space-y-4">
          <Card className="p-4 print:hidden">
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void runAction(async () => {
                  await bookInstrument({
                    equipmentId: equipId,
                    startsAt: new Date(bkStart).toISOString(),
                    endsAt: new Date(bkEnd).toISOString(),
                    purpose: bkPurpose,
                  });
                  setBkPurpose('');
                });
              }}
              className="grid grid-cols-1 sm:grid-cols-4 gap-2"
            >
              <select value={equipId} onChange={(e) => setEquipId(e.target.value)} required className="px-2.5 py-1.5 rounded border border-border bg-background text-xs text-text">
                <option value="">Select instrument…</option>
                {equipment.slice(0, 60).map((eq) => (
                  <option key={eq.UInsID} value={eq.UInsID}>{eq.Name}</option>
                ))}
              </select>
              <input type="datetime-local" value={bkStart} onChange={(e) => setBkStart(e.target.value)} required className="px-2.5 py-1.5 rounded border border-border bg-background text-xs font-mono text-text" />
              <input type="datetime-local" value={bkEnd} onChange={(e) => setBkEnd(e.target.value)} required className="px-2.5 py-1.5 rounded border border-border bg-background text-xs font-mono text-text" />
              <div className="flex gap-2">
                <input type="text" value={bkPurpose} onChange={(e) => setBkPurpose(e.target.value)} placeholder="Purpose" required className="flex-1 px-2.5 py-1.5 rounded border border-border bg-background text-xs text-text" />
                <button type="submit" disabled={busy} className="px-3 py-1.5 rounded bg-terracotta text-ivory text-xs font-semibold">Book</button>
              </div>
            </form>
          </Card>

          <Card className="p-4 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Booking Queue</h2>
            {bookings.length === 0 ? <p className="text-xs text-text-muted">No instrument bookings recorded.</p> : (
              <ul className="divide-y divide-border text-xs">
                {bookings.map((b) => (
                  <li key={b.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-text-muted mr-2">{b.equipment_id}</span>
                      <span className="font-medium text-text">{b.purpose}</span>
                      <span className="ml-2 font-mono text-text-muted">{b.status}</span>
                    </div>
                    {canDecide && b.status === 'PENDING' && (
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => void runAction(() => decideInstrumentBooking(b.id, 'APPROVED'))} className="px-2 py-0.5 rounded border border-border text-archive-green">Approve</button>
                        <button type="button" onClick={() => void runAction(() => decideInstrumentBooking(b.id, 'REJECTED'))} className="px-2 py-0.5 rounded border border-border text-error-crimson">Reject</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'leave' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Leave Requests (PJ2)</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runAction(async () => {
                  await applyProjectLeave(leaveType, lvFrom, lvTo, lvReason);
                  setLvReason('');
                });
              }}
              className="space-y-2 print:hidden"
            >
              <div className="flex gap-2">
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="px-2 py-1 rounded border border-border bg-background text-xs text-text">
                  <option value="CL">CL</option>
                  <option value="EL">EL</option>
                  <option value="MEDICAL">Medical</option>
                  <option value="DUTY">Duty</option>
                </select>
                <input type="date" value={lvFrom} onChange={(e) => setLvFrom(e.target.value)} required className="px-2 py-1 rounded border border-border bg-background text-xs font-mono text-text" />
                <input type="date" value={lvTo} onChange={(e) => setLvTo(e.target.value)} required className="px-2 py-1 rounded border border-border bg-background text-xs font-mono text-text" />
              </div>
              <div className="flex gap-2">
                <input type="text" value={lvReason} onChange={(e) => setLvReason(e.target.value)} placeholder="Reason…" className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-text" />
                <button type="submit" disabled={busy} className="px-3 py-1 rounded bg-terracotta text-ivory text-xs font-semibold">Apply</button>
              </div>
            </form>
            <ul className="divide-y divide-border text-xs">
              {leaves.map((l) => (
                <li key={l.id} className="py-2 flex items-center justify-between gap-2">
                  <span><span className="font-mono">{l.leave_type}</span> · {l.from_on} → {l.to_on} ({l.days_count}d) · {l.status}</span>
                  {canDecide && l.status === 'PENDING' && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => void runAction(() => decideProjectLeave(l.id, 'APPROVED'))} className="px-2 py-0.5 rounded border border-border text-archive-green">Approve</button>
                      <button type="button" onClick={() => void runAction(() => decideProjectLeave(l.id, 'REJECTED'))} className="px-2 py-0.5 rounded border border-border text-error-crimson">Reject</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Official Letters &amp; Certificates (PJ3)</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runAction(async () => {
                  await requestOfficialLetter(ltrKind, ltrSubject);
                  setLtrSubject('');
                });
              }}
              className="flex gap-2 print:hidden"
            >
              <select value={ltrKind} onChange={(e) => setLtrKind(e.target.value)} className="px-2 py-1 rounded border border-border bg-background text-xs text-text">
                <option value="BONAFIDE">Bonafide</option>
                <option value="EXPERIENCE">Experience</option>
                <option value="NOC">NOC</option>
                <option value="CLEARANCE">No-Dues</option>
              </select>
              <input type="text" value={ltrSubject} onChange={(e) => setLtrSubject(e.target.value)} placeholder="Purpose / subject" required className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-text" />
              <button type="submit" disabled={busy} className="px-3 py-1 rounded bg-terracotta text-ivory text-xs font-semibold">Request</button>
            </form>
            <ul className="divide-y divide-border text-xs">
              {letters.map((lt) => (
                <li key={lt.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-text">{lt.subject}</p>
                    <p className="font-mono text-[11px] text-text-muted">{lt.letter_no} · {lt.template_kind} · {lt.status}</p>
                  </div>
                  {lt.verification_code ? (
                    <Link to={`/verify/${lt.verification_code}`} className="font-mono text-terracotta hover:underline">{lt.verification_code}</Link>
                  ) : canDecide && lt.status === 'REQUESTED' ? (
                    <button type="button" onClick={() => void runAction(async () => { await issueOfficialLetter(lt.id); })} className="px-2 py-0.5 rounded border border-border text-archive-green">Issue &amp; Sign</button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'dak' && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Dak Register &amp; HQ Desk</h2>
            <label className="inline-flex items-center gap-1.5 text-xs text-text-muted">
              <input type="checkbox" checked={hqOnly} onChange={(e) => setHqOnly(e.target.checked)} />
              CSIR HQ only
            </label>
          </div>
          {canDecide && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runAction(async () => {
                  await logDakLetter({
                    dakNo,
                    direction: dakDir,
                    fromOrTo: dakParty,
                    subject: dakSubj,
                    isHq: dakHq,
                    divisionCode: user?.divisionCode ?? null,
                  });
                  setDakNo('');
                  setDakParty('');
                  setDakSubj('');
                });
              }}
              className="grid grid-cols-1 sm:grid-cols-5 gap-2 print:hidden"
            >
              <input type="text" value={dakNo} onChange={(e) => setDakNo(e.target.value)} placeholder="Dak No." required className="px-2 py-1 rounded border border-border bg-background text-xs font-mono text-text" />
              <select value={dakDir} onChange={(e) => setDakDir(e.target.value as 'INWARD' | 'OUTWARD')} className="px-2 py-1 rounded border border-border bg-background text-xs text-text">
                <option value="INWARD">Inward</option>
                <option value="OUTWARD">Outward</option>
              </select>
              <input type="text" value={dakParty} onChange={(e) => setDakParty(e.target.value)} placeholder="From / To" required className="px-2 py-1 rounded border border-border bg-background text-xs text-text" />
              <input type="text" value={dakSubj} onChange={(e) => setDakSubj(e.target.value)} placeholder="Subject" required className="px-2 py-1 rounded border border-border bg-background text-xs text-text" />
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-text-muted inline-flex items-center gap-1">
                  <input type="checkbox" checked={dakHq} onChange={(e) => setDakHq(e.target.checked)} /> HQ
                </label>
                <button type="submit" disabled={busy} className="px-3 py-1 rounded bg-terracotta text-ivory text-xs font-semibold">Log</button>
              </div>
            </form>
          )}
          <ul className="divide-y divide-border text-xs">
            {filteredDak.map((d) => (
              <li key={d.id} className="py-2 flex items-center justify-between gap-2">
                <span><span className="font-mono text-text-muted mr-2">{d.dak_no}</span>{d.direction} · {d.from_or_to} — {d.subject}</span>
                <span className="font-mono text-text-muted">{d.is_hq ? 'HQ · ' : ''}{d.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'safety' && (
        <Card className="p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Safety Incidents &amp; Near-Misses (CD16)</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAction(async () => {
                await reportSafetyIncident(safLoc, safSev, safDesc, user?.divisionCode ?? null);
                setSafLoc('');
                setSafDesc('');
              });
            }}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2 print:hidden"
          >
            <input type="text" value={safLoc} onChange={(e) => setSafLoc(e.target.value)} placeholder="Lab / Location" required className="px-2 py-1 rounded border border-border bg-background text-xs text-text" />
            <select value={safSev} onChange={(e) => setSafSev(e.target.value as 'NEAR_MISS' | 'MINOR' | 'MAJOR')} className="px-2 py-1 rounded border border-border bg-background text-xs text-text">
              <option value="NEAR_MISS">Near miss</option>
              <option value="MINOR">Minor</option>
              <option value="MAJOR">Major</option>
            </select>
            <input type="text" value={safDesc} onChange={(e) => setSafDesc(e.target.value)} placeholder="Observation…" required className="px-2 py-1 rounded border border-border bg-background text-xs text-text" />
            <button type="submit" disabled={busy} className="px-3 py-1 rounded bg-terracotta text-ivory text-xs font-semibold">Report</button>
          </form>
          <ul className="divide-y divide-border text-xs">
            {safety.map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between gap-2">
                <span><span className="font-mono text-text-muted mr-2">{s.severity}</span>{s.location}: {s.description}</span>
                <span className="font-mono text-text-muted">{s.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

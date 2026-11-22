import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Download, Layers, Shield, Wrench } from 'lucide-react';
import { Card } from '../../components/ui/Cards';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import { MfaEnrollmentCard } from '../../components/auth/MfaEnrollmentCard';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { supabase } from '../../utils/supabaseClient';
import {
  divisionExpertiseMatrix,
  isThreadIdle,
  portfolioHealthScore,
  rowsToCsv,
} from '../../lib/home/stage6';

interface TechRow { id: string; title: string; division_code: string; trl: number; status: string }
interface ThreadRow { id: string; partner_name: string; division_code: string; stage: string; last_contact_on: string }
interface FaultRow { id: string; equipment_id: string; fault_summary: string; severity: string; status: string }
interface NoDuesRow { id: string; library_ok: boolean; stores_ok: boolean; accounts_ok: boolean; it_ok: boolean; status: string }

export default function RoleDepthHub() {
  const { user } = useAuth();
  const { projects, staff, equipment } = useData();
  const [techs, setTechs] = useState<TechRow[]>([]);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [faults, setFaults] = useState<FaultRow[]>([]);
  const [noDues, setNoDues] = useState<NoDuesRow[]>([]);
  const [grievSummary, setGrievSummary] = useState('');
  const [faultEquip, setFaultEquip] = useState('');
  const [faultText, setFaultText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const health = useMemo(() => portfolioHealthScore(projects, todayIso), [projects, todayIso]);
  const divMatrix = useMemo(() => divisionExpertiseMatrix(staff), [staff]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [tRes, oRes, fRes, nRes] = await Promise.all([
      supabase.from('technologies').select('id, title, division_code, trl, status').limit(20),
      supabase.from('outside_threads').select('id, partner_name, division_code, stage, last_contact_on').limit(20),
      supabase.from('equipment_faults').select('id, equipment_id, fault_summary, severity, status').order('opened_at', { ascending: false }).limit(20),
      supabase.from('no_dues_clearances').select('id, library_ok, stores_ok, accounts_ok, it_ok, status').limit(10),
    ]);
    setTechs((tRes.data ?? []) as TechRow[]);
    setThreads((oRes.data ?? []) as ThreadRow[]);
    setFaults((fRes.data ?? []) as FaultRow[]);
    setNoDues((nRes.data ?? []) as NoDuesRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadCsv = () => {
    const csv = rowsToCsv(
      ['Division', 'StaffCount'],
      divMatrix.map((d) => [d.division, d.count]),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `division-strength-${todayIso}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Role Depth & Analytics' }]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-[500] font-serif text-text">Role Depth, Clearances &amp; Portfolio Health</h1>
          <p className="text-xs text-text-muted">
            Technologies &amp; outside threads (HH5/HH6), fault logs (TS3), clearances (CD12), private grievances (ST4), and division coverage (B1).
          </p>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-text hover:bg-surface-hover"
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      {msg && <p className="text-xs text-archive-green">{msg}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Layers size={13} /> Portfolio Health &amp; Division Coverage (C1 / B1)
          </h2>
          <p className="text-lg font-mono tabular-nums text-text">
            {health}/100 <span className="text-xs font-sans text-text-muted">active portfolio health</span>
          </p>
          <ul className="space-y-1 text-xs">
            {divMatrix.slice(0, 6).map((d) => (
              <li key={d.division} className="flex justify-between font-mono text-text-muted">
                <span>{d.division}</span>
                <span className="text-text">{d.count} staff</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Technologies &amp; Outside Threads (HH5 / HH6)
          </h2>
          {techs.length === 0 && threads.length === 0 ? (
            <p className="text-xs text-text-muted">No technologies or outside collaboration threads logged yet.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {techs.map((t) => (
                <li key={t.id} className="flex justify-between">
                  <span className="text-text font-medium">{t.title}</span>
                  <span className="font-mono text-text-muted">TRL {t.trl} · {t.division_code}</span>
                </li>
              ))}
              {threads.map((th) => (
                <li key={th.id} className="flex justify-between">
                  <span className="text-text">{th.partner_name} ({th.stage})</span>
                  <span className="font-mono text-text-muted">
                    {isThreadIdle(th.last_contact_on, todayIso) ? 'Idle 21d+' : th.last_contact_on}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Wrench size={13} /> Equipment Fault Log (TS3)
          </h2>
          <form
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              if (!supabase || !faultEquip || !faultText.trim()) return;
              await supabase.rpc('equipment_fault_report', {
                p_equipment_id: faultEquip,
                p_summary: faultText.trim(),
                p_severity: 'DOWN',
              });
              setFaultText('');
              setMsg('Fault logged.');
              await load();
            }}
            className="flex gap-2"
          >
            <select value={faultEquip} onChange={(e) => setFaultEquip(e.target.value)} required className="px-2 py-1 rounded border border-border bg-background text-xs text-text">
              <option value="">Instrument…</option>
              {equipment.slice(0, 40).map((eq) => (
                <option key={eq.UInsID} value={eq.UInsID}>{eq.Name}</option>
              ))}
            </select>
            <input type="text" value={faultText} onChange={(e) => setFaultText(e.target.value)} placeholder="Fault summary" required className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-text" />
            <button type="submit" className="px-3 py-1 rounded bg-terracotta text-ivory text-xs font-semibold">Log</button>
          </form>
          <ul className="space-y-1 text-xs">
            {faults.map((f) => (
              <li key={f.id} className="flex justify-between">
                <span className="text-text">{f.equipment_id}: {f.fault_summary}</span>
                <span className="font-mono text-text-muted">{f.status}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Shield size={13} /> No-Dues (CD12) &amp; Private Grievance (ST4)
          </h2>
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">{noDues.length} clearance record(s)</span>
            <button
              type="button"
              onClick={async () => {
                if (!supabase || !user) return;
                await supabase.rpc('no_dues_request');
                setMsg('No-Dues clearance started.');
                await load();
              }}
              className="px-2.5 py-1 rounded border border-border text-text hover:bg-surface-hover"
            >
              Start No-Dues
            </button>
          </div>
          <form
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              if (!supabase || grievSummary.trim().length < 10) return;
              await supabase.rpc('private_grievance_submit', {
                p_category: 'Academic',
                p_summary: grievSummary.trim(),
                p_against_user_id: null,
              });
              setGrievSummary('');
              setMsg('Private grievance submitted confidentially.');
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={grievSummary}
              onChange={(e) => setGrievSummary(e.target.value)}
              placeholder="Confidential grievance (10+ chars)…"
              className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-text"
            />
            <button type="submit" className="px-3 py-1 rounded border border-border text-xs text-text hover:bg-surface-hover">Submit</button>
          </form>
        </Card>
      </div>

      <MfaEnrollmentCard />
    </div>
  );
}

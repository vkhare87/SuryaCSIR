import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileDown, GraduationCap, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Badge } from '../components/ui/Cards';
import { Button } from '../components/ui/Button';
import { friendlyError } from '../lib/errors';
import {
  KIND_LABEL, THEME_OPTIONS, addTerm, findExperts, loadTerms, mergeTerm, themeLabel,
  type ExpertMatch, type ExpertiseTerm, type TermKind,
} from '../lib/expertise/api';

const input = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text';
const EVIDENCE_LABEL: Record<string, string> = { project: 'Project', scientific_output: 'Paper', ip: 'IP', note: 'Note' };

export default function Expertise() {
  const { roles } = useAuth();
  const { push } = useToast();
  const curator = roles.includes('HRAdmin') || roles.includes('MasterAdmin');
  const [terms, setTerms] = useState<ExpertiseTerm[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ExpertMatch[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reloadTerms = useCallback(() => { loadTerms().then(setTerms).catch(e => push(friendlyError(e), 'error')); }, [push]);
  useEffect(reloadTerms, [reloadTerms]);

  const termById = useMemo(() => new Map(terms.map(t => [t.id, t])), [terms]);
  const query = useMemo(() => [...chosen.map(id => termById.get(id)?.label ?? ''), text.trim()].filter(Boolean).join(', '), [chosen, termById, text]);

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!chosen.length && !text.trim()) return;
    setBusy(true);
    try { setRows(await findExperts(chosen, text)); }
    catch (err) { push(friendlyError(err), 'error'); }
    finally { setBusy(false); }
  };

  const shortlist = async () => {
    if (!rows?.length) return;
    try {
      const [{ pdf }, { ExpertShortlist }] = await Promise.all([import('@react-pdf/renderer'), import('../lib/staff/profilePdf')]);
      const url = URL.createObjectURL(await pdf(<ExpertShortlist query={query} rows={rows} />).toBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `expertise_shortlist_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { push(friendlyError(err), 'error'); }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif flex items-center gap-3">
          <GraduationCap size={26} className="text-terracotta" /> Expertise
        </h1>
        <p className="text-text-muted mt-1 text-sm">Who can do it? People with confirmed expertise come first, then people whose records mention it.</p>
      </div>

      <Card className="space-y-3">
        <form onSubmit={e => void search(e)} className="flex flex-wrap gap-2 items-center">
          <input aria-label="Search expertise" value={text} onChange={e => setText(e.target.value)} placeholder="A material, technique or application…" className={`${input} flex-1 min-w-[16rem]`} />
          <select aria-label="Add a term" value="" onChange={e => e.target.value && setChosen(c => c.includes(e.target.value) ? c : [...c, e.target.value])} className={input}>
            <option value="">Add a term…</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.label} · {KIND_LABEL[t.kind]}</option>)}
          </select>
          <Button type="submit" disabled={busy}><Search size={14} className="mr-1 inline" /> Find</Button>
          <Button type="button" variant="secondary" disabled={!rows?.length} onClick={() => void shortlist()}><FileDown size={14} className="mr-1 inline" /> Shortlist PDF</Button>
        </form>
        {chosen.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chosen.map(id => (
              <button key={id} onClick={() => setChosen(c => c.filter(x => x !== id))} className="rounded-full border border-border px-3 py-1 text-sm text-text hover:bg-surface-hover">
                {termById.get(id)?.label} ×
              </button>
            ))}
          </div>
        )}
      </Card>

      {rows && rows.length === 0 && <p className="text-sm text-text-muted">Nobody found. Try another word, or a broader term.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {rows?.map((r, i) => (
          <Card key={r.staff_id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link to={`/staff/${encodeURIComponent(r.staff_id)}`} className="text-text font-medium hover:underline">{i + 1}. {r.name}</Link>
                <p className="text-xs text-text-muted">{[r.designation, r.division].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {r.confirmed_terms > 0 && <Badge variant="success">Confirmed</Badge>}
                {r.overload && <Badge variant="warning">Overloaded</Badge>}
              </div>
            </div>
            <p className="text-xs text-text-muted">
              {r.evidence_count} record(s) · {r.active_projects} running project(s){r.retires_on ? ` · retires ${r.retires_on}` : ''}
            </p>
            <ul className="text-sm space-y-1">
              {r.evidence.slice(0, 5).map((e, j) => (
                <li key={`${e.type}:${e.id}:${j}`} className="flex gap-2">
                  <span className="text-xs text-text-muted w-14 shrink-0">{EVIDENCE_LABEL[e.type] ?? e.type}</span>
                  {/^https?:/.test(e.link)
                    ? <a href={e.link} target="_blank" rel="noreferrer" className="text-text hover:underline">{e.title}</a>
                    : <Link to={e.link} className="text-text hover:underline">{e.title}</Link>}
                </li>
              ))}
              {r.evidence.length > 5 && <li className="text-xs text-text-muted">and {r.evidence.length - 5} more</li>}
            </ul>
          </Card>
        ))}
      </div>

      {curator && <Vocabulary terms={terms} onChange={reloadTerms} />}
    </div>
  );
}

// HR keeps the list: add a term, merge a duplicate into the term that stays.
function Vocabulary({ terms, onChange }: { terms: ExpertiseTerm[]; onChange: () => void }) {
  const { push } = useToast();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<TermKind>('MATERIAL');
  const [theme, setTheme] = useState('');
  const [from, setFrom] = useState('');
  const [into, setInto] = useState('');

  const act = async (fn: () => Promise<unknown>, done: () => void) => {
    try { await fn(); done(); onChange(); }
    catch (err) { push(friendlyError(err), 'error'); }
  };

  return (
    <Card className="space-y-4">
      <h2 className="text-base font-[500] text-text font-serif">Vocabulary · {terms.length} terms</h2>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void act(() => addTerm(label, kind, theme || null), () => setLabel('')); }}>
        <input aria-label="New term" value={label} onChange={e => setLabel(e.target.value)} placeholder="New term" className={`${input} flex-1 min-w-[12rem]`} />
        <select aria-label="Kind" value={kind} onChange={e => setKind(e.target.value as TermKind)} className={input}>
          {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Theme" value={theme} onChange={e => setTheme(e.target.value)} className={input}>
          <option value="">No theme</option>
          {THEME_OPTIONS.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
        <Button type="submit" disabled={!label.trim()}>Add term</Button>
      </form>
      <form className="flex flex-wrap gap-2 items-center" onSubmit={e => { e.preventDefault(); void act(() => mergeTerm(from, into), () => { setFrom(''); setInto(''); }); }}>
        <span className="text-sm text-text-muted">Merge</span>
        <select aria-label="Duplicate term" value={from} onChange={e => setFrom(e.target.value)} className={input}>
          <option value="">duplicate…</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <span className="text-sm text-text-muted">into</span>
        <select aria-label="Term that stays" value={into} onChange={e => setInto(e.target.value)} className={input}>
          <option value="">term that stays…</option>
          {terms.filter(t => t.id !== from).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <Button type="submit" variant="secondary" disabled={!from || !into}>Merge</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {terms.map(t => (
          <span key={t.id} className="rounded-full border border-border px-3 py-1 text-xs text-text">
            {t.label} <span className="text-text-muted">· {KIND_LABEL[t.kind]}{t.theme_code ? ` · ${themeLabel(t.theme_code)}` : ''}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}

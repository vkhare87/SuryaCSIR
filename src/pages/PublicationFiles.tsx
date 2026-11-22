import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Badge } from '../components/ui/Cards';
import { Button } from '../components/ui/Button';
import { friendlyError } from '../lib/errors';
import {
  NEXT_STEP, PUB_STATUS_LABEL, consentPub, createPubFile, loadPubFiles, movePub, submitBlockers, type PubFile,
} from '../lib/publications/api';

const input = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text';
const CLEARER_ROLES = ['Director', 'MasterAdmin', 'HOD', 'DivisionHead'];

// EP12: a paper from draft to print. The database decides who may do what;
// the buttons are a hint.
export default function PublicationFiles() {
  const { user } = useAuth();
  const { staff } = useData();
  const { push } = useToast();
  const [files, setFiles] = useState<PubFile[]>([]);
  const [busy, setBusy] = useState('');
  const me = useMemo(() => staff.find(s => s.user_id && s.user_id === user?.id) ?? null, [staff, user]);
  const clearer = (user?.roles ?? []).some(r => CLEARER_ROLES.includes(r));

  const load = useCallback(() => { loadPubFiles().then(setFiles).catch(e => push(friendlyError(e), 'error')); }, [push]);
  useEffect(load, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) push(ok, 'success'); load(); }
    catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(''); }
  };

  const advance = (f: PubFile) => {
    const step = NEXT_STEP[f.status];
    if (!step) return;
    const details: Record<string, unknown> = {};
    if (step.to === 'ETHICS_CHECK') {
      const pct = window.prompt('Similarity found by the plagiarism check (%)');
      if (pct === null) return;
      details.similarity_pct = Number(pct);
    }
    if (step.to === 'SUBMITTED') {
      const journal = window.prompt('Journal it is submitted to', f.journal ?? '');
      if (journal === null) return;
      details.journal = journal;
    }
    if (step.to === 'PUBLISHED') {
      const year = window.prompt('Year of publication', String(new Date().getFullYear()));
      if (year === null) return;
      details.year = Number(year);
      details.doi = window.prompt('DOI (optional)', f.doi ?? '') ?? '';
    }
    void act(f.id, () => movePub(f.id, step.to, details), PUB_STATUS_LABEL[step.to]);
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif flex items-center gap-3">
          <FileText size={26} className="text-terracotta" /> Publication Files
        </h1>
        <p className="text-text-muted mt-1 text-sm">
          A paper gets its communication number at clearance. It is submitted only when every in-house author has consented.
        </p>
      </div>

      {me && <NewFile myId={me.ID} myName={me.Name} division={me.Division} onCreate={(title, authors) =>
        act('new', () => createPubFile(title, me.Division, authors), 'Publication file opened')} />}

      <div className="space-y-4">
        {files.map(f => {
          const step = NEXT_STEP[f.status];
          const mine = f.created_by === user?.id;
          const canStep = step && (step.by === 'author' ? mine : clearer && !mine);
          const blockers = f.status === 'CLEARED' ? submitBlockers(f) : [];
          const myRow = me && f.publication_author_consents.find(a => a.staff_id === me.ID);
          return (
            <Card key={f.id} className="space-y-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[14rem]">
                  <p className="text-text font-medium">{f.title}</p>
                  <p className="text-xs text-text-muted">
                    {f.division_code}{f.communication_no ? ` · ${f.communication_no}` : ''}{f.similarity_pct !== null ? ` · similarity ${f.similarity_pct}%` : ''}
                    {f.journal ? ` · ${f.journal}` : ''}{f.year ? ` ${f.year}` : ''}
                  </p>
                </div>
                <Badge variant={f.status === 'PUBLISHED' ? 'success' : f.status === 'DRAFT' ? 'neutral' : 'info'}>{PUB_STATUS_LABEL[f.status]}</Badge>
              </div>
              <ol className="text-sm space-y-1">
                {[...f.publication_author_consents].sort((a, b) => a.pos - b.pos).map(a => (
                  <li key={a.pos} className="flex gap-2">
                    <span className="w-5 text-text-muted">{a.pos}.</span>
                    <span className="text-text">{a.name}</span>
                    {a.staff_id && (a.consented_at
                      ? <span className="text-xs text-text-muted">consented · {a.contribution}</span>
                      : <span className="text-xs text-badge-warning-fg">consent awaited</span>)}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2 items-center">
                {myRow && !myRow.consented_at && ['DRAFT', 'ETHICS_CHECK', 'CLEARED'].includes(f.status) && (
                  <Button variant="secondary" disabled={busy === f.id} onClick={() => {
                    const c = window.prompt('Your contribution to this paper');
                    if (c) void act(f.id, () => consentPub(f.id, c), 'Consent recorded');
                  }}>Give my consent</Button>
                )}
                {canStep && (
                  <Button disabled={busy === f.id || blockers.length > 0} onClick={() => advance(f)}>{step.label}</Button>
                )}
                {clearer && !mine && f.status === 'ETHICS_CHECK' && (
                  <Button variant="secondary" disabled={busy === f.id} onClick={() => void act(f.id, () => movePub(f.id, 'DRAFT'), 'Returned')}>Return</Button>
                )}
                {blockers.length > 0 && <span className="text-xs text-text-muted">Cannot submit: {blockers.join('; ')}.</span>}
                {f.output_id && <Link to="/intelligence" className="text-xs text-text hover:underline">In the publication record as {f.output_id}</Link>}
              </div>
            </Card>
          );
        })}
        {files.length === 0 && <p className="text-sm text-text-muted">No publication files you can see yet.</p>}
      </div>
    </div>
  );
}

function NewFile({ myId, myName, division, onCreate }: {
  myId: string; myName: string; division: string;
  onCreate: (title: string, authors: { name: string; staff_id: string | null }[]) => Promise<void>;
}) {
  const { staff } = useData();
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState<{ name: string; staff_id: string | null }[]>([{ name: myName, staff_id: myId }]);
  const [extName, setExtName] = useState('');

  return (
    <Card className="space-y-3">
      <h2 className="text-base font-[500] text-text font-serif">Open a publication file · {division}</h2>
      <input aria-label="Paper title" placeholder="Title of the paper" value={title} onChange={e => setTitle(e.target.value)} className={`${input} w-full`} />
      <ol className="text-sm space-y-1">
        {authors.map((a, i) => (
          <li key={`${a.name}:${i}`} className="flex gap-2 items-center">
            <span className="w-5 text-text-muted">{i + 1}.</span>
            <span className="text-text">{a.name}</span>
            <span className="text-xs text-text-muted">{a.staff_id ? 'in-house' : 'external'}</span>
            {a.staff_id !== myId && (
              <button aria-label="Remove author" onClick={() => setAuthors(x => x.filter((_, j) => j !== i))} className="text-text-muted hover:text-text"><X size={12} /></button>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Add an in-house author" value="" onChange={e => {
          const s = staff.find(x => x.ID === e.target.value);
          if (s) setAuthors(x => [...x, { name: s.Name, staff_id: s.ID }]);
        }} className={input}>
          <option value="">Add an in-house author…</option>
          {staff.filter(s => !authors.some(a => a.staff_id === s.ID)).map(s => <option key={s.ID} value={s.ID}>{s.Name} · {s.Division}</option>)}
        </select>
        <input aria-label="External author" placeholder="External author's name" value={extName} onChange={e => setExtName(e.target.value)} className={input} />
        <Button variant="secondary" disabled={!extName.trim()} onClick={() => { setAuthors(x => [...x, { name: extName.trim(), staff_id: null }]); setExtName(''); }}>
          <Plus size={14} className="mr-1 inline" /> External
        </Button>
      </div>
      <Button disabled={!title.trim()} onClick={() => void onCreate(title, authors).then(() => { setTitle(''); setAuthors([{ name: myName, staff_id: myId }]); })}>Open file</Button>
    </Card>
  );
}

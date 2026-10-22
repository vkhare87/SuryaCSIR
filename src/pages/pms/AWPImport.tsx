import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Upload } from 'lucide-react';
import { useAWP } from '../../contexts/AWPContext';
import { useData } from '../../contexts/DataContext';
import { AWPPartVForm, type AWPFormSection } from '../../components/pms/AWPPartVForm';
import { Button } from '../../components/ui/Button';
import { emptyAWPContent, reportingYearFor } from '../../lib/pms/awp';
import { parseAWPText } from '../../lib/pms/awpExtract';
import type { AWPContent, AWPVerdict } from '../../types/pms';

type ImportStatus = 'APPROVED' | 'WITH_DIRECTOR' | 'WITH_RO';

interface QueueItem {
  key: string;
  file: File;
  url: string;
  state: 'waiting' | 'reading' | 'ready' | 'saved' | 'failed';
  progress: string;
  usedOcr: boolean;
  noText: boolean;
  content: AWPContent;
  flagged: Partial<Record<AWPFormSection, boolean>>;
  staffId: string;
  year: string;
  status: ImportStatus;
  roVerdict: AWPVerdict;
  roDate: string;
  approvedDate: string;
  error: string | null;
}

const field = 'px-3 py-2 border border-border rounded-xl text-sm bg-background text-text focus:outline-none focus:border-terracotta';
const normName = (s: string) => s.toLowerCase().replace(/^(dr|mr|mrs|ms|prof)\.?\s+/, '').replace(/[^a-z]/g, '');

export default function AWPImport() {
  const { importAWP } = useAWP();
  const { staff } = useData();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const scientists = useMemo(() => [...staff].sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? '')), [staff]);
  const patch = (key: string, p: Partial<QueueItem>) => setItems(prev => prev.map(it => (it.key === key ? { ...it, ...p } : it)));

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const added: QueueItem[] = Array.from(files)
      .filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      .map(file => ({
        key: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file, url: URL.createObjectURL(file), state: 'waiting', progress: '', usedOcr: false, noText: false,
        content: emptyAWPContent(), flagged: {}, staffId: '', year: reportingYearFor(new Date()),
        status: 'WITH_RO', roVerdict: 'REASONABLE', roDate: '', approvedDate: '', error: null,
      }));
    setItems(prev => [...prev, ...added]);
    if (!selectedKey && added[0]) setSelectedKey(added[0].key);
  };

  // Read queued PDFs one at a time — OCR is CPU-heavy.
  const next = items.find(it => it.state === 'waiting');
  const reading = items.some(it => it.state === 'reading');
  useEffect(() => {
    if (!next || reading) return;
    const key = next.key;
    patch(key, { state: 'reading', progress: 'Opening PDF…' });
    void (async () => {
      try {
        const { extractPdfText } = await import('../../lib/pms/awpOcr');
        const { text, usedOcr } = await extractPdfText(next.file, (p, n) => patch(key, { progress: `Reading page ${p} of ${n}…` }));
        const r = parseAWPText(text);
        const byId = r.employeeId ? staff.find(s => s.ID === r.employeeId) : undefined;
        const byName = !byId && r.name ? staff.filter(s => normName(s.Name ?? '') === normName(r.name!)) : [];
        const flagged = Object.fromEntries(
          Object.entries(r.confidence).map(([k, c]) => [k, c !== 'high']),
        ) as Partial<Record<AWPFormSection, boolean>>;
        patch(key, {
          state: 'ready', progress: '', usedOcr, content: r.content, flagged,
          noText: text.replace(/\s/g, '').length < 50,
          staffId: byId?.ID ?? (byName.length === 1 ? byName[0].ID : ''),
          year: r.reportingYear ?? reportingYearFor(new Date()),
          status: r.roVerdict ? 'WITH_DIRECTOR' : 'WITH_RO',
          roVerdict: r.roVerdict ?? 'REASONABLE',
        });
      } catch (e) {
        console.error('[awp] extract failed', e);
        patch(key, { state: 'ready', progress: '', noText: true, error: 'Could not read this PDF. Enter the plan by hand.' });
      }
    })();
  }, [next, reading, staff]);

  // Revoke previews on leave; a ref because the cleanup would otherwise see the first (empty) list.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach(it => URL.revokeObjectURL(it.url)), []);

  const sel = items.find(it => it.key === selectedKey);

  const save = async (it: QueueItem) => {
    setBusy(true);
    patch(it.key, { error: null });
    try {
      await importAWP({
        staffId: it.staffId, year: it.year, content: it.content, status: it.status, pdf: it.file,
        roVerdict: it.status === 'WITH_RO' ? undefined : it.roVerdict,
        roDate: it.roDate || undefined, approvedDate: it.approvedDate || undefined,
      });
      patch(it.key, { state: 'saved' });
      const nextReady = items.find(x => x.key !== it.key && x.state === 'ready');
      if (nextReady) setSelectedKey(nextReady.key);
    } catch (e) {
      patch(it.key, { error: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-serif font-medium text-text">Import Annual Work Plans</h1>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
        <Button onClick={() => fileRef.current?.click()}>
          <Upload size={14} className="mr-1.5" /> Add PDFs
        </Button>
      </div>
      <p className="text-sm text-text-muted">
        SURYA reads each PDF (scanned pages are read by OCR in this browser) and fills Part V. Check every section
        against the PDF — outlined sections need a closer look — then save. Nothing is saved until you press Save.
      </p>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map(it => (
            <button
              key={it.key}
              onClick={() => setSelectedKey(it.key)}
              className={clsx('px-3 py-1.5 rounded-full border text-xs',
                it.key === selectedKey ? 'border-terracotta text-text' : 'border-border text-text-muted')}
            >
              {it.file.name} · {it.state === 'reading' ? it.progress || 'reading' : it.state}
            </button>
          ))}
        </div>
      )}

      {sel && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <iframe title="AWP PDF" src={sel.url} className="w-full h-[80vh] border border-border rounded-2xl bg-surface lg:sticky lg:top-4" />
          <div className="space-y-4">
            {sel.state === 'reading' || sel.state === 'waiting' ? (
              <p className="text-sm text-text-muted">{sel.progress || 'Waiting…'}</p>
            ) : sel.state === 'saved' ? (
              <p className="text-sm text-text">Saved. <Link to="/pms/awp/register" className="text-terracotta underline">Open the register</Link></p>
            ) : (
              <>
                {sel.noText && <p className="p-3 border border-turmeric rounded-xl text-sm text-text">No text found in this PDF. Enter the plan by hand.</p>}
                {sel.usedOcr && !sel.noText && <p className="text-xs text-text-muted">Read by OCR — check numbers and names carefully.</p>}

                <div className="p-4 bg-surface border border-border rounded-2xl grid sm:grid-cols-2 gap-3">
                  <label className="text-xs text-text-muted sm:col-span-2">
                    Scientist
                    <select className={clsx(field, 'w-full mt-1')} value={sel.staffId} onChange={e => patch(sel.key, { staffId: e.target.value })}>
                      <option value="">— pick the scientist —</option>
                      {scientists.map(s => <option key={s.ID} value={s.ID}>{s.Name} ({s.ID}) · {s.Designation}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-text-muted">
                    Reporting year
                    <input className={clsx(field, 'w-full mt-1')} value={sel.year} pattern="\d{4}-\d{2}" onChange={e => patch(sel.key, { year: e.target.value })} />
                  </label>
                  <label className="text-xs text-text-muted">
                    How far did the paper get?
                    <select className={clsx(field, 'w-full mt-1')} value={sel.status} onChange={e => patch(sel.key, { status: e.target.value as ImportStatus })}>
                      <option value="WITH_RO">Not yet reviewed — send to HoD</option>
                      <option value="WITH_DIRECTOR">HoD signed — waiting for Director</option>
                      <option value="APPROVED">Director approved</option>
                    </select>
                  </label>
                  {sel.status !== 'WITH_RO' && (
                    <>
                      <label className="text-xs text-text-muted">
                        HoD verdict on paper
                        <select className={clsx(field, 'w-full mt-1')} value={sel.roVerdict} onChange={e => patch(sel.key, { roVerdict: e.target.value as AWPVerdict })}>
                          <option value="REASONABLE">Appears reasonable</option>
                          <option value="NOT_REASONABLE">Does not appear reasonable</option>
                        </select>
                      </label>
                      <label className="text-xs text-text-muted">
                        HoD signed on
                        <input type="date" className={clsx(field, 'w-full mt-1')} value={sel.roDate} onChange={e => patch(sel.key, { roDate: e.target.value })} />
                      </label>
                    </>
                  )}
                  {sel.status === 'APPROVED' && (
                    <label className="text-xs text-text-muted">
                      Director approved on
                      <input type="date" className={clsx(field, 'w-full mt-1')} value={sel.approvedDate} onChange={e => patch(sel.key, { approvedDate: e.target.value })} />
                    </label>
                  )}
                </div>

                <AWPPartVForm value={sel.content} onChange={c => patch(sel.key, { content: c })} flagged={sel.flagged} disabled={busy} />

                {sel.error && (
                  <p className="text-sm text-danger">
                    {sel.error}
                    {sel.error.includes('already exists') && <> — <Link to="/pms/awp/register" className="underline">open the register</Link></>}
                  </p>
                )}
                <Button isLoading={busy} disabled={!sel.staffId || !/^\d{4}-\d{2}$/.test(sel.year)} onClick={() => void save(sel)}>
                  Save AWP
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

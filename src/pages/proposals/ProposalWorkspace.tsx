import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, History, Monitor, Printer } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { useUI } from '../../contexts/UIContext';
import { Card } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { NotesPanel } from '../../components/proposals/NotesPanel';
import { ReadinessMeter } from '../../components/proposals/ReadinessMeter';
import { VersionsModal } from '../../components/proposals/VersionsModal';
import { StartIdeaForm } from '../../components/proposals/StartIdeaCard';
import { BudgetLinesEditor } from '../../components/proposals/BudgetLinesEditor';
import { SectionComments } from '../../components/proposals/SectionComments';
import { SimilarWorkPanel } from '../../components/SimilarWorkPanel';
import { submitProposal } from '../../lib/proposals/api';
import { uploadProposalDoc } from '../../lib/proposals/storage';
import {
  addBudgetLine, addNote, deleteBudgetLine, deleteNote, listNotes, listVersions, markNoteUsed, saveVersion,
  setCommentResolved, updateBudgetLine,
} from '../../lib/proposals/workspaceApi';
import { HQ_CATEGORIES, durationNote } from '../../lib/proposals/categories';
import { fiscalYearsFor, rupees } from '../../lib/projects/heads';
import { readPending } from '../../lib/proposals/autosave';
import { useDraftAutosave, type SaveState } from '../../lib/proposals/useDraftAutosave';
import {
  REQUIRED_COLUMNS, SECTIONS, missingItems, sectionState, type SectionKey,
} from '../../lib/proposals/readiness';
import {
  DOMAIN_THEMES, FUND_TYPES, PROJECT_CATEGORIES, SPONSOR_TYPES,
} from '../../lib/proposals/constants';
import { canEditProposal } from '../../lib/proposals/permissions';
import { friendlyError } from '../../lib/errors';
import type {
  NoteTarget, Proposal, ProposalBudgetLine, ProposalCoPI, ProposalNote, ReviewComment,
} from '../../types/proposal';
import type { StaffMember } from '../../types';

const TRACKS = [
  { code: 'ULIP', label: 'In-house (ULIP)', hint: 'Reviewed by the institute\'s review committee, approved by the Director.' },
  { code: 'HQ', label: 'CSIR HQ scheme', hint: 'FBR, NCP, FTT, FTC, MMP and the other headquarters-funded categories.' },
] as const;

// What an in-house proposal's funding fields almost always say.
const ULIP_FUNDING = { fundType: 'Internal', sponsorType: 'CSIR-Internal', sponsorName: 'CSIR-AMPRI' } as const;

const NOTE_SECTION: Record<NoteTarget, SectionKey> = {
  abstract: 'idea', problemStatement: 'idea', objectives: 'plan', expectedOutcomes: 'plan',
};

const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-terracotta/40';

export default function ProposalWorkspace() {
  const { id } = useParams<{ id?: string }>();
  // `key` gives each proposal its own autosave buffer and state.
  return id ? <Workspace key={id} id={id} /> : <NewIdea />;
}

// --- 1. /proposals/new — a title is all it takes ---

function NewIdea() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card className="space-y-4">
        <div>
          <h1 className="text-2xl font-[500] font-serif text-text">New project idea</h1>
          <p className="text-sm text-text-muted mt-1">
            Give it a working title. Everything else can wait, and it stays private until you submit.
          </p>
        </div>
        <StartIdeaForm autoFocus />
      </Card>
    </div>
  );
}

// --- 2. The workspace ---

function Workspace({ id }: { id: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { staff, divisions } = useData();
  const { getProposal, saveFields, saveCoPIs } = useProposals();
  const { isMobile } = useUI();

  const [draft, setDraft] = useState<Proposal | null>(null);
  const [notes, setNotes] = useState<ProposalNote[]>([]);
  const [section, setSection] = useState<SectionKey>('idea');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notesError, setNotesError] = useState('');
  const [restoredFromBrowser, setRestoredFromBrowser] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const autosave = useDraftAutosave(id, saveFields);

  const load = useCallback(async () => {
    const p = await getProposal(id);
    if (user && !canEditProposal(user, p)) {
      navigate(`/proposals/${id}`, { replace: true });
      return;
    }
    // Typing from an earlier session that never reached the server wins over
    // what the server has; the autosave hook is already sending it.
    const left = readPending(id);
    setRestoredFromBrowser(!!left);
    setDraft(left ? { ...p, ...left } : p);
  }, [id, user, getProposal, navigate]);

  useEffect(() => {
    let cancelled = false;
    load().catch((e) => { if (!cancelled) setLoadError(friendlyError(e)); });
    listNotes(id).then(
      (n) => { if (!cancelled) setNotes(n); },
      (e) => { if (!cancelled) setNotesError(friendlyError(e)); },
    );
    return () => { cancelled = true; };
  }, [id, load]);

  const set = useCallback(<K extends keyof Proposal>(field: K, value: Proposal[K]) => {
    setDraft((d) => (d ? { ...d, [field]: value } : d));
    autosave.queue({ [field]: value });
  }, [autosave]);

  const ctx = useMemo(() => ({
    hasSignedScan: !!draft?.documents?.some((d) => d.docType === 'signed_proposal'),
    hasQuotation: !!draft?.documents?.some((d) => d.docType === 'quotation'),
    lines: draft?.budgetLines ?? [],
  }), [draft]);
  const missing = useMemo(() => (draft ? missingItems(draft, ctx) : []), [draft, ctx]);
  const years = useMemo(
    () => (draft ? fiscalYearsFor(draft.proposedStartDate, draft.proposedDurationMonths) : []),
    [draft],
  );
  const openComments = useMemo(() => {
    const m: Partial<Record<SectionKey, number>> = {};
    for (const c of draft?.comments ?? []) if (!c.resolvedAt) m[c.section] = (m[c.section] ?? 0) + 1;
    return m;
  }, [draft]);
  const [printing, setPrinting] = useState(false);

  // --- 3. Actions ---

  function chooseTrack(code: string) {
    if (!draft) return;
    const patch: Partial<Proposal> = { track: code };
    if (code === 'ULIP') {
      if (!draft.fundType) patch.fundType = ULIP_FUNDING.fundType;
      if (!draft.sponsorType) patch.sponsorType = ULIP_FUNDING.sponsorType;
      if (!draft.sponsorName) patch.sponsorName = ULIP_FUNDING.sponsorName;
    }
    setDraft({ ...draft, ...patch });
    autosave.queue(patch);
  }

  async function changeCoPIs(coPIs: ProposalCoPI[]) {
    setDraft((d) => (d ? { ...d, coPIs } : d));
    setActionError('');
    try {
      await saveCoPIs(id, coPIs);
    } catch (e) {
      setActionError(friendlyError(e));
    }
  }

  async function onAddNote(body: string) {
    setNotesError('');
    try {
      const note = await addNote(id, body);
      setNotes((n) => [note, ...n]);
    } catch (e) {
      setNotesError(friendlyError(e));
      throw e;
    }
  }

  async function onUseNote(note: ProposalNote, target: NoteTarget, move: boolean) {
    if (!draft) return;
    const existing = draft[target].trimEnd();
    set(target, existing ? `${existing}\n\n${note.body}` : note.body);
    setSection(NOTE_SECTION[target]);
    if (!move) return;
    setNotesError('');
    try {
      const updated = await markNoteUsed(note.id, target);
      setNotes((n) => n.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      setNotesError(friendlyError(e));
    }
  }

  async function onDeleteNote(note: ProposalNote) {
    setNotesError('');
    try {
      await deleteNote(note.id);
      setNotes((n) => n.filter((x) => x.id !== note.id));
    } catch (e) {
      setNotesError(friendlyError(e));
    }
  }

  // Lines change the requested total in the database (a trigger sums them);
  // mirror it here so the meter and the header agree without a refetch.
  function setLines(update: (lines: ProposalBudgetLine[]) => ProposalBudgetLine[]) {
    setDraft((d) => {
      if (!d) return d;
      const budgetLines = update(d.budgetLines ?? []);
      return { ...d, budgetLines, requestedBudget: budgetLines.reduce((s, l) => s + l.amount, 0) };
    });
  }
  async function onAddLine(line: Omit<ProposalBudgetLine, 'id'>) {
    setActionError('');
    try { const added = await addBudgetLine(id, line); setLines((ls) => [...ls, added]); }
    catch (e) { setActionError(friendlyError(e)); }
  }
  async function onUpdateLine(lineId: string, patch: Partial<Omit<ProposalBudgetLine, 'id'>>) {
    setActionError('');
    try { await updateBudgetLine(lineId, patch); setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, ...patch } : l))); }
    catch (e) { setActionError(friendlyError(e)); }
  }
  async function onDeleteLine(lineId: string) {
    setActionError('');
    try { await deleteBudgetLine(lineId); setLines((ls) => ls.filter((l) => l.id !== lineId)); }
    catch (e) { setActionError(friendlyError(e)); }
  }

  async function onResolveComment(c: ReviewComment, resolved: boolean) {
    setActionError('');
    try {
      await setCommentResolved(c.id, resolved);
      const at = resolved ? new Date().toISOString() : null;
      setDraft((d) => (d ? { ...d, comments: (d.comments ?? []).map((x) => (x.id === c.id ? { ...x, resolvedAt: at } : x)) } : d));
    } catch (e) {
      setActionError(friendlyError(e));
    }
  }

  // Marks a version, so the signed scan can be matched to exactly what was printed.
  async function onPrint() {
    if (!draft) return;
    setPrinting(true); setActionError('');
    try {
      await autosave.flush();
      await saveVersion(id, 'Printed for signature');
      const versionNo = (await listVersions(id))[0]?.versionNo ?? 1;
      // Loaded on demand: the PDF renderer is large and most visits never print.
      const [{ pdf }, { ProposalPDF }] = await Promise.all([
        import('@react-pdf/renderer'), import('../../components/proposals/ProposalPDF'),
      ]);
      const blob = await pdf(<ProposalPDF proposal={draft} versionNo={versionNo} printedAt={new Date()} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${draft.proposalCode}_v${versionNo}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setPrinting(false);
    }
  }

  async function onUploadDoc(type: 'signed_proposal' | 'quotation', file: File) {
    setBusy(true); setActionError('');
    const res = await uploadProposalDoc(id, type, file);
    if (!res.ok) setActionError(res.error);
    else {
      const fresh = await getProposal(id);
      setDraft((d) => (d ? { ...d, documents: fresh.documents } : d));
    }
    setBusy(false);
  }

  async function onSubmit() {
    setBusy(true); setActionError('');
    try {
      await autosave.flush();
      const res = await submitProposal(id);
      if (!res.ok) { setActionError(res.error); return; }
      navigate(`/proposals/${id}`);
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  // --- 4. Render ---

  if (loadError) {
    return (
      <div className="p-6 space-y-3">
        <p role="alert" className="text-danger">{loadError}</p>
        <Link to="/proposals" className="text-sm text-text-muted underline">Back to proposals</Link>
      </div>
    );
  }
  if (!draft) return <div className="p-6 text-text-muted">Loading…</div>;

  const header = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Link to="/proposals" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text">
          <ArrowLeft size={14} /> Proposals
        </Link>
        <div className="flex items-center gap-3">
          <SaveIndicator state={autosave.state} />
          <span className="font-mono text-xs text-text-muted">{draft.proposalCode}</span>
        </div>
      </div>
      <input
        aria-label="Title"
        value={draft.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="Working title"
        className="w-full bg-transparent text-2xl sm:text-3xl font-[500] font-serif text-text border-0 border-b border-transparent hover:border-border focus:border-terracotta/50 focus:outline-none pb-1"
      />
      {draft.status === 'REVISION_REQUESTED' && draft.revisionNotes && (
        <div className="border border-border rounded-lg bg-surface px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-turmeric">Revision asked</p>
          <p className="text-sm text-text whitespace-pre-wrap mt-1">{draft.revisionNotes}</p>
        </div>
      )}
      {restoredFromBrowser && (
        <p role="status" className="text-xs text-text-muted">
          Unsaved changes from your last session on this browser were restored.
        </p>
      )}
    </div>
  );

  const notesPanel = (
    <NotesPanel
      notes={notes}
      onAdd={onAddNote}
      onUse={onUseNote}
      onDelete={onDeleteNote}
      canUse={!isMobile}
      error={notesError}
    />
  );

  // Phones are for jotting. The sections need a real keyboard and screen.
  if (isMobile) {
    return (
      <div className="p-4 space-y-5">
        {header}
        <div className="flex items-start gap-2 text-xs text-text-muted border border-border rounded-lg bg-surface px-3 py-2">
          <Monitor size={14} className="mt-0.5 shrink-0" />
          <span>Add notes here. Open SURYA on a computer to write the proposal sections and submit.</span>
        </div>
        {notesPanel}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {header}

      <ReadinessMeter missing={missing} total={REQUIRED_COLUMNS.length + 1} onGo={setSection} />

      {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}

      <div className="grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)_20rem]">
        <nav aria-label="Proposal sections" className="flex lg:flex-col gap-1 overflow-x-auto">
          {SECTIONS.map((s) => {
            const state = sectionState(draft, ctx, s.key);
            const open = openComments[s.key] ?? 0;
            return (
              <button
                key={s.key}
                type="button"
                aria-current={section === s.key ? 'step' : undefined}
                onClick={() => setSection(s.key)}
                className={clsx(
                  'flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-left whitespace-nowrap transition-colors',
                  section === s.key ? 'bg-surface-hover text-text font-medium' : 'text-text-muted hover:text-text hover:bg-surface-hover',
                )}
              >
                <span>
                  {s.label}
                  {open > 0 && <span className="ml-1.5 text-[11px] font-mono text-turmeric" aria-label={`${open} comments to address`}>{open}</span>}
                </span>
                {state === 'done' && <Check size={14} className="text-archive-green" aria-label="complete" />}
                {state === 'started' && <span className="w-1.5 h-1.5 rounded-full bg-turmeric" aria-label="started" />}
              </button>
            );
          })}
          <div className="lg:mt-4 lg:pt-4 lg:border-t lg:border-border flex lg:flex-col gap-2">
            <Button variant="ghost" size="sm" onClick={() => setVersionsOpen(true)} className="justify-start">
              <History size={14} className="mr-2" /> Versions
            </Button>
          </div>
        </nav>

        <Card className="space-y-4 min-w-0">
          <SectionComments section={section} comments={draft.comments ?? []} mode="author" onResolve={onResolveComment} />
          {section === 'idea' && (
            <>
              <fieldset>
                <legend className="block text-xs font-medium text-text-muted mb-1">Track</legend>
                <div className="grid sm:grid-cols-2 gap-2">
                  {TRACKS.map((t) => (
                    <label
                      key={t.code}
                      className={clsx(
                        'border rounded-lg px-3 py-2 cursor-pointer transition-colors',
                        draft.track === t.code ? 'border-terracotta/60 bg-surface-hover' : 'border-border hover:bg-surface-hover',
                      )}
                    >
                      <input
                        type="radio" name="track" className="sr-only"
                        checked={draft.track === t.code}
                        onChange={() => chooseTrack(t.code)}
                      />
                      <span className="block text-sm font-medium text-text">{t.label}</span>
                      <span className="block text-xs text-text-muted">{t.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Short name">
                  <input className={inputCls} value={draft.acronym ?? ''} onChange={(e) => set('acronym', e.target.value)} />
                </Field>
                <Field label="Theme">
                  <select className={inputCls} value={draft.domainTheme} onChange={(e) => set('domainTheme', e.target.value)}>
                    <option value="">Select…</option>
                    {DOMAIN_THEMES.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Abstract">
                <textarea rows={5} className={inputCls} value={draft.abstract} onChange={(e) => set('abstract', e.target.value)} />
              </Field>
              <Field label="Problem statement">
                <textarea rows={5} className={inputCls} value={draft.problemStatement} onChange={(e) => set('problemStatement', e.target.value)} />
              </Field>
              {draft.title.trim() && draft.abstract.trim() && (
                <SimilarWorkPanel text={`${draft.title}. ${draft.abstract}`} />
              )}
            </>
          )}

          {section === 'plan' && (
            <>
              <Field label="Objectives">
                <textarea rows={6} className={inputCls} value={draft.objectives} onChange={(e) => set('objectives', e.target.value)} />
              </Field>
              <Field label="Expected outcomes">
                <textarea rows={5} className={inputCls} value={draft.expectedOutcomes} onChange={(e) => set('expectedOutcomes', e.target.value)} />
              </Field>
              <div className="grid sm:grid-cols-3 gap-4">
                {draft.track === 'HQ' ? (
                  <Field label="HQ category">
                    <select className={inputCls} value={draft.categoryCode ?? ''} onChange={(e) => set('categoryCode', e.target.value || null)}>
                      <option value="">Select…</option>
                      {HQ_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                    </select>
                  </Field>
                ) : (
                  <Field label="Category">
                    <select className={inputCls} value={draft.projectCategory} onChange={(e) => set('projectCategory', e.target.value)}>
                      <option value="">Select…</option>
                      {PROJECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Proposed start">
                  <input type="date" className={inputCls} value={draft.proposedStartDate} onChange={(e) => set('proposedStartDate', e.target.value)} />
                </Field>
                <Field label="Duration (months)">
                  <input
                    type="number" min={1} className={inputCls}
                    value={draft.proposedDurationMonths || ''}
                    onChange={(e) => set('proposedDurationMonths', Number(e.target.value) || 0)}
                  />
                </Field>
              </div>
              {draft.track === 'HQ' && draft.categoryCode && (() => {
                const cat = HQ_CATEGORIES.find((c) => c.code === draft.categoryCode);
                const note = durationNote(draft.categoryCode, draft.proposedDurationMonths);
                return (
                  <p className={clsx('text-xs', note ? 'text-turmeric' : 'text-text-muted')}>
                    {note ?? `${cat?.code}: target ${cat?.trl}${cat?.months ? `, normally ${cat.months[0] === cat.months[1] ? cat.months[0] : `${cat.months[0]}–${cat.months[1]}`} months` : ''}.`}
                  </p>
                );
              })()}
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Readiness level now (TRL 1–9)">
                  <input
                    type="number" min={1} max={9} className={inputCls}
                    value={draft.currentTrl ?? ''}
                    onChange={(e) => set('currentTrl', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </Field>
                <Field label="Readiness level aimed for (TRL 1–9)">
                  <input
                    type="number" min={1} max={9} className={inputCls}
                    value={draft.targetTrl ?? ''}
                    onChange={(e) => set('targetTrl', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </Field>
              </div>
            </>
          )}

          {section === 'team' && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Principal investigator">
                  <input className={inputCls} value={draft.piName} onChange={(e) => set('piName', e.target.value)} />
                </Field>
                <Field label="Division">
                  <select className={inputCls} value={draft.divisionCode} onChange={(e) => set('divisionCode', e.target.value)}>
                    <option value="">Select…</option>
                    {/* Keep a code the list does not carry, rather than silently dropping it. */}
                    {draft.divisionCode && !divisions.some((d) => d.divCode === draft.divisionCode) && (
                      <option>{draft.divisionCode}</option>
                    )}
                    {divisions.map((d) => <option key={d.divCode} value={d.divCode}>{d.divCode} — {d.divName}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Co-PIs">
                <CoPIPicker staff={staff} value={draft.coPIs ?? []} onChange={(v) => void changeCoPIs(v)} />
              </Field>
              <p className="text-xs text-text-muted">Co-PIs can read this draft. Only you can edit it.</p>
            </>
          )}

          {section === 'budget' && (
            <>
              <BudgetLinesEditor
                lines={draft.budgetLines ?? []} years={years} editable
                onAdd={onAddLine} onUpdate={onUpdateLine} onDelete={onDeleteLine}
              />
              {(draft.budgetLines ?? []).length === 0 && draft.requestedBudget > 0 && (
                <p className="text-xs text-text-muted">
                  A total of {rupees(draft.requestedBudget)} was entered before budget lines existed. Add lines to break it down;
                  the total then follows them.
                </p>
              )}
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Fund type">
                  <select className={inputCls} value={draft.fundType} onChange={(e) => set('fundType', e.target.value)}>
                    <option value="">Select…</option>
                    {FUND_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Sponsor type">
                  <select className={inputCls} value={draft.sponsorType} onChange={(e) => set('sponsorType', e.target.value)}>
                    <option value="">Select…</option>
                    {SPONSOR_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Sponsor">
                  <input className={inputCls} value={draft.sponsorName} onChange={(e) => set('sponsorName', e.target.value)} />
                </Field>
              </div>
            </>
          )}

          {section === 'documents' && (
            <>
              <ol className="text-sm text-text space-y-1 list-decimal pl-5">
                <li>Print the proposal. A version is marked, and its number is on every page.</li>
                <li>Have it signed on paper.</li>
                <li>Scan it and upload the scan below, then submit.</li>
              </ol>
              <div>
                <Button variant="secondary" onClick={() => void onPrint()} isLoading={printing}>
                  <Printer size={14} className="mr-2" /> Print for signature
                </Button>
              </div>
              {ctx.lines.some((l) => l.head === 'EQUIPMENT' && l.amount >= 500000) && (
                <Field label="Quotations for equipment of ₹5 lakh or more (PDF)">
                  <input
                    type="file" accept="application/pdf" disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void onUploadDoc('quotation', file);
                    }}
                    className="text-sm text-text"
                  />
                </Field>
              )}
              <Field label="Signed proposal (PDF)">
                <input
                  type="file" accept="application/pdf" disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void onUploadDoc('signed_proposal', file);
                  }}
                  className="text-sm text-text"
                />
              </Field>
              <ul className="text-sm text-text space-y-1">
                {(draft.documents ?? []).filter((d) => d.docType === 'signed_proposal' || d.docType === 'quotation').map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <Check size={14} className="text-archive-green" />
                    <span className="truncate">{d.docType === 'quotation' ? 'Quotation — ' : ''}{d.fileName}</span>
                    <span className="font-mono text-xs text-text-muted">
                      {new Date(d.uploadedAt).toLocaleDateString('en-IN')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-text-muted">
                Submitting sends it to PME; the draft then becomes read-only unless a revision is asked.
              </p>
              <div>
                <Button onClick={() => void onSubmit()} isLoading={busy} disabled={missing.length > 0}>
                  Submit proposal
                </Button>
                {missing.length > 0 && (
                  <span className="ml-3 text-xs text-text-muted">
                    {missing.length} thing{missing.length === 1 ? '' : 's'} still needed — see the list above.
                  </span>
                )}
              </div>
            </>
          )}
        </Card>

        <aside className="lg:border-l lg:border-border lg:pl-6 min-w-0">{notesPanel}</aside>
      </div>

      <VersionsModal
        isOpen={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        current={draft}
        flush={autosave.flush}
        onRestored={load}
      />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'saving') return <span role="status" className="text-xs text-text-muted">Saving…</span>;
  if (state.kind === 'error') {
    return (
      <span role="alert" className="text-xs text-danger">
        Not saved yet — retrying. Your text is kept in this browser.
      </span>
    );
  }
  return (
    <span role="status" className="text-xs text-text-muted">
      Saved <span className="font-mono">{state.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

function CoPIPicker({
  staff, value, onChange,
}: {
  staff: StaffMember[];
  value: ProposalCoPI[];
  onChange: (v: ProposalCoPI[]) => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const available = useMemo(() => staff.filter((s) => !value.some((c) => c.staffId === s.ID)), [staff, value]);

  const add = () => {
    const found = staff.find((s) => s.ID === selectedId);
    if (!found) return;
    onChange([...value, { staffId: found.ID, staffName: found.Name }]);
    setSelectedId('');
  };

  return (
    <div>
      <div className="flex gap-2">
        <select aria-label="Staff member to add as co-PI" className={inputCls} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select staff…</option>
          {available.map((s) => <option key={s.ID} value={s.ID}>{s.Name}</option>)}
        </select>
        <Button type="button" variant="secondary" onClick={add} disabled={!selectedId}>Add</Button>
      </div>
      <ul className="mt-2 space-y-1">
        {value.map((c) => (
          <li key={c.staffId} className="flex items-center justify-between text-sm text-text bg-surface-hover px-3 py-1 rounded">
            <span>{c.staffName}</span>
            <button
              type="button" aria-label={`Remove ${c.staffName}`}
              onClick={() => onChange(value.filter((x) => x.staffId !== c.staffId))}
              className="text-text-muted hover:text-danger"
            >×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useProposals } from '../../contexts/ProposalsContext';
import {
  CLOSURE_STEP_LABELS, COMPLETION_FIELDS, EMPTY_COMPLETION, OBJECTIVES_LABELS, completionMissing, fieldLabel, followOnIdeas,
} from '../../lib/projects/closure';
import { headLabel, rupees } from '../../lib/projects/heads';
import { projectStage } from '../../lib/projects/stage';
import {
  archiveProject, recordCompletionStep, saveCompletion, submitCompletion, uploadProjectDocument,
} from '../../lib/projects/projectFileApi';
import { uploadDocument } from '../../lib/documents/registry';
import { friendlyError } from '../../lib/errors';
import type { ProjectInfo } from '../../types';
import type { ChangeStepKind, CompletionFields, CompletionReport, ObjectivesStatus, ProjectFile } from '../../types/projectFile';

const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';
const STATUS: Record<CompletionReport['status'], { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' }> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  SUBMITTED: { label: 'Submitted', variant: 'info' },
  UNDER_REVIEW: { label: 'In review', variant: 'info' },
  RETURNED: { label: 'Returned to the PI', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
};
const RESEARCHERS = ['Scientist', 'HOD', 'DivisionHead', 'Director'];

interface ClosurePanelProps {
  project: ProjectInfo;
  file: ProjectFile;
  isPi: boolean;
  isOffice: boolean;
  roles: string[];
  onChanged: () => Promise<void>;
}

export function ClosurePanel({ project, file, isPi, isOffice, roles, onChanged }: ClosurePanelProps) {
  const r = file.completion;
  const stage = projectStage(project);
  const editable = isPi && (!r || r.status === 'DRAFT' || r.status === 'RETURNED')
    && ['SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING', 'FORECLOSED'].includes(stage ?? '');
  const [writing, setWriting] = useState(false);

  // A display hint only; project_change_caller_may_act() decides.
  const mayAct = (k: ChangeStepKind) => !isPi && (roles.includes('MasterAdmin') || (
    k === 'FINANCE' ? roles.includes('FinanceAdmin')
      : k === 'DIRECTOR_APPROVAL' ? roles.includes('Director') || roles.includes('PME')
        : roles.includes('PME')));

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-[500] font-serif text-text">Closure and lessons</h2>
            <p className="text-xs text-text-muted max-w-2xl">
              The completion report closes the project and is what the institute remembers of it: what worked, what did
              not, and what a future team should know. Once approved it is published to the archive and Ask SURYA.
            </p>
          </div>
          {r && <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>}
        </div>
        {!r && editable && !writing && (
          <Button size="sm" onClick={() => setWriting(true)}>Start the completion report</Button>
        )}
        {!r && !editable && <p className="text-sm text-text-muted">No completion report yet. The PI writes it as the project ends.</p>}
        {r?.status === 'RETURNED' && r.decisionNote && <p className="text-sm text-turmeric">Returned: {r.decisionNote}</p>}
      </Card>

      {editable && (writing || r) ? (
        <ReportEditor project={project} report={r} onChanged={onChanged} />
      ) : r ? (
        <ReportView report={r} />
      ) : null}

      {r && r.steps.length > 0 && (
        <StepsCard project={project} report={r} mayAct={mayAct} onChanged={onChanged} />
      )}

      {r?.status === 'APPROVED' && <FollowOns project={project} report={r} canStart={roles.some(x => RESEARCHERS.includes(x))} />}

      {isOffice && (stage === 'CLOSED' || stage === 'FORECLOSED') && (r?.status === 'APPROVED' || (!r && !project.proposalId)) && (
        <ArchiveCard project={project} report={r} onChanged={onChanged} />
      )}
      {stage === 'ARCHIVED' && (
        <Card className="p-4">
          <p className="text-sm text-text">
            Archived{r?.publishedDocumentId ? '; the completion report is published to the institute archive and Ask SURYA.' : '.'} The file is read-only.
          </p>
        </Card>
      )}
    </div>
  );
}

// --- 1. The PI writes ---

function ReportEditor({ project, report, onChanged }: { project: ProjectInfo; report: CompletionReport | null; onChanged: () => Promise<void> }) {
  const [f, setF] = useState<CompletionFields>(() => (report ? { ...report } : { ...EMPTY_COMPLETION }));
  const [scan, setScan] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const missing = useMemo(() => completionMissing(f), [f]);
  const set = (patch: Partial<CompletionFields>) => setF(prev => ({ ...prev, ...patch }));
  const fields = (): Partial<CompletionFields> => {
    const { summary, objectives_status, objectives_reason, what_worked, what_did_not, reusable_assets,
      trl_target, trl_reached, recommendations, follow_on_ideas } = f;
    return { summary, objectives_status, objectives_reason, what_worked, what_did_not, reusable_assets,
      trl_target, trl_reached, recommendations, follow_on_ideas };
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(''); setNote('');
    try { await fn(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <Card className="p-4 space-y-4">
      <fieldset className="space-y-1">
        <legend className="text-sm font-[500] text-text">Were the objectives met?</legend>
        <div className="flex flex-wrap gap-4">
          {(Object.keys(OBJECTIVES_LABELS) as ObjectivesStatus[]).map(k => (
            <label key={k} className="flex items-center gap-1.5 text-sm text-text">
              <input type="radio" name="objectives" checked={f.objectives_status === k} onChange={() => set({ objectives_status: k })} />
              {OBJECTIVES_LABELS[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        {(['trl_target', 'trl_reached'] as const).map(k => (
          <label key={k} className="text-xs text-text-muted">
            {k === 'trl_target' ? 'Readiness level targeted' : 'Readiness level reached'}
            <select aria-label={k === 'trl_target' ? 'TRL targeted' : 'TRL reached'} className={clsx(inputCls, 'mt-1')}
              value={f[k] ?? ''} onChange={(e) => set({ [k]: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={n}>TRL {n}</option>)}
            </select>
          </label>
        ))}
      </div>
      {COMPLETION_FIELDS.filter(c => c.key !== 'objectives_reason' || f.objectives_status === 'PARTLY_MET' || f.objectives_status === 'NOT_MET').map(c => (
        <label key={c.key} className="block text-sm text-text">
          <span className="font-[500]">{c.label}</span>{!c.required && c.key !== 'objectives_reason' && <span className="text-text-muted"> (optional)</span>}
          <span className="block text-xs text-text-muted">{c.prompt}</span>
          <textarea aria-label={c.label} rows={c.key === 'summary' ? 4 : 3} className={clsx(inputCls, 'mt-1')}
            value={f[c.key]} onChange={(e) => set({ [c.key]: e.target.value })} />
        </label>
      ))}

      {missing.length > 0 && (
        <p className="text-xs text-text-muted">Still to write before submitting: {missing.map(fieldLabel).join(' · ')}</p>
      )}
      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
        <Button size="sm" variant="secondary" isLoading={busy}
          onClick={() => void run(async () => { await saveCompletion(project.ProjectID, fields()); await onChanged(); setNote('Saved.'); })}>
          Save
        </Button>
        <label className="text-xs text-text-muted">
          Signed report (PDF, every page signed)
          <input type="file" accept="application/pdf" aria-label="Signed report" onChange={(e) => setScan(e.target.files?.[0] ?? null)}
            className="block text-sm text-text mt-1" />
        </label>
        <Button size="sm" isLoading={busy} disabled={!scan || missing.length > 0}
          onClick={() => void run(async () => {
            await saveCompletion(project.ProjectID, fields());
            const d = await uploadProjectDocument(project.ProjectID, 'completion_report', scan as File);
            await submitCompletion(project.ProjectID, d.id);
            await onChanged();
          })}>
          Submit for closure
        </Button>
      </div>
      <p className="text-[11px] text-text-muted">The financial statement and the list of annexures are compiled from the project file when you submit.</p>
      {note && <p className="text-xs text-text-muted">{note}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </Card>
  );
}

// --- 2. Everyone else reads ---

function ReportView({ report: r }: { report: CompletionReport }) {
  const fs = r.financialStatement;
  return (
    <Card className="p-4 space-y-4">
      <dl className="grid sm:grid-cols-3 gap-3 text-sm">
        <div><dt className="text-[11px] uppercase tracking-wide text-text-muted">Objectives</dt>
          <dd className="text-text">{r.objectives_status ? OBJECTIVES_LABELS[r.objectives_status] : '—'}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-text-muted">Readiness</dt>
          <dd className="text-text">{r.trl_reached ? `TRL ${r.trl_reached}` : '—'}{r.trl_target ? ` of ${r.trl_target} targeted` : ''}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-text-muted">Submitted</dt>
          <dd className="text-text">{r.submittedAt?.slice(0, 10) ?? 'Not yet'}</dd></div>
      </dl>
      {COMPLETION_FIELDS.filter(c => r[c.key].trim()).map(c => (
        <section key={c.key}>
          <h3 className="text-sm font-[500] text-text">{c.label}</h3>
          <p className="text-sm text-text whitespace-pre-line">{r[c.key]}</p>
        </section>
      ))}
      {fs && (
        <section className="space-y-1">
          <h3 className="text-sm font-[500] text-text">Financial statement</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="py-1 font-[500]">Year</th><th className="font-[500]">Head</th>
              <th className="text-right font-[500]">Sanctioned</th><th className="text-right font-[500]">Spent</th></tr></thead>
            <tbody>
              {fs.heads.map(h => (
                <tr key={`${h.fiscal_year}${h.head}`} className="border-t border-border">
                  <td className="py-1 font-mono text-xs">{h.fiscal_year}</td><td>{headLabel(h.head)}</td>
                  <td className="text-right tabular-nums">{rupees(h.sanctioned)}</td><td className="text-right tabular-nums">{rupees(h.spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-text-muted">
            Sanctioned {rupees(fs.sanctioned)} · received {rupees(fs.received_total)} · spent {rupees(fs.spent_total)}
          </p>
        </section>
      )}
      {r.annexures.length > 0 && (
        <section>
          <h3 className="text-sm font-[500] text-text">Annexures</h3>
          <ol className="text-sm list-decimal pl-5 space-y-0.5">
            {r.annexures.map((a, i) => (
              <li key={i} className={clsx(a.missing ? 'text-danger' : 'text-text')}>
                {a.label}{a.date ? ` (${a.date})` : ''}{a.missing ? ' — not on file' : ''}
              </li>
            ))}
          </ol>
        </section>
      )}
    </Card>
  );
}

function StepsCard({ project, report: r, mayAct, onChanged }: {
  project: ProjectInfo; report: CompletionReport; mayAct: (k: ChangeStepKind) => boolean; onChanged: () => Promise<void>;
}) {
  const current = ['SUBMITTED', 'UNDER_REVIEW'].includes(r.status) ? r.steps.find(s => s.status === 'PENDING') : undefined;
  const [decision, setDecision] = useState<'APPROVE' | 'RETURN'>('APPROVE');
  const [notes, setNotes] = useState('');
  const [scan, setScan] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = decision === 'APPROVE' ? !!scan : !!notes.trim();

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-[500] text-text">Closure route</h3>
      <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Closure route">
        {r.steps.map(s => (
          <li key={s.id} className={clsx('px-2 py-0.5 rounded-full border',
            s.status === 'DONE' ? 'border-success text-success'
              : s.status === 'RETURNED' ? 'border-danger text-danger'
                : s.id === current?.id ? 'border-brand-blue text-brand-blue' : 'border-border text-text-muted')}>
            {CLOSURE_STEP_LABELS[s.kind] ?? s.kind}{s.status === 'DONE' ? ' ✓' : ''}
          </li>
        ))}
      </ol>
      {current && mayAct(current.kind) && (
        <div className="border border-border rounded-lg p-3 space-y-2 bg-background">
          <p className="text-xs font-[500] text-text">Record: {CLOSURE_STEP_LABELS[current.kind]}</p>
          <div className="grid sm:grid-cols-[12rem_1fr] gap-2">
            <select aria-label="Closure decision" className={inputCls} value={decision} onChange={(e) => setDecision(e.target.value as 'APPROVE' | 'RETURN')}>
              <option value="APPROVE">Approve / recommend</option>
              <option value="RETURN">Return to the PI</option>
            </select>
            <input aria-label="Closure note" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder={decision === 'APPROVE' ? 'Note (optional)' : 'What needs to change'} />
          </div>
          <label className="block text-xs text-text-muted">
            Signed scan (PDF){decision === 'APPROVE' ? '' : ' — optional'}
            <input type="file" accept="application/pdf" aria-label="Closure scan" onChange={(e) => setScan(e.target.files?.[0] ?? null)} className="block text-sm text-text mt-1" />
          </label>
          <Button size="sm" isLoading={busy} disabled={!ready} onClick={async () => {
            setBusy(true); setError('');
            try {
              const d = scan ? (await uploadProjectDocument(project.ProjectID, 'closure_order', scan)).id : null;
              await recordCompletionStep(current.id, decision, notes, d);
              await onChanged();
            } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
          }}>Record</Button>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </Card>
  );
}

// --- 3. What it leaves behind ---

function FollowOns({ project, report, canStart }: { project: ProjectInfo; report: CompletionReport; canStart: boolean }) {
  const { proposals, startIdea } = useProposals();
  const { staff } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const ideas = followOnIdeas(report.follow_on_ideas);
  const started = proposals.filter(p => p.parentProjectId === project.ProjectID);
  if (ideas.length === 0 && started.length === 0) return null;
  const ownName = staff.find(s => s.user_id === user?.id)?.Name ?? '';

  return (
    <Card className="p-4 space-y-2">
      <h3 className="text-sm font-[500] text-text">Follow-on ideas</h3>
      <ul className="space-y-1.5">
        {ideas.map(idea => (
          <li key={idea} className="flex items-center justify-between gap-3 text-sm text-text">
            <span>{idea}</span>
            {canStart && (
              <Button size="sm" variant="secondary" onClick={async () => {
                try { const p = await startIdea(idea, ownName, project.ProjectID); navigate(`/proposals/${p.id}/edit`); }
                catch (e) { setError(friendlyError(e)); }
              }}>Start as a new idea</Button>
            )}
          </li>
        ))}
      </ul>
      {started.length > 0 && (
        <p className="text-xs text-text-muted">
          Already started: {started.map((p, i) => (
            <span key={p.id}>{i > 0 && ', '}<Link className="text-brand-blue underline" to={`/proposals/${p.id}`}>{p.title}</Link></span>
          ))}
        </p>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </Card>
  );
}

function ArchiveCard({ project, report, onChanged }: { project: ProjectInfo; report: CompletionReport | null; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Card className="p-4 space-y-2">
      <h3 className="text-sm font-[500] text-text">Archive the project</h3>
      <p className="text-xs text-text-muted">
        {report
          ? 'Publishes the approved completion report — lessons, financial statement and annexures — to the institute archive, where Ask SURYA indexes it, and makes the file read-only.'
          : 'A project closed before SURYA: archived without a completion report. The file becomes read-only.'}
      </p>
      <Button size="sm" isLoading={busy} onClick={async () => {
        setBusy(true); setError('');
        try {
          let docId: string | null = null;
          if (report) {
            const [{ pdf }, { CompletionPDF }] = await Promise.all([import('@react-pdf/renderer'), import('./CompletionPDF')]);
            const blob = await pdf(<CompletionPDF project={project} report={report} />).toBlob();
            const name = `Completion report ${project.ProjectNo}.pdf`.replace(/[^\w .-]/g, '_');
            const up = await uploadDocument(new File([blob], name, { type: 'application/pdf' }), {
              entityType: 'project', entityId: project.ProjectID, docType: 'completion_report',
              accessTier: 'owner', divisionCode: project.DivisionCode,
            });
            if (!up.ok) throw new Error(up.error);
            docId = up.id;
          }
          await archiveProject(project.ProjectID, docId);
          await onChanged();
        } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
      }}>{report ? 'Publish and archive' : 'Archive'}</Button>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </Card>
  );
}

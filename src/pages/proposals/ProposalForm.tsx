import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProposals } from '../../contexts/ProposalsContext';
import { useData } from '../../contexts/DataContext';
import { Card } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { submitSchema } from '../../lib/proposals/validation';
import { submitProposal } from '../../lib/proposals/api';
import { uploadProposalDoc } from '../../lib/proposals/storage';
import {
  FUND_TYPES, SPONSOR_TYPES, PROJECT_CATEGORIES, DOMAIN_THEMES,
} from '../../lib/proposals/constants';
import { canEditProposal } from '../../lib/proposals/permissions';
import type { Proposal, ProposalCoPI } from '../../types/proposal';
import type { StaffMember } from '../../types';

interface FormState {
  title: string;
  acronym: string;
  domainTheme: string;
  fundType: string;
  sponsorType: string;
  sponsorName: string;
  projectCategory: string;
  proposedStartDate: string;
  proposedDurationMonths: number;
  requestedBudget: number;
  divisionCode: string;
  abstract: string;
  problemStatement: string;
  objectives: string;
  expectedOutcomes: string;
  currentTrl: number | null;
  targetTrl: number | null;
  coPIs: ProposalCoPI[];
}

const emptyState = (defaultDivision: string): FormState => ({
  title: '',
  acronym: '',
  domainTheme: '',
  fundType: '',
  sponsorType: '',
  sponsorName: '',
  projectCategory: '',
  proposedStartDate: '',
  proposedDurationMonths: 12,
  requestedBudget: 0,
  divisionCode: defaultDivision,
  abstract: '',
  problemStatement: '',
  objectives: '',
  expectedOutcomes: '',
  currentTrl: null,
  targetTrl: null,
  coPIs: [],
});

const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';

export default function ProposalForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const { staff } = useData();
  const { getProposal, createDraft, updateDraft } = useProposals();

  const [state, setState] = useState<FormState>(() => emptyState(user?.divisionCode ?? ''));
  const [loaded, setLoaded] = useState<Proposal | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit || !id || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getProposal(id);
        if (cancelled) return;
        if (!canEditProposal(user, p)) {
          setError('You do not have permission to edit this proposal.');
          return;
        }
        setLoaded(p);
        setState({
          title: p.title,
          acronym: p.acronym ?? '',
          domainTheme: p.domainTheme,
          fundType: p.fundType,
          sponsorType: p.sponsorType,
          sponsorName: p.sponsorName,
          projectCategory: p.projectCategory,
          proposedStartDate: p.proposedStartDate,
          proposedDurationMonths: p.proposedDurationMonths,
          requestedBudget: p.requestedBudget,
          divisionCode: p.divisionCode,
          abstract: p.abstract,
          problemStatement: p.problemStatement,
          objectives: p.objectives,
          expectedOutcomes: p.expectedOutcomes,
          currentTrl: p.currentTrl,
          targetTrl: p.targetTrl,
          coPIs: p.coPIs ?? [],
        });
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isEdit, user, getProposal]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  const hasSignedDoc = useMemo(
    () => !!loaded?.documents?.some((d) => d.docType === 'signed_proposal'),
    [loaded],
  );

  const handleSave = async (mode: 'draft' | 'submit') => {
    setError('');
    setSaving(true);
    try {
      let proposalId = loaded?.id;
      const payload: Partial<Proposal> = {
        title: state.title,
        acronym: state.acronym || null,
        domainTheme: state.domainTheme,
        fundType: state.fundType,
        sponsorType: state.sponsorType,
        sponsorName: state.sponsorName,
        projectCategory: state.projectCategory,
        proposedStartDate: state.proposedStartDate,
        proposedDurationMonths: state.proposedDurationMonths,
        requestedBudget: state.requestedBudget,
        divisionCode: state.divisionCode,
        abstract: state.abstract,
        problemStatement: state.problemStatement,
        objectives: state.objectives,
        expectedOutcomes: state.expectedOutcomes,
        currentTrl: state.currentTrl,
        targetTrl: state.targetTrl,
      };

      if (mode === 'submit') {
        const parsed = submitSchema.safeParse({ ...state });
        if (!parsed.success) {
          throw new Error(parsed.error.issues.map((i) => i.message).join('; '));
        }
      }

      if (proposalId) {
        await updateDraft(proposalId, payload, state.coPIs);
      } else {
        if (!state.title.trim()) throw new Error('Title is required');
        const created = await createDraft({ ...payload, title: state.title }, state.coPIs);
        proposalId = created.id;
      }

      if (pdfFile && proposalId) {
        const up = await uploadProposalDoc(proposalId, 'signed_proposal', pdfFile);
        if (!up.ok) throw new Error(up.error);
      }

      if (mode === 'submit') {
        if (!proposalId) throw new Error('Save failed before submit');
        if (!pdfFile && !hasSignedDoc) throw new Error('Signed proposal PDF is required to submit');
        const result = await submitProposal(proposalId);
        if (!result.ok) throw new Error(result.error);
      }

      navigate(proposalId ? `/proposals/${proposalId}` : '/proposals');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-text">
        {isEdit ? 'Edit Proposal' : 'New Proposal'}
      </h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      <Section title="Identity">
        <Field label="Title" required>
          <input className={inputCls} value={state.title}
            onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Acronym">
          <input className={inputCls} value={state.acronym}
            onChange={(e) => set('acronym', e.target.value)} />
        </Field>
        <Field label="Domain / Theme">
          <select className={inputCls} value={state.domainTheme}
            onChange={(e) => set('domainTheme', e.target.value)}>
            <option value="">Select…</option>
            {DOMAIN_THEMES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Project Category">
          <select className={inputCls} value={state.projectCategory}
            onChange={(e) => set('projectCategory', e.target.value)}>
            <option value="">Select…</option>
            {PROJECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Sponsor">
        <Field label="Fund Type">
          <select className={inputCls} value={state.fundType}
            onChange={(e) => set('fundType', e.target.value)}>
            <option value="">Select…</option>
            {FUND_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Sponsor Type">
          <select className={inputCls} value={state.sponsorType}
            onChange={(e) => set('sponsorType', e.target.value)}>
            <option value="">Select…</option>
            {SPONSOR_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Sponsor Name">
          <input className={inputCls} value={state.sponsorName}
            onChange={(e) => set('sponsorName', e.target.value)} />
        </Field>
      </Section>

      <Section title="Timeline & Budget">
        <Field label="Proposed Start Date">
          <input type="date" className={inputCls} value={state.proposedStartDate}
            onChange={(e) => set('proposedStartDate', e.target.value)} />
        </Field>
        <Field label="Duration (months)">
          <input type="number" min={1} className={inputCls} value={state.proposedDurationMonths}
            onChange={(e) => set('proposedDurationMonths', Number(e.target.value))} />
        </Field>
        <Field label="Requested Budget (₹)">
          <input type="number" min={0} className={inputCls} value={state.requestedBudget}
            onChange={(e) => set('requestedBudget', Number(e.target.value))} />
        </Field>
      </Section>

      <Section title="Team">
        <Field label="Principal Investigator">
          <input className={inputCls} value={user?.email ?? ''} disabled />
        </Field>
        <Field label="Co-PIs">
          <CoPIPicker
            staff={staff}
            value={state.coPIs}
            onChange={(v) => set('coPIs', v)}
          />
        </Field>
        <Field label="Division">
          <input className={inputCls} value={state.divisionCode}
            onChange={(e) => set('divisionCode', e.target.value)} />
        </Field>
      </Section>

      <Section title="Technical">
        <Field label="Abstract"><textarea rows={3} className={inputCls} value={state.abstract}
          onChange={(e) => set('abstract', e.target.value)} /></Field>
        <Field label="Problem Statement"><textarea rows={3} className={inputCls}
          value={state.problemStatement}
          onChange={(e) => set('problemStatement', e.target.value)} /></Field>
        <Field label="Objectives"><textarea rows={3} className={inputCls}
          value={state.objectives}
          onChange={(e) => set('objectives', e.target.value)} /></Field>
        <Field label="Expected Outcomes"><textarea rows={3} className={inputCls}
          value={state.expectedOutcomes}
          onChange={(e) => set('expectedOutcomes', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Current TRL (1–9)">
            <input type="number" min={1} max={9} className={inputCls}
              value={state.currentTrl ?? ''}
              onChange={(e) => set('currentTrl', e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
          <Field label="Target TRL (1–9)">
            <input type="number" min={1} max={9} className={inputCls}
              value={state.targetTrl ?? ''}
              onChange={(e) => set('targetTrl', e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
        </div>
      </Section>

      <Section title="Signed Proposal Document">
        {hasSignedDoc && (
          <p className="text-text-muted text-sm mb-2">A signed proposal is already uploaded. Re-upload to replace.</p>
        )}
        <input type="file" accept="application/pdf"
          onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
      </Section>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => handleSave('draft')} isLoading={saving}>
          Save Draft
        </Button>
        <Button onClick={() => handleSave('submit')} isLoading={saving}>
          Submit
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium text-text mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
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

  const add = () => {
    if (!selectedId) return;
    const found = staff.find((s) => s.ID === selectedId);
    if (!found) return;
    if (value.some((c) => c.staffId === found.ID)) return;
    onChange([...value, { staffId: found.ID, staffName: found.Name }]);
    setSelectedId('');
  };
  const remove = (sid: string) => onChange(value.filter((c) => c.staffId !== sid));

  return (
    <div>
      <div className="flex gap-2">
        <select className={inputCls} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select staff…</option>
          {staff.map((s) => <option key={s.ID} value={s.ID}>{s.Name}</option>)}
        </select>
        <Button type="button" variant="secondary" onClick={add}>Add</Button>
      </div>
      <ul className="mt-2 space-y-1">
        {value.map((c) => (
          <li key={c.staffId} className="flex items-center justify-between text-sm bg-surface-hover px-3 py-1 rounded">
            <span>{c.staffName}</span>
            <button type="button" onClick={() => remove(c.staffId)} className="text-text-muted hover:text-red-500">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

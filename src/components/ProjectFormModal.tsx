import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { supabase } from '../utils/supabaseClient';
import type { ProjectInfo } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project?: ProjectInfo | null;
}

const STATUSES = ['Ongoing', 'Completed', 'Approved', 'Submitted', 'Rejected', 'On Hold'];
const CATEGORIES = ['Sponsored', 'Consultancy', 'In-house', 'Collaborative'];
const FUND_TYPES = ['CSIR', 'External', 'Industrial', 'Government', 'International'];
const SPONSOR_TYPES = ['Government', 'Industry', 'PSU', 'Academic', 'International'];

const EMPTY: ProjectInfo = {
  ProjectID: '',
  ProjectNo: '',
  ProjectName: '',
  FundType: '',
  SponsorerType: '',
  SponsorerName: '',
  ProjectCategory: '',
  ProjectStatus: 'Ongoing',
  StartDate: '',
  CompletioDate: '',
  SanctionedCost: '',
  UtilizedAmount: '',
  PrincipalInvestigator: '',
  DivisionCode: '',
  Extension: '',
  ApprovalAuthority: '',
};

export function ProjectFormModal({ isOpen, onClose, project }: Props) {
  const { divisions, staff, refreshData } = useData();
  const isEdit = !!project;

  const [form, setForm] = useState<ProjectInfo>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(project ? { ...project } : { ...EMPTY });
    setErrors({});
    setSubmitError(null);
    setShowDeleteConfirm(false);
  }, [isOpen, project]);

  function update<K extends keyof ProjectInfo>(key: K, value: ProjectInfo[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.ProjectNo.trim()) next.ProjectNo = 'Required';
    if (!form.ProjectName.trim()) next.ProjectName = 'Required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    if (!supabase) {
      setSubmitError('Supabase not configured.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const { error } = isEdit
      ? await supabase.from('projects').update(form).eq('ProjectNo', form.ProjectNo)
      : await supabase.from('projects').insert(form);

    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    await refreshData();
    onClose();
  }

  async function handleDelete() {
    if (!supabase || !project) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase.from('projects').delete().eq('ProjectNo', project.ProjectNo);
    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    await refreshData();
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Project' : 'Create Project'}>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project No" error={errors.ProjectNo}>
            <input type="text" value={form.ProjectNo} onChange={(e) => update('ProjectNo', e.target.value)} disabled={isEdit} placeholder="PRJ-2026-001" className={inputCls + ' disabled:opacity-60'} />
          </Field>
          <Field label="Project ID">
            <input type="text" value={form.ProjectID} onChange={(e) => update('ProjectID', e.target.value)} placeholder="Internal ID" className={inputCls} />
          </Field>
        </div>

        <Field label="Project Name" error={errors.ProjectName}>
          <input type="text" value={form.ProjectName} onChange={(e) => update('ProjectName', e.target.value)} className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={form.ProjectCategory} onChange={(e) => update('ProjectCategory', e.target.value)} className={inputCls}>
              <option value="">— Select —</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.ProjectStatus} onChange={(e) => update('ProjectStatus', e.target.value)} className={inputCls}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fund Type">
            <select value={form.FundType} onChange={(e) => update('FundType', e.target.value)} className={inputCls}>
              <option value="">— Select —</option>
              {FUND_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Sponsor Type">
            <select value={form.SponsorerType} onChange={(e) => update('SponsorerType', e.target.value)} className={inputCls}>
              <option value="">— Select —</option>
              {SPONSOR_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Sponsor Name">
          <input type="text" value={form.SponsorerName} onChange={(e) => update('SponsorerName', e.target.value)} className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start Date">
            <input type="date" value={form.StartDate} onChange={(e) => update('StartDate', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Completion Date">
            <input type="date" value={form.CompletioDate} onChange={(e) => update('CompletioDate', e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sanctioned Cost (₹)">
            <input type="text" value={form.SanctionedCost} onChange={(e) => update('SanctionedCost', e.target.value)} placeholder="2500000" className={inputCls} />
          </Field>
          <Field label="Utilized Amount (₹)">
            <input type="text" value={form.UtilizedAmount} onChange={(e) => update('UtilizedAmount', e.target.value)} placeholder="0" className={inputCls} />
          </Field>
        </div>

        <Field label="Principal Investigator">
          <select value={form.PrincipalInvestigator} onChange={(e) => update('PrincipalInvestigator', e.target.value)} className={inputCls}>
            <option value="">— Select —</option>
            {staff.map((s) => <option key={s.ID} value={s.ID}>{s.Name} ({s.ID})</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Division">
            <select value={form.DivisionCode} onChange={(e) => update('DivisionCode', e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {divisions.map((d) => <option key={d.divCode} value={d.divCode}>{d.divCode}</option>)}
            </select>
          </Field>
          <Field label="Approval Authority">
            <input type="text" value={form.ApprovalAuthority} onChange={(e) => update('ApprovalAuthority', e.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field label="Extension Notes">
          <textarea rows={2} value={form.Extension} onChange={(e) => update('Extension', e.target.value)} placeholder="Extension granted till..." className={inputCls + ' resize-y'} />
        </Field>

        {submitError && (
          <div className="bg-[#f5e8e8] border border-[#e8c8c8] text-[#b53333] px-4 py-3 rounded-lg text-sm">
            {submitError}
          </div>
        )}
      </div>

      <div className="flex justify-between gap-3 pt-3 border-t border-border mt-4">
        <div>
          {isEdit && (
            showDeleteConfirm ? (
              <div className="flex gap-2 items-center">
                <span className="text-xs text-text-muted">Delete this project?</span>
                <Button variant="danger" size="sm" isLoading={submitting} onClick={handleDelete}>Yes, delete</Button>
                <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(true)}>Delete</Button>
            )
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" isLoading={submitting} onClick={handleSubmit}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const inputCls = 'w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none';

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text-muted mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

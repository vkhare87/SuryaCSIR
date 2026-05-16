import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { supabase } from '../utils/supabaseClient';
import type { PhDStudent } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  student?: PhDStudent | null;
}

const STATUSES = ['Coursework', 'Ongoing', 'Thesis Submitted', 'Defended', 'Awarded', 'Discontinued'];

const EMPTY: PhDStudent = {
  EnrollmentNo: '',
  StudentName: '',
  Specialization: '',
  SupervisorName: '',
  CoSupervisorName: '',
  FellowshipDetails: '',
  CurrentStatus: 'Coursework',
  ThesisTitle: '',
  ProjectNo: '',
  DivisionCode: '',
};

export function PhDStudentFormModal({ isOpen, onClose, student }: Props) {
  const { divisions, staff, projects, refreshData } = useData();
  const isEdit = !!student;

  const [form, setForm] = useState<PhDStudent>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(student ? { ...student } : { ...EMPTY });
    setErrors({});
    setSubmitError(null);
    setShowDeleteConfirm(false);
  }, [isOpen, student]);

  function update<K extends keyof PhDStudent>(key: K, value: PhDStudent[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.EnrollmentNo.trim()) next.EnrollmentNo = 'Required';
    if (!form.StudentName.trim()) next.StudentName = 'Required';
    if (!form.SupervisorName.trim()) next.SupervisorName = 'Required';
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
      ? await supabase.from('phd_students').update(form).eq('EnrollmentNo', form.EnrollmentNo)
      : await supabase.from('phd_students').insert(form);

    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    await refreshData();
    onClose();
  }

  async function handleDelete() {
    if (!supabase || !student) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase.from('phd_students').delete().eq('EnrollmentNo', student.EnrollmentNo);
    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    await refreshData();
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit PhD Student' : 'Create PhD Student'}>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Enrollment No" error={errors.EnrollmentNo}>
            <input type="text" value={form.EnrollmentNo} onChange={(e) => update('EnrollmentNo', e.target.value)} disabled={isEdit} placeholder="PHD-2024-001" className={inputCls + ' disabled:opacity-60'} />
          </Field>
          <Field label="Current Status">
            <select value={form.CurrentStatus} onChange={(e) => update('CurrentStatus', e.target.value)} className={inputCls}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Student Name" error={errors.StudentName}>
          <input type="text" value={form.StudentName} onChange={(e) => update('StudentName', e.target.value)} className={inputCls} />
        </Field>

        <Field label="Specialization">
          <input type="text" value={form.Specialization} onChange={(e) => update('Specialization', e.target.value)} placeholder="Nanomaterials / Biocomposites / etc" className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Supervisor" error={errors.SupervisorName}>
            <select value={form.SupervisorName} onChange={(e) => update('SupervisorName', e.target.value)} className={inputCls}>
              <option value="">— Select —</option>
              {staff.map((s) => <option key={s.ID} value={s.Name}>{s.Name}</option>)}
            </select>
          </Field>
          <Field label="Co-Supervisor">
            <select value={form.CoSupervisorName} onChange={(e) => update('CoSupervisorName', e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {staff.map((s) => <option key={s.ID} value={s.Name}>{s.Name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Thesis Title">
          <textarea rows={2} value={form.ThesisTitle} onChange={(e) => update('ThesisTitle', e.target.value)} className={inputCls + ' resize-y'} />
        </Field>

        <Field label="Fellowship Details">
          <input type="text" value={form.FellowshipDetails} onChange={(e) => update('FellowshipDetails', e.target.value)} placeholder="CSIR JRF / SRF / Project Fellow" className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Division">
            <select value={form.DivisionCode} onChange={(e) => update('DivisionCode', e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {divisions.map((d) => <option key={d.divCode} value={d.divCode}>{d.divCode}</option>)}
            </select>
          </Field>
          <Field label="Associated Project">
            <select value={form.ProjectNo} onChange={(e) => update('ProjectNo', e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {projects.map((p) => <option key={p.ProjectNo} value={p.ProjectNo}>{p.ProjectNo}</option>)}
            </select>
          </Field>
        </div>

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
                <span className="text-xs text-text-muted">Delete this student?</span>
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

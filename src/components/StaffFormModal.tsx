import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { supabase } from '../utils/supabaseClient';
import type { StaffMember } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  staffMember?: StaffMember | null;
}

const GROUPS = ['Scientific', 'Technical', 'Administrative', 'Support'];
const GENDERS = ['Male', 'Female', 'Other'];
const APPOINTMENT_TYPES = ['Permanent', 'Contractual', 'Deputation', 'Honorary'];

const EMPTY_STAFF: StaffMember = {
  ID: '',
  // Set by the auth link, not by this form — HR reconciles it separately.
  user_id: null,
  LabCode: '',
  EmployeeType: '',
  Name: '',
  Designation: '',
  Group: '',
  Division: '',
  DoAPP: '',
  DOJ: '',
  DOB: '',
  Cat: '',
  AppointmentType: '',
  Level: '',
  CoreArea: '',
  Expertise: '',
  Email: '',
  Ext: '',
  VidwanID: '',
  ReportingID: '',
  HighestQualification: '',
  Gender: '',
};

export function StaffFormModal({ isOpen, onClose, staffMember }: Props) {
  const { divisions, staff, refreshData } = useData();
  const isEdit = !!staffMember;

  const [form, setForm] = useState<StaffMember>(EMPTY_STAFF);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(staffMember ? { ...staffMember } : { ...EMPTY_STAFF });
    setErrors({});
    setSubmitError(null);
    setShowDeleteConfirm(false);
  }, [isOpen, staffMember]);

  function update<K extends keyof StaffMember>(key: K, value: StaffMember[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.ID.trim()) next.ID = 'Required';
    if (!form.Name.trim()) next.Name = 'Required';
    if (!form.Designation.trim()) next.Designation = 'Required';
    if (form.Email && !/^\S+@\S+\.\S+$/.test(form.Email)) next.Email = 'Invalid email';
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

    const payload = { ...form };

    const { error } = isEdit
      ? await supabase.from('staff').update(payload).eq('ID', form.ID)
      : await supabase.from('staff').insert(payload);

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    await refreshData();
    onClose();
  }

  async function handleDelete() {
    if (!supabase || !staffMember) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase.from('staff').delete().eq('ID', staffMember.ID);
    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    await refreshData();
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Staff Member' : 'Create Staff Member'}>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
        <div className="grid grid-cols-3 gap-3">
          <Field label="ID" error={errors.ID}>
            <input
              type="text"
              value={form.ID}
              onChange={(e) => update('ID', e.target.value)}
              disabled={isEdit}
              maxLength={32}
              placeholder="S001"
              className={inputCls + ' disabled:opacity-60'}
            />
          </Field>
          <Field label="Lab Code">
            <input type="text" value={form.LabCode} onChange={(e) => update('LabCode', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Employee Type">
            <input type="text" value={form.EmployeeType} onChange={(e) => update('EmployeeType', e.target.value)} placeholder="Regular / Contractual" className={inputCls} />
          </Field>
        </div>

        <Field label="Name" error={errors.Name}>
          <input type="text" value={form.Name} onChange={(e) => update('Name', e.target.value)} placeholder="Dr. Full Name" className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Designation" error={errors.Designation}>
            <input type="text" value={form.Designation} onChange={(e) => update('Designation', e.target.value)} placeholder="Principal Scientist" className={inputCls} />
          </Field>
          <Field label="Group">
            <select value={form.Group} onChange={(e) => update('Group', e.target.value)} className={inputCls}>
              <option value="">— Select —</option>
              {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Division">
            <select value={form.Division} onChange={(e) => update('Division', e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {divisions.map((d) => <option key={d.divCode} value={d.divCode}>{d.divCode} — {d.divName}</option>)}
            </select>
          </Field>
          <Field label="Level">
            <input type="text" value={form.Level} onChange={(e) => update('Level', e.target.value)} placeholder="6" className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Date of Joining">
            <input type="date" value={form.DOJ} onChange={(e) => update('DOJ', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Date of Appointment (Present)">
            <input type="date" value={form.DoAPP} onChange={(e) => update('DoAPP', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Date of Birth">
            <input type="date" value={form.DOB} onChange={(e) => update('DOB', e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Category">
            <input type="text" value={form.Cat} onChange={(e) => update('Cat', e.target.value)} placeholder="GEN / OBC / SC / ST" className={inputCls} />
          </Field>
          <Field label="Appointment Type">
            <select value={form.AppointmentType} onChange={(e) => update('AppointmentType', e.target.value)} className={inputCls}>
              <option value="">— Select —</option>
              {APPOINTMENT_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Gender">
            <select value={form.Gender} onChange={(e) => update('Gender', e.target.value)} className={inputCls}>
              <option value="">— Select —</option>
              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Core Area">
          <input type="text" value={form.CoreArea} onChange={(e) => update('CoreArea', e.target.value)} placeholder="Ceramics / Energy / etc" className={inputCls} />
        </Field>

        <Field label="Expertise">
          <textarea rows={2} value={form.Expertise} onChange={(e) => update('Expertise', e.target.value)} placeholder="Comma-separated specialties..." className={inputCls + ' resize-y'} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" error={errors.Email}>
            <input type="email" value={form.Email} onChange={(e) => update('Email', e.target.value)} placeholder="name@ampri.res.in" className={inputCls} />
          </Field>
          <Field label="Extension">
            <input type="text" value={form.Ext} onChange={(e) => update('Ext', e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vidwan ID">
            <input type="text" value={form.VidwanID} onChange={(e) => update('VidwanID', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Reporting To">
            <select value={form.ReportingID} onChange={(e) => update('ReportingID', e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {staff.filter((s) => s.ID !== form.ID).map((s) => <option key={s.ID} value={s.ID}>{s.Name} ({s.ID})</option>)}
            </select>
          </Field>
        </div>

        <Field label="Highest Qualification">
          <input type="text" value={form.HighestQualification} onChange={(e) => update('HighestQualification', e.target.value)} placeholder="Ph.D. / M.Tech / etc" className={inputCls} />
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
                <span className="text-xs text-text-muted">Delete this staff member?</span>
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

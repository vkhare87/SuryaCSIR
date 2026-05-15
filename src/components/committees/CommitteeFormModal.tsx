import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { Modal } from '../ui/Modal';
import { MemberPicker } from './MemberPicker';
import { supabase } from '../../utils/supabaseClient';
import {
  canDeleteCommittee,
} from '../../lib/committees/permissions';
import { useAuth } from '../../contexts/AuthContext';
import type { Committee } from '../../types';
import type { SelectedMember } from './MemberPicker';

interface CommitteeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  committee?: Committee | null;
}

const COMMITTEE_TYPES = ['Standing', 'AdHoc', 'Review', 'Advisory'] as const;
const COMMITTEE_STATUSES = ['Active', 'Inactive'] as const;

export function CommitteeFormModal({ isOpen, onClose, committee }: CommitteeFormModalProps) {
  const { staff, committeeMembers, refreshData } = useData();
  const { user } = useAuth();

  const isEdit = !!committee;

  // --- Form State ---
  const [name, setName] = useState('');
  const [committeeType, setCommitteeType] = useState<'Standing' | 'AdHoc' | 'Review' | 'Advisory'>('Standing');
  const [mandate, setMandate] = useState('');
  const [formedDate, setFormedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');
  const [chairpersonId, setChairpersonId] = useState('');
  const [secretaryId, setSecretaryId] = useState('');
  const [members, setMembers] = useState<SelectedMember[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // --- Init from committee prop ---
  useEffect(() => {
    if (!isOpen) return;
    if (committee) {
      setName(committee.name || '');
      setCommitteeType(committee.committee_type || 'Standing');
      setMandate(committee.mandate || '');
      setFormedDate(committee.formed_date || new Date().toISOString().slice(0, 10));
      setStatus((committee.status as 'Active' | 'Inactive') || 'Active');
      setChairpersonId(committee.chairperson_id || '');
      setSecretaryId(committee.secretary_id || '');

      // Load existing members from committee_members
      const existingMembers = committeeMembers.filter(
        cm => cm.committee_id === committee.id,
      );
      const loadedMembers: SelectedMember[] = existingMembers.map(cm => {
        const staffMember = staff.find(s => s.ID === cm.staff_id);
        return {
          staffId: cm.staff_id,
          staffName: staffMember?.Name ?? cm.staff_id,
          role: (cm.role as SelectedMember['role']) || 'Member',
        };
      });
      setMembers(loadedMembers);
    } else {
      // Reset form for create mode
      setName('');
      setCommitteeType('Standing');
      setMandate('');
      setFormedDate(new Date().toISOString().slice(0, 10));
      setStatus('Active');
      setChairpersonId('');
      setSecretaryId('');
      setMembers([]);
    }
    setErrors({});
    setSubmitError(null);
    setShowDeleteConfirm(false);
  }, [isOpen, committee?.id]);

  // --- Validation ---
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Committee name is required';
    if (!mandate.trim()) newErrors.mandate = 'Mandate is required';
    if (!chairpersonId) newErrors.chairpersonId = 'Chairperson is required';
    if (!secretaryId) newErrors.secretaryId = 'Secretary is required';
    if (!formedDate) newErrors.formedDate = 'Formed date is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Submit ---
  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      name: name.trim(),
      committee_type: committeeType,
      mandate: mandate.trim(),
      chairperson_id: chairpersonId,
      secretary_id: secretaryId,
      status,
      formed_date: formedDate,
    };

    try {
      let committeeId = committee?.id ?? '';

      if (isEdit) {
        const { error } = await supabase!
          .from('committees')
          .update(payload)
          .eq('id', committee!.id);
        if (error) throw error;
        committeeId = committee!.id;
      } else {
        const { data, error } = await supabase!
          .from('committees')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        committeeId = data.id;
      }

      // Step 2: Persist committee members to committee_members table
      // Delete all existing members for this committee, then re-insert
      if (isEdit) {
        await supabase!.from('committee_members').delete().eq('committee_id', committeeId);
      }

      // Insert all current members
      if (members.length > 0) {
        const memberRows = members.map(m => ({
          committee_id: committeeId,
          staff_id: m.staffId,
          role: m.role,
        }));
        const { error: memberErr } = await supabase!
          .from('committee_members')
          .insert(memberRows);
        if (memberErr) throw memberErr;
      }

      await refreshData?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save committee');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Delete ---
  const handleDelete = async () => {
    if (!committee || !user || !canDeleteCommittee(user)) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Delete committee members first (FK constraint), then the committee
      await supabase!.from('committee_members').delete().eq('committee_id', committee.id);
      await supabase!.from('committees').delete().eq('id', committee.id);
      await refreshData?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to delete committee');
      setSubmitting(false);
    }
  };

  // --- Sorted staff for leadership pickers ---
  const sortedStaff = [...staff].sort((a, b) => a.Name.localeCompare(b.Name));

  // --- Section header ---
  const sectionLabel = (text: string) => (
    <p className="text-[10px] font-black text-[#c96442] uppercase tracking-widest mb-3">{text}</p>
  );

  // --- Field error helper ---
  const fieldError = (fieldName: string) =>
    errors[fieldName] ? (
      <p className="text-red-500 text-xs mt-1">{errors[fieldName]}</p>
    ) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Committee' : 'Create Committee'}>
      <div className="space-y-6">
        {/* --- Section 1: Basic Info --- */}
        <section>
          {sectionLabel('Basic Info')}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setErrors(prev => ({ ...prev, name: '' })); }}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
                placeholder="e.g., Scientific Advisory Committee"
              />
              {fieldError('name')}
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">Type</label>
              <select
                value={committeeType}
                onChange={e => setCommitteeType(e.target.value as typeof committeeType)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none appearance-none"
              >
                {COMMITTEE_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Mandate <span className="text-red-500">*</span>
              </label>
              <textarea
                value={mandate}
                onChange={e => { setMandate(e.target.value); setErrors(prev => ({ ...prev, mandate: '' })); }}
                rows={3}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none resize-none"
                placeholder="Describe the committee's purpose and responsibilities..."
              />
              {fieldError('mandate')}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">
                  Formed Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formedDate}
                  onChange={e => { setFormedDate(e.target.value); setErrors(prev => ({ ...prev, formedDate: '' })); }}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
                />
                {fieldError('formedDate')}
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as typeof status)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none appearance-none"
                >
                  {COMMITTEE_STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* --- Section 2: Leadership --- */}
        <section>
          {sectionLabel('Leadership')}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Chairperson <span className="text-red-500">*</span>
              </label>
              <select
                value={chairpersonId}
                onChange={e => { setChairpersonId(e.target.value); setErrors(prev => ({ ...prev, chairpersonId: '' })); }}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none appearance-none"
              >
                <option value="">— Select Chairperson —</option>
                {sortedStaff.map(s => (
                  <option key={s.ID} value={s.ID}>{s.Name}</option>
                ))}
              </select>
              {fieldError('chairpersonId')}
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Secretary <span className="text-red-500">*</span>
              </label>
              <select
                value={secretaryId}
                onChange={e => { setSecretaryId(e.target.value); setErrors(prev => ({ ...prev, secretaryId: '' })); }}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none appearance-none"
              >
                <option value="">— Select Secretary —</option>
                {sortedStaff.map(s => (
                  <option key={s.ID} value={s.ID}>{s.Name}</option>
                ))}
              </select>
              {fieldError('secretaryId')}
            </div>
          </div>
        </section>

        {/* --- Section 3: Members --- */}
        <section>
          {sectionLabel('Members')}
          <MemberPicker selected={members} onChange={setMembers} />
        </section>

        {/* --- Submit Error --- */}
        {submitError && (
          <div className="bg-[#f5e8e8] border border-[#e8c8c8] text-[#b53333] px-4 py-3 rounded-lg text-sm">
            {submitError}
          </div>
        )}

        {/* --- Actions --- */}
        <div className="flex items-center justify-between pt-4 border-t border-border mt-6">
          <div>
            {isEdit && user && canDeleteCommittee(user) && (
              !showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 text-sm border border-[#e8c8c8] text-[#b53333] rounded-lg hover:bg-[#f5e8e8] transition-colors"
                >
                  Delete Committee
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#b53333]">Are you sure?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={submitting}
                    className="px-3 py-1.5 text-sm bg-[#b53333] text-white rounded-lg hover:bg-[#9a2b2b] transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 text-sm bg-[#c96442] text-white rounded-lg hover:bg-[#b55a3a] transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

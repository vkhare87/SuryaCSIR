import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { supabase } from '../utils/supabaseClient';
import type { DivisionInfo } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  division?: DivisionInfo | null;
}

const STATUSES = ['Active', 'Inactive'] as const;

export function DivisionFormModal({ isOpen, onClose, division }: Props) {
  const { staff, refreshData } = useData();
  const isEdit = !!division;

  const [divCode, setDivCode] = useState('');
  const [divName, setDivName] = useState('');
  const [divDescription, setDivDescription] = useState('');
  const [divResearchAreas, setDivResearchAreas] = useState('');
  const [divHoDID, setDivHoDID] = useState('');
  const [divSanctionedstrength, setDivSanctionedstrength] = useState(0);
  const [divCurrentStrength, setDivCurrentStrength] = useState(0);
  const [divStatus, setDivStatus] = useState<'Active' | 'Inactive'>('Active');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (division) {
      setDivCode(division.divCode);
      setDivName(division.divName);
      setDivDescription(division.divDescription || '');
      setDivResearchAreas(division.divResearchAreas || '');
      setDivHoDID(division.divHoDID || '');
      setDivSanctionedstrength(division.divSanctionedstrength || 0);
      setDivCurrentStrength(division.divCurrentStrength || 0);
      setDivStatus(division.divStatus || 'Active');
    } else {
      setDivCode('');
      setDivName('');
      setDivDescription('');
      setDivResearchAreas('');
      setDivHoDID('');
      setDivSanctionedstrength(0);
      setDivCurrentStrength(0);
      setDivStatus('Active');
    }
    setErrors({});
    setSubmitError(null);
    setShowDeleteConfirm(false);
  }, [isOpen, division]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!divCode.trim()) next.divCode = 'Required';
    if (!isEdit && divCode.length > 16) next.divCode = 'Max 16 chars';
    if (!divName.trim()) next.divName = 'Required';
    if (divSanctionedstrength < 0) next.divSanctionedstrength = 'Must be >= 0';
    if (divCurrentStrength < 0) next.divCurrentStrength = 'Must be >= 0';
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

    const hodStaff = staff.find((s) => s.ID === divHoDID);
    const payload = {
      divCode: divCode.trim(),
      divName: divName.trim(),
      divDescription: divDescription.trim(),
      divResearchAreas: divResearchAreas.trim(),
      divHoDID: divHoDID || null,
      divHoD: hodStaff?.Name || '',
      divSanctionedstrength,
      divCurrentStrength,
      divStatus,
    };

    const { error } = isEdit
      ? await supabase.from('divisions').update(payload).eq('divCode', divCode)
      : await supabase.from('divisions').insert(payload);

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    await refreshData();
    onClose();
  }

  async function handleDelete() {
    if (!supabase || !division) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase
      .from('divisions')
      .delete()
      .eq('divCode', division.divCode);
    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    await refreshData();
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Division' : 'Create Division'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Code</label>
            <input
              type="text"
              value={divCode}
              onChange={(e) => setDivCode(e.target.value.toUpperCase())}
              disabled={isEdit}
              maxLength={16}
              placeholder="ARC"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none disabled:opacity-60"
            />
            {errors.divCode && <p className="text-xs text-red-600 mt-1">{errors.divCode}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Status</label>
            <select
              value={divStatus}
              onChange={(e) => setDivStatus(e.target.value as 'Active' | 'Inactive')}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">Name</label>
          <input
            type="text"
            value={divName}
            onChange={(e) => setDivName(e.target.value)}
            placeholder="Advanced Refractory Ceramics"
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
          />
          {errors.divName && <p className="text-xs text-red-600 mt-1">{errors.divName}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">Description</label>
          <textarea
            rows={3}
            value={divDescription}
            onChange={(e) => setDivDescription(e.target.value)}
            placeholder="Research scope of this division..."
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">Research Areas</label>
          <textarea
            rows={2}
            value={divResearchAreas}
            onChange={(e) => setDivResearchAreas(e.target.value)}
            placeholder="Comma-separated focus areas..."
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">Head of Division</label>
          <select
            value={divHoDID}
            onChange={(e) => setDivHoDID(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
          >
            <option value="">— None —</option>
            {staff.map((s) => (
              <option key={s.ID} value={s.ID}>{s.Name} ({s.ID})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Sanctioned Strength</label>
            <input
              type="number"
              min={0}
              value={divSanctionedstrength}
              onChange={(e) => setDivSanctionedstrength(parseInt(e.target.value || '0', 10))}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
            />
            {errors.divSanctionedstrength && <p className="text-xs text-red-600 mt-1">{errors.divSanctionedstrength}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Current Strength</label>
            <input
              type="number"
              min={0}
              value={divCurrentStrength}
              onChange={(e) => setDivCurrentStrength(parseInt(e.target.value || '0', 10))}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
            />
            {errors.divCurrentStrength && <p className="text-xs text-red-600 mt-1">{errors.divCurrentStrength}</p>}
          </div>
        </div>

        {submitError && (
          <div className="bg-[#f5e8e8] border border-[#e8c8c8] text-[#b53333] px-4 py-3 rounded-lg text-sm">
            {submitError}
          </div>
        )}

        <div className="flex justify-between gap-3 pt-2 border-t border-border">
          <div>
            {isEdit && (
              showDeleteConfirm ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-text-muted">Delete this division?</span>
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
      </div>
    </Modal>
  );
}

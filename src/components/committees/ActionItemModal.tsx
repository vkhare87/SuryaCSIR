import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { Modal } from '../ui/Modal';
import { supabase } from '../../utils/supabaseClient';
import type { Committee } from '../../types';

interface ActionItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId?: string | null;
  committees?: Committee[];
}

export function ActionItemModal({ isOpen, onClose, meetingId }: ActionItemModalProps) {
  const { staff, committees: dataCommittees, refreshData } = useData();

  const isStandalone = !meetingId;

  // --- Form State ---
  const [task, setTask] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [deadline, setDeadline] = useState('');
  const [source] = useState<'meeting' | 'manual'>(isStandalone ? 'manual' : 'meeting');
  const [committeeId, setCommitteeId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // --- Sorted staff for assignee picker ---
  const sortedStaff = [...staff].sort((a, b) => a.Name.localeCompare(b.Name));

  // --- Reset form on open/close ---
  useEffect(() => {
    if (!isOpen) return;
    setTask('');
    setAssignedTo('');
    setDeadline('');
    setCommitteeId('');
    setErrors({});
    setSubmitError(null);
  }, [isOpen]);

  // --- Validation ---
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!task.trim()) newErrors.task = 'Task description is required';
    if (!assignedTo) newErrors.assignedTo = 'Assignee is required';
    if (!deadline) newErrors.deadline = 'Deadline is required';
    if (isStandalone && !committeeId) newErrors.committeeId = 'Committee is required for standalone action items';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Submit ---
  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      meeting_id: meetingId ?? null,
      source,
      task: task.trim(),
      assigned_to: assignedTo,
      deadline,
      status: 'Pending',
      notes: '',
    };

    try {
      const { error } = await supabase!
        .from('action_items')
        .insert(payload);

      if (error) throw error;

      await refreshData?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create action item');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Field error helper ---
  const fieldError = (fieldName: string) =>
    errors[fieldName] ? (
      <p className="text-red-500 text-xs mt-1">{errors[fieldName]}</p>
    ) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Action Item">
      <div className="space-y-6">
        {/* --- Mode indicator --- */}
        <div className="bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-muted">
          {source === 'manual' ? 'Standalone action item' : 'Meeting action item'}
        </div>

        {/* --- Committee selector (standalone mode only) --- */}
        {source === 'manual' && (
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">
              Committee <span className="text-red-500">*</span>
            </label>
            <select
              value={committeeId}
              onChange={e => { setCommitteeId(e.target.value); setErrors(prev => ({ ...prev, committeeId: '' })); }}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none appearance-none"
            >
              <option value="">— Select Committee —</option>
              {dataCommittees.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {fieldError('committeeId')}
          </div>
        )}

        {/* --- Task --- */}
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">
            Task Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={task}
            onChange={e => { setTask(e.target.value); setErrors(prev => ({ ...prev, task: '' })); }}
            rows={3}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none resize-none"
            placeholder="Describe the action item..."
          />
          {fieldError('task')}
        </div>

        {/* --- Assignee --- */}
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">
            Assign To <span className="text-red-500">*</span>
          </label>
          <select
            value={assignedTo}
            onChange={e => { setAssignedTo(e.target.value); setErrors(prev => ({ ...prev, assignedTo: '' })); }}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none appearance-none"
          >
            <option value="">— Select Staff —</option>
            {sortedStaff.map(s => (
              <option key={s.ID} value={s.ID}>{s.Name}</option>
            ))}
          </select>
          {fieldError('assignedTo')}
        </div>

        {/* --- Deadline --- */}
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">
            Deadline <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={deadline}
            onChange={e => { setDeadline(e.target.value); setErrors(prev => ({ ...prev, deadline: '' })); }}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
          />
          {fieldError('deadline')}
        </div>

        {/* --- Submit Error --- */}
        {submitError && (
          <div className="bg-[#f5e8e8] border border-[#e8c8c8] text-[#b53333] px-4 py-3 rounded-lg text-sm">
            {submitError}
          </div>
        )}

        {/* --- Actions --- */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
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
            {submitting ? 'Creating...' : 'Create Action Item'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

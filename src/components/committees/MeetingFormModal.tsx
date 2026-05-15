import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { Modal } from '../ui/Modal';
import { supabase } from '../../utils/supabaseClient';
import type { Meeting } from '../../types';

interface AgendaItemDraft {
  description: string;
  proposedBy: string;
}

interface MeetingFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  committeeId: string;
  meeting?: Meeting | null;
}

const MEETING_STATUSES = ['Scheduled', 'Completed', 'Cancelled'] as const;

export function MeetingFormModal({ isOpen, onClose, committeeId, meeting }: MeetingFormModalProps) {
  const { refreshData } = useData();

  const isEdit = !!meeting;

  // --- Form State ---
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [venue, setVenue] = useState('');
  const [status, setStatus] = useState<'Scheduled' | 'Completed' | 'Cancelled'>('Scheduled');
  const [agendaItems, setAgendaItems] = useState<AgendaItemDraft[]>([]);
  const [agendaInput, setAgendaInput] = useState('');
  const [agendaProposer, setAgendaProposer] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // --- Init from meeting prop ---
  useEffect(() => {
    if (!isOpen) return;
    if (meeting) {
      setTitle(meeting.title || '');
      setMeetingDate(meeting.meeting_date || new Date().toISOString().slice(0, 10));
      setVenue(meeting.venue || '');
      setStatus((meeting.status as 'Scheduled' | 'Completed' | 'Cancelled') || 'Scheduled');
      setAgendaItems([]);
    } else {
      setTitle('');
      setMeetingDate(new Date().toISOString().slice(0, 10));
      setVenue('');
      setStatus('Scheduled');
      setAgendaItems([]);
    }
    setAgendaInput('');
    setAgendaProposer('');
    setErrors({});
    setSubmitError(null);
  }, [isOpen, meeting?.id]);

  // --- Validation ---
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Meeting title is required';
    if (!meetingDate) newErrors.meetingDate = 'Meeting date is required';
    if (!venue.trim()) newErrors.venue = 'Venue is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Add agenda item ---
  const addAgendaItem = () => {
    const desc = agendaInput.trim();
    if (!desc) return;
    setAgendaItems(prev => [...prev, { description: desc, proposedBy: agendaProposer.trim() || 'Not specified' }]);
    setAgendaInput('');
    setAgendaProposer('');
  };

  const removeAgendaItem = (index: number) => {
    setAgendaItems(prev => prev.filter((_, i) => i !== index));
  };

  // --- Submit ---
  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      committee_id: committeeId,
      title: title.trim(),
      meeting_date: meetingDate,
      venue: venue.trim(),
      status,
      summary: '',
    };

    try {
      let meetingId = meeting?.id ?? '';

      if (isEdit) {
        const { error } = await supabase!
          .from('meetings')
          .update(payload)
          .eq('id', meeting!.id);
        if (error) throw error;
        meetingId = meeting!.id;

        // Delete existing agenda items and re-insert
        await supabase!.from('agenda_items').delete().eq('meeting_id', meetingId);
      } else {
        const { data, error } = await supabase!
          .from('meetings')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        meetingId = data.id;
      }

      // Insert agenda items
      if (agendaItems.length > 0) {
        const agendaRows = agendaItems.map((item, index) => ({
          meeting_id: meetingId,
          sequence: index + 1,
          description: item.description,
          proposed_by: item.proposedBy,
          status: 'Pending',
        }));
        const { error: agendaErr } = await supabase!
          .from('agenda_items')
          .insert(agendaRows);
        if (agendaErr) throw agendaErr;
      }

      await refreshData?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save meeting');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Section label ---
  const sectionLabel = (text: string) => (
    <p className="text-[10px] font-black text-[#c96442] uppercase tracking-widest mb-3">{text}</p>
  );

  // --- Field error ---
  const fieldError = (fieldName: string) =>
    errors[fieldName] ? (
      <p className="text-red-500 text-xs mt-1">{errors[fieldName]}</p>
    ) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Meeting' : 'Schedule Meeting'}>
      <div className="space-y-6">
        {/* --- Meeting Details --- */}
        <section>
          {sectionLabel('Meeting Details')}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => { setTitle(e.target.value); setErrors(prev => ({ ...prev, title: '' })); }}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
                placeholder="e.g., Q2 Review Meeting"
              />
              {fieldError('title')}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={meetingDate}
                  onChange={e => { setMeetingDate(e.target.value); setErrors(prev => ({ ...prev, meetingDate: '' })); }}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
                />
                {fieldError('meetingDate')}
              </div>

              {isEdit && (
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as typeof status)}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none appearance-none"
                  >
                    {MEETING_STATUSES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                Venue <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={venue}
                onChange={e => { setVenue(e.target.value); setErrors(prev => ({ ...prev, venue: '' })); }}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
                placeholder="e.g., Conference Room A"
              />
              {fieldError('venue')}
            </div>
          </div>
        </section>

        {/* --- Agenda Items --- */}
        <section>
          {sectionLabel('Agenda Items')}
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={agendaInput}
                onChange={e => setAgendaInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAgendaItem(); } }}
                placeholder="Agenda item description..."
                className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
              />
              <input
                type="text"
                value={agendaProposer}
                onChange={e => setAgendaProposer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAgendaItem(); } }}
                placeholder="Proposed by..."
                className="w-36 px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:ring-2 focus:ring-[#3898ec] outline-none"
              />
              <button
                type="button"
                onClick={addAgendaItem}
                disabled={!agendaInput.trim()}
                className="px-3 py-2 bg-[#c96442] text-white rounded-lg text-sm hover:bg-[#b55a3a] transition-colors disabled:opacity-40 shrink-0"
              >
                Add
              </button>
            </div>

            {agendaItems.length > 0 && (
              <div className="space-y-2">
                {agendaItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-3 px-3 py-2 bg-surface border border-border rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text truncate">{item.description}</p>
                      <p className="text-xs text-text-muted">{item.proposedBy}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAgendaItem(index)}
                      className="p-1 rounded hover:bg-surface-hover text-text-muted shrink-0"
                      title="Remove agenda item"
                    >
                      {/* X icon fallback */}
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {agendaItems.length === 0 && (
              <p className="text-sm text-text-muted">No agenda items yet. Add at least one.</p>
            )}
          </div>
        </section>

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
            {submitting ? 'Saving...' : isEdit ? 'Update' : 'Schedule'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { canWriteMinutes, canUnlockMinutes } from '../../lib/committees/permissions';
import type { Meeting, Committee, UserAccount } from '../../types';

interface MinutesEditorProps {
  meeting: Meeting;
  committee: Committee;
  user: UserAccount;
  onUpdate: () => void;
}

export function MinutesEditor({ meeting, committee, user, onUpdate }: MinutesEditorProps) {
  const [text, setText] = useState(meeting.summary ?? '');
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    setText(meeting.summary ?? '');
  }, [meeting.id, meeting.summary]);

  useEffect(() => {
    if (meeting.status !== 'Completed') {
      setIsLocked(false);
      return;
    }
    const meetingDate = new Date(meeting.meeting_date);
    const sevenDaysAfter = meetingDate.getTime() + 7 * 86_400_000;
    setIsLocked(Date.now() > sevenDaysAfter);
  }, [meeting.status, meeting.meeting_date]);

  const canEdit = !isLocked && canWriteMinutes(user, committee);
  const canUnlock = isLocked && canUnlockMinutes(user);

  const handleBlur = async () => {
    if (text === (meeting.summary ?? '') || !canEdit) return;
    setSaving(true);
    const { error } = await supabase!
      .from('meetings')
      .update({ summary: text })
      .eq('id', meeting.id);
    if (!error) onUpdate();
    setSaving(false);
  };

  const handleUnlock = async () => {
    await supabase!.rpc('unlock_meeting_minutes', { p_meeting_id: meeting.id });
    onUpdate();
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text">Meeting Minutes</h3>
        <div className="flex items-center gap-2">
          {isLocked && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700"
              title="Minutes are locked 7 days after meeting completion. Only admins can unlock."
            >
              <Lock size={12} /> Locked
            </span>
          )}
          {canUnlock && (
            <button
              onClick={handleUnlock}
              className="text-xs text-[#c96442] hover:underline"
            >
              Unlock
            </button>
          )}
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        disabled={!canEdit}
        rows={8}
        className={`w-full px-4 py-3 bg-surface border border-border rounded-lg text-sm resize-y
          ${!canEdit ? 'bg-surface-hover text-text-muted cursor-not-allowed' : ''}`}
        placeholder={canEdit ? 'Enter meeting minutes...' : 'Minutes are locked.'}
      />
      {saving && <span className="text-xs text-text-muted">Saving...</span>}
    </div>
  );
}

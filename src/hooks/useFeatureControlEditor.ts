import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFeatureControls } from '../contexts/FeatureControlContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../utils/supabaseClient';
import type { FeatureControl } from '../types';

const SAVED_FLASH_MS = 1500;

/** Shared save flow for the Feature Controls admin panels: upserts a
 * feature_controls row, refreshes the shared context on success, and
 * exposes a short-lived "saved" flag per feature so the UI can confirm
 * a toggle actually took effect. */
export function useFeatureControlEditor() {
  const { user } = useAuth();
  const { refresh } = useFeatureControls();
  const { push } = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const save = async (next: FeatureControl) => {
    if (!supabase || !user) return;
    setSaving(next.feature_key);
    const { error } = await supabase.from('feature_controls').upsert({
      feature_key: next.feature_key,
      enabled: next.enabled,
      disabled_roles: next.disabled_roles,
      note: next.note,
      updated_by: user.id,
    });
    setSaving(null);
    if (error) {
      push(error.message, 'error');
      return;
    }
    await refresh();
    setSavedFlash(next.feature_key);
    setTimeout(() => {
      setSavedFlash((cur) => (cur === next.feature_key ? null : cur));
    }, SAVED_FLASH_MS);
  };

  return { saving, savedFlash, save };
}

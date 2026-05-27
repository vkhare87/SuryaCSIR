import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '../utils/supabaseClient';
import {
  FIELD_META,
  TABLE_NAMES,
  FILE_TYPE_LABELS,
  type FileType,
} from '../utils/dataMigration';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PK_FIELD: Record<FileType, string> = {
  divisions:    'divCode',
  staff:        'ID',
  projects:     'ProjectID',
  projectStaff: 'id',
  phd:          'EnrollmentNo',
  equipment:    'UInsID',
  contractStaff: 'id',
};

// Auto-generated PK (UUID) — user cannot edit these
const AUTO_PK: FileType[] = ['projectStaff', 'contractStaff'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EntityEditModalProps {
  type: FileType;
  /** Existing record for edit mode; null for create mode */
  record: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityEditModal({ type, record, onClose, onSaved }: EntityEditModalProps) {
  const isCreate = record === null;
  const fields = FIELD_META[type];
  const pk = PK_FIELD[type];
  const isAutoPk = AUTO_PK.includes(type);

  // Build initial form state from record or empty strings
  const buildInitial = () => {
    const init: Record<string, string> = {};
    fields.forEach(f => {
      init[f.column] = record ? String(record[f.column] ?? '') : '';
    });
    return init;
  };

  const [values, setValues] = useState<Record<string, string>>(buildInitial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when record changes (e.g. switching rows)
  useEffect(() => {
    setValues(buildInitial());
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, type]);

  const set = (col: string, val: string) =>
    setValues(prev => ({ ...prev, [col]: val }));

  const validate = (): string | null => {
    for (const f of fields) {
      if (f.required && !values[f.column]?.trim()) {
        return `${f.label} is required.`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!supabase) return;
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {};
      fields.forEach(f => {
        const val = values[f.column].trim();
        payload[f.column] = val === '' ? null : val;
      });

      if (isCreate) {
        const { error: e } = await supabase
          .from(TABLE_NAMES[type])
          .insert(payload);
        if (e) throw new Error(e.message);
      } else {
        const pkVal = record![pk];
        const { error: e } = await supabase
          .from(TABLE_NAMES[type])
          .update(payload)
          .eq(pk, pkVal);
        if (e) throw new Error(e.message);
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider font-medium">
              {FILE_TYPE_LABELS[type]}
            </p>
            <h2 className="text-lg font-semibold text-text mt-0.5">
              {isCreate ? 'New Record' : 'Edit Record'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors text-text-muted"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          {fields.map(f => {
            const isPk = f.column === pk;
            const disabled = !isCreate && isPk;
            const autoHide = isCreate && isAutoPk && isPk;
            if (autoHide) return null;

            return (
              <div key={f.column}>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                  {f.label}
                  {f.required && <span className="text-rose-500 ml-1">*</span>}
                  {isPk && <span className="ml-1.5 text-[10px] font-normal text-text-muted/60 normal-case tracking-normal">(primary key)</span>}
                </label>
                <input
                  type="text"
                  value={values[f.column] ?? ''}
                  onChange={e => set(f.column, e.target.value)}
                  disabled={disabled}
                  placeholder={f.example}
                  className={clsx(
                    'w-full px-3 py-2 rounded-lg border text-sm text-text bg-surface placeholder:text-text-muted/50',
                    'focus:outline-none focus:ring-2 focus:ring-[#c96442]/30 focus:border-[#c96442]',
                    'transition-colors',
                    disabled
                      ? 'opacity-50 cursor-not-allowed border-border'
                      : 'border-border hover:border-[#c96442]/40',
                  )}
                />
                {f.hint && (
                  <p className="text-[11px] text-text-muted mt-1">{f.hint}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
          {error ? (
            <p className="text-sm text-rose-600 flex-1">{error}</p>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-[#c96442] hover:bg-[#b5593b] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

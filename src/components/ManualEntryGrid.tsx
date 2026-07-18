import { useMemo, useState } from 'react';
import { Plus, Trash2, AlertCircle, Check } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';
import {
  FIELD_META,
  validateRows,
  pushToSupabase,
  TABLE_NAMES,
  type FileType,
  type FieldMeta,
} from '../utils/dataMigration';
import { isProvisioned, supabase } from '../utils/supabaseClient';
import { useData } from '../contexts/DataContext';

interface ManualEntryGridProps {
  type: FileType;
  onComplete?: () => void;
}

interface Option {
  value: string;
  label: string;
}

const STAFF_NAME_FK = ['SupervisorName', 'PIName', 'PrincipalInvestigator', 'AttachedToStaffID'];

const isRowEmpty = (row: Record<string, string>) =>
  Object.values(row).every((v) => v.trim() === '');

const blankRow = (fields: FieldMeta[]): Record<string, string> =>
  Object.fromEntries(fields.map((f) => [f.column, '']));

export function ManualEntryGrid({ type, onComplete }: ManualEntryGridProps) {
  const { divisions, staff, projects, refreshData } = useData();
  const fields = FIELD_META[type];

  const [rows, setRows] = useState<Record<string, string>[]>(() =>
    Array.from({ length: 5 }, () => blankRow(fields)),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ upserted: number; failed: number } | null>(null);

  // FK dropdown options keyed by column; null = plain input.
  const optionsFor = (column: string): Option[] | null => {
    if ((column === 'Division' || column === 'DivisionCode') && type !== 'divisions') {
      return divisions.map((d) => ({ value: d.divCode, label: `${d.divCode} — ${d.divName}` }));
    }
    if (column === 'ProjectNo' && type !== 'projects') {
      return projects.map((p) => ({ value: p.ProjectNo, label: `${p.ProjectNo} — ${p.ProjectName}` }));
    }
    if (STAFF_NAME_FK.includes(column)) {
      return staff.map((s) => ({ value: s.Name, label: `${s.Name} (${s.Designation})` }));
    }
    return null;
  };

  const inputType = (field: FieldMeta): string => {
    if (field.hint.includes('YYYY-MM-DD')) return 'date';
    if (field.column === 'Email') return 'email';
    return 'text';
  };

  // Validate only non-empty rows; empty rows are "not yet filled", not errors.
  const validation = useMemo(() => {
    const raw = validateRows(rows, type);
    return raw.map((r, i) => (isRowEmpty(rows[i]) ? { ...r, errors: [], isValid: true } : r));
  }, [rows, type]);

  const filledCount = rows.filter((r) => !isRowEmpty(r)).length;
  const errorCount = validation.filter((r) => !r.isValid).length;

  const setCell = (rowIdx: number, column: string, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === rowIdx ? { ...row, [column]: value } : row)));
  };

  const addRow = () => setRows((prev) => [...prev, blankRow(fields)]);
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!supabase) return;
    const payload = rows.filter((r) => !isRowEmpty(r));
    if (payload.length === 0 || errorCount > 0) return;
    setIsSaving(true);
    const res = await pushToSupabase(supabase, TABLE_NAMES[type], payload, (msg) => console.log(msg));
    setResult(res);
    setIsSaving(false);
    await refreshData();
    if (res.failed === 0) {
      setRows(Array.from({ length: 5 }, () => blankRow(fields)));
      onComplete?.();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-text-muted">
          <span className="font-bold text-text">{filledCount}</span> row{filledCount !== 1 ? 's' : ''} filled
          {errorCount > 0 && (
            <span className="ml-2 text-rose-600">· {errorCount} with errors</span>
          )}
        </p>
        <Button variant="secondary" size="sm" onClick={addRow}>
          <Plus size={14} className="mr-1" /> Add Row
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-hover border-b border-border text-left">
              <th className="px-2 py-3 w-8 font-medium text-text-muted">#</th>
              {fields.map((f) => (
                <th key={f.column} className="px-3 py-3 font-medium text-text-muted whitespace-nowrap" title={f.hint}>
                  {f.label}
                  {f.required && <span className="text-rose-500 ml-0.5">*</span>}
                </th>
              ))}
              <th className="px-2 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const rowErrors = validation[rowIdx]?.errors || [];
              return (
                <tr key={rowIdx} className={clsx('border-b border-border last:border-0', rowIdx % 2 === 0 ? 'bg-surface' : 'bg-surface-hover/40')}>
                  <td className="px-2 py-1.5 text-center text-text-muted">{rowIdx + 1}</td>
                  {fields.map((f) => {
                    const opts = optionsFor(f.column);
                    const cellHasError = rowErrors.some((e) => e.field === f.column);
                    const cellClass = clsx(
                      'w-full min-w-[120px] px-2 py-1 text-sm bg-surface border rounded outline-none focus:ring-1 focus:ring-[#c96442]',
                      cellHasError ? 'border-rose-400' : 'border-border',
                    );
                    return (
                      <td key={f.column} className="px-2 py-1.5">
                        {opts ? (
                          <select
                            value={row[f.column]}
                            onChange={(e) => setCell(rowIdx, f.column, e.target.value)}
                            className={cellClass}
                          >
                            <option value="">
                              {opts.length === 0 ? '(none — add first)' : `— ${f.label} —`}
                            </option>
                            {opts.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={inputType(f)}
                            value={row[f.column]}
                            placeholder={f.example}
                            onChange={(e) => setCell(rowIdx, f.column, e.target.value)}
                            className={cellClass}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => removeRow(rowIdx)}
                      className="text-text-muted hover:text-rose-600 transition-colors"
                      title="Remove row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {errorCount > 0 && (
        <div className="px-4 py-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle size={14} />
          <span>Fix required fields (marked *) in {errorCount} row{errorCount !== 1 ? 's' : ''} before saving.</span>
        </div>
      )}

      {result && (
        <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2">
          <Check size={14} />
          <span>Saved {result.upserted} row{result.upserted !== 1 ? 's' : ''}{result.failed > 0 ? `, ${result.failed} failed` : ''}.</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!isProvisioned() || isSaving || filledCount === 0 || errorCount > 0}
          className="bg-[#c96442] hover:bg-[#b5593b] text-white font-bold px-6"
        >
          {isSaving ? 'Saving...' : `Save ${filledCount || ''} Row${filledCount !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  );
}
